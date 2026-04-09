import type {
  BacklogPriority,
  GeneratedBacklogItem,
  ProjectBootstrapInput,
} from "@/lib/bootstrap";
import { buildFallbackBootstrapDraft, normalizeBootstrapDraft } from "@/lib/bootstrap-draft";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const BACKLOG_RESPONSE_SCHEMA = {
  type: "array",
  minItems: 5,
  maxItems: 8,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      userStory: { type: "string" },
      acceptanceCriteria: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string" },
      },
      priority: {
        type: "string",
        enum: ["critical", "high", "medium", "low"],
      },
      storyPoints: {
        type: "integer",
        minimum: 1,
        maximum: 13,
      },
    },
    required: [
      "title",
      "description",
      "userStory",
      "acceptanceCriteria",
      "priority",
      "storyPoints",
    ],
  },
} as const;

const BOOTSTRAP_DRAFT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    techStack: {
      type: "object",
      additionalProperties: false,
      properties: {
        framework: {
          type: "string",
          enum: ["nextjs", "vue", "svelte", "python"],
        },
        css: {
          type: "string",
          enum: ["tailwind", "vanilla", "scss", "styled"],
        },
        database: {
          type: "string",
          enum: ["sqlite", "postgres", "mongodb", "supabase"],
        },
        deployment: {
          type: "string",
          enum: ["vercel", "cloudflare", "aws", "local"],
        },
      },
      required: ["framework", "css", "database", "deployment"],
    },
    requirements: {
      type: "object",
      additionalProperties: false,
      properties: {
        targetAudience: { type: "string" },
        mustHaves: { type: "string" },
        niceToHaves: { type: "string" },
        constraints: { type: "string" },
      },
      required: [
        "targetAudience",
        "mustHaves",
        "niceToHaves",
        "constraints",
      ],
    },
  },
  required: ["name", "description", "techStack", "requirements"],
} as const;

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

type GeminiErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      "@type"?: string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
      locale?: string;
      message?: string;
    }>;
  };
};

export function getGeminiModel() {
  return DEFAULT_GEMINI_MODEL;
}

type GeminiGenerationSource = "gemini" | "fallback";

type BacklogGenerationResult = {
  items: GeneratedBacklogItem[];
  source: GeminiGenerationSource;
  reason?: string;
};

type BootstrapDraftGenerationResult = {
  draft: ProjectBootstrapInput;
  source: GeminiGenerationSource;
  reason?: string;
};

export async function generateBacklogItems(
  input: ProjectBootstrapInput
): Promise<BacklogGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const reason = "GEMINI_API_KEY가 없어서 로컬 백로그 초안을 사용했습니다.";
    console.warn(`[gemini] backlog fallback: ${reason}`);
    return { items: buildFallbackBacklogItems(input), source: "fallback", reason };
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/models/${getGeminiModel()}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: [
                "너는 숙련된 제품 오너다.",
                "입력된 프로젝트 요구사항을 바탕으로 한국어 제품 백로그를 작성한다.",
                "MVP 우선순위를 먼저 반영하고, 각 항목은 구현 가능한 단위여야 한다.",
                "priority는 critical/high/medium/low 중 하나만 사용한다.",
                "storyPoints는 1, 2, 3, 5, 8, 13 중 하나를 사용한다.",
              ].join(" "),
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildBacklogPrompt(input),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseJsonSchema: BACKLOG_RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(formatGeminiApiError(details));
  }

  const payload = (await response.json()) as GeminiGenerateResponse;
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const reason =
      payload.candidates?.[0]?.finishReason ?? payload.promptFeedback?.blockReason ?? "응답 없음";
    throw new Error(`Gemini가 유효한 백로그를 반환하지 않았습니다. 원인: ${reason}`);
  }

  let rawItems: unknown;
  try {
    rawItems = parseGeminiJson(text);
  } catch (error) {
    const reason =
      error instanceof Error
        ? `${error.message} 로컬 백로그 초안을 사용했습니다.`
        : "Gemini 응답 JSON을 해석하지 못해 로컬 백로그 초안을 사용했습니다.";
    console.warn(`[gemini] backlog fallback: ${reason}`);
    return { items: buildFallbackBacklogItems(input), source: "fallback", reason };
  }

  const items = normalizeBacklogResponse(rawItems)
    .map(normalizeBacklogItem)
    .filter((item): item is GeneratedBacklogItem => item !== null)
    .slice(0, 8);

  if (items.length === 0) {
    const reason = "Gemini 응답이 배열 형태가 아니거나 유효한 항목이 없어서 로컬 백로그 초안을 사용했습니다.";
    console.warn(`[gemini] backlog fallback: ${reason}`);
    return { items: buildFallbackBacklogItems(input), source: "fallback", reason };
  }

  return { items, source: "gemini" };
}

