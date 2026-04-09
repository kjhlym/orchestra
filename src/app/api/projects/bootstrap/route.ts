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
import { createProjectWorkspace, WorkspaceQualityGateError } from "@/lib/project-workspace";
import { summarizeDesignReferenceSite } from "@/lib/design-reference-summary";
import {
  buildExecutionBrief,
  buildRoleExecutionOrder,
} from "@/lib/workflow-guidance";

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
  let enrichedInput = input;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let workspacePath: string | null = null;

      const sendEvent = (event: BootstrapEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        sendEvent({
          type: "status",
          message: "요구사항을 분석하고 초기 작성본 생성을 준비합니다.",
        });

        sendEvent({
          type: "status",
          message: "참고 사이트가 있으면 요약해서 반영합니다.",
        });

        const enriched = await enrichDesignReference(input);
        enrichedInput = enriched.input;
        if (enriched.summary) {
          sendEvent({
            type: "design-reference-summary",
            summary: enriched.summary.summary,
            siteUrl: enriched.summary.siteUrl,
            title: enriched.summary.title,
            highlights: enriched.summary.highlights,
            message: "참고 사이트 요약을 반영했습니다.",
          });
        }

        const backlogResult = await generateBacklogItems(enrichedInput);

        if (backlogResult.source === "fallback") {
          console.warn("[bootstrap] " + backlogResult.reason);
        }

        sendEvent({
          type: "generation-source",
          stage: "backlog",
          source: backlogResult.source,
          message:
            backlogResult.source === "gemini"
              ? "자동 작성본이 정상 생성되었습니다."
              : "로컬 자동 작성본을 사용했습니다.",
        });

        sendEvent({
          type: "status",
          message: `자동 작성본 ${backlogResult.items.length}개를 생성했습니다.`,
        });

        sendEvent({
          type: "status",
          message: "독립 프로젝트 작업 폴더를 생성합니다.",
        });

        const workspace = await createProjectWorkspace(enrichedInput, backlogResult.items);
        workspacePath = workspace.workspacePath;
        const executionBrief = buildExecutionBrief(enrichedInput, backlogResult.items);
        const roleExecutionOrder = buildRoleExecutionOrder(
          workspace.roleQualityStats,
          "backlog",
          workspace.repairProfile?.focusRoles ?? []
        );

        const result = await prisma.$transaction(async (tx) => {
          const project = await tx.project.create({
            data: {
              name: enrichedInput.name,
              slug: workspace.slug,
              description: enrichedInput.description || null,
              workspacePath: workspace.workspacePath,
              techStack: JSON.stringify(enrichedInput.techStack),
              requirements: JSON.stringify(enrichedInput.requirements),
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
                  "프로젝트가 초기화되었고 제품 구조가 준비되었습니다.",
                lastRunAt: new Date().toISOString(),
                executionBrief,
                strictHarness: executionBrief.strictHarness,
                homepageAudit: workspace.homepageAudit,
                designAudit: workspace.designAudit,
                roleQualityStats: workspace.roleQualityStats,
                repairProfile: workspace.repairProfile,
                roleExecutionOrder,
                generationMode: workspace.generationMode,
                attemptCount: workspace.attemptCount,
              }),
            },
          });

          const backlogs: GeneratedBacklogRecord[] = [];

          for (const backlog of backlogResult.items) {
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
          type: "homepage-audit",
          audit: workspace.homepageAudit,
          message: workspace.homepageAudit.passed
            ? "홈페이지 품질 검수를 통과했습니다."
            : "홈페이지 품질 검수에서 문제가 발견되었습니다.",
        });

        sendEvent({
          type: "design-audit",
          audit: workspace.designAudit,
          message: workspace.designAudit.passed
            ? "디자인 품질 검수를 통과했습니다."
            : "디자인 품질 검수에서 문제가 발견되었습니다.",
        });

        sendEvent({
          type: "role-quality",
          stats: workspace.roleQualityStats,
          repairProfile: workspace.repairProfile,
          roleExecutionOrder,
          message:
            workspace.repairProfile && workspace.repairProfile.focusRoles.length > 0
              ? `재생성 포커스: ${workspace.repairProfile.focusRoles.join(", ")}`
              : "역할 품질 누적 기록을 저장했습니다.",
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

        if (error instanceof WorkspaceQualityGateError) {
          sendEvent({
            type: "homepage-audit",
            audit: error.homepageAudit,
            message: error.message,
          });
          sendEvent({
            type: "design-audit",
            audit: error.designAudit,
            message: error.message,
          });
          sendEvent({
            type: "role-quality",
            stats: error.roleQualityStats,
            repairProfile: error.repairProfile,
            roleExecutionOrder: buildRoleExecutionOrder(
              error.roleQualityStats,
              "backlog",
              error.repairProfile?.focusRoles ?? []
            ),
            message: error.message,
          });
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

async function enrichDesignReference(input: ProjectBootstrapInput): Promise<{
  input: ProjectBootstrapInput;
  summary: {
    siteUrl?: string;
    title?: string;
    description?: string;
    highlights: string[];
    summary: string;
  } | null;
}> {
  const reference = input.designReference;

  if (!reference?.siteUrl || reference.summary?.trim()) {
    return { input, summary: null };
  }

  const summary = await summarizeDesignReferenceSite(reference.siteUrl);
  if (!summary?.summary) {
    return { input, summary: null };
  }

  return {
    input: {
      ...input,
      designReference: {
        ...reference,
        summary: summary.summary,
      },
    },
    summary: {
      siteUrl: reference.siteUrl,
      ...summary,
    },
  };
}

function sanitizeInput(input: ProjectBootstrapInput): ProjectBootstrapInput {
  const visualAssetPlan = normalizeVisualAssetPlan(input);
  const visualAssets = normalizeVisualAssets(input);
  const designReference = normalizeDesignReference(input);

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
    ...(designReference ? { designReference } : {}),
    ...(visualAssetPlan ? { visualAssetPlan } : {}),
    ...(visualAssets && (visualAssets.heroImage || visualAssets.galleryImages?.length)
      ? { visualAssets }
      : {}),
  };
}

function normalizeDesignReference(input: ProjectBootstrapInput) {
  if (!input.designReference || typeof input.designReference !== "object") {
    return undefined;
  }

  const siteUrl =
    typeof input.designReference.siteUrl === "string" && input.designReference.siteUrl.trim()
      ? input.designReference.siteUrl.trim()
      : "";
  const notes =
    typeof input.designReference.notes === "string" && input.designReference.notes.trim()
      ? input.designReference.notes.trim()
      : "";
  const mood =
    typeof input.designReference.mood === "string" && input.designReference.mood.trim()
      ? input.designReference.mood.trim()
      : "";
  const summary =
    typeof input.designReference.summary === "string" && input.designReference.summary.trim()
      ? input.designReference.summary.trim()
      : "";

  if (!siteUrl && !notes && !mood && !summary) {
    return undefined;
  }

  return {
    ...(siteUrl ? { siteUrl } : {}),
    ...(notes ? { notes } : {}),
    ...(mood ? { mood } : {}),
    ...(summary ? { summary } : {}),
  };
}

function normalizeVisualAssetPlan(input: ProjectBootstrapInput) {
  if (input.visualAssetPlan && typeof input.visualAssetPlan === "object") {
    const hero = normalizeVisualAssetSlot(input.visualAssetPlan.hero, "Hero image");
    const gallery = Array.isArray(input.visualAssetPlan.gallery)
      ? input.visualAssetPlan.gallery
          .map((item, index) => normalizeVisualAssetSlot(item, `Gallery image ${index + 1}`))
          .filter((item): item is { source: string; alt: string } => item !== null)
      : [];

    if (hero || gallery.length > 0) {
      return {
        ...(hero ? { hero } : {}),
        ...(gallery.length ? { gallery } : {}),
      };
    }
  }

  const fallback = normalizeVisualAssets(input);
  if (!fallback) {
    return undefined;
  }

  const hero = fallback.heroImage
    ? { source: fallback.heroImage, alt: `${input.name.trim() || "Project"} hero image` }
    : undefined;
  const gallery = fallback.galleryImages?.map((source, index) => ({
    source,
    alt: `${input.name.trim() || "Project"} gallery image ${index + 1}`,
  }));

  if (!hero && (!gallery || gallery.length === 0)) {
    return undefined;
  }

  return {
    ...(hero ? { hero } : {}),
    ...(gallery && gallery.length ? { gallery } : {}),
  };
}

function normalizeVisualAssets(input: ProjectBootstrapInput) {
  if (!input.visualAssets || typeof input.visualAssets !== "object") {
    return undefined;
  }

  const heroImage =
    typeof input.visualAssets.heroImage === "string" && input.visualAssets.heroImage.trim()
      ? input.visualAssets.heroImage.trim()
      : "";
  const galleryImages = Array.isArray(input.visualAssets.galleryImages)
    ? input.visualAssets.galleryImages
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

  if (!heroImage && galleryImages.length === 0) {
    return undefined;
  }

  return {
    ...(heroImage ? { heroImage } : {}),
    ...(galleryImages.length ? { galleryImages } : {}),
  };
}

function normalizeVisualAssetSlot(
  value: unknown,
  fallbackAlt: string
): { source: string; alt: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const source = typeof record.source === "string" ? record.source.trim() : "";
  if (!source) {
    return null;
  }

  const alt = typeof record.alt === "string" ? record.alt.trim() : "";
  return {
    source,
    alt: alt || fallbackAlt,
  };
}
