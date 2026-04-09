import { promises as fs } from "fs";
import path from "path";
import type { GeneratedBacklogItem, ProjectBootstrapInput } from "@/lib/bootstrap";
import {
  auditGeneratedHomepage,
  buildHomepageAuditMarkdown,
  type HomepageAuditResult,
} from "@/lib/homepage-audit";
import {
  auditGeneratedDesign,
  buildDesignAuditMarkdown,
  type DesignAuditResult,
} from "@/lib/design-audit";
import { detectProjectCategoryFromText } from "@/lib/project-intent";
import {
  ROLE_BRIEFS,
  ROLE_CHECKLISTS,
  type WorkflowRole,
} from "@/lib/workflow-guidance";
import { getAgentTypeLabel } from "@/lib/display";
import { WORKSPACES_ROOT } from "@/lib/workspaces";

type WorkspaceResult = {
  slug: string;
  workspacePath: string;
  homepageAudit: HomepageAuditResult;
  designAudit: DesignAuditResult;
  roleQualityStats: RoleQualityStats;
  repairProfile: RepairProfile | null;
  generationMode: WorkspaceGenerationMode;
  attemptCount: number;
};

type WorkspaceGenerationMode = "standard" | "repair";
type RoleQualityStats = Record<WorkflowRole, number>;

type RepairProfile = {
  focusRoles: WorkflowRole[];
  focusMessages: Array<{
    role: WorkflowRole;
    message: string;
    count: number;
  }>;
  roleQualityStats: RoleQualityStats;
};

type WorkspaceCategory =
  | "commerce"
  | "booking"
  | "internal"
  | "portfolio"
  | "content"
  | "docs"
  | "event"
  | "hospitality"
  | "generic";

type WorkspaceBlueprint = {
  category: WorkspaceCategory;
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  metrics: Array<{ label: string; value: string }>;
  valueProps: Array<{ title: string; description: string }>;
  collectionFilters: Array<{ label: string; note: string }>;
  showcaseItems: Array<{
    tag: string;
    title: string;
    description: string;
    note: string;
    details: string;
    image?: string;
  }>;
  visualAssets?: {
    heroImage: string;
    showcaseImages: string[];
  };
  buildPlanCards: Array<{
    title: string;
    description: string;
    priority: string;
  }>;
  processSteps: Array<{
    step: string;
    title: string;
    description: string;
  }>;
  trustPoints: string[];
  editorialSpotlight: {
    eyebrow: string;
    title: string;
    description: string;
    bullets: string[];
  };
  socialProof: {
    eyebrow: string;
    title: string;
    summary: string;
    score: string;
    quotes: Array<{
      name: string;
      role: string;
      quote: string;
    }>;
  };
  serviceCards: Array<{
    title: string;
    description: string;
  }>;
  faq: Array<{
    question: string;
    answer: string;
  }>;
};

type VisualThemeVariant = "editorial" | "midnight" | "sunrise" | "cool";

type VisualThemeSpec = {
  key: VisualThemeVariant;
  pageShell: string;
  headerShell: string;
  heroSectionShell: string;
  heroShell: string;
  heroMediaShell: string;
  sectionShell: string;
  cardShell: string;
  featuredCardShell: string;
  processShell: string;
  faqShell: string;
  footerShell: string;
  trustChipShell: string;
  chipShell: string;
  footerChipShell: string;
  logoShell: string;
  primaryButtonShell: string;
  secondaryButtonShell: string;
  accentLabel: string;
  mutedLabel: string;
  palette: readonly [string, string, string];
};

type TypographyProfile = {
  key: string;
  sansVariable: string;
  displayVariable: string;
};

type PageSurfaceProfile = {
  background: string;
  foreground: string;
  pageSurface: string;
  pageOverlay: string;
  overlayOpacity: string;
  selection: string;
};

type WorkspaceQualitySnapshot = {
  homepageAudit: HomepageAuditResult;
  designAudit: DesignAuditResult;
  roleQualityStats: RoleQualityStats;
  repairProfile: RepairProfile | null;
  generationMode: WorkspaceGenerationMode;
  attemptCount: number;
};

export class WorkspaceQualityGateError extends Error {
  homepageAudit: HomepageAuditResult;
  designAudit: DesignAuditResult;
  roleQualityStats: RoleQualityStats;
  repairProfile: RepairProfile | null;
  generationMode: WorkspaceGenerationMode;
  attemptCount: number;

  constructor(snapshot: WorkspaceQualitySnapshot) {
    super(buildWorkspaceQualityGateMessage(snapshot));
    this.name = "WorkspaceQualityGateError";
    this.homepageAudit = snapshot.homepageAudit;
    this.designAudit = snapshot.designAudit;
    this.roleQualityStats = snapshot.roleQualityStats;
    this.repairProfile = snapshot.repairProfile;
    this.generationMode = snapshot.generationMode;
    this.attemptCount = snapshot.attemptCount;
  }
}

function buildWorkspaceQualityGateMessage(snapshot: WorkspaceQualitySnapshot) {
  const homepageState = snapshot.homepageAudit.passed ? "통과" : "실패";
  const designState = snapshot.designAudit.passed ? "통과" : "실패";
  const homepageMessage = snapshot.homepageAudit.messages[0] ?? "홈페이지 검수 사유 없음";
  const designMessage = snapshot.designAudit.messages[0] ?? "디자인 검수 사유 없음";
  const roleSummary = (snapshot.repairProfile?.focusMessages ?? buildRepairProfile(snapshot.roleQualityStats).focusMessages)
    .map((item) => `${item.role}: ${item.message}`)
    .slice(0, 2)
    .join(" / ");

  return [
    `워크스페이스 품질 검수에 실패했습니다. 시도 ${snapshot.attemptCount}회, 모드 ${snapshot.generationMode}.`,
    `homepage: ${homepageState} (${homepageMessage})`,
    `design: ${designState} (${designMessage})`,
    roleSummary ? `role focus: ${roleSummary}` : "",
  ].join(" ");
}

export async function createProjectWorkspace(
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  await fs.mkdir(WORKSPACES_ROOT, { recursive: true });

  const slug = await createUniqueSlug(input.name);
  const workspacePath = path.join(WORKSPACES_ROOT, slug);
  const blueprint = buildHomepageBlueprint(input, backlogItems);
  const roleQualityStats = createEmptyRoleQualityStats();
  let lastError: unknown = null;
  let repairProfile: RepairProfile | null = null;

  for (const [attemptIndex, generationMode] of (["standard", "repair"] as const).entries()) {
    const attemptCount = attemptIndex + 1;

    try {
      await prepareWorkspaceDirectory(workspacePath);
      await writeCommonWorkspaceFiles(
        workspacePath,
        slug,
        input,
        backlogItems,
        blueprint,
        generationMode,
        repairProfile
      );
      await writeFrameworkScaffold(
        workspacePath,
        slug,
        input,
        backlogItems
      );

      const homepageAudit = await auditGeneratedHomepage(workspacePath, input, backlogItems);
      const designAudit = await auditGeneratedDesign(workspacePath, input, backlogItems);

      mergeRoleQualityStats(roleQualityStats, homepageAudit.roleFindings);
      mergeRoleQualityStats(roleQualityStats, designAudit.roleFindings);
      repairProfile = buildRepairProfile(
        roleQualityStats,
        homepageAudit.roleFindings,
        designAudit.roleFindings
      );
      Object.assign(roleQualityStats, repairProfile.roleQualityStats);

      if (!homepageAudit.passed || !designAudit.passed) {
        const gateError = new WorkspaceQualityGateError({
          homepageAudit,
          designAudit,
          roleQualityStats,
          repairProfile,
          generationMode,
          attemptCount,
        });
        lastError = gateError;
        continue;
      }

      await writeQualityAuditFiles(
        workspacePath,
        slug,
        input,
        backlogItems,
        blueprint,
        homepageAudit,
        designAudit,
        roleQualityStats,
        repairProfile,
        generationMode,
        attemptCount
      );

      return {
        slug,
        workspacePath,
        homepageAudit,
        designAudit,
        roleQualityStats,
        repairProfile,
        generationMode,
        attemptCount,
      } satisfies WorkspaceResult;
    } catch (error) {
      lastError = error;
      await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => null);
    }
  }

  throw lastError ?? new Error("프로젝트 워크스페이스를 생성하지 못했습니다.");
}

function slugifyProjectName(value: string) {
  const normalized = value
    .normalize("NFC")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "new-project";
}

async function createUniqueSlug(projectName: string) {
  const base = slugifyProjectName(projectName);

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const targetPath = path.join(WORKSPACES_ROOT, candidate);

    try {
      await fs.mkdir(targetPath);
      return candidate;
    } catch (error) {
      if (isPathAlreadyExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("사용 가능한 프로젝트 슬러그를 생성하지 못했습니다.");
}

function isPathAlreadyExistsError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

async function writeCommonWorkspaceFiles(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[],
  blueprint: WorkspaceBlueprint,
  generationMode: WorkspaceGenerationMode,
  repairProfile: RepairProfile | null
) {
  const docsDir = path.join(workspacePath, "docs");

  await fs.mkdir(docsDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, ".gitignore"), buildGitignore(), "utf8"),
    fs.writeFile(path.join(workspacePath, "README.md"), buildWorkspaceReadme(input, slug, repairProfile), "utf8"),
    fs.writeFile(
      path.join(workspacePath, "project.context.json"),
      JSON.stringify(
        {
          slug,
          generatedAt: new Date().toISOString(),
          input,
          backlogItems,
          blueprint,
          generationMode,
          repairProfile,
        },
        null,
        2
      ),
      "utf8"
    ),
    fs.writeFile(path.join(docsDir, "requirements.md"), buildRequirementsMarkdown(input), "utf8"),
    fs.writeFile(path.join(docsDir, "backlog.md"), buildBacklogMarkdown(backlogItems), "utf8"),
    fs.writeFile(
      path.join(docsDir, "implementation-guide.md"),
      buildImplementationGuide(input, backlogItems, blueprint, repairProfile),
      "utf8"
    ),
    fs.writeFile(
      path.join(docsDir, "role-quality.md"),
      buildRoleQualityMarkdown(createEmptyRoleQualityStats(), repairProfile),
      "utf8"
    ),
  ]);
}

async function writeQualityAuditFiles(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[],
  blueprint: WorkspaceBlueprint,
  homepageAudit: HomepageAuditResult,
  designAudit: DesignAuditResult,
  roleQualityStats: RoleQualityStats,
  repairProfile: RepairProfile | null,
  generationMode: WorkspaceGenerationMode,
  attemptCount: number
) {
  const docsDir = path.join(workspacePath, "docs");

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "README.md"), buildWorkspaceReadme(input, slug, repairProfile), "utf8"),
    fs.writeFile(
      path.join(workspacePath, "project.context.json"),
      JSON.stringify(
        {
          slug,
          generatedAt: new Date().toISOString(),
          input,
          backlogItems,
          blueprint,
          homepageAudit,
          designAudit,
          roleQualityStats,
          repairProfile,
          generationMode,
          attemptCount,
        },
        null,
        2
      ),
      "utf8"
    ),
    fs.writeFile(
      path.join(docsDir, "homepage-audit.md"),
      buildHomepageAuditMarkdown(homepageAudit),
      "utf8"
    ),
    fs.writeFile(
      path.join(docsDir, "implementation-guide.md"),
      buildImplementationGuide(input, backlogItems, blueprint, repairProfile),
      "utf8"
    ),
    fs.writeFile(
      path.join(docsDir, "design-audit.md"),
      buildDesignAuditMarkdown(designAudit),
      "utf8"
    ),
    fs.writeFile(
      path.join(docsDir, "role-quality.md"),
      buildRoleQualityMarkdown(roleQualityStats, repairProfile),
      "utf8"
    ),
  ]);
}

async function prepareWorkspaceDirectory(workspacePath: string) {
  await fs.mkdir(workspacePath, { recursive: true });
}

async function writeFrameworkScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  switch (normalizeFramework(input.techStack.framework)) {
    case "vue":
      await writeVueScaffold(workspacePath, slug, input, backlogItems);
      return;
    case "svelte":
      await writeSvelteScaffold(workspacePath, slug, input, backlogItems);
      return;
    case "python":
      await writeFastApiScaffold(workspacePath, input, backlogItems);
      return;
    case "nextjs":
    default:
      await writeNextScaffold(workspacePath, slug, input, backlogItems);
      return;
  }
}

function normalizeFramework(value: string | undefined) {
  const normalized = (value || "nextjs").trim().toLowerCase();

  if (normalized === "next.js" || normalized === "next") {
    return "nextjs";
  }

  if (normalized === "nuxt" || normalized === "vue.js") {
    return "vue";
  }

  if (normalized === "sveltekit") {
    return "svelte";
  }

  return normalized;
}

async function writeNextScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const appDir = path.join(workspacePath, "src", "app");
  const category = detectProjectCategory(input);
  const theme = selectVisualTheme(input, category);
  const typography = selectTypographyProfile(input, category, theme);
  const surface = selectPageSurfaceProfile(category, theme);

  await fs.mkdir(appDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "package.json"), buildNextPackageJson(slug), "utf8"),
    fs.writeFile(path.join(workspacePath, "tsconfig.json"), buildNextTsConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "next-env.d.ts"), buildNextEnvDts(), "utf8"),
    fs.writeFile(path.join(workspacePath, "next.config.ts"), buildNextConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "eslint.config.mjs"), buildNextEslintConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "postcss.config.mjs"), buildPostCssConfig(), "utf8"),
    fs.writeFile(path.join(appDir, "globals.css"), buildNextGlobalsCss(), "utf8"),
    fs.writeFile(path.join(appDir, "layout.tsx"), buildNextLayout(input, typography, surface), "utf8"),
    fs.writeFile(path.join(appDir, "page.tsx"), buildNextPage(input, backlogItems), "utf8"),
  ]);
}

async function writeVueScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const srcDir = path.join(workspacePath, "src");

  await fs.mkdir(srcDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "package.json"), buildVuePackageJson(slug), "utf8"),
    fs.writeFile(path.join(workspacePath, "tsconfig.json"), buildVueTsConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "vite.config.ts"), buildVueViteConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "index.html"), buildVueIndexHtml(input), "utf8"),
    fs.writeFile(path.join(srcDir, "main.ts"), buildVueMainTs(), "utf8"),
    fs.writeFile(path.join(srcDir, "App.vue"), buildVueApp(input, backlogItems), "utf8"),
    fs.writeFile(path.join(srcDir, "style.css"), buildVueStyleCss(), "utf8"),
  ]);
}

async function writeSvelteScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const srcDir = path.join(workspacePath, "src");

  await fs.mkdir(srcDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "package.json"), buildSveltePackageJson(slug), "utf8"),
    fs.writeFile(path.join(workspacePath, "tsconfig.json"), buildSvelteTsConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "vite.config.ts"), buildSvelteViteConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "svelte.config.js"), buildSvelteConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "index.html"), buildVueIndexHtml(input), "utf8"),
    fs.writeFile(path.join(srcDir, "main.ts"), buildSvelteMainTs(), "utf8"),
    fs.writeFile(path.join(srcDir, "App.svelte"), buildSvelteApp(input, backlogItems), "utf8"),
  ]);
}

async function writeFastApiScaffold(
  workspacePath: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const appDir = path.join(workspacePath, "app");

  await fs.mkdir(appDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "requirements.txt"), buildFastApiRequirements(), "utf8"),
    fs.writeFile(path.join(appDir, "main.py"), buildFastApiMainPy(input, backlogItems), "utf8"),
  ]);
}

function buildGitignore() {
  return ["node_modules", ".next", "dist", "__pycache__", ".venv", ".env", ".DS_Store", ""].join("\n");
}

function buildWorkspaceReadme(
  input: ProjectBootstrapInput,
  slug: string,
  repairProfile: RepairProfile | null
) {
  const criticFocus =
    repairProfile?.focusMessages.find((item) => item.role === "critic") ?? null;
  const designReferenceBrief = buildDesignReferenceBrief(input.designReference);

  return [
    `# ${input.name}`,
    "",
    "오케스트라가 생성한 독립 워크스페이스입니다.",
    "",
    `- slug: \`${slug}\``,
    `- framework: \`${input.techStack.framework || "unspecified"}\``,
    `- css: \`${input.techStack.css || "unspecified"}\``,
    `- database: \`${input.techStack.database || "unspecified"}\``,
    `- deployment: \`${input.techStack.deployment || "unspecified"}\``,
    "",
    "세부 요구사항은 `docs/requirements.md`, 초기 백로그는 `docs/backlog.md`를 확인하세요.",
    "초기 화면 설계와 역할 가이드는 `docs/implementation-guide.md`에 정리되어 있습니다.",
    ...(designReferenceBrief
      ? ["초기 참고 기준은 `docs/requirements.md`와 `docs/implementation-guide.md`의 Design Reference 섹션을 확인하세요."]
      : []),
    "초기 홈페이지 품질 검수 결과는 `docs/homepage-audit.md`에 저장됩니다.",
    "디자인 품질 검수 결과는 `docs/design-audit.md`에 저장됩니다.",
    "역할 품질과 비평 포커스는 `docs/role-quality.md`에 저장됩니다.",
    ...(criticFocus
      ? [
          "",
          "## Critic Lens",
          `- count: ${criticFocus.count}`,
          `- focus: ${criticFocus.message}`,
          "- patterns: 중복 섹션, 과도한 카드 수, 무거운 blur/shadow, 반복 렌더링",
        ]
      : []),
    "",
    "## 실행",
    "",
    "선택한 프레임워크에 맞는 의존성을 설치한 뒤 실행하세요.",
    "",
    "```bash",
    "npm install",
    "npm run dev",
    "```",
    "",
  ].join("\n");
}

function buildRequirementsMarkdown(input: ProjectBootstrapInput) {
  const heroImage =
    input.visualAssetPlan?.hero?.source?.trim() ??
    input.visualAssets?.heroImage?.trim() ??
    "";
  const galleryImages =
    input.visualAssetPlan?.gallery?.map((item) => item.source.trim()).filter(Boolean) ??
    input.visualAssets?.galleryImages?.map((item) => item.trim()).filter(Boolean) ??
    [];
  const designReferenceBrief = buildDesignReferenceBrief(input.designReference);

  return [
    "# Requirements",
    "",
    `## 프로젝트명`,
    input.name,
    "",
    "## 설명",
    input.description || "설명 없음",
    "",
    "## 기술 스택",
    `- Framework: ${input.techStack.framework || "-"}`,
    `- CSS: ${input.techStack.css || "-"}`,
    `- Database: ${input.techStack.database || "-"}`,
    `- Deployment: ${input.techStack.deployment || "-"}`,
    "",
    "## 타깃 사용자",
    input.requirements.targetAudience || "-",
    "",
    "## Must Haves",
    input.requirements.mustHaves || "-",
    "",
    "## Nice To Haves",
    input.requirements.niceToHaves || "-",
    "",
    "## Constraints",
    input.requirements.constraints || "-",
    "",
    "## Visual Asset Plan",
    `- Hero image: ${heroImage || "auto-generated"}`,
    `- Gallery images: ${galleryImages.length > 0 ? galleryImages.join(", ") : "auto-generated"}`,
    ...(designReferenceBrief
      ? [
          "",
          "## Design Reference",
          designReferenceBrief,
        ]
      : []),
    "",
  ].join("\n");
}

function buildBacklogMarkdown(backlogItems: GeneratedBacklogItem[]) {
  return [
    "# Initial Backlog",
    "",
    ...backlogItems.flatMap((item, index) => [
      `## ${index + 1}. ${item.title}`,
      `- Priority: ${item.priority}`,
      `- Story Points: ${item.storyPoints}`,
      `- Description: ${item.description}`,
      `- User Story: ${item.userStory}`,
      "- Acceptance Criteria:",
      ...item.acceptanceCriteria.map((criterion) => `  - ${criterion}`),
      "",
    ]),
  ].join("\n");
}

