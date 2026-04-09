import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini";
import type {
  RoleQualityStatsRecord,
  RoleRepairProfileRecord,
} from "@/lib/bootstrap";
import prisma from "@/lib/prisma";
import {
  buildRoleExecutionOrder,
  buildRoleTaskMap,
  sortAgentsByRole,
  type WorkflowRole,
} from "@/lib/workflow-guidance";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type HarnessConfig = {
  provider?: string;
  model?: string;
  workspacePath?: string;
  lastMessage?: string;
  lastRunAt?: string;
  roleQualityStats?: RoleQualityStatsRecord;
  repairProfile?: RoleRepairProfileRecord | null;
  roleExecutionOrder?: WorkflowRole[];
};

const AGENT_TEMPLATES = [
  { name: "PO 플래너", type: "planner" },
  { name: "프로그램 비평가", type: "critic" },
  { name: "UI 디자이너", type: "designer" },
  { name: "프론트엔드 코더", type: "coder" },
  { name: "QA 테스터", type: "tester" },
] as const;

export async function POST(_request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  let workflowLocked = false;

  try {
    const lockResult = await prisma.workflow.updateMany({
      where: {
        projectId,
        orchestratorStatus: {
          not: "running",
        },
      },
      data: {
        orchestratorStatus: "running",
      },
    });

    if (lockResult.count === 0) {
      return NextResponse.json(
        { error: "다른 워크플로우 실행이 진행 중입니다." },
        { status: 409 }
      );
    }

    workflowLocked = true;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workflow: true,
        backlogs: {
          orderBy: { createdAt: "asc" },
          include: {
            tasks: true,
          },
        },
        sprints: {
          orderBy: { createdAt: "desc" },
          include: {
            tasks: true,
          },
        },
      },
    });

    if (!project || !project.workflow) {
      return NextResponse.json(
        { error: "프로젝트 워크플로우를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const agents = await ensureAgents();
    const harnessBase = parseHarnessConfig(project.workflow.harnessConfig);

    if (project.workflow.currentPhase === "retro") {
      return NextResponse.json({
        message: "이미 모든 파이프라인 단계가 완료되었습니다.",
      });
    }

    if (project.workflow.currentPhase === "planning") {
      const message = "요구사항 정리가 완료되어 백로그 준비 단계로 전환했습니다.";
      const roleExecutionOrder = buildRoleExecutionOrder(
        harnessBase.roleQualityStats,
        "backlog",
        harnessBase.repairProfile?.focusRoles ?? []
      );

      await prisma.$transaction([
        prisma.workflow.update({
          where: { projectId },
          data: {
            currentPhase: "backlog",
            harnessConfig: JSON.stringify(
              mergeHarnessConfig(
                harnessBase,
                project.workspacePath,
                message,
                roleExecutionOrder
              )
            ),
          },
        }),
        prisma.project.update({
          where: { id: projectId },
          data: { status: "backlog" },
        }),
      ]);

      return NextResponse.json({ message });
    }

    if (project.workflow.currentPhase === "backlog") {
      const roleExecutionOrder = buildRoleExecutionOrder(
        harnessBase.roleQualityStats,
        "sprint",
        harnessBase.repairProfile?.focusRoles ?? []
      );
      const orderedAgents = sortAgentsByRole(agents, roleExecutionOrder);
      const existingSprint = project.sprints[0];
      const sprint =
        existingSprint ??
        (await prisma.sprint.create({
          data: {
            projectId,
            name: "Sprint 1",
            goal: "핵심 MVP 백로그를 구현 가능한 작업으로 전환합니다.",
            startDate: new Date(),
            endDate: addDays(new Date(), 13),
            velocity: 21,
          },
        }));

      const existingTaskBacklogIds = new Set(
        project.backlogs
          .flatMap((backlog) => backlog.tasks.map((task) => task.backlogId))
          .filter((backlogId): backlogId is string => Boolean(backlogId))
      );

      const candidateBacklogs = project.backlogs.filter(
        (backlog) => backlog.status !== "done" && !existingTaskBacklogIds.has(backlog.id)
      );

      const selectedBacklogs = candidateBacklogs.slice(0, 5);

      if (!selectedBacklogs.length && existingSprint?.tasks.length === 0) {
        return NextResponse.json(
          { error: "스프린트로 전환할 백로그가 없습니다." },
          { status: 400 }
        );
      }

      const assignments = orderedAgents.filter((agent) => agent.type !== "tester" && agent.type !== "critic");

      if (selectedBacklogs.length > 0) {
        await prisma.$transaction(async (tx) => {
          for (const [index, backlog] of selectedBacklogs.entries()) {
            const assignee = assignments[index % assignments.length];

            await tx.task.create({
              data: {
                sprintId: sprint.id,
                backlogId: backlog.id,
                title: backlog.title,
                description: backlog.description,
                assignedAgent: assignee?.name ?? null,
                status: "todo",
              },
            });

            await tx.productBacklog.update({
              where: { id: backlog.id },
              data: { status: "inSprint" },
            });
          }
        });
      }

      await setAgentState({
        agents: orderedAgents,
        runningTypes: new Set(["planner", "critic", "designer", "coder"]),
        currentTaskByType: buildRoleTaskMap(project.name, "backlog"),
      });

      const taskCount = selectedBacklogs.length || existingSprint?.tasks.length || 0;
      const message =
        selectedBacklogs.length > 0
          ? `Sprint 1을 생성하고 작업 ${selectedBacklogs.length}개를 배치했습니다.`
          : `기존 Sprint 1을 사용해 작업 ${taskCount}개 상태를 유지합니다.`;

      await prisma.$transaction([
        prisma.workflow.update({
          where: { projectId },
          data: {
            currentPhase: "sprint",
            harnessConfig: JSON.stringify(
              mergeHarnessConfig(
                harnessBase,
                project.workspacePath,
                message,
                roleExecutionOrder
              )
            ),
          },
        }),
        prisma.project.update({
          where: { id: projectId },
          data: { status: "sprint" },
        }),
      ]);

      return NextResponse.json({ message });
    }

    const sprint = project.sprints[0];

    if (!sprint) {
      return NextResponse.json(
        { error: "진행 중인 스프린트를 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    if (project.workflow.currentPhase === "sprint") {
      const roleExecutionOrder = buildRoleExecutionOrder(
        harnessBase.roleQualityStats,
        "review",
        harnessBase.repairProfile?.focusRoles ?? []
      );
      const orderedAgents = sortAgentsByRole(agents, roleExecutionOrder);
      const reviewReadyTasks = sprint.tasks.filter((task) => task.status !== "done");

      if (!reviewReadyTasks.length) {
        return NextResponse.json(
          { error: "검토 단계로 보낼 작업이 없습니다." },
          { status: 400 }
        );
      }

      await prisma.task.updateMany({
        where: {
          sprintId: sprint.id,
          status: {
            in: ["todo", "inProgress"],
          },
        },
        data: {
          status: "review",
        },
      });

      await setAgentState({
        agents: orderedAgents,
        runningTypes: new Set(["tester", "critic"]),
        currentTaskByType: buildRoleTaskMap(project.name, "review"),
      });

      const message = `Sprint 작업 ${reviewReadyTasks.length}개를 테스트 및 검토 단계로 이동했습니다.`;

      await prisma.workflow.update({
        where: { projectId },
        data: {
          currentPhase: "review",
          harnessConfig: JSON.stringify(
            mergeHarnessConfig(
              harnessBase,
              project.workspacePath,
              message,
              roleExecutionOrder
            )
          ),
        },
      });

      return NextResponse.json({ message });
    }

    const relatedBacklogIds = sprint.tasks
      .map((task) => task.backlogId)
      .filter((backlogId): backlogId is string => Boolean(backlogId));

    const roleExecutionOrder = buildRoleExecutionOrder(
      harnessBase.roleQualityStats,
      "retro",
      harnessBase.repairProfile?.focusRoles ?? []
    );
    const orderedAgents = sortAgentsByRole(agents, roleExecutionOrder);

    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: {
          sprintId: sprint.id,
        },
        data: {
          status: "done",
        },
      });

      if (relatedBacklogIds.length > 0) {
        await tx.productBacklog.updateMany({
          where: {
            id: {
              in: relatedBacklogIds,
            },
          },
          data: {
            status: "done",
          },
        });
      }

      await tx.workflow.update({
        where: { projectId },
        data: {
          currentPhase: "retro",
          harnessConfig: JSON.stringify(
            mergeHarnessConfig(
              harnessBase,
              project.workspacePath,
              "테스트 및 검토가 완료되어 회고 단계까지 마무리했습니다.",
              roleExecutionOrder
            )
          ),
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: { status: "done" },
      });
    });

    await setAgentState({
      agents: orderedAgents,
      runningTypes: new Set<string>(),
      currentTaskByType: buildRoleTaskMap(project.name, "retro"),
    });

    return NextResponse.json({
      message: "회고 단계를 완료하고 프로젝트를 종료 상태로 전환했습니다.",
    });
  } catch (error) {
    console.error("워크플로우 실행 오류:", error);
    return NextResponse.json(
      { error: "파이프라인 실행을 시작하지 못했습니다." },
      { status: 500 }
    );
  } finally {
    if (workflowLocked) {
      await prisma.workflow
        .updateMany({
          where: {
            projectId,
            orchestratorStatus: "running",
          },
          data: {
            orchestratorStatus: "idle",
          },
        })
        .catch(() => null);
    }
  }
}

