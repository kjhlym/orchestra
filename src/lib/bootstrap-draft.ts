import type { ProjectBootstrapInput } from "@/lib/bootstrap";
import { detectProjectCategoryFromText } from "@/lib/project-intent";

export function buildFallbackBootstrapDraft(idea = ""): ProjectBootstrapInput {
  const subject = normalizeIdea(idea) || "새 홈페이지 프로젝트";
  const profile = inferProjectProfile(subject);

  return {
    name: profile.name,
    description: profile.description,
    techStack: profile.techStack,
    requirements: profile.requirements,
  };
}

export function normalizeBootstrapDraft(
  value: unknown
): ProjectBootstrapInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const techStack = record.techStack;
  const requirements = record.requirements;

  if (!isStringRecord(techStack) || !isStringRecord(requirements)) {
    return null;
  }

  const name = toCleanString(record.name);
  const description = toCleanString(record.description);

  if (!name || !description) {
    return null;
  }

  return {
    name,
    description,
    techStack: {
      framework: toCleanString(techStack.framework),
      css: toCleanString(techStack.css),
      database: toCleanString(techStack.database),
      deployment: toCleanString(techStack.deployment),
    },
    requirements: {
      targetAudience: toCleanString(requirements.targetAudience),
      mustHaves: toCleanString(requirements.mustHaves),
      niceToHaves: toCleanString(requirements.niceToHaves),
      constraints: toCleanString(requirements.constraints),
    },
    ...(isVisualAssetPlanRecord(record.visualAssetPlan)
      ? { visualAssetPlan: normalizeVisualAssetPlan(record.visualAssetPlan) }
      : {}),
    ...(isDesignReferenceRecord(record.designReference)
      ? { designReference: normalizeDesignReference(record.designReference) }
      : {}),
    ...(isVisualAssetsRecord(record.visualAssets)
      ? {
          visualAssets: normalizeVisualAssets(record.visualAssets),
          visualAssetPlan: legacyVisualAssetsToPlan(record.visualAssets, name),
        }
      : {}),
  };
}

function normalizeIdea(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。!！?？]+$/g, "");
}

function pickProjectName(idea: string) {
  const shortened = idea.length > 28 ? `${idea.slice(0, 28)}...` : idea;
  return shortened || "새 홈페이지";
}

function inferProjectProfile(idea: string): ProjectBootstrapInput {
  const subject = normalizeIdea(idea) || "새 홈페이지 프로젝트";
  const category = detectProjectCategoryFromText(subject);
  const isReservation = /예약|booking|calendar|schedule/.test(subject.toLowerCase());
  const isCommerce = category === "commerce";
  const isInternalTool = category === "internal";

  if (isReservation) {
    return {
      name: pickProjectName(idea || "예약 관리 플랫폼"),
      description: `${idea}의 예약 접수, 일정 조율, 알림 흐름을 빠르게 검증하는 MVP를 만듭니다.`,
      techStack: {
        framework: "nextjs",
        css: "tailwind",
        database: "postgres",
        deployment: "vercel",
      },
      requirements: {
        targetAudience: "예약을 빠르게 받고 관리해야 하는 고객과 운영자",
        mustHaves:
          "- 사용자는 예약 가능 시간을 확인하고 예약할 수 있어야 합니다.\n" +
          "- 운영자는 예약 목록과 상태를 관리할 수 있어야 합니다.\n" +
          "- 예약 변경과 취소를 즉시 확인할 수 있어야 합니다.",
        niceToHaves:
          "- 예약 알림 자동 발송\n" +
          "- 캘린더 연동\n" +
          "- 모바일 최적화",
        constraints:
          "예약 충돌을 막아야 하며, 주요 화면은 빠르게 열리고 폼 입력은 간단해야 합니다.",
      },
    };
  }

  if (isCommerce) {
    return {
      name: pickProjectName(idea || "브랜드 커머스 홈페이지"),
      description: `${idea}의 브랜드, 제품, 구매 흐름을 한 화면에서 보여주는 커머스 MVP를 만듭니다.`,
      techStack: {
        framework: "nextjs",
        css: "tailwind",
        database: "postgres",
        deployment: "vercel",
      },
      requirements: {
        targetAudience: "브랜드와 제품을 효과적으로 보여주고 전환을 높이려는 팀",
        mustHaves:
          "- 사용자는 제품과 컬렉션을 소개할 수 있어야 합니다.\n" +
          "- 주문 또는 문의 흐름을 추적할 수 있어야 합니다.\n" +
          "- 고객 신뢰를 높이는 콘텐츠를 배치할 수 있어야 합니다.",
        niceToHaves:
          "- 추천 컬렉션\n" +
          "- 리뷰/신뢰 섹션\n" +
          "- 프로모션 배너",
        constraints:
          "브랜드 감성을 유지하면서도 구매 동선은 짧고 명확해야 합니다.",
      },
    };
  }

  if (isInternalTool) {
    return {
      name: pickProjectName(idea || "내부 업무 포털"),
      description: `${idea}을/를 위한 내부 운영 도구로, 승인과 작업 추적을 단순하게 자동화합니다.`,
      techStack: {
        framework: "nextjs",
        css: "tailwind",
        database: "sqlite",
        deployment: "local",
      },
      requirements: {
        targetAudience: "반복 업무를 줄이고 싶은 내부 운영자와 팀 리더",
        mustHaves:
          "- 사용자는 요청을 등록하고 상태를 추적할 수 있어야 합니다.\n" +
          "- 관리자는 승인 또는 반려 결정을 빠르게 처리할 수 있어야 합니다.\n" +
          "- 작업 이력이 남아야 합니다.",
        niceToHaves:
          "- 필터와 검색\n" +
          "- 대시보드 요약 카드\n" +
          "- 알림 통합",
        constraints:
          "내부 도구는 설치와 운영이 쉬워야 하며, 복잡한 설정 없이 바로 사용할 수 있어야 합니다.",
      },
    };
  }

  return {
    name: pickProjectName(subject),
    description: `${subject}의 핵심 가치를 빠르게 검증할 수 있는 범용 홈페이지 MVP를 만듭니다.`,
    techStack: {
      framework: "nextjs",
      css: "tailwind",
      database: "postgres",
      deployment: "vercel",
    },
    requirements: {
      targetAudience: "빠르게 제품 가치를 검증하려는 실무 사용자",
      mustHaves:
        "- 사용자는 핵심 기능을 즉시 이용할 수 있어야 합니다.\n" +
        "- 운영자는 주요 데이터를 등록, 수정, 확인할 수 있어야 합니다.\n" +
        "- 변경 사항은 안전하게 저장되고 추적되어야 합니다.",
      niceToHaves:
        "- 대시보드 시각화\n" +
        "- 알림 및 상태 변경 이력\n" +
        "- 모바일 대응 UI",
      constraints:
        "초기 버전은 빠른 출시를 우선하고, 핵심 흐름은 3초 이내 응답을 목표로 합니다.",
    },
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isVisualAssetsRecord(value: unknown): value is { heroImage?: string; galleryImages?: string[] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.heroImage !== undefined && typeof record.heroImage !== "string") {
    return false;
  }

  if (record.galleryImages !== undefined) {
    if (!Array.isArray(record.galleryImages)) {
      return false;
    }

    if (!record.galleryImages.every((entry) => typeof entry === "string")) {
      return false;
    }
  }

  return true;
}

function isDesignReferenceRecord(value: unknown): value is {
  siteUrl?: string;
  notes?: string;
  mood?: string;
  summary?: string;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.siteUrl !== undefined && typeof record.siteUrl !== "string") {
    return false;
  }

  if (record.notes !== undefined && typeof record.notes !== "string") {
    return false;
  }

  if (record.mood !== undefined && typeof record.mood !== "string") {
    return false;
  }

  if (record.summary !== undefined && typeof record.summary !== "string") {
    return false;
  }

  return true;
}