function buildDesignReferenceBrief(reference: ProjectBootstrapInput["designReference"]) {
  if (!reference) {
    return "";
  }

  const parts: string[] = [];

  if (reference.siteUrl) {
    parts.push(`사이트 ${formatReferenceHost(reference.siteUrl)}`);
  }

  if (reference.summary) {
    parts.push(`요약 ${reference.summary}`);
  }

  if (reference.notes) {
    parts.push(`참고 포인트 ${reference.notes}`);
  }

  if (reference.mood) {
    parts.push(`분위기 ${reference.mood}`);
  }

  return parts.join(" · ");
}

function appendReferenceContext(text: string, referenceBrief: string) {
  if (!referenceBrief) {
    return text;
  }

  return `${text} 참고 기준: ${referenceBrief}.`;
}

function formatReferenceHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function buildAudienceCards(
  category: WorkspaceCategory,
  cards: Array<{ title: string; description: string; priority: string }>
) {
  return cards.map((card, index) => {
    const template = getAudienceCardTemplate(category, index);
    const shouldRewrite = shouldRewriteAudienceCard(category, card);

    return {
      title: shouldRewrite ? template.title : card.title,
      description: shouldRewrite ? template.description : card.description,
      priority: isImplementationPriority(card.priority) ? template.priority : card.priority,
    };
  });
}

function shouldRewriteAudienceCard(
  category: WorkspaceCategory,
  card: { title: string; description: string }
) {
  if (category === "booking" || category === "internal" || category === "generic") {
    return true;
  }

  return isImplementationHeavyCopy(`${card.title} ${card.description}`);
}

function isImplementationHeavyCopy(text: string) {
  return /(조회|입력|제출|페이지|발송|crud|api|admin|dashboard|관리자|백오피스|백로그|구현|연동|등록|수정|삭제|폼|요청 처리|승인 처리|상태 관리)/i.test(
    text
  );
}

function isImplementationPriority(value: string) {
  return value === "critical" || value === "high" || value === "medium" || value === "low";
}

function resolveAudienceShowcaseNote(original: string, fallback: string) {
  return isImplementationPriority(original) ? fallback : original;
}

function getAudienceCardTemplate(category: WorkspaceCategory, index: number) {
  const templates: Record<
    WorkspaceCategory,
    Array<{ title: string; description: string; priority: string }>
  > = {
    commerce: [
      {
        title: "대표 제품을 빠르게 비교하게 만듭니다",
        description: "가격, 핵심 기능, 사용 포인트가 한눈에 들어오도록 정리합니다.",
        priority: "비교 포인트",
      },
      {
        title: "처음 방문해도 선택 기준이 분명합니다",
        description: "무엇이 다른지 짧고 분명하게 보여줘 문의 전 고민을 줄입니다.",
        priority: "선택 기준",
      },
      {
        title: "구매 전 불안을 줄이는 안내를 붙입니다",
        description: "배송, 설치, 교환 같은 확인 포인트를 같은 흐름 안에서 보여줍니다.",
        priority: "신뢰 요소",
      },
      {
        title: "문의와 구매가 자연스럽게 이어집니다",
        description: "카드 탐색에서 상담과 주문으로 바로 넘어갈 수 있게 구성합니다.",
        priority: "전환 흐름",
      },
    ],
    booking: [
      {
        title: "가능한 시간을 먼저 고르게 만듭니다",
        description: "복잡한 설명보다 예약 가능 여부와 시간 선택이 먼저 보이도록 정리합니다.",
        priority: "전환 포인트",
      },
      {
        title: "몇 단계 안에 예약을 완료하게 합니다",
        description: "입력 부담을 줄인 흐름으로 예약 신청까지 매끄럽게 이어지게 만듭니다.",
        priority: "예약 흐름",
      },
      {
        title: "접수 직후 안심할 정보를 바로 보여줍니다",
        description: "예약이 잘 들어갔는지, 다음에 무엇을 기다리면 되는지 즉시 안내합니다.",
        priority: "신뢰 안내",
      },
      {
        title: "확정과 변경 알림을 놓치지 않게 합니다",
        description: "확정, 변경, 취소 메시지가 자연스럽게 이어져 운영 문의를 줄입니다.",
        priority: "운영 안정성",
      },
    ],
    internal: [
      {
        title: "요청을 빠르게 등록하고 우선순위를 잡습니다",
        description: "운영자가 망설이지 않고 다음 액션을 시작할 수 있게 첫 단계를 단순화합니다.",
        priority: "운영 속도",
      },
      {
        title: "승인과 결정을 한 화면에서 끝냅니다",
        description: "중간 확인 과정을 줄여 팀이 더 빨리 판단하고 움직이게 합니다.",
        priority: "결정 효율",
      },
      {
        title: "상태와 담당자를 즉시 파악하게 만듭니다",
        description: "누가 무엇을 맡고 있는지 한눈에 읽혀서 추적 비용이 줄어듭니다.",
        priority: "가시성",
      },
      {
        title: "이력과 후속 작업이 자연스럽게 연결됩니다",
        description: "한 번 처리한 요청이 기록으로 남아 반복 업무를 줄이는 기반이 됩니다.",
        priority: "운영 체계",
      },
    ],
    portfolio: [
      {
        title: "대표 작업으로 실력을 먼저 증명합니다",
        description: "첫 화면에서 무엇을 잘하는지 바로 느껴지게 구성합니다.",
        priority: "대표 작업",
      },
      {
        title: "역할과 해결 과정을 짧게 이해시킵니다",
        description: "예쁜 결과물만이 아니라 문제를 푼 방식이 함께 읽히도록 만듭니다.",
        priority: "케이스 스터디",
      },
      {
        title: "결과와 성과를 신뢰로 연결합니다",
        description: "협업 맥락과 성과를 같이 보여줘 상담 전 확신을 높입니다.",
        priority: "신뢰 요소",
      },
      {
        title: "상담 요청으로 자연스럽게 이어집니다",
        description: "작업 감상에서 문의까지 흐름이 끊기지 않도록 설계합니다.",
        priority: "전환 흐름",
      },
    ],
    content: [
      {
        title: "첫 화면에서 읽고 싶은 글을 바로 고르게 합니다",
        description: "최신 글과 주제 구분이 한눈에 보이도록 정리합니다.",
        priority: "읽기 유도",
      },
      {
        title: "주제 탐색이 자연스럽게 이어집니다",
        description: "뉴스, 분석, 스토리 같은 흐름을 빠르게 훑을 수 있게 만듭니다.",
        priority: "탐색 구조",
      },
      {
        title: "저장과 구독의 이유를 분명하게 만듭니다",
        description: "한 번 읽고 끝나는 사이트가 아니라 다시 찾게 되는 흐름을 강화합니다.",
        priority: "재방문",
      },
      {
        title: "콘텐츠 신뢰가 쌓이는 편집 리듬을 만듭니다",
        description: "카드, 제목, 요약이 일정한 톤으로 이어져 사이트 인상이 정리됩니다.",
        priority: "편집 신뢰",
      },
    ],
    docs: [
      {
        title: "처음 온 사람도 바로 시작하게 만듭니다",
        description: "빠른 시작과 핵심 가이드를 가장 먼저 보이게 배치합니다.",
        priority: "빠른 시작",
      },
      {
        title: "필요한 문서를 헤매지 않게 정리합니다",
        description: "카테고리와 검색 흐름이 짧고 분명해서 온보딩 속도가 빨라집니다.",
        priority: "탐색 구조",
      },
      {
        title: "예시와 레퍼런스를 함께 보여줍니다",
        description: "개념만 설명하지 않고 바로 적용할 수 있는 문맥을 붙입니다.",
        priority: "실사용성",
      },
      {
        title: "지원 경로를 같은 화면에서 찾게 만듭니다",
        description: "FAQ와 도움말, 문의 포인트를 분리하지 않고 이어서 보여줍니다.",
        priority: "지원 흐름",
      },
    ],
    event: [
      {
        title: "일정이 가장 먼저 눈에 들어오게 만듭니다",
        description: "무엇이 언제 열리는지 빠르게 읽혀야 등록 결정이 쉬워집니다.",
        priority: "일정 안내",
      },
      {
        title: "연사와 프로그램을 함께 설득 포인트로 씁니다",
        description: "참가 이유가 되는 콘텐츠를 짧게 훑고 바로 등록으로 넘어가게 합니다.",
        priority: "참가 유도",
      },
      {
        title: "티켓과 등록 정보를 망설임 없이 찾게 합니다",
        description: "행사 정보가 좋아도 등록 경로가 복잡하면 전환이 끊기기 쉽습니다.",
        priority: "등록 흐름",
      },
      {
        title: "장소와 후속 안내까지 한 번에 정리합니다",
        description: "참가 전 준비부터 행사 후 리캡까지 이어지는 경험을 설계합니다.",
        priority: "참가 신뢰",
      },
    ],
    hospitality: [
      {
        title: "방문 전에 보고 싶은 정보를 먼저 보여줍니다",
        description: "메뉴, 위치, 운영시간처럼 결정에 필요한 정보가 먼저 읽히게 만듭니다.",
        priority: "방문 포인트",
      },
      {
        title: "공간 분위기와 예약 흐름을 함께 설득합니다",
        description: "사진만 예쁜 페이지가 아니라 실제 방문 결정을 돕는 구조로 바꿉니다.",
        priority: "예약 유도",
      },
      {
        title: "메뉴 선택이 쉬운 카드 흐름을 만듭니다",
        description: "대표 메뉴와 특징을 짧게 보여줘 고민 시간을 줄입니다.",
        priority: "선택 기준",
      },
      {
        title: "찾아오는 길과 운영 정책을 분명히 합니다",
        description: "방문 전 자주 묻는 질문을 한 화면에서 해결하게 만듭니다.",
        priority: "방문 신뢰",
      },
    ],
    generic: [
      {
        title: "첫 화면에서 무엇을 하는지 바로 이해시킵니다",
        description: "방문자가 5초 안에 서비스의 핵심 가치를 읽을 수 있게 정리합니다.",
        priority: "첫인상",
      },
      {
        title: "장점과 핵심 기능을 카드로 분명히 보여줍니다",
        description: "설명보다 이해가 먼저 되도록 짧은 메시지 중심으로 구성합니다.",
        priority: "핵심 가치",
      },
      {
        title: "신뢰 정보와 선택 이유를 자연스럽게 붙입니다",
        description: "후기, 수치, 운영 기준 같은 요소가 전환 앞에서 역할을 하게 만듭니다.",
        priority: "신뢰 요소",
      },
      {
        title: "문의와 다음 행동으로 부드럽게 연결합니다",
        description: "마지막까지 흐름이 끊기지 않게 CTA와 안내를 이어 붙입니다.",
        priority: "전환 흐름",
      },
    ],
  };

  const items = templates[category];
  return items[index % items.length];
}

function buildImplementationGuide(
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[],
  blueprint: WorkspaceBlueprint,
  repairProfile: RepairProfile | null
) {
  const designReferenceBrief = buildDesignReferenceBrief(input.designReference);

  return [
    "# Implementation Guide",
    "",
    "## What We Are Building",
    `- Project: ${input.name}`,
    `- Category: ${blueprint.category}`,
    `- Primary page: ${blueprint.heroTitle} website`,
    ...(designReferenceBrief
      ? [
          "",
          "## Design Reference",
          designReferenceBrief,
        ]
      : []),
    "",
    "## Required Homepage Sections",
    "- Header-led navigation with a sticky top bar and visible CTAs",
    "- Hero with a clear promise and two CTAs",
    "- Metrics or trust strip above the fold",
    "- A horizontal rail or carousel for fast scanning of key items",
    "- Visual assets or generated artwork for hero and showcase cards",
    "- Showcase grid with real-looking products or outcomes",
    "- Build plan cards that mirror the top backlog items",
    "- Process or workflow section",
    "- Contact, support, or next-step section for final conversion",
    "- FAQ and a structured footer",
    "",
    "## Non-Negotiables",
    "- No lorem ipsum or placeholder-only content",
    "- No single-color empty page",
    "- No invisible CTA",
    "- No layout that breaks on mobile",
    "- No page that feels like one undifferentiated card dump",
    "",
    "## Role Briefs",
    ...Object.entries(ROLE_BRIEFS).flatMap(([role, brief]) => [
      `### ${getAgentTypeLabel(role)}`,
      brief,
      "",
    ]),
    "## Role Checklists",
    ...Object.entries(ROLE_CHECKLISTS).flatMap(([role, items]) => [
      `### ${getAgentTypeLabel(role)} (${role})`,
      ...items.map((item) => `- ${item}`),
      "",
    ]),
    "## Definition of Done",
    "- Header anchors the page and exposes the main sections.",
    ...[
      "Hero exists and explains the value in one sentence.",
      "The page uses section rhythm instead of stacking everything equally.",
      "At least three meaningful showcase cards are visible.",
      "At least one primary CTA and one secondary CTA are visible above the fold.",
      "Backlog is translated into visible implementation intent, not just stored in DB.",
      "The page reads like a real product, not a generator demo.",
      "A horizontal rail or carousel appears where it helps readability.",
      "Responsive layout works on mobile and desktop.",
    ].map((line) => `- ${line}`),
    "",
    "## Build Plan Snapshot",
    ...backlogItems.slice(0, 5).map((item, index) => `- ${index + 1}. ${item.title} (${item.priority})`),
    "",
    "## Repair Focus",
    ...(repairProfile
      ? repairProfile.focusMessages.flatMap((item) => [
          `### ${getAgentTypeLabel(item.role)} (${item.role})`,
          `- count: ${item.count}`,
          `- focus: ${item.message}`,
          "",
        ])
      : ["- none"]),
  ].join("\n");
}

function buildRoleQualityMarkdown(
  roleQualityStats: RoleQualityStats,
  repairProfile: RepairProfile | null
) {
  const sortedRoles = (Object.entries(roleQualityStats) as Array<[WorkflowRole, number]>)
    .sort((a, b) => b[1] - a[1]);
  const criticFocus = repairProfile?.focusMessages.filter((item) => item.role === "critic") ?? [];

  return [
    "# Role Quality",
    "",
    "## Cumulative Counts",
    ...sortedRoles.map(([role, count]) => `- ${getAgentTypeLabel(role)} (${role}): ${count}`),
    "",
    "## Repair Focus",
    ...(repairProfile
      ? [
          ...(criticFocus.length
            ? [
                "### Critic Lens",
                ...criticFocus.map(
                  (item) => `- ${getAgentTypeLabel(item.role)}: ${item.message} (${item.count}) [${item.role}]`
                ),
                "",
              ]
            : []),
          "### Full Focus",
          ...repairProfile.focusMessages.map(
            (item) => `- ${getAgentTypeLabel(item.role)} (${item.role}): ${item.message} (${item.count})`
          ),
        ]
      : ["- none"]),
    "",
  ].join("\n");
}

function createEmptyRoleQualityStats(): RoleQualityStats {
  return {
    planner: 0,
    critic: 0,
    designer: 0,
    coder: 0,
    tester: 0,
  };
}

function buildVisualAssetBundle(
  input: ProjectBootstrapInput,
  category: WorkspaceCategory,
  showcaseItems: Array<{ title: string; description: string; note: string }>,
  heroFallbackLabel: string
) {
  const colors = selectVisualTheme(input, category).palette;
  const visualAssetPlan =
    input.visualAssetPlan ?? legacyVisualAssetsToPlan(input.visualAssets, input.name);
  const heroImage =
    normalizeVisualAssetSource(visualAssetPlan?.hero?.source)
    ?? buildDefaultVisualImage({
      title: input.name,
      subtitle: heroFallbackLabel,
      accent: colors[0],
      detail: input.description || "Visual asset",
    });

  const showcaseImages = showcaseItems.map((item, index) => {
    const provided = visualAssetPlan?.gallery?.[index]?.source;
    return (
      normalizeVisualAssetSource(provided) ??
      buildDefaultVisualImage({
        title: item.title,
        subtitle: item.note,
        accent: colors[(index + 1) % colors.length],
        detail: item.description,
      })
    );
  });

  return {
    heroImage,
    showcaseImages,
  };
}

function legacyVisualAssetsToPlan(
  value: ProjectBootstrapInput["visualAssets"],
  projectName: string
) {
  const heroImage = value?.heroImage?.trim();
  const galleryImages = value?.galleryImages?.map((item) => item.trim()).filter(Boolean) ?? [];

  const hero = heroImage
    ? {
        source: heroImage,
        alt: `${projectName} hero image`,
      }
    : undefined;
  const gallery = galleryImages.map((source, index) => ({
    source,
    alt: `${projectName} gallery image ${index + 1}`,
  }));

  if (!hero && gallery.length === 0) {
    return undefined;
  }

  return {
    ...(hero ? { hero } : {}),
    ...(gallery.length
      ? {
          gallery,
        }
      : {}),
  };
}

