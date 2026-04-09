import type { GeneratedBacklogItem, ProjectBootstrapInput } from "@/lib/bootstrap";
import { detectProjectCategoryFromText, type ProjectCategory } from "@/lib/project-intent";

export type WorkflowRole = "planner" | "critic" | "designer" | "coder" | "tester";

export const ROLE_BRIEFS: Record<WorkflowRole, string> = {
  planner: "핵심 고객, 전환 목표, 첫 화면 우선순위를 고정하고 불필요한 기능은 과감히 버린다.",
  critic: "비용, 중복, 과장, 성능 병목, AI 슬롭을 먼저 찾아내고 렌더 비용까지 줄이면서 다른 역할의 결과를 더 날카롭게 깎는다.",
  designer: "헤더가 페이지를 이끌게 하고, 히어로-증명-쇼케이스-푸터까지의 시각적 흐름과 위계를 설계한다.",
  coder: "실제 데이터와 반응형 섹션을 구현하고 단순 placeholder 카드 대신 제품, 가치, 구매 흐름을 보여준다.",
  tester: "375px, 768px, 1440px에서 레이아웃, CTA 노출, 오버플로우, 대비, 기본 접근성을 점검한다.",
};

export const ROLE_CHECKLISTS: Record<WorkflowRole, string[]> = {
  planner: [
    "첫 화면이 무엇을 약속하는지 한 문장으로 정리한다.",
    "Top backlog가 사용자 가치와 전환에 맞게 우선순위가 정리되었는지 확인한다.",
    "불필요한 기능을 제외하고 MVP 경계를 분명히 만든다.",
  ],
  critic: [
    "중복 섹션, 과도한 카드 수, 불필요한 데코레이션을 찾아낸다.",
    "성능을 해칠 수 있는 무거운 구조나 과한 렌더링 패턴을 지적한다.",
    "불필요한 blur, shadow, 반복 렌더링을 먼저 줄인다.",
    "다른 역할의 결과를 더 간결하고 선명하게 깎는 제안을 남긴다.",
  ],
  designer: [
    "헤더, hero, proof rail, showcase, build plan, footer의 순서를 먼저 고정한다.",
    "모바일과 데스크톱에서 동일한 메시지가 끊기지 않게 여백과 타이포를 맞춘다.",
    "감성만 있는 페이지가 아니라 CTA와 섹션 진입점이 눈에 띄는 구조를 만든다.",
  ],
  coder: [
    "실제 데이터 바인딩과 반복 렌더링으로 화면이 빈 껍데기처럼 보이지 않게 한다.",
    "섹션별 앵커와 카드 흐름이 끊기지 않도록 구현한다.",
    "배경, 카드, 버튼, 구분선이 하나의 디자인 언어를 공유하게 한다.",
  ],
  tester: [
    "375px, 768px, 1440px에서 레이아웃이 무너지지 않는지 확인한다.",
    "CTA가 첫 화면과 주요 섹션마다 충분히 보이는지 확인한다.",
    "placeholder, lorem ipsum, 정적인 데모 카드가 섞이지 않았는지 점검한다.",
  ],
};

export type StrictHarness = {
  mode: "strict";
  lockedCategory: ProjectCategory;
  scopeLock: {
    projectName: string;
    primaryPage: string;
    allowedSections: string[];
    forbiddenDrifts: string[];
  };
  nonNegotiables: string[];
  roleContracts: Record<
    WorkflowRole,
    {
      objective: string;
      requiredOutput: string;
      forbidden: string[];
      successCriteria: string[];
    }
  >;
};

const PHASE_ROLE_BASE_ORDER: Record<
  "planning" | "backlog" | "sprint" | "review" | "retro",
  WorkflowRole[]
> = {
  planning: ["planner", "critic", "designer", "coder", "tester"],
  backlog: ["planner", "critic", "designer", "coder", "tester"],
  sprint: ["designer", "critic", "planner", "coder", "tester"],
  review: ["tester", "critic", "coder", "designer", "planner"],
  retro: ["planner", "critic", "designer", "coder", "tester"],
};

export function detectProjectCategory(input: Pick<ProjectBootstrapInput, "name" | "description" | "requirements">) {
  const text = `${input.name} ${input.description} ${input.requirements.targetAudience} ${input.requirements.mustHaves} ${input.requirements.niceToHaves} ${input.requirements.constraints}`;
  return detectProjectCategoryFromText(text);
}

