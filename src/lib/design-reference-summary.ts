export type DesignReferenceSiteSummary = {
  title?: string;
  description?: string;
  highlights: string[];
  summary: string;
};

const MAX_HTML_CHARS = 150_000;
const REQUEST_TIMEOUT_MS = 4_000;

export async function summarizeDesignReferenceSite(siteUrl: string) {
  let url: URL;

  try {
    url = new URL(siteUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const controller = new AbortController();
  const timeout = windowLikeSetTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; OrchestraBot/1.0; +https://github.com/openai)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return null;
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    const title = extractTagText(html, "title");
    const description = extractMetaDescription(html);
    const highlights = extractHighlights(html);
    const summary = buildSummary(title, description, highlights);

    if (!summary) {
      return null;
    }

    return {
      title,
      description,
      highlights,
      summary,
    } satisfies DesignReferenceSiteSummary;
  } catch {
    return null;
  } finally {
    windowLikeClearTimeout(timeout);
  }
}

function buildSummary(title: string | undefined, description: string | undefined, highlights: string[]) {
  const titlePart = title ? truncate(title, 50) : "";
  const descriptionPart = description ? truncate(description, 90) : "";
  const highlightPart = highlights.slice(0, 2).map((item) => truncate(item, 36)).filter(Boolean);

  const parts: string[] = [];

  if (titlePart) {
    parts.push(titlePart);
  }

  if (descriptionPart) {
    parts.push(descriptionPart);
  }

  if (highlightPart.length > 0) {
    parts.push(`핵심 ${highlightPart.join(" / ")}`);
  }

  return parts.join(" · ");
}

function extractTagText(html: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const match = html.match(pattern);
  return match ? cleanText(stripTags(match[1])) : "";
}

function extractMetaDescription(html: string) {
  const pattern = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i;
  const match = html.match(pattern);
  if (match?.[1]) {
    return cleanText(match[1]);
  }

  const ogPattern = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i;
  const ogMatch = html.match(ogPattern);
  return ogMatch?.[1] ? cleanText(ogMatch[1]) : "";
}

function extractHighlights(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  const preferredBlocks = collectBlockMatches(withoutNoise, /<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi);
  const cleanedPreferred = preferredBlocks
    .map((entry) => cleanText(stripTags(entry)))
    .filter((text) => isUsefulText(text));

  if (cleanedPreferred.length > 0) {
    return uniqueText(cleanedPreferred).slice(0, 4);
  }

  const text = cleanText(stripTags(withoutNoise));
  return splitSentences(text)
    .filter((entry) => isUsefulText(entry))
    .slice(0, 4);
}

function collectBlockMatches(html: string, pattern: RegExp) {
  const matches: string[] = [];
  for (const match of html.matchAll(pattern)) {
    if (match[2]) {
      matches.push(match[2]);
    }
  }
  return matches;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isUsefulText(value: string) {
  return value.length >= 18 && !/^(cookie|privacy|copyright|all rights reserved)/i.test(value);
}

function splitSentences(value: string) {
  return value
    .split(/[.!?。！？]+|\u2028|\u2029|\n+/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function uniqueText(values: string[]) {
  return [...new Set(values)];
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function windowLikeSetTimeout(callback: () => void, ms: number) {
  return globalThis.setTimeout(callback, ms);
}

function windowLikeClearTimeout(handle: ReturnType<typeof globalThis.setTimeout>) {
  globalThis.clearTimeout(handle);
}
