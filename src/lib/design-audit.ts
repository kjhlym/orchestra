import { promises as fs } from "fs";
import path from "path";
import type { GeneratedBacklogItem, ProjectBootstrapInput } from "@/lib/bootstrap";
import { detectProjectCategory, type WorkflowRole } from "@/lib/workflow-guidance";

const WORKFLOW_ROLES: WorkflowRole[] = ["planner", "critic", "designer", "coder", "tester"];

export type DesignAuditResult = {
  passed: boolean;
  score: number;
  checkedAt: string;
  framework: string;
  filePath: string;
  stylePath: string;
  messages: string[];
  roleFindings: Record<WorkflowRole, string[]>;
  skipped?: boolean;
};

export class DesignAuditError extends Error {
  result: DesignAuditResult;

  constructor(result: DesignAuditResult) {
    super(buildDesignAuditFailureMessage(result));
    this.name = "DesignAuditError";
    this.result = result;
  }
}

export async function auditGeneratedDesign(
  workspacePath: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
): Promise<DesignAuditResult> {
  const framework = normalizeFramework(input.techStack.framework);
  const filePath = getHomepageFilePath(workspacePath, framework);
  const stylePath = getStyleFilePath(workspacePath, framework);
  const category = detectProjectCategory(input);

  if (framework !== "nextjs") {
    return {
      passed: true,
      skipped: true,
      score: 100,
      checkedAt: new Date().toISOString(),
      framework,
      filePath,
      stylePath,
      messages: [
        "디자인 검수는 Next.js 랜딩 페이지에 가장 강하게 적용됩니다.",
        "다른 프레임워크는 생성 완료 후 수동 디자인 확인을 권장합니다.",
      ],
      roleFindings: createEmptyRoleFindings(),
    };
  }

  const [pageContent, styleContent] = await Promise.all([
    fs.readFile(filePath, "utf8").catch(() => ""),
    fs.readFile(stylePath, "utf8").catch(() => ""),
  ]);

  if (!pageContent) {
    return {
      passed: false,
      score: 0,
      checkedAt: new Date().toISOString(),
      framework,
      filePath,
      stylePath,
      messages: [`디자인 검수용 페이지를 찾지 못했습니다: ${filePath}`],
      roleFindings: createEmptyRoleFindings(),
    };
  }

  const page = pageContent.toLowerCase();
  const styles = styleContent.toLowerCase();
  const messages: string[] = [];
  const roleFindings = createEmptyRoleFindings();
  let score = 100;

  const checks: Array<{
    ok: boolean;
    message: string;
    penalty: number;
    roles: WorkflowRole[];
  }> = [
    {
      ok: page.includes("bg-[radial-gradient") || page.includes("bg-gradient-to-"),
      message: "브랜드 배경 레이어가 부족합니다.",
      penalty: 15,
      roles: ["critic", "designer"],
    },
    {
      ok: page.includes("backdrop-blur"),
      message: "글래스 효과 또는 레이어감이 약합니다.",
      penalty: 10,
      roles: ["critic", "designer"],
    },
    {
      ok: page.includes("shadow-2xl") || page.includes("shadow-lg"),
      message: "카드 깊이감이 부족합니다.",
      penalty: 10,
      roles: ["critic", "designer", "coder"],
    },
    {
      ok: page.includes("tracking-tight"),
      message: "헤드라인 위계가 약합니다.",
      penalty: 10,
      roles: ["designer", "planner"],
    },
    {
      ok: page.includes("text-5xl") || page.includes("text-6xl"),
      message: "히어로 타이포가 충분히 강하지 않습니다.",
      penalty: 10,
      roles: ["designer", "planner"],
    },
    {
      ok: page.includes("rounded-[2rem]") || page.includes("rounded-[1.75rem]"),
      message: "큰 라운드 카드가 보이지 않습니다.",
      penalty: 10,
      roles: ["designer"],
    },
    {
      ok: page.includes("bg-slate-950") || page.includes("bg-neutral-950"),
      message: "대비가 강한 다크 섹션이 없습니다.",
      penalty: 10,
      roles: ["designer", "coder"],
    },
    {
      ok: page.includes("section"),
      message: "섹션 단위의 정보 구획이 부족합니다.",
      penalty: 10,
      roles: ["planner", "designer"],
    },
  ];

  if (category === "commerce") {
    checks.push(
      {
        ok: page.includes('id="collection-filters"'),
        message: "컬렉션 필터가 시각적으로 드러나지 않습니다.",
        penalty: 10,
        roles: ["designer", "planner"],
      },
      {
        ok: page.includes('id="shopping-guide"'),
        message: "구매 안내 카드가 부족합니다.",
        penalty: 10,
        roles: ["designer", "planner"],
      },
      {
        ok: page.includes('id="reviews"'),
        message: "후기/신뢰 영역이 약합니다.",
        penalty: 10,
        roles: ["designer", "coder"],
      },
      {
        ok: page.includes('id="featured-products"'),
        message: "추천 제품 섹션이 부족합니다.",
        penalty: 10,
        roles: ["designer", "coder"],
      }
    );
  }

  for (const check of checks) {
    if (!check.ok) {
      messages.push(check.message);
      score -= check.penalty;
      appendRoleFinding(roleFindings, check.roles, check.message);
    }
  }

  const sectionCount = (pageContent.match(/<section\b/g) || []).length;
  if (sectionCount < 4) {
    messages.push("디자인 구성이 충분히 분절되지 않았습니다.");
    score -= 10;
    appendRoleFinding(roleFindings, ["planner", "designer"], "섹션 단위의 정보 구획을 더 분명히 나누세요.");
  }

  const cardCount = (pageContent.match(/<article\b/g) || []).length;
  const minimumCardCount =
    category === "commerce" ? 6 : 4;
  if (cardCount < minimumCardCount) {
    messages.push("카드 기반 레이아웃이 충분하지 않습니다.");
    score -= 10;
    appendRoleFinding(roleFindings, ["critic", "coder", "designer"], "카드 수와 정보 밀도를 더 늘려야 합니다.");
  }

  const maximumCardCount =
    category === "commerce" ? Math.max(18, backlogItems.length + 12) : Math.max(14, backlogItems.length + 8);
  if (cardCount > maximumCardCount) {
    messages.push("카드가 너무 많아 시각적 복잡도와 렌더 비용이 커집니다.");
    score -= 8;
    appendRoleFinding(roleFindings, ["critic", "designer", "coder"], "핵심 카드만 남기고 반복 블록을 정리하세요.");
  }

  const buttonLikeCount = (page.match(/rounded-full/g) || []).length;
  if (buttonLikeCount < 2) {
    messages.push("CTA 버튼의 시각적 무게가 부족합니다.");
    score -= 10;
    appendRoleFinding(roleFindings, ["planner", "designer"], "주요 CTA를 더 강한 시각 요소로 만들어야 합니다.");
  }

  if (!(styles.includes("--background") && styles.includes("scroll-behavior"))) {
    messages.push("기본 스타일 토큰과 스무스 스크롤이 설정되지 않았습니다.");
    score -= 5;
    appendRoleFinding(roleFindings, ["coder"], "기본 스타일 토큰과 스크롤 설정을 보강하세요.");
  }

  if (!(styles.includes("font-family") && styles.includes("color: var(--foreground)"))) {
    messages.push("기본 타이포 시스템이 명확하지 않습니다.");
    score -= 5;
    appendRoleFinding(roleFindings, ["designer", "coder"], "기본 타이포 시스템이 더 분명해야 합니다.");
  }

  const passed = messages.length === 0;

  return {
    passed,
    score: Math.max(0, score),
    checkedAt: new Date().toISOString(),
    framework,
    filePath,
    stylePath,
    messages,
    roleFindings,
  };
}

