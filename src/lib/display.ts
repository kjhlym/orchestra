export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "기획",
  backlog: "백로그",
  sprint: "스프린트",
  done: "완료",
};

export const BACKLOG_PRIORITY_LABELS: Record<string, string> = {
  critical: "긴급",
  high: "높음",
  medium: "보통",
  low: "낮음",
};

export const AGENT_STATUS_LABELS: Record<string, string> = {
  idle: "대기",
  running: "실행 중",
  paused: "일시 중지",
  error: "오류",
};

export const AGENT_TYPE_LABELS: Record<string, string> = {
  planner: "기획",
  designer: "디자인",
  coder: "개발",
  tester: "테스트",
};

export const WORKFLOW_PHASES = [
  { id: "planning", label: "1. 요구사항 및 기획" },
  { id: "backlog", label: "2. 백로그 생성" },
  { id: "sprint", label: "3. 스프린트 실행" },
  { id: "review", label: "4. 테스트 및 검토" },
  { id: "retro", label: "5. 회고" },
] as const;

export const TECH_STACK_LABELS: Record<string, string> = {
  nextjs: "Next.js (React)",
  vue: "Vue.js / Nuxt",
  svelte: "SvelteKit",
  python: "Python FastAPI (템플릿)",
  tailwind: "Tailwind CSS",
  vanilla: "바닐라 CSS",
  scss: "SCSS / SASS",
  styled: "Styled Components",
  sqlite: "SQLite (Prisma)",
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
  supabase: "Supabase",
  vercel: "Vercel",
  cloudflare: "Cloudflare Pages/Workers",
  aws: "AWS",
  local: "로컬 전용",
};

export function getProjectStatusLabel(status: string) {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function getBacklogPriorityLabel(priority: string) {
  return BACKLOG_PRIORITY_LABELS[priority] ?? priority;
}

export function getAgentStatusLabel(status: string) {
  return AGENT_STATUS_LABELS[status] ?? status;
}

export function getAgentTypeLabel(type: string) {
  return AGENT_TYPE_LABELS[type] ?? type;
}

export function getTechStackLabel(value: string) {
  return TECH_STACK_LABELS[value] ?? value;
}

export function parseTechStack(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.values(parsed)
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      .map((entry) => getTechStackLabel(entry));
  } catch {
    return [value];
  }
}

export function formatKoreanDate(date: Date | string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}