function normalizeVisualAssetSource(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildDefaultVisualImage(input: {
  title: string;
  subtitle: string;
  detail: string;
  accent: string;
}) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${input.accent}" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#0f172a" stop-opacity="1" />
        </linearGradient>
        <radialGradient id="glow" cx="0.25" cy="0.2" r="0.8">
          <stop offset="0%" stop-color="#fff7ed" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#fff7ed" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="900" rx="72" fill="url(#bg)" />
      <rect x="80" y="80" width="1040" height="740" rx="48" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.24)" />
      <circle cx="940" cy="170" r="220" fill="url(#glow)" />
      <circle cx="260" cy="690" r="180" fill="rgba(255,255,255,0.14)" />
      <text x="130" y="180" fill="#fff7ed" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="700" letter-spacing="4">${escapeHtml(
        input.subtitle
      )}</text>
      <text x="130" y="310" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="800">${escapeHtml(
        input.title
      )}</text>
      <text x="130" y="380" fill="#e2e8f0" font-family="Inter, Arial, sans-serif" font-size="30">${escapeHtml(
        input.detail
      )}</text>
      <rect x="130" y="500" width="320" height="18" rx="9" fill="rgba(255,255,255,0.65)" />
      <rect x="130" y="540" width="510" height="18" rx="9" fill="rgba(255,255,255,0.45)" />
      <rect x="130" y="580" width="420" height="18" rx="9" fill="rgba(255,255,255,0.32)" />
      <g transform="translate(830 520)">
        <rect width="220" height="220" rx="40" fill="rgba(255,255,255,0.12)" />
        <path d="M40 150L92 92L134 132L180 86" stroke="#fff7ed" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="70" cy="72" r="18" fill="#fff7ed" />
      </g>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const VISUAL_THEME_LIBRARY: Record<VisualThemeVariant, VisualThemeSpec> = {
  editorial: {
    key: "editorial",
    pageShell:
      "min-h-screen bg-[radial-gradient(circle_at_top,_#fff8ef_0,_#f7efe1_34%,_#ede5d6_100%)] text-slate-950",
    headerShell: "sticky top-0 z-30 border-b border-white/70 bg-white/78 backdrop-blur-xl",
    heroSectionShell: "mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[1.08fr_0.92fr] lg:px-8",
    heroShell: "overflow-hidden rounded-[2.5rem] border border-white/80 bg-white/90 p-4 shadow-2xl shadow-amber-200/30",
    heroMediaShell:
      "relative min-h-[22rem] overflow-hidden rounded-[1.85rem] border border-slate-900/5 bg-slate-950",
    sectionShell: "grid gap-5 rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-sm",
    cardShell: "rounded-[1.75rem] border border-amber-100 bg-white/92 p-6 shadow-sm",
    featuredCardShell:
      "overflow-hidden rounded-[1.65rem] border border-slate-200 bg-white shadow-sm",
    processShell: "rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-sm",
    faqShell: "rounded-[2rem] border border-amber-100 bg-white/92 p-8 shadow-sm",
    footerShell: "grid gap-4 rounded-[1.75rem] border border-slate-200 bg-white/90 p-6 shadow-sm",
    trustChipShell: "rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white/90",
    chipShell: "rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm",
    footerChipShell:
      "rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white",
    logoShell: "flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15",
    primaryButtonShell:
      "rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5",
    secondaryButtonShell:
      "rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-white",
    accentLabel: "text-amber-700",
    mutedLabel: "text-slate-500",
    palette: ["#f97316", "#fb7185", "#0f172a"],
  },
  midnight: {
    key: "midnight",
    pageShell:
      "min-h-screen bg-[radial-gradient(circle_at_top,_#1d4ed8_0,_#020617_45%,_#020617_100%)] text-slate-50",
    headerShell: "sticky top-0 z-30 border-b border-white/10 bg-slate-950/82 backdrop-blur-xl",
    heroSectionShell: "mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[0.92fr_1.08fr] lg:px-8",
    heroShell:
      "overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur",
    heroMediaShell:
      "relative min-h-[22rem] overflow-hidden rounded-[1.85rem] border border-white/10 bg-slate-900",
    sectionShell: "grid gap-5 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur",
    cardShell: "rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur",
    featuredCardShell:
      "overflow-hidden rounded-[1.65rem] border border-white/10 bg-slate-900/70 shadow-sm backdrop-blur",
    processShell: "rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-sm backdrop-blur",
    faqShell: "rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-sm backdrop-blur",
    footerShell: "grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur",
    trustChipShell: "rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-100",
    chipShell:
      "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 backdrop-blur",
    footerChipShell:
      "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 backdrop-blur",
    logoShell:
      "flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white shadow-lg shadow-slate-950/20 backdrop-blur",
    primaryButtonShell:
      "rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 shadow-lg shadow-cyan-200/30 transition hover:-translate-y-0.5",
    secondaryButtonShell:
      "rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-100 transition hover:-translate-y-0.5 hover:bg-white/10 backdrop-blur",
    accentLabel: "text-cyan-300",
    mutedLabel: "text-slate-300",
    palette: ["#22d3ee", "#8b5cf6", "#020617"],
  },
  sunrise: {
    key: "sunrise",
    pageShell:
      "min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed_0,_#ffedd5_38%,_#fde68a_100%)] text-slate-950",
    headerShell: "sticky top-0 z-30 border-b border-orange-100 bg-white/72 backdrop-blur-xl",
    heroSectionShell: "mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[1.16fr_0.84fr] lg:px-8",
    heroShell:
      "overflow-hidden rounded-[2.7rem] border border-orange-100 bg-white/90 p-5 shadow-2xl shadow-orange-200/35",
    heroMediaShell:
      "relative min-h-[22rem] overflow-hidden rounded-[1.9rem] border border-orange-100 bg-slate-950",
    sectionShell: "grid gap-5 rounded-[2rem] border border-orange-100 bg-white/90 p-6 shadow-sm",
    cardShell: "rounded-[1.75rem] border border-orange-100 bg-white/95 p-6 shadow-sm",
    featuredCardShell:
      "overflow-hidden rounded-[1.65rem] border border-orange-100 bg-white shadow-sm",
    processShell: "rounded-[2rem] border border-orange-100 bg-white/90 p-8 shadow-sm",
    faqShell: "rounded-[2rem] border border-orange-100 bg-white/92 p-8 shadow-sm",
    footerShell: "grid gap-4 rounded-[1.75rem] border border-orange-100 bg-white/90 p-6 shadow-sm",
    trustChipShell: "rounded-2xl bg-orange-50 px-4 py-3 text-sm text-slate-800",
    chipShell:
      "rounded-full border border-orange-100 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm",
    footerChipShell:
      "rounded-full border border-orange-100 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white",
    logoShell:
      "flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200/30",
    primaryButtonShell:
      "rounded-full bg-orange-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-orange-200/30 transition hover:-translate-y-0.5",
    secondaryButtonShell:
      "rounded-full border border-orange-100 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-white",
    accentLabel: "text-orange-700",
    mutedLabel: "text-slate-500",
    palette: ["#f59e0b", "#f97316", "#7c2d12"],
  },
  cool: {
    key: "cool",
    pageShell:
      "min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#ecfeff_48%,_#e0f2fe_100%)] text-slate-950",
    headerShell: "sticky top-0 z-30 border-b border-cyan-100 bg-white/72 backdrop-blur-xl",
    heroSectionShell: "mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[1.02fr_0.98fr] lg:px-8",
    heroShell: "overflow-hidden rounded-[2.5rem] border border-cyan-100 bg-white/88 p-4 shadow-2xl shadow-cyan-200/30",
    heroMediaShell:
      "relative min-h-[22rem] overflow-hidden rounded-[1.85rem] border border-cyan-100 bg-slate-950",
    sectionShell: "grid gap-5 rounded-[2rem] border border-cyan-100 bg-white/90 p-6 shadow-sm",
    cardShell: "rounded-[1.75rem] border border-cyan-100 bg-white/95 p-6 shadow-sm",
    featuredCardShell:
      "overflow-hidden rounded-[1.65rem] border border-cyan-100 bg-white shadow-sm",
    processShell: "rounded-[2rem] border border-cyan-100 bg-white/90 p-8 shadow-sm",
    faqShell: "rounded-[2rem] border border-cyan-100 bg-white/92 p-8 shadow-sm",
    footerShell: "grid gap-4 rounded-[1.75rem] border border-cyan-100 bg-white/90 p-6 shadow-sm",
    trustChipShell: "rounded-2xl bg-cyan-50 px-4 py-3 text-sm text-slate-700",
    chipShell:
      "rounded-full border border-cyan-100 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm",
    footerChipShell:
      "rounded-full border border-cyan-100 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white",
    logoShell:
      "flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500 text-white shadow-lg shadow-cyan-200/30",
    primaryButtonShell:
      "rounded-full bg-cyan-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-cyan-200/30 transition hover:-translate-y-0.5",
    secondaryButtonShell:
      "rounded-full border border-cyan-100 bg-white/80 px-5 py-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-white",
    accentLabel: "text-cyan-700",
    mutedLabel: "text-slate-500",
    palette: ["#0ea5e9", "#14b8a6", "#1e3a8a"],
  },
};

function selectVisualTheme(input: ProjectBootstrapInput, category: WorkspaceCategory): VisualThemeSpec {
  const hint = buildVisualHint(input, category);

  if (/(dark|noir|midnight|moody|시크|다크|블랙)/.test(hint)) {
    return VISUAL_THEME_LIBRARY.midnight;
  }

  if (/(editorial|magazine|minimal|clean|serif|편집|미니멀|담백)/.test(hint)) {
    return VISUAL_THEME_LIBRARY.editorial;
  }

  if (/(bright|sun|playful|warm|friendly|밝|활기|경쾌|포근)/.test(hint)) {
    return VISUAL_THEME_LIBRARY.sunrise;
  }

  if (/(cool|tech|glass|futuristic|테크|글래스|모던|neo)/.test(hint)) {
    return VISUAL_THEME_LIBRARY.cool;
  }

  const seed = stableHash(hint);
  const categoryBias = stableHash(category);
  const variants = Object.values(VISUAL_THEME_LIBRARY);
  return variants[(seed + categoryBias) % variants.length];
}

function selectTypographyProfile(
  input: ProjectBootstrapInput,
  category: WorkspaceCategory,
  theme: VisualThemeSpec
): TypographyProfile {
  const hint = buildVisualHint(input, category);

  if (category === "booking") {
    return { key: "motion-sans", sansVariable: "var(--font-sora)", displayVariable: "var(--font-space-grotesk)" };
  }

  if (category === "internal" || category === "docs") {
    return { key: "systems", sansVariable: "var(--font-ibm-plex-sans)", displayVariable: "var(--font-space-grotesk)" };
  }

  if (category === "portfolio" || category === "hospitality" || category === "event") {
    return { key: "serif-contrast", sansVariable: "var(--font-sora)", displayVariable: "var(--font-cormorant)" };
  }

  if (category === "content") {
    return { key: "editorial", sansVariable: "var(--font-manrope)", displayVariable: "var(--font-fraunces)" };
  }

  if (/(luxury|hotel|gallery|brand|portfolio|editorial|magazine|브랜드|포트폴리오|에디토리얼)/.test(hint)) {
    return { key: "serif-contrast", sansVariable: "var(--font-sora)", displayVariable: "var(--font-cormorant)" };
  }

  if (/(docs|manual|guide|internal|ops|dashboard|tech|api|문서|운영|관리|대시보드)/.test(hint)) {
    return { key: "systems", sansVariable: "var(--font-ibm-plex-sans)", displayVariable: "var(--font-space-grotesk)" };
  }

  if (/(booking|reservation|calendar|schedule|event|예약|일정|행사)/.test(hint)) {
    return { key: "motion-sans", sansVariable: "var(--font-sora)", displayVariable: "var(--font-space-grotesk)" };
  }

  if (theme.key === "editorial") {
    return { key: "editorial", sansVariable: "var(--font-manrope)", displayVariable: "var(--font-fraunces)" };
  }

  if (theme.key === "cool") {
    return { key: "cool-systems", sansVariable: "var(--font-ibm-plex-sans)", displayVariable: "var(--font-space-grotesk)" };
  }

  return { key: "classic", sansVariable: "var(--font-manrope)", displayVariable: "var(--font-fraunces)" };
}

function selectPageSurfaceProfile(category: WorkspaceCategory, theme: VisualThemeSpec): PageSurfaceProfile {
  const [primary, secondary, accent] = theme.palette;

  if (category === "portfolio") {
    return {
      background: "#faf6ef",
      foreground: theme.key === "midnight" ? "#f8fafc" : "#111827",
      pageSurface: `radial-gradient(circle at 16% 18%, ${withAlpha(primary, 0.18)} 0, transparent 28%), radial-gradient(circle at 85% 16%, ${withAlpha(secondary, 0.16)} 0, transparent 24%), linear-gradient(180deg, #fffaf4 0%, #efe5d8 100%)`,
      pageOverlay: `repeating-linear-gradient(90deg, ${withAlpha(accent, 0.06)} 0 1px, transparent 1px 28px), repeating-linear-gradient(0deg, ${withAlpha(primary, 0.04)} 0 1px, transparent 1px 28px)`,
      overlayOpacity: "0.42",
      selection: withAlpha(primary, 0.26),
    };
  }

  if (category === "content") {
    return {
      background: "#fbf7f0",
      foreground: "#111827",
      pageSurface: `radial-gradient(circle at top, ${withAlpha(primary, 0.14)} 0, transparent 34%), linear-gradient(180deg, #fffdf8 0%, #f4ede3 100%)`,
      pageOverlay: `repeating-linear-gradient(0deg, ${withAlpha(accent, 0.05)} 0 1px, transparent 1px 30px)`,
      overlayOpacity: "0.38",
      selection: withAlpha(secondary, 0.24),
    };
  }

  if (category === "docs") {
    return {
      background: "#f6f8fb",
      foreground: "#0f172a",
      pageSurface: `linear-gradient(180deg, #f8fbff 0%, #edf5fb 100%)`,
      pageOverlay: `linear-gradient(${withAlpha(primary, 0.06)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(accent, 0.06)} 1px, transparent 1px)`,
      overlayOpacity: "0.52",
      selection: withAlpha(primary, 0.22),
    };
  }

  if (category === "booking") {
    return {
      background: "#f3fbfd",
      foreground: "#082f49",
      pageSurface: `radial-gradient(circle at 18% 20%, ${withAlpha(primary, 0.16)} 0, transparent 26%), radial-gradient(circle at 82% 12%, ${withAlpha(secondary, 0.14)} 0, transparent 20%), linear-gradient(180deg, #f7feff 0%, #e6f7fb 100%)`,
      pageOverlay: `repeating-linear-gradient(135deg, ${withAlpha(accent, 0.05)} 0 2px, transparent 2px 18px)`,
      overlayOpacity: "0.34",
      selection: withAlpha(primary, 0.24),
    };
  }

  if (category === "internal") {
    return {
      background: "#f5f7fb",
      foreground: "#111827",
      pageSurface: `linear-gradient(180deg, #f8fbff 0%, #eef2ff 46%, #e8eef8 100%)`,
      pageOverlay: `linear-gradient(${withAlpha(accent, 0.07)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(primary, 0.05)} 1px, transparent 1px)`,
      overlayOpacity: "0.46",
      selection: withAlpha(accent, 0.22),
    };
  }

  if (category === "event") {
    return {
      background: theme.key === "midnight" ? "#020617" : "#fff8f1",
      foreground: theme.key === "midnight" ? "#f8fafc" : "#111827",
      pageSurface: `radial-gradient(circle at 50% 0%, ${withAlpha(primary, 0.22)} 0, transparent 32%), linear-gradient(180deg, ${theme.key === "midnight" ? "#020617" : "#fff9f2"} 0%, ${theme.key === "midnight" ? "#111827" : "#f4e6d4"} 100%)`,
      pageOverlay: `radial-gradient(${withAlpha(secondary, 0.12)} 1px, transparent 1px)`,
      overlayOpacity: "0.44",
      selection: withAlpha(primary, 0.26),
    };
  }

  if (category === "hospitality") {
    return {
      background: "#fbf5ec",
      foreground: "#1f2937",
      pageSurface: `radial-gradient(circle at 14% 16%, ${withAlpha(primary, 0.16)} 0, transparent 24%), linear-gradient(180deg, #fff9f3 0%, #efe2d0 100%)`,
      pageOverlay: `repeating-radial-gradient(circle at center, ${withAlpha(secondary, 0.05)} 0 2px, transparent 2px 18px)`,
      overlayOpacity: "0.26",
      selection: withAlpha(secondary, 0.22),
    };
  }

  return {
    background: theme.key === "midnight" ? "#020617" : "#fffaf3",
    foreground: theme.key === "midnight" ? "#f8fafc" : "#111827",
    pageSurface:
      theme.key === "midnight"
        ? `radial-gradient(circle at top, ${withAlpha(primary, 0.24)} 0, transparent 34%), linear-gradient(180deg, #020617 0%, #0f172a 100%)`
        : `radial-gradient(circle at top, ${withAlpha(primary, 0.14)} 0, transparent 35%), linear-gradient(180deg, #fffaf3 0%, #f6efe0 100%)`,
    pageOverlay: `repeating-linear-gradient(90deg, ${withAlpha(accent, 0.04)} 0 1px, transparent 1px 26px)`,
    overlayOpacity: "0.3",
    selection: withAlpha(primary, 0.24),
  };
}