function getHomepageFilePath(workspacePath: string, framework: string) {
  switch (framework) {
    case "vue":
      return path.join(workspacePath, "src", "App.vue");
    case "svelte":
      return path.join(workspacePath, "src", "App.svelte");
    case "python":
      return path.join(workspacePath, "app", "main.py");
    case "nextjs":
    default:
      return path.join(workspacePath, "src", "app", "page.tsx");
  }
}

function getStyleFilePath(workspacePath: string, framework: string) {
  switch (framework) {
    case "vue":
    case "svelte":
      return path.join(workspacePath, "src", "style.css");
    case "python":
      return path.join(workspacePath, "app", "main.py");
    case "nextjs":
    default:
      return path.join(workspacePath, "src", "app", "globals.css");
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

export function buildDesignAuditMarkdown(result: DesignAuditResult) {
  return [
    "# Design Audit",
    "",
    `- passed: ${result.passed}`,
    `- score: ${result.score}`,
    `- framework: ${result.framework}`,
    `- page: ${result.filePath}`,
    `- style: ${result.stylePath}`,
    `- checkedAt: ${result.checkedAt}`,
    "",
    "## Messages",
    ...(result.messages.length > 0 ? result.messages.map((message) => `- ${message}`) : ["- no issues found"]),
    "",
    "## Role Findings",
    ...buildRoleFindingMarkdown(result.roleFindings),
    "",
  ].join("\n");
}

function buildDesignAuditFailureMessage(result: DesignAuditResult) {
  if (result.passed) {
    return "디자인 감사가 실패 상태로 호출되었습니다.";
  }

  const roleSummary = buildRoleSummary(result.roleFindings);
  const firstMessage = result.messages[0] ?? "알 수 없는 사유";
  return `생성된 디자인 품질 검수에 실패했습니다. 점수 ${result.score}점. ${roleSummary || firstMessage}`;
}

function createEmptyRoleFindings() {
  return {
    planner: [],
    critic: [],
    designer: [],
    coder: [],
    tester: [],
  };
}

function appendRoleFinding(
  roleFindings: Record<WorkflowRole, string[]>,
  roles: WorkflowRole[],
  message: string
) {
  for (const role of roles) {
    roleFindings[role].push(message);
  }
}

function buildRoleFindingMarkdown(roleFindings: Record<WorkflowRole, string[]>) {
  const lines: string[] = [];

  for (const role of WORKFLOW_ROLES) {
    const findings = roleFindings[role];
    if (!findings.length) {
      continue;
    }

    lines.push(`### ${role}`);
    lines.push(...findings.map((message) => `- ${message}`));
    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("- no role-specific issues found");
  }

  return lines;
}

function buildRoleSummary(roleFindings: Record<WorkflowRole, string[]>) {
  const findings = WORKFLOW_ROLES.flatMap((role) =>
    roleFindings[role].length > 0 ? [`${role}: ${roleFindings[role][0]}`] : []
  );

  return findings.slice(0, 2).join(" / ");
}