export async function generateBootstrapDraft(
  idea: string
): Promise<BootstrapDraftGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const reason = "GEMINI_API_KEY가 없어서 로컬 초안 템플릿을 사용했습니다.";
    console.warn(`[gemini] bootstrap draft fallback: ${reason}`);
    return { draft: buildFallbackBootstrapDraft(idea), source: "fallback", reason };
  }

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models/${getGeminiModel()}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: [
                  "너는 시니어 제품 디자이너다.",
                  "입력된 한 줄 아이디어를 바탕으로 새 프로젝트 폼 초안을 작성한다.",
                  "결과는 JSON 객체 하나만 반환한다.",
                  "name, description, techStack, requirements를 모두 채운다.",
                  "techStack은 nextjs/vue/svelte/python, tailwind/vanilla/scss/styled, sqlite/postgres/mongodb/supabase, vercel/cloudflare/aws/local 중 하나씩 선택한다.",
                  "requirements는 한국어로 간결하지만 구체적으로 작성한다.",
                ].join(" "),
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildBootstrapDraftPrompt(idea),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseJsonSchema: BOOTSTRAP_DRAFT_RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (!response.ok) {
      const reason = "Gemini 초안 생성 API 응답이 성공하지 않아 로컬 템플릿을 사용했습니다.";
      console.warn(`[gemini] bootstrap draft fallback: ${reason}`);
      return { draft: buildFallbackBootstrapDraft(idea), source: "fallback", reason };
    }

    const payload = (await response.json()) as GeminiGenerateResponse;
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const reason = "Gemini 초안 응답이 비어 있어 로컬 템플릿을 사용했습니다.";
      console.warn(`[gemini] bootstrap draft fallback: ${reason}`);
      return { draft: buildFallbackBootstrapDraft(idea), source: "fallback", reason };
    }

    const parsed = normalizeBootstrapDraft(parseGeminiJson(text));
    if (!parsed) {
      const reason = "Gemini 초안 응답 파싱에 실패해 로컬 템플릿을 사용했습니다.";
      console.warn(`[gemini] bootstrap draft fallback: ${reason}`);
      return { draft: buildFallbackBootstrapDraft(idea), source: "fallback", reason };
    }

    return { draft: parsed, source: "gemini" };
  } catch {
    const reason = "Gemini 초안 생성 중 예외가 발생해 로컬 템플릿을 사용했습니다.";
    console.warn(`[gemini] bootstrap draft fallback: ${reason}`);
    return { draft: buildFallbackBootstrapDraft(idea), source: "fallback", reason };
  }
}