function buildVisualHint(input: ProjectBootstrapInput, category: WorkspaceCategory) {
  return normalizeThemeHint(
    [
      input.name,
      input.description,
      input.requirements.targetAudience,
      input.requirements.mustHaves,
      input.requirements.niceToHaves,
      input.requirements.constraints,
      input.designReference?.siteUrl,
      input.designReference?.summary,
      input.designReference?.notes,
      input.designReference?.mood,
      category,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function normalizeThemeHint(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildAdaptiveBlueprint(
  input: ProjectBootstrapInput,
  category: "portfolio" | "content" | "docs" | "event" | "hospitality",
  buildPlanCards: Array<{ title: string; description: string; priority: string }>
): WorkspaceBlueprint {
  const themes: Record<
    typeof category,
    Pick<
      WorkspaceBlueprint,
      | "heroEyebrow"
      | "primaryCta"
      | "secondaryCta"
      | "metrics"
      | "valueProps"
      | "collectionFilters"
      | "trustPoints"
      | "editorialSpotlight"
      | "socialProof"
      | "serviceCards"
      | "processSteps"
      | "faq"
    >
  > = {
    portfolio: {
      heroEyebrow: "Portfolio Studio",
      primaryCta: "Selected Work",
      secondaryCta: "Capabilities",
      metrics: [
        { label: "핵심 가치", value: "작품과 결과를 먼저 보여줌" },
        { label: "구현 초점", value: "신뢰와 결과 중심" },
        { label: "품질 기준", value: "비주얼 위계 / 반응형" },
      ],
      valueProps: [
        { title: "결과 중심 소개", description: "작업물, 역할, 성과를 한 눈에 읽히게 배치합니다." },
        { title: "의도 있는 비주얼", description: "이미지와 텍스트가 같은 리듬으로 움직이게 만듭니다." },
        { title: "문의로 이어지는 구조", description: "작품 감상에서 상담 요청으로 자연스럽게 넘어갑니다." },
      ],
      collectionFilters: [
        { label: "Selected", note: "추천 작업" },
        { label: "Brand", note: "브랜드" },
        { label: "Product", note: "제품" },
        { label: "Motion", note: "모션" },
      ],
      trustPoints: [
        "작품과 설명이 한 화면에 정리됨",
        "상담 CTA가 포트폴리오 흐름 안에 들어감",
        "모바일에서 작업물 우선 노출",
      ],
      editorialSpotlight: {
        eyebrow: "Portfolio Story",
        title: "작품이 곧 소개서가 되는 구조",
        description:
          "포트폴리오는 예쁜 이미지 모음이 아니라, 무엇을 잘하는지 증명하는 자료입니다. 결과와 과정이 같이 보여야 합니다.",
        bullets: [
          "대표 작업을 첫 화면에서 바로 확인",
          "성과와 역할 범위를 함께 노출",
          "문의가 쉬운 상담 동선 확보",
        ],
      },
      socialProof: {
        eyebrow: "Client Feedback",
        title: "신뢰는 결과와 맥락에서 나온다",
        summary: "프로젝트 만족도 4.8/5 · 재의뢰율 높음",
        score: "4.8/5",
        quotes: [
          {
            name: "클라이언트 A",
            role: "Brand lead",
            quote: "작업 의도와 결과가 같이 보여서 내부 설명이 쉬웠습니다.",
          },
        ],
      },
      serviceCards: [
        { title: "Case Study", description: "문제, 접근, 결과를 짧고 강하게 보여줍니다." },
        { title: "Capabilities", description: "할 수 있는 일을 한눈에 정리합니다." },
        { title: "Testimonials", description: "협업 신뢰를 쌓는 추천사를 배치합니다." },
        { title: "Contact", description: "상담과 제안을 바로 보낼 수 있습니다." },
      ],
      processSteps: [
        { step: "01", title: "작품 발견", description: "대표 결과물을 먼저 읽게 합니다." },
        { step: "02", title: "역할 확인", description: "무엇을 맡았는지 분명히 보여줍니다." },
        { step: "03", title: "사례 탐색", description: "과정과 결과를 함께 확인합니다." },
        { step: "04", title: "상담 연결", description: "문의로 자연스럽게 넘어갑니다." },
      ],
      faq: [
        { question: "어떤 작업을 보여주면 좋나요?", answer: "가장 대표적인 결과와 역할이 분명한 작업을 우선 배치합니다." },
        { question: "문의는 어디에 두나요?", answer: "헤더, hero, footer, CTA rail에 모두 노출해 전환을 놓치지 않게 합니다." },
      ],
    },
    content: {
      heroEyebrow: "Editorial Site",
      primaryCta: "Latest Stories",
      secondaryCta: "Topics",
      metrics: [
        { label: "핵심 가치", value: "읽고, 저장하고, 다시 방문" },
        { label: "구현 초점", value: "편집 흐름과 가독성" },
        { label: "품질 기준", value: "타이포 / 스캔성 / 반응형" },
      ],
      valueProps: [
        { title: "읽기 좋은 첫 화면", description: "헤드라인, 리드, 카드가 자연스럽게 이어집니다." },
        { title: "주제 구조", description: "주제별 탐색과 최신 글을 함께 보여줍니다." },
        { title: "재방문 유도", description: "구독과 저장으로 다시 들어올 이유를 만듭니다." },
      ],
      collectionFilters: [
        { label: "All", note: "전체" },
        { label: "News", note: "뉴스" },
        { label: "Analysis", note: "분석" },
        { label: "Stories", note: "스토리" },
      ],
      trustPoints: [
        "주제와 최신 글이 같이 보임",
        "구독 CTA가 시선을 끊지 않음",
        "긴 글도 스캔하기 쉬움",
      ],
      editorialSpotlight: {
        eyebrow: "Editorial Rhythm",
        title: "제목만 좋은 사이트는 오래 못 간다",
        description:
          "콘텐츠 사이트는 제목, 주제, 구독, 저장 흐름이 있어야 합니다. 읽고 끝나는 것이 아니라 다시 찾게 해야 합니다.",
        bullets: [
          "최신 글과 카테고리를 같이 배치",
          "구독과 북마크 진입점을 분명히",
          "글 사이의 여백과 대비를 크게",
        ],
      },
      socialProof: {
        eyebrow: "Readers",
        title: "반복 방문을 만드는 편집 신뢰",
        summary: "구독자 12k · 평균 체류시간 4분",
        score: "12k",
        quotes: [
          {
            name: "독자",
            role: "Subscriber",
            quote: "주제별 정리가 잘 돼 있어서 필요한 글을 빨리 찾을 수 있어요.",
          },
        ],
      },
      serviceCards: [
        { title: "Topics", description: "주제를 명확히 분류합니다." },
        { title: "Subscribe", description: "새 글을 놓치지 않게 합니다." },
        { title: "Archive", description: "과거 글도 찾기 쉽게 정리합니다." },
        { title: "Search", description: "원하는 글을 바로 찾습니다." },
      ],
      processSteps: [
        { step: "01", title: "읽기", description: "첫 화면에서 주제를 파악합니다." },
        { step: "02", title: "탐색", description: "필터와 주제별 목록으로 이동합니다." },
        { step: "03", title: "구독", description: "관심 콘텐츠를 계속 받습니다." },
        { step: "04", title: "재방문", description: "아카이브와 추천으로 돌아옵니다." },
      ],
      faq: [
        { question: "뉴스와 칼럼을 같이 보여줄 수 있나요?", answer: "네, 주제 필터와 콘텐츠 카드로 함께 운영할 수 있습니다." },
        { question: "구독 기능은 어디에 두나요?", answer: "헤더와 footer, editorial rail에 같이 둡니다." },
      ],
    },
    docs: {
      heroEyebrow: "Documentation Hub",
      primaryCta: "Quick Start",
      secondaryCta: "Reference",
      metrics: [
        { label: "핵심 가치", value: "찾기 쉬운 문서" },
        { label: "구현 초점", value: "구조와 탐색성" },
        { label: "품질 기준", value: "검색 / 계층 / 가독성" },
      ],
      valueProps: [
        { title: "빠른 시작", description: "처음 들어온 사람이 바로 시작할 수 있게 합니다." },
        { title: "명확한 레퍼런스", description: "개념, 옵션, 예시를 한 흐름으로 묶습니다." },
        { title: "지원 연결", description: "도움말과 문의 경로를 분명히 둡니다." },
      ],
      collectionFilters: [
        { label: "Start", note: "시작" },
        { label: "Guide", note: "가이드" },
        { label: "API", note: "API" },
        { label: "FAQ", note: "자주 묻는 질문" },
      ],
      trustPoints: [
        "문서 진입점이 분명함",
        "검색과 카테고리가 우선",
        "지원 경로가 보임",
      ],
      editorialSpotlight: {
        eyebrow: "Docs Story",
        title: "문서는 읽히는 순간에 완성된다",
        description:
          "문서 사이트는 정보가 많아도 못 찾으면 의미가 없습니다. 빠른 시작, 레퍼런스, 지원 경로가 같이 있어야 합니다.",
        bullets: [
          "빠른 시작을 항상 첫 번째로",
          "레퍼런스와 예시를 함께 배치",
          "검색과 FAQ를 같은 레벨로",
        ],
      },
      socialProof: {
        eyebrow: "Teams",
        title: "팀이 신뢰하는 문서 구조",
        summary: "문서 검색 성공률 98%",
        score: "98%",
        quotes: [
          {
            name: "개발팀",
            role: "Contributor",
            quote: "무엇부터 보면 되는지 분명해서 온보딩이 빨라졌습니다.",
          },
        ],
      },
      serviceCards: [
        { title: "Quick Start", description: "처음 읽는 사람을 위한 최소 경로." },
        { title: "Reference", description: "세부 옵션과 예시를 정리." },
        { title: "Search", description: "원하는 문서를 빠르게 탐색." },
        { title: "Support", description: "도움말과 문의 경로를 안내." },
      ],
      processSteps: [
        { step: "01", title: "시작", description: "가장 먼저 볼 페이지로 안내합니다." },
        { step: "02", title: "탐색", description: "주제별로 문서를 찾아갑니다." },
        { step: "03", title: "적용", description: "코드나 운영에 바로 반영합니다." },
        { step: "04", title: "지원", description: "궁금한 점은 FAQ와 문의로 연결합니다." },
      ],
      faq: [
        { question: "문서 사이트에 뭐가 제일 중요하죠?", answer: "시작 경로와 검색입니다." },
        { question: "문의는 꼭 필요할까요?", answer: "지원 경로가 있어야 실제 사용성이 높아집니다." },
      ],
    },
    event: {
      heroEyebrow: "Event Platform",
      primaryCta: "Schedule",
      secondaryCta: "Speakers",
      metrics: [
        { label: "핵심 가치", value: "참가 전환과 일정" },
        { label: "구현 초점", value: "프로그램과 신뢰" },
        { label: "품질 기준", value: "스케줄 / 티켓 / 모바일" },
      ],
      valueProps: [
        { title: "명확한 일정", description: "행사 일정과 세션 정보를 한눈에 보여줍니다." },
        { title: "참가 유도", description: "티켓과 등록 CTA가 자연스럽게 이어집니다." },
        { title: "행사 신뢰", description: "연사, 장소, 후속 정보를 함께 노출합니다." },
      ],
      collectionFilters: [
        { label: "Agenda", note: "일정" },
        { label: "Speakers", note: "연사" },
        { label: "Tickets", note: "티켓" },
        { label: "Venue", note: "장소" },
      ],
      trustPoints: [
        "일정과 등록이 먼저 보임",
        "연사와 장소 정보가 분명함",
        "모바일에서 빠르게 신청 가능",
      ],
      editorialSpotlight: {
        eyebrow: "Event Flow",
        title: "행사는 설득보다 일정이 먼저다",
        description:
          "이벤트 사이트는 무엇보다 일정, 참가 방법, 장소, 연사를 빠르게 전달해야 합니다. 안내가 늦으면 등록이 끊깁니다.",
        bullets: [
          "일정을 가장 먼저 노출",
          "등록 CTA를 반복 배치",
          "장소와 연사 정보를 명확하게",
        ],
      },
      socialProof: {
        eyebrow: "Attendance",
        title: "참가를 밀어주는 신뢰",
        summary: "사전 등록 3,200명",
        score: "3.2k",
        quotes: [
          {
            name: "참가자",
            role: "Attendee",
            quote: "언제 어디서 무엇을 하는지 바로 보여서 등록이 쉬웠어요.",
          },
        ],
      },
      serviceCards: [
        { title: "Schedule", description: "행사 일정과 타임테이블." },
        { title: "Speakers", description: "연사 소개와 강연 주제." },
        { title: "Tickets", description: "등록과 티켓 안내." },
        { title: "Venue", description: "장소와 오시는 길." },
      ],
      processSteps: [
        { step: "01", title: "일정 확인", description: "세션과 시간을 먼저 봅니다." },
        { step: "02", title: "등록", description: "티켓이나 참가 신청을 진행합니다." },
        { step: "03", title: "참여", description: "행사 중 필요한 정보를 다시 확인합니다." },
        { step: "04", title: "후속", description: "자료와 리캡으로 연결합니다." },
      ],
      faq: [
        { question: "티켓 정보는 어디에 두나요?", answer: "헤더, hero, 일정 섹션, footer에 반복해서 둡니다." },
        { question: "온라인 행사도 되나요?", answer: "네. 등록과 스트리밍 링크를 같이 보여주면 됩니다." },
      ],
    },
    hospitality: {
      heroEyebrow: "Hospitality Site",
      primaryCta: "Menu",
      secondaryCta: "Reserve",
      metrics: [
        { label: "핵심 가치", value: "분위기와 예약" },
        { label: "구현 초점", value: "메뉴 / 위치 / 동선" },
        { label: "품질 기준", value: "사진 / 가독성 / 모바일" },
      ],
      valueProps: [
        { title: "메뉴가 먼저 보임", description: "무엇을 제공하는지 바로 읽히게 합니다." },
        { title: "예약 흐름", description: "예약과 방문 정보로 자연스럽게 이어집니다." },
        { title: "공간 감성", description: "사진과 정보의 비율을 균형 있게 유지합니다." },
      ],
      collectionFilters: [
        { label: "Menu", note: "메뉴" },
        { label: "Reserve", note: "예약" },
        { label: "Location", note: "위치" },
        { label: "Hours", note: "운영시간" },
      ],
      trustPoints: [
        "메뉴와 분위기가 같이 보임",
        "예약 CTA가 명확함",
        "방문 정보가 쉽게 읽힘",
      ],
      editorialSpotlight: {
        eyebrow: "Dining Story",
        title: "예약 이전에 분위기를 설득해야 한다",
        description:
          "레스토랑과 카페 사이트는 메뉴, 공간, 위치, 운영 시간이 분명해야 합니다. 분위기만 있고 정보가 없으면 예약이 막힙니다.",
        bullets: [
          "대표 메뉴를 먼저 보여줌",
          "예약과 위치 정보를 함께 배치",
          "운영 시간과 정책을 쉽게 찾게 함",
        ],
      },
      socialProof: {
        eyebrow: "Guests",
        title: "방문 전 불안을 줄이는 정보",
        summary: "평균 평점 4.7/5",
        score: "4.7/5",
        quotes: [
          {
            name: "방문객",
            role: "Guest",
            quote: "분위기랑 메뉴 정보가 같이 보여서 선택이 쉬웠어요.",
          },
        ],
      },
      serviceCards: [
        { title: "Menu", description: "대표 메뉴와 가격을 정리." },
        { title: "Reserve", description: "예약 동선을 간단하게." },
        { title: "Location", description: "찾아오는 길을 명확하게." },
        { title: "Hours", description: "운영 시간과 휴무를 표시." },
      ],
      processSteps: [
        { step: "01", title: "메뉴 확인", description: "대표 메뉴와 가격을 봅니다." },
        { step: "02", title: "분위기 확인", description: "사진과 좌석 느낌을 읽습니다." },
        { step: "03", title: "예약", description: "방문 시간과 인원을 선택합니다." },
        { step: "04", title: "방문", description: "위치와 운영 정보를 다시 확인합니다." },
      ],
      faq: [
        { question: "예약은 어디에 두나요?", answer: "헤더와 hero, footer, 그리고 지도/위치 블록에 함께 둡니다." },
        { question: "매장 사진도 넣을 수 있나요?", answer: "네. 메뉴와 동급으로 배치하면 좋습니다." },
      ],
    },
  };

  const theme = themes[category];
  return {
    category,
    heroEyebrow: theme.heroEyebrow,
    heroTitle: input.name,
    heroDescription:
      input.description ||
      `${input.name}의 핵심 경험을 한 번에 보여주는 ${theme.heroEyebrow.toLowerCase()}입니다.`,
    primaryCta: theme.primaryCta,
    secondaryCta: theme.secondaryCta,
    metrics: theme.metrics,
    valueProps: theme.valueProps,
    collectionFilters: theme.collectionFilters,
    showcaseItems: buildPlanCards.map((card, index) => ({
      tag: `${theme.heroEyebrow === "Website Blueprint" ? "Focus" : "Item"} ${index + 1}`,
      title: card.title,
      description: card.description,
      note: card.priority,
      details: theme.heroEyebrow === "Editorial Site" ? "read · save · return" : "pattern · flow · support",
    })),
    buildPlanCards,
    processSteps: theme.processSteps,
    trustPoints: theme.trustPoints,
    editorialSpotlight: theme.editorialSpotlight,
    socialProof: theme.socialProof,
    serviceCards: theme.serviceCards,
    faq: theme.faq,
  };
}

function mergeRoleQualityStats(
  target: RoleQualityStats,
  roleFindings: Record<WorkflowRole, string[]>
) {
  for (const role of Object.keys(target) as WorkflowRole[]) {
    target[role] += roleFindings[role].length;
  }
}

function buildRepairProfile(
  roleQualityStats: RoleQualityStats,
  ...findingsList: Array<Record<WorkflowRole, string[]>>
): RepairProfile {
  return buildRepairProfileFromFindings(roleQualityStats, ...findingsList);
}

function buildRepairProfileFromFindings(
  roleQualityStats: RoleQualityStats,
  ...findingsList: Array<Record<WorkflowRole, string[]>>
): RepairProfile {
  const normalizedRoleQualityStats: RoleQualityStats = { ...roleQualityStats };
  const minimumRoleCounts: RoleQualityStats = {
    planner: 1,
    critic: 1,
    designer: 2,
    coder: 1,
    tester: 1,
  };
  const criticFallbackMessage =
    findingsList.flatMap((findings) => findings.critic).find(Boolean) ?? ROLE_BRIEFS.critic;

  for (const role of Object.keys(minimumRoleCounts) as WorkflowRole[]) {
    normalizedRoleQualityStats[role] = Math.max(
      normalizedRoleQualityStats[role],
      minimumRoleCounts[role]
    );
  }

  const focusRoles = (Object.entries(normalizedRoleQualityStats) as Array<[WorkflowRole, number]>)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0)
    .map(([role]) => role);

  const focusMessages = focusRoles.map((role) => ({
    role,
    count: normalizedRoleQualityStats[role],
    message:
      role === "critic"
        ? criticFallbackMessage
        : findingsList.flatMap((findings) => findings[role]).find(Boolean) ?? ROLE_BRIEFS[role],
  }));

  return {
    focusRoles,
    focusMessages,
    roleQualityStats: normalizedRoleQualityStats,
  };
}

function buildHomepageBlueprint(
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
): WorkspaceBlueprint {
  const category = detectProjectCategory(input);
  const buildPlanCards = backlogItems.slice(0, 4).map((item) => ({
    title: item.title,
    description: item.description,
    priority: item.priority,
  }));
  const referenceBrief = buildDesignReferenceBrief(input.designReference);

  const applyReferenceContext = (blueprint: WorkspaceBlueprint) => {
    if (!referenceBrief) {
      return blueprint;
    }

    return {
      ...blueprint,
      heroDescription: appendReferenceContext(blueprint.heroDescription, referenceBrief),
      editorialSpotlight: {
        ...blueprint.editorialSpotlight,
        description: appendReferenceContext(blueprint.editorialSpotlight.description, referenceBrief),
      },
    };
  };

  if (category === "commerce") {
    if (detectCommerceTheme(input) === "assistive") {
      return applyReferenceContext({
        category,
        heroEyebrow: "Assistive Commerce",
        heroTitle: input.name,
        heroDescription:
          input.description ||
          `${input.name}의 상담, 비교, 배송, 설치 흐름을 한 번에 보여주는 복지용구 커머스 홈페이지입니다.`,
        primaryCta: "제품 카테고리 보기",
        secondaryCta: "상담/배송 안내",
        metrics: [
          { label: "첫 화면", value: "상담 중심 안내" },
          { label: "구매 흐름", value: "비교 · 상담 · 연결" },
          { label: "운영 포인트", value: "재고 · 배송 · 설치" },
        ],
        valueProps: [
          {
            title: "상담 친화형 구조",
            description: "고령자와 보호자가 상품 차이를 쉽게 물어보고 비교할 수 있게 합니다.",
          },
          {
            title: "실사용 기준 정보",
            description: "착용감, 호환성, 규격, 사용 환경을 큰 글씨로 분명하게 보여줍니다.",
          },
          {
            title: "배송/설치 동선",
            description: "배송 시기, 설치 여부, 반품 기준을 구매 전에 바로 확인할 수 있게 합니다.",
          },
          {
            title: "운영 친화형 구조",
            description: "상담, 문의, 재고, 주문 상태를 바꾸기 쉬운 페이지로 설계합니다.",
          },
        ],
        collectionFilters: [
          { label: "이동 보조", note: "휠체어 / 워커" },
          { label: "보행 보조", note: "지팡이 / 보행기" },
          { label: "목욕 보조", note: "의자 / 손잡이" },
          { label: "욕창 예방", note: "매트리스 / 방석" },
          { label: "위생/생활", note: "보호대 / 보조용품" },
        ],
        showcaseItems: [
          {
            tag: "Best Match",
            title: "이동 보조용 휠체어",
            description: "실내외 이동에 맞는 규격과 접이 방식이 한눈에 보이도록 구성합니다.",
            note: "₩1,280,000",
            details: "foldable · indoor / outdoor",
          },
          {
            tag: "Daily Care",
            title: "욕창 예방 매트리스",
            description: "압력 분산, 두께, 관리 방법을 비교하기 쉽게 보여줍니다.",
            note: "₩980,000",
            details: "pressure relief · easy clean",
          },
          {
            tag: "Bathroom",
            title: "목욕 보조 의자",
            description: "안정성, 높이 조절, 미끄럼 방지 요소를 우선 노출합니다.",
            note: "₩220,000",
            details: "height adjust · non-slip",
          },
          {
            tag: "Mobility",
            title: "보행 보조기",
            description: "사용자 체형과 보행 환경에 맞는 제품을 빠르게 비교하게 합니다.",
            note: "₩160,000",
            details: "lightweight · support handle",
          },
        ],
        buildPlanCards,
        processSteps: [
          {
            step: "01",
            title: "제품 발견",
            description: "이동/보행/목욕/욕창 예방 같은 목적별 카테고리를 먼저 보여줍니다.",
          },
          {
            step: "02",
            title: "비교와 상담",
            description: "규격, 사용 환경, 보험/비급여 여부를 비교한 뒤 문의로 이어갑니다.",
          },
          {
            step: "03",
            title: "주문과 안내",
            description: "주문 전에 배송, 설치, 교환 기준을 명확하게 확인시킵니다.",
          },
          {
            step: "04",
            title: "사후 관리",
            description: "사용 중 문의와 재구매를 쉽게 이어지는 운영 구조를 둡니다.",
          },
        ],
        trustPoints: [
          "고령자도 읽기 쉬운 큰 타이포",
          "상담과 배송 정보가 먼저 보임",
          "실사용 기준으로 비교하기 쉬움",
        ],
        editorialSpotlight: {
          eyebrow: "Care Story",
          title: "복지용구는 기능보다 적합성이 먼저다",
          description:
            "복지용구 쇼핑몰은 예쁜 사진보다 사용 환경, 안전성, 설치 가능 여부가 중요합니다. 구매 전에 꼭 알아야 할 정보를 먼저 보여줘야 합니다.",
          bullets: [
            "사용 목적별로 카테고리를 먼저 분리",
            "규격과 호환성을 카드에서 바로 확인",
            "상담과 배송 기준을 구매 전에 노출",
          ],
        },
        socialProof: {
          eyebrow: "Care Confidence",
          title: "구매 전 불안을 낮추는 신뢰 정보",
          summary: "상담 만족도 4.8/5 · 재문의율 높음",
          score: "4.8/5",
          quotes: [
            {
              name: "보호자 A",
              role: "Family buyer",
              quote: "제품 차이를 쉽게 비교할 수 있어서 상담 전에 방향을 잡기 좋았습니다.",
            },
            {
              name: "이용자 B",
              role: "Primary user",
              quote: "글씨가 크고 설명이 분명해서 제품을 고를 때 훨씬 편했습니다.",
            },
            {
              name: "상담사 C",
              role: "Care consultant",
              quote: "배송과 설치 기준이 분명해서 상담 품질이 좋아졌습니다.",
            },
            {
              name: "보호자 D",
              role: "Repeat buyer",
              quote: "상담/배송 안내가 먼저 보여서 안심하고 주문할 수 있었습니다.",
            },
          ],
        },
        serviceCards: [
          {
            title: "상담 연결",
            description: "전화, 문의폼, 카카오 문의 같은 빠른 상담 진입점을 둡니다.",
          },
          {
            title: "배송 안내",
            description: "배송 기간, 설치 여부, 반품 기준을 구매 전에 분명히 안내합니다.",
          },
          {
            title: "사용법 안내",
            description: "처음 쓰는 사람도 이해할 수 있게 사용법과 주의사항을 함께 보여줍니다.",
          },
          {
            title: "호환성 확인",
            description: "체형, 공간, 생활 환경에 맞는 제품인지 빠르게 확인할 수 있게 합니다.",
          },
          {
            title: "사후 지원",
            description: "재문의와 교환, 유지보수 경로를 쉽게 찾도록 만듭니다.",
          },
        ],
        faq: [
          {
            question: "보험 적용이나 비급여 정보도 넣을 수 있나요?",
            answer: "네. 가격 옆에 구분을 두고, 상담 버튼 근처에 관련 설명을 배치하면 좋습니다.",
          },
          {
            question: "고령자가 보기 어렵지 않나요?",
            answer: "큰 글씨, 짧은 문장, 명확한 카드 구조로 읽기 부담을 줄입니다.",
          },
          {
            question: "배송과 설치 안내는 어디에 두나요?",
            answer: "첫 화면, 제품 카드, FAQ, footer에 반복해서 둡니다.",
          },
        ],
      });
    }

    return applyReferenceContext({
      category,
      heroEyebrow: "Product Commerce",
      heroTitle: input.name,
      heroDescription:
        input.description ||
        `${input.name}의 제품, 비교, 문의, 배송 흐름을 한 번에 보여주는 커머스 홈페이지입니다.`,
      primaryCta: "제품 둘러보기",
      secondaryCta: "배송/문의",
      metrics: [
        { label: "첫 화면", value: "제품과 가격을 먼저 노출" },
        { label: "구매 흐름", value: "비교 · 문의 · 결제" },
        { label: "운영 포인트", value: "재고 · 배송 · 후기" },
      ],
      valueProps: [
        {
          title: "범용 카탈로그 구조",
          description: "어떤 제품군이든 카테고리와 가격을 한눈에 볼 수 있게 만듭니다.",
        },
        {
          title: "비교와 문의 동선",
          description: "상세 비교와 문의 시작점을 짧고 분명하게 배치합니다.",
        },
        {
          title: "배송과 정책 안내",
          description: "배송, 교환, 설치, 반품 기준을 제품 선택 전에 확인할 수 있게 합니다.",
        },
        {
          title: "운영 친화형 구조",
          description: "상담, 재고, 주문 상태를 바꾸기 쉬운 페이지로 설계합니다.",
        },
      ],
      collectionFilters: [
        { label: "전체", note: "모든 제품" },
        { label: "추천", note: "베스트" },
        { label: "신상품", note: "새로 등록" },
        { label: "인기", note: "많이 본" },
        { label: "묶음", note: "패키지" },
      ],
      showcaseItems: [
        {
          tag: "추천",
          title: "핵심 제품 A",
          description: "주요 기능, 사용 환경, 호환성을 먼저 보여주는 대표 제품입니다.",
          note: "₩128,000",
          details: "specs · use case · support",
        },
        {
          tag: "신상품",
          title: "핵심 제품 B",
          description: "비교하기 쉬운 가격대와 규격으로 구성한 신규 등록 제품입니다.",
          note: "₩92,000",
          details: "new · compare · inquiry",
        },
        {
          tag: "인기",
          title: "핵심 제품 C",
          description: "방문자가 자주 비교하는 기능과 사용 팁을 함께 보여줍니다.",
          note: "₩76,000",
          details: "popular · easy review",
        },
        {
          tag: "묶음",
          title: "제품 패키지",
          description: "함께 쓰는 제품을 묶어 선택하기 쉽게 구성한 패키지입니다.",
          note: "₩54,000",
          details: "bundle · savings",
        },
      ],
      buildPlanCards,
      processSteps: [
        {
          step: "01",
          title: "제품 발견",
          description: "카테고리와 핵심 혜택을 먼저 읽히게 합니다.",
        },
        {
          step: "02",
          title: "비교",
          description: "가격, 규격, 옵션, 사용 환경을 쉽게 비교하게 합니다.",
        },
        {
          step: "03",
          title: "문의",
          description: "상담과 문의로 자연스럽게 이어지는 진입점을 둡니다.",
        },
        {
          step: "04",
          title: "결제/배송",
          description: "주문, 배송, 교환, 설치 정보를 분명하게 보여줍니다.",
        },
      ],
      trustPoints: [
        "제품과 가격이 먼저 보임",
        "비교와 문의가 분리되어 읽기 쉬움",
        "배송과 정책 안내가 명확함",
      ],
      editorialSpotlight: {
        eyebrow: "Product Story",
        title: "제품 설명은 짧고 분명해야 한다",
        description:
          "범용 커머스는 제품군이 달라도 읽는 방식이 비슷해야 합니다. 기능, 가격, 비교 포인트, 배송 안내를 같은 순서로 보여주는 게 중요합니다.",
        bullets: [
          "핵심 기능과 사용 환경을 먼저 설명",
          "가격과 비교 포인트를 카드에서 바로 노출",
          "문의와 배송 정보를 같은 레벨로 배치",
        ],
      },
      socialProof: {
        eyebrow: "Customer Proof",
        title: "구매 전에 확인하고 싶은 신뢰 요소",
        summary: "평균 평점 4.8/5 · 문의 응답 빠름",
        score: "4.8/5",
        quotes: [
          {
            name: "이용자 A",
            role: "Buyer",
            quote: "제품 설명이 짧고 분명해서 처음 들어와도 비교가 쉬웠습니다.",
          },
          {
            name: "보호자 B",
            role: "Helper",
            quote: "가격과 배송 기준이 같이 보여서 주문 전에 확인하기 편했습니다.",
          },
          {
            name: "상담자 C",
            role: "Consultant",
            quote: "문의 동선이 명확해서 제품 설명 후 바로 상담으로 이어졌습니다.",
          },
        ],
      },
      serviceCards: [
        {
          title: "상담 연결",
          description: "전화, 문의폼, 메시지 같은 빠른 상담 진입점을 둡니다.",
        },
        {
          title: "배송 안내",
          description: "배송 기간과 출고 기준을 구매 전에 보여줍니다.",
        },
        {
          title: "교환/반품",
          description: "반품과 교환 기준을 보기 쉬운 언어로 정리합니다.",
        },
        {
          title: "제품 비교",
          description: "사양, 가격, 옵션을 나란히 볼 수 있게 배치합니다.",
        },
      ],
      faq: [
        {
          question: "가격 정보도 같이 넣을 수 있나요?",
          answer: "네. 카드와 비교 섹션에 함께 넣는 편이 가장 읽기 쉽습니다.",
        },
        {
          question: "상담과 문의는 어디에 두나요?",
          answer: "헤더, hero, 서비스 카드, FAQ, footer에 반복해서 둡니다.",
        },
        {
          question: "카드가 너무 평평해지지 않나요?",
          answer: "가격, 비교 포인트, 후기, 정책 정보를 분리해서 카드 밀도를 유지합니다.",
        },
      ],
    });
  }

  if (category === "booking") {
    return applyReferenceContext({
      category,
      heroEyebrow: "Booking Experience",
      heroTitle: input.name,
      heroDescription:
        input.description ||
        "예약 가능 시간 확인부터 확정 알림까지 자연스럽게 이어지는 예약 서비스입니다.",
      primaryCta: "예약 시간 보기",
      secondaryCta: "운영 방식",
      metrics: [
        { label: "핵심 흐름", value: "조회 · 예약 · 알림" },
        { label: "속도", value: "2초 내 예약 확인" },
        { label: "운영", value: "캘린더 · 알림 · 상태 관리" },
      ],
      valueProps: [
        {
          title: "예약 가시성",
          description: "가능한 시간을 한 눈에 보여줘 선택 부담을 줄입니다.",
        },
        {
          title: "운영 안정성",
          description: "중복 예약 방지와 상태 관리가 중심이 됩니다.",
        },
        {
          title: "자동 알림",
          description: "예약 접수, 변경, 취소가 자동으로 전달되도록 설계합니다.",
        },
      ],
      showcaseItems: buildPlanCards.map((card, index) => ({
        tag: `Flow ${index + 1}`,
        title: card.title,
        description: card.description,
        note: card.priority,
        details: "available slots · instant confirm",
      })),
      collectionFilters: [
        { label: "Today", note: "오늘" },
        { label: "This Week", note: "이번 주" },
        { label: "Popular", note: "인기" },
        { label: "Repeat", note: "재방문" },
      ],
      buildPlanCards,
      processSteps: [
        { step: "01", title: "시간 선택", description: "사용자는 가능한 시간을 먼저 확인합니다." },
        { step: "02", title: "정보 입력", description: "간결한 폼으로 예약 정보를 입력합니다." },
        { step: "03", title: "확정 알림", description: "예약 확정과 변경을 자동으로 안내합니다." },
        { step: "04", title: "운영 관리", description: "관리자는 캘린더와 상태로 예약을 관리합니다." },
      ],
      trustPoints: [
        "예약 충돌 방지",
        "알림 자동화",
        "운영자가 이해하기 쉬운 상태 관리",
      ],
      editorialSpotlight: {
        eyebrow: "Booking Story",
        title: "예약 가능한 시간을 먼저 보여주는 경험",
        description:
          "예약 서비스는 가격보다 먼저 시간과 확신을 줘야 합니다. 가능한 슬롯, 응답 속도, 변경 정책을 함께 보여주는 것이 핵심입니다.",
        bullets: [
          "가능한 시간대를 우선 노출",
          "예약 확정과 변경 알림을 분리",
          "상태 관리와 캘린더 흐름을 명확하게 연결",
        ],
      },
      socialProof: {
        eyebrow: "Customer Confidence",
        title: "예약 실패를 줄이는 신뢰 지표",
        summary: "평균 응답 1.8분 · 예약 완료율 96%",
        score: "96%",
        quotes: [
          {
            name: "운영자",
            role: "Front desk",
            quote: "예약 상태가 즉시 반영되어 이중 예약이 거의 없어졌습니다.",
          },
        ],
      },
      serviceCards: [
        { title: "즉시 확인", description: "예약 요청 후 바로 확정 가능 여부를 보여줍니다." },
        { title: "캘린더 연동", description: "운영 캘린더와 예약 흐름을 연결합니다." },
        { title: "알림 자동화", description: "예약, 변경, 취소 메시지를 자동으로 전달합니다." },
        { title: "운영 상태", description: "대기/확정/취소 상태를 한 번에 관리합니다." },
      ],
      faq: [
        {
          question: "예약 시간이 겹치면 어떻게 하나요?",
          answer: "가능 시간만 예약되도록 검증하고, 상태 업데이트로 충돌을 막습니다.",
        },
        {
          question: "관리자는 무엇을 보나요?",
          answer: "예약 목록, 상태, 알림 이력, 변경 사항을 한 화면에서 봅니다.",
        },
      ],
    });
  }

  if (category === "internal") {
    return applyReferenceContext({
      category,
      heroEyebrow: "Internal Operations Hub",
      heroTitle: input.name,
      heroDescription:
        input.description ||
        "승인, 요청, 작업 추적을 하나의 내부 운영 화면으로 묶은 효율 중심 제품입니다.",
      primaryCta: "대시보드 보기",
      secondaryCta: "운영 방식",
      metrics: [
        { label: "핵심 흐름", value: "요청 · 승인 · 추적" },
        { label: "효율", value: "반복 업무 축소" },
        { label: "운영", value: "검색 · 필터 · 상태" },
      ],
      valueProps: [
        {
          title: "빠른 승인",
          description: "작업 승인/반려가 즉시 처리되도록 설계합니다.",
        },
        {
          title: "가시성 높은 추적",
          description: "요청의 현재 상태와 담당자를 한 눈에 확인합니다.",
        },
        {
          title: "구조화된 기록",
          description: "이력과 변경 사항이 남아 후속 작업이 쉬워집니다.",
        },
      ],
      showcaseItems: buildPlanCards.map((card, index) => ({
        tag: `Item ${index + 1}`,
        title: card.title,
        description: card.description,
        note: card.priority,
        details: "request · approve · track",
      })),
      collectionFilters: [
        { label: "Open", note: "진행중" },
        { label: "Pending", note: "대기" },
        { label: "Approved", note: "승인" },
        { label: "Archived", note: "보관" },
      ],
      buildPlanCards,
      processSteps: [
        { step: "01", title: "요청 접수", description: "운영 요청을 빠르게 등록합니다." },
        { step: "02", title: "승인/반려", description: "핵심 결정을 한 화면에서 처리합니다." },
        { step: "03", title: "작업 추적", description: "진행 상태와 담당자를 명확히 관리합니다." },
        { step: "04", title: "운영 개선", description: "이력을 바탕으로 반복 업무를 줄입니다." },
      ],
      trustPoints: [
        "승인 흐름 단순화",
        "상태 중심의 운영 화면",
        "반복 업무 절감",
      ],
      editorialSpotlight: {
        eyebrow: "Ops Story",
        title: "운영자는 속도, 팀은 명확성을 원한다",
        description:
          "내부 툴은 화려함보다 빠른 결정과 가시성이 중요합니다. 요청, 승인, 추적이 한 화면에서 연결되어야 합니다.",
        bullets: [
          "대기 상태와 담당자를 바로 확인",
          "승인/반려를 1단계로 줄임",
          "반복 업무를 이력 기반으로 정리",
        ],
      },
      socialProof: {
        eyebrow: "Team Impact",
        title: "운영 팀이 체감하는 효율 향상",
        summary: "반복 작업 37% 감소 · 응답 시간 52% 단축",
        score: "37%",
        quotes: [
          {
            name: "운영팀",
            role: "Daily user",
            quote: "요청 이력과 담당자가 같이 보여서 처리 속도가 확실히 빨라졌습니다.",
          },
        ],
      },
      serviceCards: [
        { title: "빠른 승인", description: "의사결정 경로를 한 화면으로 줄입니다." },
        { title: "상태 추적", description: "요청의 현재 위치를 즉시 파악할 수 있습니다." },
        { title: "이력 보존", description: "후속 작업을 위한 기록이 남습니다." },
        { title: "검색/필터", description: "운영자가 원하는 항목을 빠르게 찾습니다." },
      ],
      faq: [
        {
          question: "외부 고객용 서비스인가요?",
          answer: "아니요. 내부 팀이 빠르게 운영하기 위한 도구에 가깝습니다.",
        },
      ],
    });
  }

  if (
    category === "portfolio" ||
    category === "content" ||
    category === "docs" ||
    category === "event" ||
    category === "hospitality"
  ) {
    return applyReferenceContext(buildAdaptiveBlueprint(input, category, buildPlanCards));
  }

  return applyReferenceContext({
    category,
    heroEyebrow: "Product Blueprint",
    heroTitle: input.name,
    heroDescription:
      input.description || "핵심 가치를 빠르게 보여주고, 다음 액션으로 이어지는 시작 페이지입니다.",
    primaryCta: "핵심 보기",
    secondaryCta: "구현 계획",
    metrics: [
      { label: "핵심 가치", value: "명확한 한 문장" },
      { label: "구현 초점", value: "사용자 흐름 중심" },
      { label: "품질 기준", value: "반응형 / 가독성" },
    ],
    valueProps: [
      {
        title: "간결한 첫인상",
        description: "누구를 위한 무엇인지 5초 안에 읽히도록 만듭니다.",
      },
      {
        title: "역할이 드러나는 구조",
        description: "플래너, 디자이너, 코더, 테스터가 볼 때 할 일이 분명해야 합니다.",
      },
      {
        title: "실행 가능한 계획",
        description: "홈페이지와 백로그가 연결되어 실제 구현으로 이어집니다.",
      },
    ],
    showcaseItems: buildPlanCards.map((card, index) => ({
      tag: `Focus ${index + 1}`,
      title: card.title,
      description: card.description,
      note: card.priority,
      details: "validate · ship · review",
    })),
    collectionFilters: [
      { label: "All", note: "전체" },
      { label: "Featured", note: "추천" },
      { label: "New", note: "신규" },
      { label: "Top", note: "인기" },
    ],
    buildPlanCards,
    processSteps: [
      { step: "01", title: "문제 정의", description: "누구의 어떤 문제를 푸는지 정리합니다." },
      { step: "02", title: "섹션 구성", description: "히어로, 가치, 증명, 행동 유도 흐름을 만듭니다." },
      { step: "03", title: "구현", description: "실제 UI와 데이터 흐름을 붙입니다." },
      { step: "04", title: "검수", description: "화면 크기별로 품질을 확인합니다." },
    ],
    trustPoints: [
      "실행 가능한 구조",
      "시각적 위계가 분명한 레이아웃",
      "팀 역할이 보이는 가이드",
    ],
    editorialSpotlight: {
      eyebrow: "Product Story",
      title: "홈페이지는 제품의 첫 판매 페이지다",
      description:
        "좋은 랜딩은 단지 소개가 아니라 첫 구매를 설득하는 자료입니다. 스토리, 증명, 다음 행동이 한 흐름으로 이어져야 합니다.",
      bullets: [
        "무엇을 파는지 5초 안에 읽힘",
        "증명과 행동 유도가 분명",
        "팀이 바로 구현할 수 있는 구조",
      ],
    },
    socialProof: {
      eyebrow: "Proof",
      title: "실제로 쓰이는 제품처럼 보이는가",
      summary: "기능 설명보다 전환 흐름과 신뢰가 먼저입니다.",
      score: "ready",
      quotes: [
        {
          name: "Builder",
          role: "Founder",
          quote: "이 페이지는 데모가 아니라 실제 판매/운영을 상정한 구조여야 합니다.",
        },
      ],
    },
    serviceCards: [
      { title: "Clear CTA", description: "주요 행동을 바로 누를 수 있게 합니다." },
      { title: "Evidence", description: "숫자와 신뢰 요소를 먼저 보여줍니다." },
      { title: "Flow", description: "탐색에서 전환까지 끊기지 않게 연결합니다." },
      { title: "Support", description: "FAQ와 정책으로 불안을 낮춥니다." },
    ],
    faq: [
      {
        question: "이 페이지는 무엇을 보여주나요?",
        answer: "프로젝트의 핵심 가치와 구현 우선순위를 한 번에 보여줍니다.",
      },
    ],
  });
}

function detectProjectCategory(input: ProjectBootstrapInput): WorkspaceCategory {
  const text = `${input.name} ${input.description} ${input.requirements.targetAudience} ${input.requirements.mustHaves} ${input.requirements.niceToHaves} ${input.requirements.constraints}`;
  return detectProjectCategoryFromText(text);
}

function detectCommerceTheme(input: ProjectBootstrapInput): "assistive" | "default" {
  const text = `${input.name} ${input.description} ${input.requirements.targetAudience} ${input.requirements.mustHaves} ${input.requirements.niceToHaves} ${input.requirements.constraints}`.toLowerCase();

  if (
    /복지용구|휠체어|보행\s*보조|보행보조|욕창|목욕\s*보조|재활|보조용품|의료기기|assistive|mobility|care/.test(
      text
    )
  ) {
    return "assistive";
  }

  return "default";
}

function buildNextPackageJson(slug: string) {
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "eslint",
      },
      dependencies: {
        next: "15.5.14",
        react: "19.1.0",
        "react-dom": "19.1.0",
      },
      devDependencies: {
        "@eslint/eslintrc": "^3",
        "@tailwindcss/postcss": "^4",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        eslint: "^9",
        "eslint-config-next": "15.5.14",
        tailwindcss: "^4",
        typescript: "^5",
      },
    },
    null,
    2
  );
}