async function ensureAgents() {
  await Promise.all(
    AGENT_TEMPLATES.map((template) =>
      prisma.agent.upsert({
        where: { type: template.type },
        create: {
          name: template.name,
          type: template.type,
          status: "idle",
        },
        update: {},
      })
    )
  );

  return prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
  });
}

async function setAgentState({
  agents,
  runningTypes,
  currentTaskByType,
}: {
  agents: Array<{ id: string; type: string }>;
  runningTypes: Set<string>;
  currentTaskByType: Partial<Record<string, string>>;
}) {
  await Promise.all(
    agents.map((agent) =>
      prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: runningTypes.has(agent.type) ? "running" : "idle",
          currentTask: runningTypes.has(agent.type) ? currentTaskByType[agent.type] ?? null : null,
        },
      })
    )
  );
}

function parseHarnessConfig(value: string | null): HarnessConfig {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as HarnessConfig;
  } catch {
    return {};
  }
}

function mergeHarnessConfig(
  current: HarnessConfig,
  workspacePath: string | null,
  lastMessage: string,
  roleExecutionOrder: WorkflowRole[]
) {
  return {
    ...current,
    provider: current.provider ?? "gemini",
    model: current.model ?? getGeminiModel(),
    workspacePath: workspacePath ?? current.workspacePath,
    lastMessage,
    lastRunAt: new Date().toISOString(),
    roleExecutionOrder,
  };
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
