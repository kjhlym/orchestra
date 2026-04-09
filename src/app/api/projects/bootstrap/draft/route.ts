import { NextResponse } from "next/server";
import { generateBootstrapDraft } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const idea =
    body && typeof body === "object" && "idea" in body && typeof body.idea === "string"
      ? body.idea
      : "";

  const result = await generateBootstrapDraft(idea);

  if (result.source === "fallback") {
    console.warn("[bootstrap-draft] " + result.reason);
  }

  return NextResponse.json({
    draft: result.draft,
    source: result.source,
    reason: result.reason ?? null,
  });
}