function buildNextTsConfig() {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: false,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  );
}

function buildNextEnvDts() {
  return [
    '/// <reference types="next" />',
    '/// <reference types="next/image-types/global" />',
    "",
    "// This file is auto-generated by Next.js.",
    "",
  ].join("\n");
}

function buildNextConfig() {
  return ['const nextConfig = {', "  reactStrictMode: true,", "};", "", "export default nextConfig;", ""].join(
    "\n"
  );
}

function buildNextEslintConfig() {
  return [
    'import { FlatCompat } from "@eslint/eslintrc";',
    "",
    "const compat = new FlatCompat({",
    "  baseDirectory: import.meta.dirname,",
    "});",
    "",
    'const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];',
    "",
    "export default eslintConfig;",
    "",
  ].join("\n");
}

function buildPostCssConfig() {
  return ['export default {', "  plugins: {", '    "@tailwindcss/postcss": {},', "  },", "};", ""].join("\n");
}

function buildNextGlobalsCss() {
  return [
    '@import "tailwindcss";',
    "",
    ":root {",
    "  --background: #ffffff;",
    "  --foreground: #111827;",
    "  --page-surface: linear-gradient(180deg, #fffaf3 0%, #f6efe0 100%);",
    "  --page-overlay: none;",
    "  --page-overlay-opacity: 0.28;",
    "  --page-selection: rgba(245, 158, 11, 0.25);",
    "  --font-sans: Arial, sans-serif;",
    "  --font-display: Georgia, serif;",
    "  color-scheme: light;",
    "}",
    "",
    "html {",
    "  scroll-behavior: smooth;",
    "  text-rendering: geometricPrecision;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "  position: relative;",
    "  isolation: isolate;",
    "  background-color: var(--background);",
    "  background-image: var(--page-surface);",
    "  color: var(--foreground);",
    "  font-family: var(--font-sans), Arial, sans-serif;",
    "  min-height: 100vh;",
    "  overflow-x: hidden;",
    "}",
    "",
    "body::before {",
    '  content: "";',
    "  position: fixed;",
    "  inset: 0;",
    "  z-index: -1;",
    "  pointer-events: none;",
    "  background-image: var(--page-overlay);",
    "  background-size: 28px 28px;",
    "  opacity: var(--page-overlay-opacity);",
    "  mix-blend-mode: soft-light;",
    "}",
    "",
    "h1, h2, h3, h4, h5, h6, .font-display {",
    "  font-family: var(--font-display), var(--font-sans), Georgia, serif;",
    "  letter-spacing: -0.02em;",
    "}",
    "",
    "a {",
    "  color: inherit;",
    "  text-decoration: none;",
    "}",
    "",
    "::selection {",
    "  background: var(--page-selection);",
    "}",
    "",
    "* {",
    "  box-sizing: border-box;",
    "}",
    "",
  ].join("\n");
}

