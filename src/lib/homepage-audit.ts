import { promises as fs } from "fs";
import path from "path";
import type { GeneratedBacklogItem, ProjectBootstrapInput } from "@/lib/bootstrap";
import { detectProjectCategory, type WorkflowRole } from "@/lib/workflow-guidance";

const WORKFLOW_ROLES: WorkflowRole[] = ["planner", "critic", "designer", "coder", "tester"];

export type HomepageAuditResult = {
  passed: boolean;
  score: number;
  checkedAt: string;
  framework: string;
  filePath: string;
  messages: string[];
  roleFindings: Record<WorkflowRole, string[]>;
  skipped?: boolean;
};

export class HomepageAuditError extends Error {
  result: HomepageAuditResult;

  constructor(result: HomepageAuditResult) {
    super(buildHomepageAuditFailureMessage(result));
    this.name = "HomepageAuditError";
    this.result = result;
  }
}

export async function auditGeneratedHomepage(
  workspacePath: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
): Promise<HomepageAuditResult> {
  const framework = normalizeFramework(input.techStack.framework);
  const filePath = getHomepageFilePath(workspacePath, framework);
  const category = detectProjectCategory(input);

  if (framework !== "nextjs") {
    return {
      passed: true,
      skipped: true,
      score: 100,
      checkedAt: new Date().toISOString(),
      framework,
      filePath,
      messages: [
        "현재 자동 검수는 Next.js 랜딩 페이지에 대해 가장 강하게 적용됩니다.",
        "다른 프레임워크는 생성 완료 후 수동 확인을 권장합니다.",
      ],
      roleFindings: createEmptyRoleFindings(),
    };
  }

  let content = "";

  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return {
      passed: false,
      score: 0,
      checkedAt: new Date().toISOString(),
      framework,
      filePath,
      messages: [`홈페이지 파일을 찾지 못했습니다: ${filePath}`],
      roleFindings: createEmptyRoleFindings(),
    };
  }

  const normalized = content.toLowerCase();
  const messages: string[] = [];
  const roleFindings = createEmptyRoleFindings();
  let score = 100;

  const requiredChecks: Array<{
    ok: boolean;
    message: string;
    penalty: number;
    roles: WorkflowRole[];
  }> = [
    {
      ok: normalized.includes('id="categories"'),
      message: "카테고리 섹션이 없습니다.",
      penalty: 20,
      roles: ["planner", "designer", "coder"],
    },
    {
      ok: normalized.includes('id="featured-products"'),
      message: "추천 제품 섹션이 없습니다.",
      penalty: 20,
      roles: ["planner", "coder"],
    },
    {
      ok: normalized.includes('id="purchase-steps"'),
      message: "구매 절차 섹션이 없습니다.",
      penalty: 15,
      roles: ["planner", "tester"],
    },
    {
      ok: normalized.includes('id="faq"') || normalized.includes("faq"),
      message: "FAQ 섹션이 없습니다.",
      penalty: 10,
      roles: ["tester", "planner"],
    },
    {
      ok: normalized.includes('href="#categories"'),
      message: "카테고리로 이동하는 CTA가 없습니다.",
      penalty: 10,
      roles: ["designer", "planner"],
    },
    {
      ok: normalized.includes('href="#featured-products"'),
      message: "추천 제품으로 이동하는 CTA가 없습니다.",
      penalty: 10,
      roles: ["planner", "designer"],
    },
    {
      ok: normalized.includes("showcaseitems.map"),
      message: "추천 제품 카드 데이터 바인딩이 없습니다.",
      penalty: 10,
      roles: ["critic", "coder", "designer"],
    },
    {
      ok: normalized.includes("buildplancards.map"),
      message: "구매 절차 카드 렌더링이 없습니다.",
      penalty: 10,
      roles: ["critic", "coder", "planner"],
    },
  ];

  if (category === "commerce") {
    requiredChecks.push(
      {
        ok: normalized.includes('id="collection-filters"'),
        message: "커머스 컬렉션 필터가 없습니다.",
        penalty: 10,
        roles: ["designer", "planner"],
      },
      {
        ok: normalized.includes('id="shopping-guide"'),
        message: "구매 안내 섹션이 없습니다.",
        penalty: 10,
        roles: ["planner", "designer"],
      },
      {
        ok: normalized.includes('id="reviews"'),
        message: "후기/신뢰 섹션이 없습니다.",
        penalty: 10,
        roles: ["designer", "coder"],
      },
      {
        ok: normalized.includes("₩") || normalized.includes("gift-ready"),
        message: "상품 가격 또는 선물 정보가 충분히 드러나지 않습니다.",
        penalty: 10,
        roles: ["coder", "designer"],
      }
    );
  }

  for (const check of requiredChecks) {
    if (!check.ok) {
      messages.push(check.message);
      score -= check.penalty;
      appendRoleFinding(roleFindings, check.roles, check.message);
    }
  }

  const bannedPatterns = [
    "lorem ipsum",
    "프로젝트 설명을 여기에 작성하세요",
    "placeholder",
    "todo",
  ];

  for (const pattern of bannedPatterns) {
    if (normalized.includes(pattern)) {
      messages.push(`금지된 placeholder 문구가 발견되었습니다: ${pattern}`);
      score -= 15;
      appendRoleFinding(
        roleFindings,
        WORKFLOW_ROLES,
        `placeholder 문구를 제거하세요: ${pattern}`
      );
    }
  }

  const articleCount = (content.match(/<article\b/g) || []).length;
  const minimumArticleCount =
    category === "commerce" ? 6 : 4;
  if (articleCount < minimumArticleCount) {
    messages.push("화면에 충분한 카드 수가 보이지 않습니다.");
    score -= 10;
    appendRoleFinding(roleFindings, ["critic", "designer", "coder"], "카드 레이아웃과 정보 밀도를 더 채워야 합니다.");
  }

  const maximumArticleCount =
    category === "commerce" ? Math.max(18, backlogItems.length + 12) : Math.max(14, backlogItems.length + 8);
  if (articleCount > maximumArticleCount) {
    messages.push("카드 수가 너무 많아 스캔과 렌더 비용이 커집니다.");
    score -= 8;
    appendRoleFinding(roleFindings, ["critic", "designer", "coder"], "카드 수를 줄이고 핵심 카드만 남기세요.");
  }

  const ctaCount = (content.match(/href="#/g) || []).length;
  if (ctaCount < 2) {
    messages.push("상단 CTA 수가 부족합니다.");
    score -= 10;
    appendRoleFinding(roleFindings, ["planner", "designer"], "첫 화면과 핵심 섹션에 CTA를 더 분명하게 배치하세요.");
  }

  const hasHero = normalized.includes("hero") || normalized.includes("brand commerce") || normalized.includes("homepage");
  if (!hasHero) {
    messages.push("Hero 영역이 명확하지 않습니다.");
    score -= 15;
    appendRoleFinding(roleFindings, ["planner", "designer"], "Hero의 가치 제안과 첫 문장을 더 강하게 잡아야 합니다.");
  }

  const passed = messages.length === 0;

  return {
    passed,
    score: Math.max(0, score),
    checkedAt: new Date().toISOString(),
    framework,
    filePath,
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

export function buildHomepageAuditMarkdown(result: HomepageAuditResult) {
  return [
    "# Homepage Audit",
    "",
    `- passed: ${result.passed}`,
    `- score: ${result.score}`,
    `- framework: ${result.framework}`,
    `- file: ${result.filePath}`,
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

function buildHomepageAuditFailureMessage(result: HomepageAuditResult) {
  if (result.passed) {
    return "홈페이지 감사가 실패 상태로 호출되었습니다.";
  }

  const roleSummary = buildRoleSummary(result.roleFindings);
  const firstMessage = result.messages[0] ?? "알 수 없는 사유";
  return `생성된 홈페이지 품질 검수에 실패했습니다. 점수 ${result.score}점. ${roleSummary || firstMessage}`;
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
