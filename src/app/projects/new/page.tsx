import RequirementsForm from "@/components/requirements/RequirementsForm";
import { Card, CardContent } from "@/components/ui/card";

const WORKSPACES_ROOT = process.env.ORCHESTRA_PROJECTS_ROOT ?? "D:\\rpa\\orchestra_projects";

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <Card className="border-green-200 bg-green-50/60">
        <CardContent className="flex flex-col gap-2 py-4 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">
            생성 결과는 독립 프로젝트 폴더로 저장됩니다.
          </div>
          <div>
            새 프로젝트를 만들면 메인 앱 내부가 아니라{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
              {WORKSPACES_ROOT}
            </code>
            아래에 완전한 독립 워크스페이스가 생성됩니다.
          </div>
        </CardContent>
      </Card>

      <RequirementsForm />
    </div>
  );
}