function buildNextLayout(
  input: ProjectBootstrapInput,
  typography: TypographyProfile,
  surface: PageSurfaceProfile
) {
  const designReferenceBrief = buildDesignReferenceBrief(input.designReference);
  const baseDescription = input.description || `${input.name} 프로젝트`;
  const metadataDescription = designReferenceBrief
    ? `${baseDescription} 참고 기준: ${designReferenceBrief}.`
    : baseDescription;
  const bodyStyle = {
    "--background": surface.background,
    "--foreground": surface.foreground,
    "--page-surface": surface.pageSurface,
    "--page-overlay": surface.pageOverlay,
    "--page-overlay-opacity": surface.overlayOpacity,
    "--page-selection": surface.selection,
    "--font-sans": typography.sansVariable,
    "--font-display": typography.displayVariable,
  };

  return [
    'import type { Metadata } from "next";',
    'import { Cormorant_Garamond, Fraunces, IBM_Plex_Sans, Manrope, Sora, Space_Grotesk } from "next/font/google";',
    'import "./globals.css";',
    "",
    'const manrope = Manrope({',
    '  subsets: ["latin"],',
    '  variable: "--font-manrope",',
    "});",
    "",
    'const fraunces = Fraunces({',
    '  subsets: ["latin"],',
    '  variable: "--font-fraunces",',
    "});",
    "",
    'const sora = Sora({',
    '  subsets: ["latin"],',
    '  variable: "--font-sora",',
    "});",
    "",
    'const ibmPlexSans = IBM_Plex_Sans({',
    '  subsets: ["latin"],',
    '  weight: ["400", "500", "600", "700"],',
    '  variable: "--font-ibm-plex-sans",',
    "});",
    "",
    'const cormorant = Cormorant_Garamond({',
    '  subsets: ["latin"],',
    '  weight: ["400", "500", "600", "700"],',
    '  variable: "--font-cormorant",',
    "});",
    "",
    'const spaceGrotesk = Space_Grotesk({',
    '  subsets: ["latin"],',
    '  variable: "--font-space-grotesk",',
    "});",
    "",
    "const bodyStyle = " + JSON.stringify(bodyStyle, null, 2) + " as React.CSSProperties;",
    "",
    "export const metadata: Metadata = {",
    `  title: ${JSON.stringify(input.name)},`,
    `  description: ${JSON.stringify(metadataDescription)},`,
    "};",
    "",
    "export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {",
    "  return (",
    '    <html lang="ko">',
    "      <body className={`${manrope.variable} ${fraunces.variable} ${sora.variable} ${ibmPlexSans.variable} ${cormorant.variable} ${spaceGrotesk.variable}`} style={bodyStyle}>",
    "        {children}",
    "      </body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildNextPage(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const blueprint = buildHomepageBlueprint(input, backlogItems);
  const theme = selectVisualTheme(input, blueprint.category);
  const audiencePlanCards = buildAudienceCards(blueprint.category, blueprint.buildPlanCards);
  const audienceBacklogCards = buildAudienceCards(
    blueprint.category,
    backlogItems.map((item) => ({
      title: item.title,
      description: item.description,
      priority: item.priority,
    }))
  );
  const audienceShowcaseCards = buildAudienceCards(
    blueprint.category,
    blueprint.showcaseItems.map((item) => ({
      title: item.title,
      description: item.description,
      priority: item.note,
    }))
  );
  const visualAssets = buildVisualAssetBundle(
    input,
    blueprint.category,
    audienceShowcaseCards.map((item) => ({
      title: item.title,
      description: item.description,
      note: item.priority,
    })),
    blueprint.heroEyebrow
  );
  const renderedBlueprint = {
    ...blueprint,
    buildPlanCards: audiencePlanCards,
    backlogCards: audienceBacklogCards,
    showcaseItems: blueprint.showcaseItems.map((item, index) => ({
      ...item,
      title: audienceShowcaseCards[index]?.title ?? item.title,
      description: audienceShowcaseCards[index]?.description ?? item.description,
      note: resolveAudienceShowcaseNote(item.note, audienceShowcaseCards[index]?.priority ?? item.note),
      image: visualAssets.showcaseImages[index],
    })),
    visualAssets,
  };
  const isCommerce = blueprint.category === "commerce";
  const isPortfolio = blueprint.category === "portfolio";
  const isContent = blueprint.category === "content";
  const isDocs = blueprint.category === "docs";
  const isBooking = blueprint.category === "booking";
  const isEvent = blueprint.category === "event";
  const isHospitality = blueprint.category === "hospitality";
  const isInternal = blueprint.category === "internal";
  const isEditorial = isContent || isDocs;
  const isOperations = isBooking || isInternal;
  const isExperience = isEvent || isHospitality;
  const featuredSectionFirst =
    isPortfolio || isExperience || isOperations || theme.key === "midnight" || theme.key === "cool";
  const featuredSectionLabel = isCommerce
    ? "추천 제품"
    : isPortfolio
      ? "대표 작업"
      : isContent
        ? "핵심 콘텐츠"
      : isDocs
        ? "빠른 시작"
        : isBooking
          ? "예약 흐름"
          : isInternal
            ? "운영 보드"
            : isEvent
              ? "행사 프로그램"
              : "방문 가이드";
  const featuredSectionHeading = isCommerce
    ? "실제로 비교하고 고르는 대표 제품"
    : isPortfolio
      ? "작업 결과를 먼저 보여주는 대표 포트폴리오"
      : isContent
        ? "읽고 저장하게 만드는 핵심 글"
        : isDocs
        ? "처음부터 끝까지 따라가는 문서 흐름"
        : isBooking
          ? "가능 시간과 예약 상태를 먼저 보여주는 흐름"
          : isInternal
            ? "요청, 승인, 추적이 한 번에 보이는 운영 화면"
            : isEvent
              ? "지금 봐야 할 일정과 연사"
              : "예약 전에 확인할 방문 정보";
  const featuredSectionDescription = isCommerce
    ? "가격과 사용 포인트를 같이 보면 선택이 훨씬 쉬워집니다."
    : isPortfolio
      ? "작업물, 역할, 결과를 먼저 보여줘야 상담으로 자연스럽게 이어집니다."
      : isContent
        ? "헤드라인과 주제, 저장 동선이 함께 보여야 재방문이 늘어납니다."
        : isDocs
        ? "빠른 시작과 레퍼런스를 나란히 보여주면 문서 탐색이 훨씬 쉬워집니다."
        : isBooking
          ? "가능 슬롯, 확정 상태, 운영 안내를 함께 보여줘야 예약 전환이 올라갑니다."
          : isInternal
            ? "담당자, 상태, 승인 경로를 한 화면에 모아야 운영 속도가 빨라집니다."
            : isEvent
              ? "일정과 연사를 먼저 보여주면 등록 고민이 줄어듭니다."
              : "메뉴와 예약, 위치를 한 번에 읽히게 해야 방문 전환이 올라갑니다.";
  const primaryNavLabel = isCommerce
    ? "카테고리"
    : isPortfolio
      ? "작업"
      : isContent
        ? "주제"
        : isDocs
          ? "문서"
          : isBooking
            ? "예약"
            : isInternal
              ? "운영"
              : isEvent
                ? "일정"
                : "방문";
  const processNavLabel = isCommerce
    ? "구매 안내"
    : isPortfolio
      ? "작업 흐름"
      : isContent
        ? "읽기 흐름"
        : isDocs
          ? "사용 흐름"
          : isBooking
            ? "예약 흐름"
            : isInternal
              ? "운영 흐름"
              : isEvent
                ? "참가 흐름"
                : "방문 흐름";
  const secondaryNavHref = isCommerce
    ? "#reviews"
    : isPortfolio
      ? "#case-studies"
      : isContent
        ? "#editorial-rail"
        : isDocs
          ? "#docs-flow"
          : isBooking
            ? "#booking-flow"
            : isInternal
              ? "#ops-board"
              : isEvent
                ? "#event-program"
                : "#visit-guide";
  const secondaryNavLabel = isCommerce
    ? "후기"
    : isPortfolio
      ? "케이스"
      : isContent
        ? "에디토리얼"
        : isDocs
          ? "가이드"
          : isBooking
            ? "운영"
            : isInternal
              ? "보드"
              : isEvent
                ? "프로그램"
                : "가이드";
  const supportChipLabel = isCommerce
    ? "문의"
    : isPortfolio
      ? "상담"
      : isContent
        ? "구독"
        : isDocs
          ? "지원"
          : isBooking
            ? "도움말"
            : isInternal
              ? "지원"
              : isEvent
                ? "등록 안내"
                : "예약 문의";
  const faqEyebrow = isCommerce
    ? "FAQ"
    : isContent
      ? "읽기 도움말"
      : isDocs
        ? "지원 안내"
        : isBooking
          ? "예약 도움말"
          : isInternal
            ? "운영 도움말"
            : isPortfolio
              ? "상담 안내"
              : isEvent
                ? "참가 안내"
                : "방문 도움말";
  const heroQuickViewLabel = isCommerce
    ? "추천 제품"
    : isPortfolio
      ? "대표 작업"
      : isContent
        ? "지금 읽을 글"
        : isDocs
          ? "시작 가이드"
          : isBooking
            ? "예약 요약"
            : isInternal
              ? "운영 요약"
              : isEvent
                ? "지금 진행 중"
                : "방문 요약";
  const processSectionEyebrow = isCommerce
    ? "구매 절차"
    : isPortfolio
      ? "작업 흐름"
      : isContent
        ? "읽기 흐름"
        : isDocs
          ? "사용 흐름"
          : isBooking
            ? "예약 흐름"
            : isInternal
              ? "운영 흐름"
              : isEvent
                ? "참가 흐름"
                : "방문 흐름";
  const processSectionHeading = isCommerce
    ? "주문 전후 흐름을 미리 보여줍니다"
    : isPortfolio
      ? "작업을 이해하고 상담으로 넘어가는 순서를 보여줍니다"
      : isContent
        ? "읽고 저장하고 다시 찾는 흐름을 정리합니다"
        : isDocs
          ? "처음 사용부터 지원까지의 경로를 보여줍니다"
          : isBooking
            ? "시간 선택부터 확정 알림까지 한 번에 보여줍니다"
            : isInternal
              ? "요청부터 승인, 추적까지 운영 단계를 정리합니다"
              : isEvent
                ? "발견부터 등록, 참여까지의 흐름을 정리합니다"
                : "탐색부터 예약, 방문까지의 흐름을 정리합니다";
  const processSectionDescription = isCommerce
    ? "제품 선택에서 상담, 배송, 설치, 사후 문의까지 이어지는 실제 구매 흐름을 먼저 보여주면 문의가 훨씬 쉬워집니다."
    : isPortfolio
      ? "작품 발견, 역할 이해, 사례 탐색, 상담 연결이 한 흐름으로 이어져야 포트폴리오가 설득력을 가집니다."
      : isContent
        ? "첫 방문에서 주제 발견, 콘텐츠 탐색, 구독, 재방문까지 이어지는 흐름이 분명해야 오래 읽히는 사이트가 됩니다."
        : isDocs
          ? "빠른 시작, 탐색, 적용, 지원 경로가 한 번에 보이면 문서는 읽히는 것이 아니라 실제로 쓰이게 됩니다."
          : isBooking
            ? "가능 시간 확인, 예약 입력, 확정 알림, 운영 상태 확인까지의 흐름이 짧고 분명해야 이탈이 줄어듭니다."
            : isInternal
              ? "요청 등록, 승인, 작업 추적, 이력 확인이 명확해야 운영 팀이 망설임 없이 다음 결정을 내릴 수 있습니다."
              : isEvent
                ? "행사 발견, 일정 확인, 등록, 후속 자료 확인이 한 줄기로 이어져야 참가 전환이 올라갑니다."
                : "메뉴 확인, 예약, 방문 준비, 재방문까지의 흐름이 자연스러워야 실제 방문으로 이어집니다.";
  const secondarySectionHeading = isCommerce
    ? "이용 순서를 먼저 확인하세요"
    : isPortfolio
      ? "상담 전 체크할 질문을 정리합니다"
      : isContent
        ? "읽는 사람이 자주 묻는 질문을 먼저 풀어줍니다"
        : isDocs
          ? "도입 전에 많이 막히는 질문을 정리합니다"
          : isBooking
            ? "예약 전에 가장 많이 묻는 내용을 모았습니다"
            : isInternal
              ? "운영팀이 자주 확인하는 기준을 모았습니다"
              : isEvent
                ? "참가 전에 자주 묻는 내용을 정리합니다"
                : "방문 전에 가장 많이 확인하는 내용을 정리합니다";
  const footerEyebrow = isCommerce
    ? "고객센터"
    : isPortfolio
      ? "상담 안내"
      : isContent
        ? "에디토리얼 안내"
        : isDocs
          ? "지원 센터"
          : isBooking
            ? "예약 지원"
            : isInternal
              ? "운영 지원"
              : isEvent
                ? "참가 안내"
                : "방문 안내";
  const footerDescription = isCommerce
    ? "상담, 배송, 설치, 반품 기준을 먼저 확인하고 문의해 주세요. 필요한 정보가 분명할수록 구매가 쉬워집니다."
    : isPortfolio
      ? "대표 작업, 협업 범위, 문의 동선을 분명하게 보여주면 다음 상담으로 자연스럽게 이어집니다."
      : isContent
        ? "주제 탐색, 최신 글, 구독 경로를 분명하게 두면 한 번 읽고 끝나는 사이트가 아니라 다시 찾는 허브가 됩니다."
        : isDocs
          ? "빠른 시작, 검색, 지원 경로를 같은 레벨에 두면 문서를 찾는 시간이 크게 줄어듭니다."
          : isBooking
            ? "가능 시간, 예약 변경, 확정 알림, 문의 경로를 분명하게 두면 예약 불안을 크게 줄일 수 있습니다."
            : isInternal
              ? "요청 상태, 승인 기준, 담당자 흐름, 지원 경로가 분명해야 내부 운영 속도가 안정됩니다."
              : isEvent
                ? "일정, 장소, 등록, 후속 자료 경로를 분명하게 두면 참가 준비가 훨씬 쉬워집니다."
                : "메뉴, 예약, 위치, 운영시간을 한 번에 정리해 두면 방문 전 결정이 훨씬 빨라집니다.";
  const footerPrimaryLinkLabel = primaryNavLabel;
  const footerFeatureLinkLabel = isCommerce
    ? "제품"
    : isPortfolio
      ? "작업"
      : isContent
        ? "콘텐츠"
        : isDocs
          ? "문서"
          : isBooking
            ? "예약"
            : isInternal
              ? "운영"
              : isEvent
                ? "프로그램"
                : "가이드";
  const serviceCardsSection =
    isCommerce
      ? []
      : [
          '      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">',
          '        <div className={theme.sectionShell}>',
          '          <div className="flex items-end justify-between gap-4">',
          '            <div>',
          '              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>서비스 카드</div>',
          (
            '              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>'
            + (isContent
              ? "읽기와 재방문 포인트를 카드로 정리합니다"
              : isDocs
                ? "사용과 지원 포인트를 카드로 정리합니다"
                : isBooking
                  ? "예약 운영 포인트를 카드로 정리합니다"
                  : isInternal
                    ? "운영 기준을 카드로 정리합니다"
                    : isPortfolio
                      ? "상담 전 확인할 강점을 카드로 정리합니다"
                      : isEvent
                        ? "참가 전 확인할 정보를 카드로 정리합니다"
                        : "방문 결정을 돕는 정보를 카드로 정리합니다")
            + "</h2>"
          ),
          "            </div>",
          '            <div className={`max-w-md text-sm leading-6 ${theme.mutedLabel}`}>',
          (
            "              "
            + (isContent
              ? "카드형 섹션은 최신 글, 주제, 저장 동선을 빠르게 훑게 해줍니다."
              : isDocs
                ? "카드형 섹션은 빠른 시작, 검색, 지원 포인트를 짧게 파악하게 해줍니다."
                : isBooking
                  ? "카드형 섹션은 예약 가능 여부와 운영 기준을 빠르게 이해하게 해줍니다."
                  : isInternal
                    ? "카드형 섹션은 운영자가 상태와 판단 기준을 빠르게 찾게 합니다."
                    : isPortfolio
                      ? "카드형 섹션은 사례, 강점, 상담 포인트를 빠르게 훑게 해줍니다."
                      : isEvent
                        ? "카드형 섹션은 프로그램, 등록, 장소 정보를 빠르게 훑게 해줍니다."
                        : "카드형 섹션은 메뉴, 예약, 위치 정보를 빠르게 훑게 해줍니다.")
          ),
          "            </div>",
          "          </div>",
          '          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">',
          "            {blueprint.serviceCards.map((item) => (",
          '              <article key={item.title} className={theme.cardShell}>',
          '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{item.title}</div>',
          '                <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>',
          "              </article>",
          "            ))}",
          "          </div>",
          "        </div>",
          "      </section>",
          "",
        ];
  const adaptiveCollectionSection =
    isCommerce
      ? [
          '      <section id="categories" className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">',
          '        <div className={`grid gap-5 lg:grid-cols-[0.95fr_1.05fr] ${theme.sectionShell}`}>',
          '          <div>',
          '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>카테고리</div>',
          '            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>먼저 목적에 맞는 제품군을 고르세요</h2>',
          '            <p className={`mt-3 max-w-xl text-sm leading-7 ${theme.mutedLabel}`}>이용 목적이 분명해야 비교가 쉬워집니다. 이동, 보행, 목욕, 욕창 예방처럼 필요한 제품군부터 먼저 좁혀보세요.</p>',
          "          </div>",
          '          <div className="grid gap-3 sm:grid-cols-3">',
          "            {blueprint.metrics.map((metric) => (",
          '              <div key={metric.label} className={theme.cardShell}>',
          '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{metric.label}</div>',
          '                <div className={`mt-2 text-sm font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-900"}`}>{metric.value}</div>',
          "              </div>",
          "            ))}",
          "          </div>",
          "        </div>",
          "      </section>",
          "",
        ]
      : isPortfolio
        ? [
            '      <section id="categories" className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">',
            '        <div className={theme.sectionShell}>',
            '          <div>',
            '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>작업</div>',
            '            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>대표 작업과 강점을 먼저 보여줍니다</h2>',
            '            <p className={`mt-3 max-w-xl text-sm leading-7 ${theme.mutedLabel}`}>작업 범위와 결과가 먼저 읽히면, 보는 사람은 자연스럽게 다음 상담 단계로 넘어갑니다.</p>',
            "          </div>",
            '          <div className="mt-6 flex flex-wrap gap-2">',
            "            {blueprint.collectionFilters.map((item) => (",
            '              <span key={item.label} className={theme.chipShell}>',
            "                {item.label} · {item.note}",
            "              </span>",
            "            ))}",
            "          </div>",
            '          <div className="mt-6 grid gap-4 md:grid-cols-3">',
            "            {blueprint.trustPoints.map((point) => (",
            '              <div key={point} className={theme.cardShell}>',
            '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>포커스</div>',
            '                <div className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{point}</div>',
            "              </div>",
            "            ))}",
            "          </div>",
            "        </div>",
            "      </section>",
            "",
          ]
        : isBooking
          ? [
              '      <section id="categories" className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">',
              '        <div className={theme.sectionShell}>',
              '          <div>',
              '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>예약 탐색</div>',
              '            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>가능한 시간과 운영 기준을 먼저 정리합니다</h2>',
              '            <p className={`mt-3 max-w-xl text-sm leading-7 ${theme.mutedLabel}`}>예약 서비스는 감성보다 확신이 먼저입니다. 가능한 시간, 상태, 알림 기준이 같이 보여야 이탈이 줄어듭니다.</p>',
              "          </div>",
              '          <div className="mt-6 flex flex-wrap gap-2">',
              "            {blueprint.collectionFilters.map((item) => (",
              '              <span key={item.label} className={theme.chipShell}>',
              "                {item.label} · {item.note}",
              "              </span>",
              "            ))}",
              "          </div>",
              '          <div className="mt-6 grid gap-4 md:grid-cols-3">',
              "            {blueprint.trustPoints.map((point) => (",
              '              <div key={point} className={theme.cardShell}>',
              '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>운영 포인트</div>',
              '                <div className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{point}</div>',
              "              </div>",
              "            ))}",
              "          </div>",
              "        </div>",
              "      </section>",
              "",
            ]
          : isInternal
            ? [
                '      <section id="categories" className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">',
                '        <div className={theme.sectionShell}>',
                '          <div>',
                '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>운영 구조</div>',
                '            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>요청, 승인, 추적 기준을 먼저 보여줍니다</h2>',
                '            <p className={`mt-3 max-w-xl text-sm leading-7 ${theme.mutedLabel}`}>내부 도구는 무엇을 할 수 있는지보다 어떤 기준으로 굴러가는지가 먼저 보여야 팀이 안심하고 씁니다.</p>',
                "          </div>",
                '          <div className="mt-6 flex flex-wrap gap-2">',
                "            {blueprint.collectionFilters.map((item) => (",
                '              <span key={item.label} className={theme.chipShell}>',
                "                {item.label} · {item.note}",
                "              </span>",
                "            ))}",
                "          </div>",
                '          <div className="mt-6 grid gap-4 md:grid-cols-3">',
                "            {blueprint.trustPoints.map((point) => (",
                '              <div key={point} className={theme.cardShell}>',
                '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>운영 포인트</div>',
                '                <div className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{point}</div>',
                "              </div>",
                "            ))}",
                "          </div>",
                "        </div>",
                "      </section>",
                "",
              ]
        : [
            '      <section id="categories" className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">',
            '        <div className={theme.sectionShell}>',
            '          <div>',
            '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>탐색</div>',
            (
              '            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>'
              + (isEditorial ? "주제와 아카이브를 먼저 정리합니다" : isExperience ? "일정과 방문 정보를 먼저 정리합니다" : "핵심 정보를 먼저 정리합니다")
              + "</h2>"
            ),
            (
              '            <p className={`mt-3 max-w-xl text-sm leading-7 ${theme.mutedLabel}`}>'
              + (isEditorial
                ? "주제, 최신 글, 검색 흐름을 먼저 잡아야 읽고 다시 찾는 구조가 됩니다."
                : isExperience
                  ? "방문, 예약, 안내, 위치를 먼저 보여줘야 실제 전환이 쉬워집니다."
                  : "핵심 흐름을 먼저 정리하면 방문자가 다음 행동을 고르기 쉬워집니다.")
              + "</p>"
            ),
            "          </div>",
            '          <div className="mt-6 flex flex-wrap gap-2">',
            "            {blueprint.collectionFilters.map((item) => (",
            '              <span key={item.label} className={theme.chipShell}>',
            "                {item.label} · {item.note}",
            "              </span>",
            "            ))}",
            "          </div>",
            '          <div className="mt-6 grid gap-4 md:grid-cols-3">',
            "            {blueprint.trustPoints.map((point) => (",
            '              <div key={point} className={theme.cardShell}>',
            '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>포인트</div>',
            '                <div className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{point}</div>',
            "              </div>",
            "            ))}",
            "          </div>",
            "        </div>",
            "      </section>",
            "",
          ];
  const categorySpecialSection =
    isBooking
      ? [
          '      <section id="booking-flow" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">',
          '        <div className={`grid gap-6 lg:grid-cols-[0.95fr_1.05fr] ${theme.sectionShell}`}>',
          '          <div className={theme.sectionShell}>',
          '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>예약 운영</div>',
          '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>가능 시간, 확정 상태, 알림 흐름을 한 번에 보여줍니다</h2>',
          '            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>예약 경험은 예쁜 화면보다 실패하지 않는 흐름이 중요합니다. 예약 전 확인해야 할 운영 기준을 먼저 읽게 해야 합니다.</p>',
          '            <div className="mt-6 grid gap-4 sm:grid-cols-2">',
          "              {blueprint.processSteps.map((step) => (",
          '                <article key={step.step} className={theme.cardShell}>',
          '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{step.step}</div>',
          '                  <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{step.title}</h3>',
          '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{step.description}</p>',
          "                </article>",
          "              ))}",
          "            </div>",
          "          </div>",
          '          <div className="grid gap-4">',
          '            <article className={theme.featuredCardShell}>',
          '              <div className="p-5">',
          '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{blueprint.socialProof.eyebrow}</div>',
          '                <h3 className={`mt-2 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.socialProof.title}</h3>',
          '                <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{blueprint.editorialSpotlight.description}</p>',
          '                <div className={`mt-4 text-sm font-semibold ${theme.accentLabel}`}>{blueprint.socialProof.summary}</div>',
          "              </div>",
          "            </article>",
          '            <div className="grid gap-3 sm:grid-cols-2">',
          "              {blueprint.serviceCards.map((item) => (",
          '                <article key={item.title} className={theme.cardShell}>',
          '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{item.title}</div>',
          '                  <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>',
          "                </article>",
          "              ))}",
          "            </div>",
          "          </div>",
          "        </div>",
          "      </section>",
          "",
        ]
      : isInternal
        ? [
            '      <section id="ops-board" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">',
            '        <div className={`grid gap-6 lg:grid-cols-[1fr_1fr] ${theme.sectionShell}`}>',
            '          <div className={theme.sectionShell}>',
            '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>운영 보드</div>',
            '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>담당자, 상태, 다음 결정을 같은 화면에서 읽게 합니다</h2>',
            '            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>내부 도구는 팀이 망설임 없이 움직이게 만들어야 합니다. 승인 기준과 현재 상태를 같은 밀도로 보여줘야 운영 속도가 유지됩니다.</p>',
            '            <div className="mt-6 grid gap-4 sm:grid-cols-2">',
            "              {blueprint.buildPlanCards.map((card) => (",
            '                <article key={card.title} className={theme.cardShell}>',
            '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{card.priority}</div>',
            '                  <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{card.title}</h3>',
            '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{card.description}</p>',
            "                </article>",
            "              ))}",
            "            </div>",
            "          </div>",
            '          <div className="grid gap-4">',
            '            <article className={theme.featuredCardShell}>',
            '              <div className="p-5">',
            '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{blueprint.editorialSpotlight.eyebrow}</div>',
            '                <h3 className={`mt-2 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.editorialSpotlight.title}</h3>',
            '                <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{blueprint.editorialSpotlight.description}</p>',
          '                <div className={`mt-4 text-sm font-semibold ${theme.accentLabel}`}>{blueprint.socialProof.summary}</div>',
            "              </div>",
            "            </article>",
            '            <div className="grid gap-3 sm:grid-cols-3">',
            "              {blueprint.trustPoints.map((point) => (",
            '                <div key={point} className={theme.cardShell}>',
            '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>운영 기준</div>',
            '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{point}</p>',
            "                </div>",
            "              ))}",
            "            </div>",
            "          </div>",
            "        </div>",
            "      </section>",
            "",
          ]
      : isPortfolio
      ? [
          '      <section id="case-studies" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">',
          '        <div className={`grid gap-6 lg:grid-cols-[0.95fr_1.05fr] ${theme.sectionShell}`}>',
          '          <div className={theme.sectionShell}>',
          '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>케이스 스터디</div>',
          '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>작업 과정과 결과를 한 번에 읽게 합니다</h2>',
          '            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>작업한 이유, 맡은 역할, 나온 결과를 같은 흐름으로 보여주면 포트폴리오는 훨씬 설득력이 생깁니다.</p>',
          '            <ol className="mt-6 space-y-4">',
          "              {blueprint.processSteps.map((step) => (",
          '                <li key={step.step} className={theme.cardShell}>',
          '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{step.step}</div>',
          '                  <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{step.title}</h3>',
          '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{step.description}</p>',
          "                </li>",
          "              ))}",
          "            </ol>",
          "          </div>",
          '          <div className="grid gap-4">',
          "            {blueprint.buildPlanCards.map((card) => (",
          '              <article key={card.title} className={theme.featuredCardShell}>',
          '                <div className="p-5">',
          '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{card.priority}</div>',
          '                  <h3 className={`mt-2 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{card.title}</h3>',
          '                  <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{card.description}</p>',
          "                </div>",
          "              </article>",
          "            ))}",
          "          </div>",
          "        </div>",
          "      </section>",
          "",
        ]
      : isContent
        ? [
            '      <section id="editorial-rail" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">',
            '        <div className={`grid gap-6 lg:grid-cols-[1fr_0.9fr] ${theme.sectionShell}`}>',
            '          <div className="grid gap-4">',
            '            <div className={theme.sectionShell}>',
            '              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>에디토리얼</div>',
            '              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>주제와 저장 동선을 먼저 설계합니다</h2>',
            '              <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>뉴스, 칼럼, 스토리가 같은 형식으로 보이면 읽기 리듬이 안정되고 재방문도 쉬워집니다.</p>',
            "            </div>",
            '            <div className="grid gap-3 sm:grid-cols-2">',
            "              {blueprint.serviceCards.map((item) => (",
            '                <article key={item.title} className={theme.cardShell}>',
            '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{item.title}</div>',
            '                  <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>',
            "                </article>",
            "              ))}",
            "            </div>",
            "          </div>",
            '          <div className="grid gap-4">',
            '            <article className={theme.featuredCardShell}>',
            '              <div className="p-5">',
            '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{blueprint.editorialSpotlight.eyebrow}</div>',
            '                <h3 className={`mt-2 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.editorialSpotlight.title}</h3>',
            '                <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{blueprint.editorialSpotlight.description}</p>',
            '                <ul className="mt-5 space-y-3">',
            "                  {blueprint.editorialSpotlight.bullets.map((bullet) => (",
            '                    <li key={bullet} className={`flex gap-3 text-sm leading-6 ${theme.pageShell.includes("text-slate-50") ? "text-slate-100" : "text-slate-700"}`}>',
            '                      <span className="mt-2 h-2 w-2 rounded-full bg-amber-500" />',
            "                      <span>{bullet}</span>",
            "                    </li>",
            "                  ))}",
            "                </ul>",
            "              </div>",
            "            </article>",
            '            <div className="grid gap-3 sm:grid-cols-3">',
            "              {blueprint.collectionFilters.map((item) => (",
            '                <span key={item.label} className={theme.chipShell}>',
            "                  {item.label} · {item.note}",
            "                </span>",
            "              ))}",
            "            </div>",
            "          </div>",
            "        </div>",
            "      </section>",
            "",
          ]
        : isDocs
          ? [
              '      <section id="docs-flow" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">',
              '        <div className={`grid gap-6 lg:grid-cols-[0.9fr_1.1fr] ${theme.sectionShell}`}>',
              '          <div className={theme.sectionShell}>',
              '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>빠른 시작</div>',
              '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>처음 보는 사람의 동선을 가장 짧게 만듭니다</h2>',
              '            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>시작, 참고, 지원이 한 번에 보이면 문서 검색이 아니라 실제 사용이 쉬워집니다.</p>',
              '            <div className="mt-6 grid gap-3 sm:grid-cols-2">',
              "              {blueprint.collectionFilters.map((item) => (",
              '                <span key={item.label} className={theme.chipShell}>',
              "                  {item.label} · {item.note}",
              "                </span>",
              "              ))}",
              "            </div>",
              "          </div>",
              '          <div className="grid gap-4">',
              '            <div className={theme.featuredCardShell}>',
              '              <div className="p-5">',
              '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{blueprint.editorialSpotlight.eyebrow}</div>',
              '                <h3 className={`mt-2 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.editorialSpotlight.title}</h3>',
              '                <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{blueprint.editorialSpotlight.description}</p>',
              "              </div>",
              "            </div>",
              '            <div className="grid gap-3 md:grid-cols-3">',
              "              {blueprint.processSteps.map((step) => (",
              '                <article key={step.step} className={theme.cardShell}>',
              '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{step.step}</div>',
              '                  <h3 className={`mt-2 text-base font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{step.title}</h3>',
              '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{step.description}</p>',
              "                </article>",
              "              ))}",
              "            </div>",
              "          </div>",
              "        </div>",
              "      </section>",
              "",
            ]
          : isEvent
            ? [
                '      <section id="event-program" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">',
                '        <div className={`grid gap-6 lg:grid-cols-[1.05fr_0.95fr] ${theme.sectionShell}`}>',
                '          <div className={theme.sectionShell}>',
                '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>프로그램</div>',
                '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>일정과 연사를 먼저 보여주고 등록으로 보냅니다</h2>',
                '            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>행사 사이트는 무엇보다 시간표와 참가 이유가 중요합니다. 늦기 전에 등록할 이유를 먼저 보여줘야 합니다.</p>',
                '            <div className="mt-6 grid gap-4 sm:grid-cols-2">',
                "              {blueprint.processSteps.map((step) => (",
                '                <article key={step.step} className={theme.cardShell}>',
                '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{step.step}</div>',
                '                  <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{step.title}</h3>',
                '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{step.description}</p>',
                "                </article>",
                "              ))}",
                "            </div>",
                "          </div>",
                '          <div className="grid gap-4">',
                '            <div className={theme.featuredCardShell}>',
                '              <div className="p-5">',
                '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{blueprint.socialProof.eyebrow}</div>',
                '                <h3 className={`mt-2 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.socialProof.title}</h3>',
                '                <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{blueprint.socialProof.summary}</p>',
                "              </div>",
                "            </div>",
                '            <div className="grid gap-3 sm:grid-cols-2">',
                "              {blueprint.trustPoints.map((point) => (",
                '                <div key={point} className={theme.cardShell}>',
                '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>핵심</div>',
                '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{point}</p>',
                "                </div>",
                "              ))}",
                "            </div>",
                "          </div>",
                "        </div>",
                "      </section>",
                "",
              ]
            : [
                '      <section id="visit-guide" className="mx-auto max-w-7xl px-6 py-10 lg:px-8">',
                '        <div className={`grid gap-6 lg:grid-cols-[0.95fr_1.05fr] ${theme.sectionShell}`}>',
                '          <div className={theme.sectionShell}>',
                '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>방문 가이드</div>',
                '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>메뉴, 예약, 위치를 한 번에 정리합니다</h2>',
                '            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>방문형 사이트는 분위기보다 정보가 먼저입니다. 예약 전 가장 많이 묻는 내용을 섹션 하나로 모아야 합니다.</p>',
                '            <div className="mt-6 grid gap-3 sm:grid-cols-2">',
                "              {blueprint.serviceCards.map((item) => (",
                '                <article key={item.title} className={theme.cardShell}>',
                '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{item.title}</div>',
                '                  <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>',
                "                </article>",
                "              ))}",
                "            </div>",
                "          </div>",
                '          <div className="grid gap-4">',
                '            <div className={theme.featuredCardShell}>',
                '              <div className="p-5">',
                '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{blueprint.editorialSpotlight.eyebrow}</div>',
                '                <h3 className={`mt-2 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.editorialSpotlight.title}</h3>',
                '                <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{blueprint.editorialSpotlight.description}</p>',
                "              </div>",
                "            </div>",
                '            <div className="grid gap-3 sm:grid-cols-3">',
                "              {blueprint.collectionFilters.map((item) => (",
                '                <span key={item.label} className={theme.chipShell}>',
                "                  {item.label} · {item.note}",
                "                </span>",
                "              ))}",
                "            </div>",
                "          </div>",
                "        </div>",
                "      </section>",
                "",
              ];
  const categoryCardWallSection =
    isCommerce
      ? []
      : [
          '      <section id="card-wall" className="mx-auto max-w-7xl px-6 py-8 lg:px-8">',
          '        <div className={theme.sectionShell}>',
          '          <div className="flex items-end justify-between gap-4">',
          '            <div>',
          '              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>카드 벽</div>',
          (
            '              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>'
            + (isPortfolio
              ? "작업 세부를 더 깊게 보여줍니다"
              : isDocs
                ? "문서 흐름을 더 잘게 나눕니다"
                : isBooking
                  ? "예약 운영 정보를 카드로 더 촘촘히 보여줍니다"
                  : isInternal
                    ? "운영 상태와 승인 기준을 카드로 더 잘게 나눕니다"
                : isEvent
                  ? "행사 정보를 카드로 더 촘촘히 보여줍니다"
                  : "방문자가 바로 훑을 카드들을 추가합니다")
            + "</h2>"
          ),
          '            </div>',
          '            <div className={`max-w-md text-sm leading-6 ${theme.mutedLabel}`}>',
          (
            '              '
            + (isPortfolio
              ? "사례, 역할, 결과를 한 번 더 카드로 쪼개서 상담 직전의 설득을 강화합니다."
              : isDocs
                ? "빠른 시작, 가이드, 검색, 지원을 카드로 분리해 진입 장벽을 낮춥니다."
                : isBooking
                  ? "가능 시간, 예약 정책, 알림, 운영 상태를 각각 카드로 분리해 예약 불안을 줄입니다."
                  : isInternal
                    ? "요청, 승인, 상태, 검색 기준을 카드로 분리해 운영팀의 판단 속도를 높입니다."
                : isEvent
                  ? "일정, 연사, 티켓, 장소를 각각 카드로 분리해 등록 전환을 올립니다."
                  : "메뉴, 예약, 위치, 운영시간을 각각의 카드로 분리해 방문 결정을 빠르게 만듭니다.")
          ),
          "            </div>",
          "          </div>",
          '          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">',
          "            {blueprint.backlogCards.map((card) => (",
          '              <article key={card.title} className={theme.cardShell}>',
          '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{card.priority}</div>',
          '                <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{card.title}</h3>',
          '                <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{card.description}</p>',
          "              </article>",
          "            ))}",
          "          </div>",
          "        </div>",
          "      </section>",
          "",
        ];
  const featuredProductsSection = [
    '      <section id="featured-products" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">',
    '        <div className="flex items-end justify-between gap-4">',
    '          <div>',
    '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>'
      + featuredSectionLabel
      + "</div>",
    '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>'
      + featuredSectionHeading
      + "</h2>",
    "          </div>",
    '          <div className={`max-w-md text-sm leading-6 ${theme.mutedLabel}`}>'
      + featuredSectionDescription
      + "</div>",
    "        </div>",
    '        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">',
    "          {blueprint.showcaseItems.map((item) => (",
    '            <article key={item.title} className={theme.featuredCardShell}>',
    '              <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `url(${item.image})` }} />',
    '              <div className="p-5">',
    '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.mutedLabel}`}>{item.tag}</div>',
    '                <h3 className={`mt-3 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{item.title}</h3>',
    '                <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>',
    '                <div className={`mt-3 text-xs font-medium uppercase tracking-[0.18em] ${theme.mutedLabel}`}>{item.details}</div>',
    '                <div className={`mt-5 text-sm font-semibold ${theme.accentLabel}`}>{item.note}</div>',
    "              </div>",
    "            </article>",
    "          ))}",
    "        </div>",
    "      </section>",
    "",
  ];
  return [
    "const blueprint = " + JSON.stringify(renderedBlueprint, null, 2) + ";",
    "const theme = " + JSON.stringify(theme, null, 2) + ";",
    "",
    "export default function Home() {",
    "  return (",
    '    <main className={theme.pageShell}>',
    '      <header className={theme.headerShell}>',
    '        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">',
    '          <div className="flex items-center gap-3">',
    '            <div className={theme.logoShell}>',
    '              <span className="text-sm font-semibold">O</span>',
    "            </div>",
    "            <div>",
    '              <div className={`text-[10px] font-semibold uppercase tracking-[0.35em] ${theme.accentLabel}`}>{blueprint.heroEyebrow}</div>',
    '              <div className={`text-sm font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.heroTitle}</div>',
    "            </div>",
    "          </div>",
    '          <nav className={`hidden items-center gap-6 text-sm font-medium ${theme.pageShell.includes("text-slate-50") ? "text-slate-200" : "text-slate-600"} md:flex`}>',
    (
      '            <a href="#categories" className={`transition ${theme.pageShell.includes("text-slate-50") ? "hover:text-white" : "hover:text-slate-950"}`}>'
      + primaryNavLabel
      + "</a>"
    ),
    (
      '            <a href="#featured-products" className={`transition ${theme.pageShell.includes("text-slate-50") ? "hover:text-white" : "hover:text-slate-950"}`}>'
      + featuredSectionLabel
      + "</a>"
    ),
    '            <a href="#purchase-steps" className={`transition ${theme.pageShell.includes("text-slate-50") ? "hover:text-white" : "hover:text-slate-950"}`}>'
      + processNavLabel
      + "</a>",
    '            <a href="'
      + secondaryNavHref
      + '" className={`transition ${theme.pageShell.includes("text-slate-50") ? "hover:text-white" : "hover:text-slate-950"}`}>'
      + secondaryNavLabel
      + "</a>",
    '            <a href="#faq" className={`transition ${theme.pageShell.includes("text-slate-50") ? "hover:text-white" : "hover:text-slate-950"}`}>FAQ</a>',
    "          </nav>",
    '          <div className="flex items-center gap-3">',
    '            <a href="#faq" className={`hidden md:inline-flex ${theme.footerChipShell}`}>',
    "              " + supportChipLabel,
    "            </a>",
    '            <a href="#featured-products" className={theme.primaryButtonShell}>',
    "              {blueprint.primaryCta}",
    "            </a>",
    "          </div>",
    "        </div>",
    "      </header>",
    "",
    '      <section id="overview" className={theme.heroSectionShell}>',
    '        <div className="space-y-8">',
    '          <div className={`inline-flex rounded-full border border-white/70 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] ${theme.accentLabel} shadow-sm`}>',
    "            {blueprint.heroEyebrow}",
    "          </div>",
    "          <div className=\"space-y-5\">",
    '            <h1 className={`max-w-3xl text-5xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"} md:text-6xl`}>',
    "              {blueprint.heroTitle}",
    "            </h1>",
    '            <p className={`max-w-2xl text-lg leading-8 ${theme.mutedLabel}`}>{blueprint.heroDescription}</p>',
    "          </div>",
    '          <div className="flex flex-wrap gap-3">',
    '            <a href="#featured-products" className={theme.primaryButtonShell}>',
    "              {blueprint.primaryCta}",
    "            </a>",
    '            <a href="#purchase-steps" className={theme.secondaryButtonShell}>',
    "              {blueprint.secondaryCta}",
    "            </a>",
    "          </div>",
    '          <div className="grid gap-4 sm:grid-cols-3">',
    "            {blueprint.metrics.map((metric) => (",
    '              <div key={metric.label} className={theme.cardShell}>',
    '                <div className={`text-xs font-semibold uppercase tracking-[0.22em] ${theme.accentLabel}`}>{metric.label}</div>',
    '                <div className={`mt-3 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-900"}`}>{metric.value}</div>',
    "              </div>",
    "            ))}",
    "          </div>",
    "        </div>",
    "",
    '        <div className="relative">',
    '          <div className="absolute inset-0 -z-10 rounded-[2.5rem] bg-amber-300/20 blur-3xl" />',
    '          <div className={theme.heroShell}>',
    '            <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">',
    '              <div className={theme.heroMediaShell}>',
    '                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${blueprint.visualAssets.heroImage})` }} />',
    '                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />',
    '                <div className="absolute inset-x-0 bottom-0 p-5 text-white">',
    '                  <div className={`text-xs font-semibold uppercase tracking-[0.28em] ${theme.accentLabel}`}>'
      + heroQuickViewLabel
      + "</div>",
    '                  <div className="mt-2 text-2xl font-semibold tracking-tight">{blueprint.heroTitle}</div>',
    '                  <p className={`mt-2 max-w-md text-sm leading-6 ${theme.pageShell.includes("text-slate-50") ? "text-slate-200" : "text-slate-600"}`}>{blueprint.heroDescription}</p>',
    "                </div>",
    "              </div>",
    '              <div className="grid gap-4">',
    '                <div className={theme.cardShell}>',
    '                  <div className={`text-xs font-semibold uppercase tracking-[0.28em] ${theme.accentLabel}`}>바로 보기</div>',
    '                  <div className="mt-3 space-y-3">',
    '                    {blueprint.showcaseItems.slice(0, 2).map((item) => (',
    '                      <div key={item.title} className={theme.featuredCardShell}>',
    '                        <div className="h-28 bg-cover bg-center" style={{ backgroundImage: `url(${item.image})` }} />',
    '                        <div className="p-3">',
    '                          <div className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${theme.mutedLabel}`}>{item.tag}</div>',
    '                          <div className={`mt-1 text-sm font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{item.title}</div>',
    "                        </div>",
    "                      </div>",
    "                    ))}",
    "                  </div>",
    "                </div>",
    '                <div className="grid gap-3 sm:grid-cols-3">',
    "                  {blueprint.trustPoints.map((point) => (",
    '                    <div key={point} className={theme.trustChipShell}>',
    "                      {point}",
    "                    </div>",
    "                  ))}",
    "                </div>",
    "              </div>",
    "            </div>",
    "          </div>",
    "        </div>",
    "      </section>",
    "",
    ...(featuredSectionFirst ? featuredProductsSection : []),
    ...adaptiveCollectionSection,
    ...categorySpecialSection,
    ...categoryCardWallSection,
    '      <section className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">',
    '        <div className="grid gap-4 md:grid-cols-3">',
    "          {blueprint.valueProps.map((item) => (",
    '            <article key={item.title} className={theme.cardShell}>',
    '              <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>선택 기준</div>',
    '              <h2 className={`mt-3 text-xl font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{item.title}</h2>',
    '              <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{item.description}</p>',
    "            </article>",
    "          ))}",
    "        </div>",
    "      </section>",
    "",
    ...serviceCardsSection,
    ...(blueprint.category === "commerce"
      ? [
          '      <section id="shopping-guide" className="mx-auto max-w-7xl px-6 py-8 lg:px-8">',
          '        <div className={`grid gap-5 lg:grid-cols-[1.05fr_0.95fr] ${theme.sectionShell}`}>',
          '          <div className={theme.sectionShell}>',
          '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>구매 안내</div>',
          '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>먼저 확인해야 할 구매 기준</h2>',
          '            <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>복지용구는 가격보다 사용 환경과 호환성이 중요합니다. 상담, 규격, 설치 가능 여부를 먼저 확인하세요.</p>',
          '            <ul className="mt-6 space-y-3">',
          "              {blueprint.editorialSpotlight.bullets.map((bullet) => (",
          '                <li key={bullet} className={`flex gap-3 text-sm leading-6 ${theme.pageShell.includes("text-slate-50") ? "text-slate-100" : "text-slate-700"}`}>',
          '                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-amber-500" />',
          "                  <span>{bullet}</span>",
          "                </li>",
          "              ))}",
          "            </ul>",
          "          </div>",
          '          <div className={theme.sectionShell}>',
          '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>구매 안내</div>',
          '            <h3 className={`mt-2 text-2xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>상담, 배송, 설치를 먼저 확인하세요</h3>',
          '            <div className="mt-6 grid gap-4 sm:grid-cols-2">',
          "              {blueprint.serviceCards.map((item) => (",
          '                <article key={item.title} className={theme.cardShell}>',
          '                  <h4 className={`text-sm font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{item.title}</h4>',
          '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>',
          "                </article>",
          "              ))}",
          "            </div>",
          "          </div>",
          "        </div>",
          "      </section>",
          "",
        ]
      : []),
    ...(featuredSectionFirst ? [] : featuredProductsSection),
    ...(blueprint.category === "commerce"
      ? [
    '      <section id="reviews" className="mx-auto max-w-7xl px-6 py-8 lg:px-8">',
          '        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">',
          '          <div className={theme.sectionShell}>',
          '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>후기와 신뢰</div>',
          '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.socialProof.title}</h2>',
          '            <div className="mt-6 flex items-end gap-4">',
          '              <div className={`text-5xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{blueprint.socialProof.score}</div>',
          '              <div className={`max-w-xs text-sm leading-6 ${theme.mutedLabel}`}>{blueprint.socialProof.summary}</div>',
          "            </div>",
          '            <div className={theme.cardShell}>',
          "              실제 구매를 밀어주는 건 화려한 이미지보다 명확한 신뢰입니다.",
          "            </div>",
          "          </div>",
          '          <div className="grid gap-4 md:grid-cols-3">',
          "            {blueprint.socialProof.quotes.map((quote) => (",
          '              <article key={quote.name} className={theme.cardShell}>',
          '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{quote.role}</div>',
          '                <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{quote.name}</h3>',
          '                <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{quote.quote}</p>',
          "              </article>",
          "            ))}",
          "          </div>",
          "        </div>",
          "      </section>",
          "",
        ]
      : []),
    '      <section id="purchase-steps" className="mx-auto max-w-7xl px-6 py-8 lg:px-8">',
    '        <div className={theme.processShell}>',
    '          <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>'
      + processSectionEyebrow
      + "</div>",
    '          <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>'
      + processSectionHeading
      + "</h2>",
    '          <p className={`mt-3 max-w-3xl text-sm leading-7 ${theme.mutedLabel}`}>'
      + processSectionDescription
      + "</p>",
    '          <div className="mt-6 grid gap-4 md:grid-cols-2">',
    "            {blueprint.buildPlanCards.map((item) => (",
    '              <article key={item.title} className={theme.cardShell}>',
    '                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{item.priority}</div>',
    '                <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{item.title}</h3>',
    '                <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>',
    "              </article>",
    "            ))}",
    "          </div>",
    "        </div>",
    "      </section>",
    "",
    '      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">',
    '        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">',
    '          <div className={theme.sectionShell}>',
    '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>'
      + processSectionEyebrow
      + "</div>",
    '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>'
      + secondarySectionHeading
      + "</h2>",
    '            <div className="mt-6 space-y-4">',
            "              {blueprint.processSteps.map((step) => (",
    '                <article key={step.step} className={theme.cardShell}>',
    '                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>{step.step}</div>',
    '                  <h3 className={`mt-2 text-lg font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>{step.title}</h3>',
    '                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{step.description}</p>',
    "                </article>",
    "              ))}",
    "            </div>",
    "          </div>",
    "",
    '          <div id="faq" className={theme.faqShell}>',
    '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>'
      + faqEyebrow
      + "</div>",
    '            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-950"}`}>자주 묻는 질문</h2>',
    '            <div className="mt-6 space-y-4">',
    "              {blueprint.faq.map((item) => (",
    '                <details key={item.question} className={theme.cardShell}>',
    '                  <summary className={`cursor-pointer list-none text-sm font-semibold ${theme.pageShell.includes("text-slate-50") ? "text-white" : "text-slate-900"}`}>',
    '                    {item.question}',
    '                  </summary>',
    '                  <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.answer}</p>',
    "                </details>",
    "              ))}",
    "            </div>",
    "          </div>",
    "        </div>",
    "      </section>",
    "",
    '      <footer className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-8">',
    '        <div className={theme.footerShell}>',
    "          <div>",
    '            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>'
      + footerEyebrow
      + "</div>",
    '            <p className={`mt-2 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>'
      + footerDescription
      + "</p>",
    "          </div>",
    '          <div className="flex flex-wrap gap-2 lg:justify-end">',
    '            <a href="#overview" className={theme.footerChipShell}>Top</a>',
    '            <a href="#categories" className={theme.footerChipShell}>'
      + footerPrimaryLinkLabel
      + "</a>",
    '            <a href="#featured-products" className={theme.footerChipShell}>'
      + footerFeatureLinkLabel
      + "</a>",
    '            <a href="#faq" className={theme.footerChipShell}>FAQ</a>',
    "          </div>",
    "        </div>",
    "      </footer>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildVuePackageJson(slug: string) {
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        vue: "^3.5.13",
      },
      devDependencies: {
        "@vitejs/plugin-vue": "^5.2.1",
        typescript: "^5.7.3",
        vite: "^6.0.5",
      },
    },
    null,
    2
  );
}

