"use client";

import Link from "next/link";
import { useState } from "react";

type GeneratedHomepagePreviewActionsProps = {
  projectId: string;
  compact?: boolean;
};

export default function GeneratedHomepagePreviewActions({
  projectId,
  compact = false,
}: GeneratedHomepagePreviewActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopyPreviewLink() {
    const previewUrl = new URL(`/projects/${projectId}/preview`, window.location.origin).toString();

    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  const containerClass = compact
    ? "flex flex-wrap gap-2"
    : "flex flex-wrap items-center gap-3";
  const primaryClass =
    "inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800";
  const secondaryClass =
    "inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50";
  const ghostClass =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900";
  const copyLabel =
    copyState === "copied"
      ? "미리보기 링크 복사됨"
      : copyState === "failed"
        ? "복사 실패, 다시 시도"
        : "미리보기 링크 복사";

  return (
    <div className={containerClass}>
      <button
        type="button"
        onClick={handleCopyPreviewLink}
        className={primaryClass}
        data-testid="preview-copy-link"
      >
        {copyLabel}
      </button>
      <Link
        href={`/projects/${projectId}/workflow`}
        className={secondaryClass}
        data-testid="preview-deploy-prep"
      >
        배포 준비로 이동
      </Link>
      <Link href={`/projects/${projectId}`} className={ghostClass} data-testid="preview-project-summary">
        프로젝트 요약
      </Link>
    </div>
  );
}