export function buildExecutionBrief(
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const category = detectProjectCategory(input);
  const topBacklogs = backlogItems.slice(0, 4).map((item) => ({
    title: item.title,
    priority: item.priority,
    storyPoints: item.storyPoints,
  }));

  return {
    category,
    primaryPage: `${input.name} website`,
    roleBriefs: ROLE_BRIEFS,
    roleChecklists: ROLE_CHECKLISTS,
    qualityChecklist: [
      "A sticky header anchors the page and exposes the main sections.",
      "Hero exists and explains the value in one sentence.",
      "The page uses a clear section rhythm instead of one long card dump.",
      "At least three meaningful showcase cards are visible.",
      "At least one primary CTA and one secondary CTA are visible above the fold.",
      "Backlog is translated into visible implementation intent, not just stored in DB.",
      "The page reads like a real product, not a generator demo.",
      "A horizontal rail or carousel is used where it improves scanning.",
      "The critique loop removes bloat before review.",
      "Non-commerce sites expose a contact, support, or next-step path.",
      "Responsive layout works on mobile and desktop.",
    ],
    strictHarness: buildStrictHarness(input, backlogItems, category),
    topBacklogs,
  };
}

export function buildRoleTaskMap(
  projectName: string,
  phase: "planning" | "backlog" | "sprint" | "review" | "retro"
) {
  const prefix = strictPrefix(projectName, phase);

  switch (phase) {
    case "planning":
      return {
        planner: prefix(`${projectName}의 전환 목표, 핵심 타깃, MVP 경계를 한 줄로 고정합니다.`),
        critic: prefix(`${projectName}의 scope와 경험 흐름에서 중복, 과장, 성능 부담을 먼저 찾아냅니다.`),
        designer: prefix(`${projectName}의 히어로, 신뢰 요소, CTA 위계를 먼저 설계합니다.`),
        coder: prefix(`${projectName}의 섹션 구조와 반복 렌더링 기반을 준비합니다.`),
        tester: prefix(`${projectName}의 정보 구조가 모바일에서도 읽히는지 점검합니다.`),
      };
    case "backlog":
      return {
        planner: prefix(`${projectName}의 백로그를 사용자 가치와 홈 전환 흐름 기준으로 재정렬합니다.`),
        critic: prefix(`${projectName}의 백로그에서 중복 기능, 무거운 요구사항, AI 슬롭을 제거합니다.`),
        designer: prefix(`${projectName}의 카드, 타이포, 여백, CTA 밀도를 구체화합니다.`),
        coder: prefix(`${projectName}의 홈과 핵심 상세 화면의 데이터 흐름을 구현할 준비를 합니다.`),
        tester: prefix(`${projectName}의 카드 수, CTA 수, 반응형 기준을 점검합니다.`),
      };
    case "sprint":
      return {
        planner: prefix(`${projectName} Sprint 1의 범위와 완료 기준을 관리합니다.`),
        critic: prefix(`${projectName}의 시각 구조와 정보 흐름에서 과한 비용과 중복을 실시간으로 비평합니다.`),
        designer: prefix(`${projectName}의 헤더, hero, 섹션 리듬, 캐러셀/rail의 시각 구조를 먼저 잠급니다.`),
        coder: prefix(`${projectName}의 주요 화면과 데이터 흐름을 구현하고 빈 상태를 제거합니다.`),
        tester: prefix(`${projectName}의 핵심 화면을 멀티 브레이크포인트로 검수합니다.`),
      };
    case "review":
      return {
        planner: prefix(`${projectName}의 릴리스 기준과 남은 리스크를 정리합니다.`),
        critic: prefix(`${projectName}의 결과물에서 반복, 과장, 불필요한 렌더링을 끝까지 깎아냅니다.`),
        designer: prefix(`${projectName}의 시각적 일관성과 CTA 가독성을 재확인합니다.`),
        coder: prefix(`${projectName}의 남은 버그와 레이아웃 문제를 수정합니다.`),
        tester: prefix(`${projectName}의 접근성, 반응형, 상호작용을 최종 검증합니다.`),
      };
    case "retro":
    default:
      return {
        planner: prefix(`${projectName} 회고에서 학습과 다음 개선점을 정리합니다.`),
        critic: prefix(`${projectName}의 구현과 운영에서 비용이 컸던 패턴을 냉정하게 정리합니다.`),
        designer: prefix(`${projectName}의 시각적 품질 변화와 부족한 패턴을 정리합니다.`),
        coder: prefix(`${projectName}의 구현 부채와 리팩터링 우선순위를 정리합니다.`),
        tester: prefix(`${projectName}의 테스트 공백과 재현 케이스를 기록합니다.`),
      };
  }
}