function buildVueTsConfig() {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        module: "ESNext",
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        skipLibCheck: true,
        moduleResolution: "Bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "preserve",
        strict: true,
      },
      include: ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"],
    },
    null,
    2
  );
}

function buildVueViteConfig() {
  return [
    'import { defineConfig } from "vite";',
    'import vue from "@vitejs/plugin-vue";',
    "",
    "export default defineConfig({",
    "  plugins: [vue()],",
    "});",
    "",
  ].join("\n");
}

function buildVueIndexHtml(input: ProjectBootstrapInput) {
  return [
    "<!doctype html>",
    '<html lang="ko">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${escapeHtml(input.name)}</title>`,
    "  </head>",
    "  <body>",
    '    <div id="app"></div>',
    '    <script type="module" src="/src/main.ts"></script>',
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

function buildVueMainTs() {
  return ['import { createApp } from "vue";', 'import App from "./App.vue";', 'import "./style.css";', "", "createApp(App).mount(\"#app\");", ""].join("\n");
}

function buildVueApp(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const items = backlogItems.slice(0, 4);
  const visualAssets = buildVisualAssetBundle(
    input,
    "generic",
    items.map((item) => ({
      title: item.title,
      description: item.description,
      note: item.priority,
    })),
    "Independent Workspace"
  );
  return [
    "<script setup lang=\"ts\">",
    "const backlogItems = " + JSON.stringify(items, null, 2),
    "const visualAssets = " + JSON.stringify(visualAssets, null, 2),
    "</script>",
    "",
    "<template>",
    '  <main class="page">',
    '    <section class="hero">',
    `      <div class="eyebrow">Independent Workspace</div>`,
    `      <h1>${escapeHtml(input.name)}</h1>`,
    `      <p>${escapeHtml(input.description || "프로젝트 설명을 추가하세요.")}</p>`,
    '      <div class="hero-media" :style="{ backgroundImage: `url(${visualAssets.heroImage})` }"></div>',
    "    </section>",
    '    <section class="grid">',
    '      <article v-for=\"(item, index) in backlogItems\" :key=\"item.title\" class=\"card\">',
    '        <div class="card-media" :style="{ backgroundImage: `url(${visualAssets.galleryImages[index]})` }"></div>',
    '        <div class=\"priority\">{{ item.priority }}</div>',
    '        <h2>{{ item.title }}</h2>',
    '        <p>{{ item.description }}</p>',
    "      </article>",
    "    </section>",
    "  </main>",
    "</template>",
    "",
  ].join("\n");
}

function buildVueStyleCss() {
  return [
    ":root {",
    "  font-family: Arial, sans-serif;",
    "  color: #0f172a;",
    "  background: #f8fafc;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "}",
    "",
    ".page {",
    "  min-height: 100vh;",
    "  padding: 48px 24px;",
    "}",
    "",
    ".hero {",
    "  max-width: 960px;",
    "  margin: 0 auto;",
    "}",
    "",
    ".hero-media {",
    "  margin-top: 24px;",
    "  height: 280px;",
    "  border-radius: 28px;",
    "  background-size: cover;",
    "  background-position: center;",
    "  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);",
    "}",
    "",
    ".eyebrow {",
    "  color: #059669;",
    "  font-weight: 700;",
    "  text-transform: uppercase;",
    "  letter-spacing: 0.2em;",
    "  font-size: 12px;",
    "}",
    "",
    "h1 {",
    "  font-size: 56px;",
    "  margin: 16px 0;",
    "}",
    "",
    ".grid {",
    "  max-width: 960px;",
    "  margin: 32px auto 0;",
    "  display: grid;",
    "  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));",
    "  gap: 16px;",
    "}",
    "",
    ".card {",
    "  background: white;",
    "  border-radius: 24px;",
    "  padding: 20px;",
    "  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);",
    "}",
    "",
    ".card-media {",
    "  height: 180px;",
    "  border-radius: 18px;",
    "  background-size: cover;",
    "  background-position: center;",
    "  margin-bottom: 16px;",
    "}",
    "",
    ".priority {",
    "  font-size: 12px;",
    "  text-transform: uppercase;",
    "  color: #64748b;",
    "}",
    "",
  ].join("\n");
}

function buildSveltePackageJson(slug: string) {
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        svelte: "^5.16.0",
      },
      devDependencies: {
        "@sveltejs/vite-plugin-svelte": "^5.0.3",
        svelte: "^5.16.0",
        typescript: "^5.7.3",
        vite: "^6.0.5",
      },
    },
    null,
    2
  );
}