function buildBacklogPrompt(input: ProjectBootstrapInput) {
  return [
    "다음 프로젝트 정보를 기반으로 제품 백로그를 5~8개 생성하라.",
    "결과는 JSON 배열로만 반환하라.",
    "출력 규칙:",
    "- 각 항목은 실제 구현 가능한 단위로 작성한다.",
    "- mustHaves를 먼저 반영하고, niceToHaves는 후순위로 포함한다.",
    "- 타깃 사용자와 제약사항을 반드시 반영한다.",
    '- userStory는 "사용자로서 ..., 나는 ... 원한다. 그래서 ..." 형식으로 작성한다.',
    "- acceptanceCriteria는 2~4개로 작성한다.",
    "- title과 description은 모두 한국어로 작성한다.",
    "",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

function buildFallbackBacklogItems(input: ProjectBootstrapInput): GeneratedBacklogItem[] {
  const projectName = input.name.trim() || "새 프로젝트";
  const targetAudience =
    input.requirements.targetAudience.trim() || "실무 사용자";

  return [
    {
      title: `${projectName} 기본 구조`,
      description: "프로젝트의 핵심 화면과 데이터 흐름을 만든다.",
      userStory: `사용자로서 ${projectName}의 핵심 기능을 바로 사용할 수 있기를 원합니다.`,
      acceptanceCriteria: [
        "핵심 화면이 정상적으로 열린다.",
        "기본 데이터 흐름이 작동한다.",
      ],
      priority: "high",
      storyPoints: 3,
    },
    {
      title: "핵심 작업 흐름",
      description: `${targetAudience}가 가장 자주 쓰는 흐름을 구현한다.`,
      userStory: `사용자로서 ${targetAudience}가 반복 작업을 빠르게 처리하고 싶습니다.`,
      acceptanceCriteria: [
        "주요 작업을 3단계 이내로 끝낼 수 있다.",
        "결과가 즉시 화면에 반영된다.",
      ],
      priority: "critical",
      storyPoints: 5,
    },
    {
      title: "데이터 저장",
      description: "입력한 내용을 안전하게 저장하고 다시 불러올 수 있게 한다.",
      userStory: "사용자로서 내가 입력한 내용을 나중에 다시 확인하고 싶습니다.",
      acceptanceCriteria: [
        "저장 후 새로고침해도 데이터가 유지된다.",
        "삭제 및 수정 동작이 정상적으로 작동한다.",
      ],
      priority: "high",
      storyPoints: 3,
    },
    {
      title: "운영자 관리 화면",
      description: "관리자가 상태와 진행 상황을 한눈에 볼 수 있게 한다.",
      userStory: "운영자로서 현재 진행 상태를 빠르게 파악하고 싶습니다.",
      acceptanceCriteria: [
        "목록과 상세 정보가 표시된다.",
        "상태 변경이 가능하다.",
      ],
      priority: "medium",
      storyPoints: 3,
    },
    {
      title: "기본 검증",
      description: "입력값과 오류 상황을 사용자 친화적으로 처리한다.",
      userStory: "사용자로서 잘못된 입력을 했을 때 바로 알 수 있기를 원합니다.",
      acceptanceCriteria: [
        "필수 입력값이 비어 있으면 저장되지 않는다.",
        "오류 메시지가 이해하기 쉽게 표시된다.",
      ],
      priority: "medium",
      storyPoints: 2,
    },
  ];
}

function normalizeBacklogResponse(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.backlogs,
    record.backlogItems,
    record.items,
    record.data,
    record.result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (looksLikeBacklogItem(record)) {
    return [record];
  }

  return [];
}

function looksLikeBacklogItem(value: Record<string, unknown>) {
  return (
    typeof value.title === "string" ||
    typeof value.description === "string" ||
    typeof value.userStory === "string" ||
    Array.isArray(value.acceptanceCriteria) ||
    typeof value.priority === "string" ||
    typeof value.storyPoints === "string" ||
    typeof value.storyPoints === "number"
  );
}

function buildBootstrapDraftPrompt(idea: string) {
  const normalizedIdea = idea.trim();

  return [
    "다음 한 줄 아이디어를 바탕으로 새 프로젝트 초안을 작성하라.",
    "name은 2~6단어의 프로젝트명으로 쓰고, description은 1~2문장으로 작성한다.",
    "techStack은 이 프로젝트에 가장 잘 맞는 조합으로 선택한다.",
    "requirements는 실제 구현 가능한 수준으로 작성하고, mustHaves는 3개 이상, niceToHaves는 2개 이상으로 구성한다.",
    "constraints는 속도, 접근성, 운영 안정성 중 최소 하나를 포함한다.",
    "",
    normalizedIdea || "아직 아이디어가 없다. 범용적인 새 SaaS 제품 초안을 작성하라.",
  ].join("\n");
}

function normalizeBacklogItem(value: unknown): GeneratedBacklogItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = toCleanString(record.title);

  if (!title) {
    return null;
  }

  const description = toCleanString(record.description) || `${title} 기능을 구현합니다.`;
  const userStory = toCleanString(record.userStory) || `${title} 기능을 사용할 수 있어야 합니다.`;
  const acceptanceCriteria = toStringList(record.acceptanceCriteria);
  const priority = normalizePriority(record.priority);
  const storyPoints = normalizeStoryPoints(record.storyPoints);

  return {
    title,
    description,
    userStory,
    acceptanceCriteria:
      acceptanceCriteria.length > 0 ? acceptanceCriteria : [`${title} 기능이 정상 동작한다.`],
    priority,
    storyPoints,
  };
}

function toCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((entry) => entry.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function normalizePriority(value: unknown): BacklogPriority {
  const priority = typeof value === "string" ? value.toLowerCase() : "";

  if (priority === "critical" || priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }

  return "medium";
}

function normalizeStoryPoints(value: unknown) {
  const allowedStoryPoints = [1, 2, 3, 5, 8, 13];
  const storyPoints =
    typeof value === "number"
      ? Math.round(value)
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;

  return allowedStoryPoints.includes(storyPoints) ? storyPoints : 3;
}

function stripJsonFence(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseGeminiJson(text: string) {
  const candidates = collectJsonCandidates(text);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error(
    `Gemini 응답 JSON을 해석하지 못했습니다. 응답 일부: ${createResponsePreview(text)}`
  );
}

function collectJsonCandidates(text: string) {
  const normalized = text.trim();
  const candidates = new Set<string>();

  addJsonCandidate(candidates, normalized);
  addJsonCandidate(candidates, stripJsonFence(normalized));
  addJsonCandidate(candidates, normalized.replace(/^\s*json\s*/i, "").trim());

  const fenced = extractFencedBlock(normalized);
  if (fenced) {
    addJsonCandidate(candidates, fenced);
    addJsonCandidate(candidates, stripJsonFence(fenced));
  }

  addJsonCandidate(candidates, extractBalancedJson(normalized, "[", "]"));
  addJsonCandidate(candidates, extractBalancedJson(normalized, "{", "}"));

  return [...candidates];
}

function addJsonCandidate(candidates: Set<string>, value: string | null) {
  const trimmed = value?.trim();
  if (trimmed) {
    candidates.add(trimmed);
  }
}

function extractFencedBlock(text: string) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match?.[1] ?? null;
}

function extractBalancedJson(text: string, openChar: "[" | "{", closeChar: "]" | "}") {
  const start = text.indexOf(openChar);

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function createResponsePreview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function formatGeminiApiError(details: string) {
  const parsed = parseGeminiError(details);
  const message = parsed?.error?.message?.trim();
  const status = parsed?.error?.status?.trim();

  if (isExpiredOrInvalidApiKeyError(parsed)) {
    return [
      "Gemini API 키가 만료되었거나 유효하지 않습니다.",
      "`.env`의 `GEMINI_API_KEY`를 새 키로 교체한 뒤 Next.js 서버를 다시 시작하세요.",
    ].join(" ");
  }

  if (message) {
    return `Gemini API 호출에 실패했습니다. ${message}${status ? ` (${status})` : ""}`;
  }

  const fallback = details.trim();
  return fallback ? `Gemini API 호출에 실패했습니다. ${fallback}` : "Gemini API 호출에 실패했습니다.";
}

function parseGeminiError(details: string) {
  try {
    return JSON.parse(details) as GeminiErrorResponse;
  } catch {
    return null;
  }
}

function isExpiredOrInvalidApiKeyError(payload: GeminiErrorResponse | null) {
  const error = payload?.error;

  if (!error) {
    return false;
  }

  const joinedReasons = (error.details ?? [])
    .map((detail) => detail.reason ?? detail.message ?? "")
    .join(" ")
    .toLowerCase();
  const combinedMessage = `${error.message ?? ""} ${joinedReasons}`.toLowerCase();

  return combinedMessage.includes("api key expired") || combinedMessage.includes("api_key_invalid");
}
