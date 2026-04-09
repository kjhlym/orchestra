import { NextResponse } from "next/server";
import { summarizeDesignReferenceSite } from "@/lib/design-reference-summary";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const siteUrl =
    body && typeof body === "object" && "siteUrl" in body && typeof body.siteUrl === "string"
      ? body.siteUrl.trim()
      : "";

  if (!siteUrl) {
    return NextResponse.json({ error: "참고 사이트 URL이 필요합니다." }, { status: 400 });
  }

  const summary = await summarizeDesignReferenceSite(siteUrl);

  if (!summary) {
    return NextResponse.json(
      { error: "참고 사이트를 요약하지 못했습니다." },
      { status: 422 }
    );
  }

  return NextResponse.json(summary);
}
