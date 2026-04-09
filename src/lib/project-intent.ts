export type ProjectCategory =
  | "commerce"
  | "booking"
  | "internal"
  | "portfolio"
  | "content"
  | "docs"
  | "event"
  | "hospitality"
  | "generic";

const COMMERCE_KEYWORDS = [
  "쇼핑몰",
  "이커머스",
  "커머스",
  "commerce",
  "ecommerce",
  "장바구니",
  "결제",
  "카탈로그",
  "반품",
];

const PORTFOLIO_KEYWORDS = [
  "포트폴리오",
  "portfolio",
  "작품",
  "스튜디오",
  "에이전시",
  "agency",
  "case study",
  "크리에이티브",
];

const CONTENT_KEYWORDS = [
  "블로그",
  "blog",
  "뉴스",
  "news",
  "매거진",
  "magazine",
  "에디토리얼",
  "article",
  "콘텐츠",
];

const DOCS_KEYWORDS = [
  "문서",
  "docs",
  "documentation",
  "guide",
  "가이드",
  "handbook",
  "api",
  "지식 베이스",
];

const EVENT_KEYWORDS = [
  "행사",
  "event",
  "conference",
  "meetup",
  "summit",
  "festival",
  "ticket",
  "세미나",
];

const HOSPITALITY_KEYWORDS = [
  "레스토랑",
  "restaurant",
  "카페",
  "cafe",
  "호텔",
  "hotel",
  "숙소",
  "stay",
  "예약",
  "menu",
  "dining",
];

const NEGATION_MARKERS = [
  "아니라",
  "아닌",
  "말고",
  "없이",
  "배제",
  "지양",
  "보이지 않게",
  "보이게 하지",
  "보이지 않도록",
  "처럼 보이지 않게",
];

export function detectProjectCategoryFromText(text: string): ProjectCategory {
  const lower = text.toLowerCase();

  if (hasAffirmativeKeyword(lower, COMMERCE_KEYWORDS)) {
    return "commerce";
  }

  if (/(예약|booking|schedule|appointment|calendar)/.test(lower)) {
    return "booking";
  }

  if (hasAffirmativeKeyword(lower, PORTFOLIO_KEYWORDS)) {
    return "portfolio";
  }

  if (hasAffirmativeKeyword(lower, CONTENT_KEYWORDS)) {
    return "content";
  }

  if (hasAffirmativeKeyword(lower, DOCS_KEYWORDS)) {
    return "docs";
  }

  if (hasAffirmativeKeyword(lower, EVENT_KEYWORDS)) {
    return "event";
  }

  if (hasAffirmativeKeyword(lower, HOSPITALITY_KEYWORDS)) {
    return "hospitality";
  }

  if (/(내부 운영|내부 도구|내부 툴|내부 포털|dashboard|admin|workflow|approval|업무|포털|관리)/.test(lower)) {
    return "internal";
  }

  return "generic";
}

function hasAffirmativeKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => {
    const index = text.indexOf(keyword);
    if (index < 0) {
      return false;
    }

    const start = Math.max(0, index - 18);
    const end = Math.min(text.length, index + keyword.length + 18);
    const window = text.slice(start, end);

    return !NEGATION_MARKERS.some((marker) => window.includes(marker));
  });
}