function isVisualAssetPlanRecord(value: unknown): value is {
  hero?: { source?: string; alt?: string };
  gallery?: Array<{ source?: string; alt?: string }>;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.hero !== undefined && !isVisualAssetSlotRecord(record.hero)) {
    return false;
  }

  if (record.gallery !== undefined) {
    if (!Array.isArray(record.gallery)) {
      return false;
    }

    if (!record.gallery.every((entry) => isVisualAssetSlotRecord(entry))) {
      return false;
    }
  }

  return true;
}

function isVisualAssetSlotRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.source === undefined || typeof record.source === "string") &&
    (record.alt === undefined || typeof record.alt === "string")
  );
}

function normalizeVisualAssetPlan(value: {
  hero?: { source?: string; alt?: string };
  gallery?: Array<{ source?: string; alt?: string }>;
}) {
  return {
    ...(value.hero?.source
      ? {
          hero: {
            source: toCleanString(value.hero.source),
            alt: toCleanString(value.hero.alt) || "Hero image",
          },
        }
      : {}),
    ...(value.gallery?.length
      ? {
          gallery: value.gallery
            .map((item, index) => {
              const source = toCleanString(item.source);
              if (!source) {
                return null;
              }

              return {
                source,
                alt: toCleanString(item.alt) || `Gallery image ${index + 1}`,
              };
            })
            .filter((item): item is { source: string; alt: string } => item !== null),
        }
      : {}),
  };
}

function legacyVisualAssetsToPlan(
  value: { heroImage?: string; galleryImages?: string[] },
  projectName: string
) {
  const heroImage = toCleanString(value.heroImage);
  const galleryImages = (value.galleryImages ?? []).map(toCleanString).filter(Boolean);

  return {
    ...(heroImage
      ? {
          hero: {
            source: heroImage,
            alt: `${projectName} hero image`,
          },
        }
      : {}),
    ...(galleryImages.length
      ? {
          gallery: galleryImages.map((source, index) => ({
            source,
            alt: `${projectName} gallery image ${index + 1}`,
          })),
        }
      : {}),
  };
}

function normalizeVisualAssets(value: { heroImage?: string; galleryImages?: string[] }) {
  const heroImage = toCleanString(value.heroImage);
  const galleryImages = (value.galleryImages ?? []).map(toCleanString).filter(Boolean);

  return {
    ...(heroImage ? { heroImage } : {}),
    ...(galleryImages.length ? { galleryImages } : {}),
  };
}

function normalizeDesignReference(value: { siteUrl?: string; notes?: string; mood?: string; summary?: string }) {
  const siteUrl = toCleanString(value.siteUrl);
  const notes = toCleanString(value.notes);
  const mood = toCleanString(value.mood);
  const summary = toCleanString((value as { summary?: string }).summary);

  return {
    ...(siteUrl ? { siteUrl } : {}),
    ...(notes ? { notes } : {}),
    ...(mood ? { mood } : {}),
    ...(summary ? { summary } : {}),
  };
}

function toCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