export function buildStrictHarness(
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[],
  lockedCategory: ProjectCategory
): StrictHarness {
  const topBacklogTitles = backlogItems.slice(0, 4).map((item) => item.title);

  return {
    mode: "strict",
    lockedCategory,
      scopeLock: {
        projectName: input.name,
        primaryPage: `${input.name} website`,
        allowedSections: [
          "header",
          "hero",
          "metrics",
          "trust",
          "proof-rail",
          "showcase",
          "carousel",
          "feature-grid",
          "build-plan",
          "process",
          "faq",
          "contact",
          "gallery",
          "timeline",
          "pricing",
          "schedule",
          "testimonials",
          "footer",
        ],
      forbiddenDrifts: [
        "change the category mid-generation",
        "invent new backlog items",
        "add placeholder-only content",
        "drop the primary CTA",
        "flatten the page into one undifferentiated card wall",
        "expand beyond the provided brief",
      ],
    },
    nonNegotiables: [
      "Stay inside the locked category and requirements.",
      "Use only the provided backlog and role brief as source material.",
      "Do not introduce new product directions or hidden assumptions.",
      "Lead the page with a header-driven structure instead of dumping every section at once.",
      "Do not replace the homepage structure with an unrelated layout.",
      "Do not ship placeholder text, lorem ipsum, or demo-only cards.",
      "Expose the final action path for the requested site type.",
    ],
    roleContracts: {
      planner: {
        objective: "lock scope and priority order",
        requiredOutput: `1-paragraph scope lock and a ranked summary of top backlog items: ${topBacklogTitles.join(", ") || "none"}.`,
        forbidden: [
          "do not expand the feature set",
          "do not change the locked category",
          "do not rewrite the product into a different business",
        ],
        successCriteria: [
          "top backlog matches the brief",
          "scope is narrower, not wider",
          "every next step is tied to the current page",
        ],
      },
      critic: {
        objective: "remove bloat and expose risk",
        requiredOutput: "a concise critique that calls out duplicate sections, runtime bloat, weak hierarchy, and avoidable complexity.",
        forbidden: [
          "do not add new scope",
          "do not defend obvious bloat",
          "do not replace critique with generic praise",
        ],
        successCriteria: [
          "findings reduce runtime or cognitive load",
          "feedback is specific and actionable",
          "critical issues are surfaced before coding",
        ],
      },
      designer: {
        objective: "lock the visual hierarchy",
        requiredOutput: "header-first layout notes for hero, proof rail, showcase/carousel, build plan, process, FAQ, and footer.",
        forbidden: [
          "do not introduce decorative-only sections",
          "do not change the information architecture",
          "do not turn the page into a brand moodboard",
        ],
        successCriteria: [
          "CTA remains obvious",
          "mobile and desktop hierarchy is explicit",
          "each section has a clear job",
        ],
      },
      coder: {
        objective: "implement only the approved structure",
        requiredOutput: "component map, data binding plan, header shell, and a concrete list of rendered sections.",
        forbidden: [
          "do not invent new pages",
          "do not add new product concepts",
          "do not swap the stack without approval",
        ],
        successCriteria: [
          "all approved sections render",
          "data comes from the brief or backlog",
          "no placeholder-only blocks survive",
        ],
      },
      tester: {
        objective: "prove the locked scope still works",
        requiredOutput: "breakpoint checklist, header/nav sanity check, defect list, and pass/fail summary against the brief.",
        forbidden: [
          "do not suggest feature expansion",
          "do not propose a redesign unless a test fails",
          "do not blur QA findings with new ideas",
        ],
        successCriteria: [
          "375px, 768px, 1440px are checked",
          "CTA and proof are visible",
          "no scope drift appears in the page",
        ],
      },
    },
  };
}

function strictPrefix(projectName: string, phase: string) {
  return (message: string) =>
    `STRICT HARNESS [${projectName} · ${phase}] - ${message} Do not change scope, category, or section order without the brief.`;
}

export function buildRoleExecutionOrder(
  roleQualityStats: Partial<Record<WorkflowRole, number>> | null | undefined,
  phase: "planning" | "backlog" | "sprint" | "review" | "retro",
  repairFocusRoles: WorkflowRole[] = []
) {
  const baseOrder = PHASE_ROLE_BASE_ORDER[phase];
  const focusSet = new Set(repairFocusRoles);

  return [...baseOrder].sort((left, right) => {
    const leftScore = (roleQualityStats?.[left] ?? 0) * 10 + (focusSet.has(left) ? 3 : 0);
    const rightScore = (roleQualityStats?.[right] ?? 0) * 10 + (focusSet.has(right) ? 3 : 0);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return baseOrder.indexOf(left) - baseOrder.indexOf(right);
  });
}

export function sortAgentsByRole<T extends { type: string }>(
  agents: T[],
  roleOrder: WorkflowRole[]
) {
  const rank = new Map(roleOrder.map((role, index) => [role, index]));

  return [...agents].sort((left, right) => {
    const leftRank = rank.get(left.type as WorkflowRole) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.type as WorkflowRole) ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return 0;
  });
}
