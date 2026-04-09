import { randomUUID } from 'crypto';
import RequirementsForm from "@/components/requirements/RequirementsForm";
import { Card, CardContent } from "@/components/ui/card";
import { WORKSPACES_ROOT } from "@/lib/workspaces";

export default function NewProjectPage() {
  const freshProjectKey = randomUUID();

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden border-slate-200/80 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_30%)]" />
        <CardContent className="relative flex flex-col gap-3 px-5 py-5 sm:px-6 sm:py-6">
          <div className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            새 프로젝트
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">
              입력하면 바로 홈페이지가 만들어집니다.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              결과는{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                {WORKSPACES_ROOT}
              </code>
              아래 작업 폴더에 분리 저장되고 오른쪽에서 바로 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1 shadow-sm">입력</span>
            <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1 shadow-sm">분리 저장</span>
            <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1 shadow-sm">즉시 확인</span>
          </div>
        </CardContent>
      </Card>

      <RequirementsForm key={freshProjectKey} />
    </div>
  );
}
