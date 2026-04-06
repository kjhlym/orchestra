import type {
  BacklogPriority,
  GeneratedBacklogItem,
  ProjectBootstrapInput,
} from "@/lib/bootstrap";

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

export async function generateBacklogItems(input: ProjectBootstrapInput) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.");
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
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Gemini 응답 JSON을 해석하지 못했습니다.");
  }

  if (!Array.isArray(rawItems)) {
    throw new Error("Gemini 응답 형식이 배열이 아닙니다.");
  }

  const items = rawItems
    .map(normalizeBacklogItem)
    .filter((item): item is GeneratedBacklogItem => item !== null)
    .slice(0, 8);

  if (items.length === 0) {
    throw new Error("저장할 수 있는 백로그 항목을 생성하지 못했습니다.");
  }

  return items;
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