function buildSvelteTsConfig() {
  return JSON.stringify(
    {
      compilerOptions: {
        module: "ESNext",
        target: "ES2020",
        moduleResolution: "Bundler",
        strict: true,
        types: ["svelte"],
      },
      include: ["src/**/*.ts", "src/**/*.svelte"],
    },
    null,
    2
  );
}

function buildSvelteViteConfig() {
  return [
    'import { defineConfig } from "vite";',
    'import { svelte } from "@sveltejs/vite-plugin-svelte";',
    "",
    "export default defineConfig({",
    "  plugins: [svelte()],",
    "});",
    "",
  ].join("\n");
}

function buildSvelteConfig() {
  return ["export default {", "  compilerOptions: {", "    dev: true,", "  },", "};", ""].join("\n");
}

function buildSvelteMainTs() {
  return ['import App from "./App.svelte";', "", "const app = new App({", "  target: document.getElementById(\"app\")!,", "});", "", "export default app;", ""].join("\n");
}

function buildSvelteApp(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const items = backlogItems.slice(0, 4);
  const visualAssets = buildVisualAssetBundle(
    input,
    "generic",
    items.map((item) => ({
      title: item.title,
      description: item.description,
      note: item.priority,
    })),
    "Independent Workspace"
  );
  return [
    "<script lang=\"ts\">",
    "  const backlogItems = " + JSON.stringify(items, null, 2),
    "  const visualAssets = " + JSON.stringify(visualAssets, null, 2),
    "</script>",
    "",
    '<svelte:head><title>' + escapeHtml(input.name) + "</title></svelte:head>",
    "",
    '<main class=\"page\">',
    '  <section class=\"hero\">',
    '    <div class=\"eyebrow\">Independent Workspace</div>',
    `    <h1>${escapeHtml(input.name)}</h1>`,
    `    <p>${escapeHtml(input.description || "프로젝트 설명을 추가하세요.")}</p>`,
    '    <div class="hero-media" style={`background-image: url(${visualAssets.heroImage})`}></div>',
    "  </section>",
    '  <section class=\"grid\">',
    "    {#each backlogItems as item, index}",
    '      <article class=\"card\">',
    '        <div class="card-media" style={`background-image: url(${visualAssets.galleryImages[index]})`}></div>',
    '        <div class=\"priority\">{item.priority}</div>',
    "        <h2>{item.title}</h2>",
    "        <p>{item.description}</p>",
    "      </article>",
    "    {/each}",
    "  </section>",
    "</main>",
    "",
    "<style>",
    buildVueStyleCss(),
    "</style>",
    "",
  ].join("\n");
}

function buildFastApiRequirements() {
  return ["fastapi==0.115.8", "uvicorn[standard]==0.34.0", ""].join("\n");
}

function buildFastApiMainPy(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const items = backlogItems
    .slice(0, 5)
    .map((item) => `        {"title": ${JSON.stringify(item.title)}, "priority": ${JSON.stringify(item.priority)}},`)
    .join("\n");

  return [
    "from fastapi import FastAPI",
    "",
    "app = FastAPI(title=" + JSON.stringify(input.name) + ")",
    "",
    "@app.get('/')",
    "def read_root():",
    "    return {",
    "        'name': " + JSON.stringify(input.name) + ",",
    "        'description': " + JSON.stringify(input.description || "") + ",",
    "        'backlog': [",
    items,
    "        ],",
    "    }",
    "",
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
