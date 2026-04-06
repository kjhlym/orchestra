import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import type {
  BootstrapEvent,
  GeneratedBacklogRecord,
  ProjectBootstrapInput,
} from "@/lib/bootstrap";
import { isProjectBootstrapInput } from "@/lib/bootstrap";
import { generateBacklogItems, getGeminiModel } from "@/lib/gemini";
import prisma from "@/lib/prisma";
import { createProjectWorkspace } from "@/lib/project-workspace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isProjectBootstrapInput(body)) {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const input = sanitizeInput(body);

  if (!input.name) {
    return NextResponse.json(
      { error: "프로젝트명은 필수입니다." },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let workspacePath: string | null = null;

      const sendEvent = (event: BootstrapEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        sendEvent({
          type: "status",
          message: "요구사항을 분석하고 초기 백로그 생성을 준비합니다.",
        });

        const generatedBacklogs = await generateBacklogItems(input);

        sendEvent({
          type: "status",
          message: `Gemini가 초기 백로그 ${generatedBacklogs.length}개를 생성했습니다.`,
        });

        sendEvent({
          type: "status",
          message: "독립 프로젝트 워크스페이스를 생성합니다.",
        });

        const workspace = await createProjectWorkspace(input, generatedBacklogs);
        workspacePath = workspace.workspacePath;

        const result = await prisma.$transaction(async (tx) => {
          const project = await tx.project.create({
            data: {
              name: input.name,
              slug: workspace.slug,
              description: input.description || null,
              workspacePath: workspace.workspacePath,
              techStack: JSON.stringify(input.techStack),
              requirements: JSON.stringify(input.requirements),
              status: "backlog",
            },
          });

          await tx.workflow.create({
            data: {
              projectId: project.id,
              orchestratorStatus: "idle",
              currentPhase: "backlog",
              harnessConfig: JSON.stringify({
                provider: "gemini",
                model: getGeminiModel(),
                workspacePath: workspace.workspacePath,
                lastMessage:
                  "프로젝트가 초기화되었고 제품 백로그가 준비되었습니다.",
                lastRunAt: new Date().toISOString(),
              }),
            },
          });

          const backlogs: GeneratedBacklogRecord[] = [];

          for (const backlog of generatedBacklogs) {
            const created = await tx.productBacklog.create({
              data: {
                projectId: project.id,
                title: backlog.title,
                description: backlog.description,
                userStory: backlog.userStory,
                acceptanceCriteria: backlog.acceptanceCriteria.join("\n"),
                priority: backlog.priority,
                storyPoints: backlog.storyPoints,
                status: "todo",
              },
            });

            backlogs.push({
              id: created.id,
              title: created.title,
              description: created.description,
              userStory: created.userStory,
              acceptanceCriteria: created.acceptanceCriteria,
              priority: created.priority,
              storyPoints: created.storyPoints,
            });
          }

          return { project, backlogs };
        });

        sendEvent({
          type: "project-created",
          projectId: result.project.id,
          projectName: result.project.name,
        });

        result.backlogs.forEach((backlog, index) => {
          sendEvent({
            type: "backlog-created",
            index: index + 1,
            total: result.backlogs.length,
            backlog,
          });
        });

        sendEvent({
          type: "complete",
          projectId: result.project.id,
          backlogCount: result.backlogs.length,
        });
      } catch (error) {
        if (workspacePath) {
          await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => null);
        }

        const message =
          error instanceof Error
            ? error.message
            : "프로젝트를 초기화하지 못했습니다.";

        console.error("프로젝트 부트스트랩 오류:", error);
        sendEvent({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function sanitizeInput(input: ProjectBootstrapInput): ProjectBootstrapInput {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    techStack: {
      framework: input.techStack.framework.trim(),
      css: input.techStack.css.trim(),
      database: input.techStack.database.trim(),
      deployment: input.techStack.deployment.trim(),
    },
    requirements: {
      targetAudience: input.requirements.targetAudience.trim(),
      mustHaves: input.requirements.mustHaves.trim(),
      niceToHaves: input.requirements.niceToHaves.trim(),
      constraints: input.requirements.constraints.trim(),
    },
  };
}
