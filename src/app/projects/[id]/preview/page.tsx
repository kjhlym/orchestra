import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GeneratedHomepagePreview from "@/components/projects/GeneratedHomepagePreview";
import { loadGeneratedHomepagePreview } from "@/lib/generated-homepage-preview";
import prisma from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPreviewPage({ params }: PageProps) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      workspacePath: true,
    },
  });

  if (!project) {
    notFound();
  }

  const preview = await loadGeneratedHomepagePreview(project.workspacePath);

  if (!preview || !project.workspacePath) {
    return (
      <Card className="border-slate-200/80 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>홈페이지 미리보기를 아직 준비하지 못했습니다</CardTitle>
          <CardDescription>
            Next.js 형태의 생성 결과가 있어야 앱 안에서 바로 미리보기를 열 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            작업 폴더: {project.workspacePath || "생성 대기"}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              프로젝트 요약으로 돌아가기
            </Link>
            <Link
              href={`/projects/${project.id}/workflow`}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              워크플로우 보기
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <GeneratedHomepagePreview
      preview={preview}
      projectId={project.id}
      workspacePath={project.workspacePath}
    />
  );
}
