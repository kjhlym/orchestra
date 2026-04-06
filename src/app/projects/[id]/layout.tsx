import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import ProjectTabs from "@/components/projects/ProjectTabs";
import { formatKoreanDate, getProjectStatusLabel, parseTechStack } from "@/lib/display";
import prisma from "@/lib/prisma";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          backlogs: true,
          sprints: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const techStack = parseTechStack(project.techStack);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                상태: {getProjectStatusLabel(project.status)}
              </Badge>
              {project.slug && <Badge variant="outline">slug: {project.slug}</Badge>}
            </div>

            <div>
              <h1 className="text-4xl font-bold tracking-tight">{project.name}</h1>
              <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
                {project.description || "프로젝트 설명이 아직 없습니다."}
              </p>
            </div>

            {techStack && techStack.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {techStack.map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-white px-4 py-3 text-sm text-slate-600">
            마지막 업데이트 {formatKoreanDate(project.updatedAt)}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SummaryCard
            title="독립 워크스페이스"
            value={project.workspacePath || "생성 대기"}
            mono
          />
          <SummaryCard
            title="초기 백로그"
            value={`${project._count.backlogs}개`}
          />
          <SummaryCard
            title="스프린트"
            value={`${project._count.sprints}개`}
          />
        </div>
      </section>

      <ProjectTabs projectId={project.id} />

      <section>{children}</section>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  mono = false,
}: {
  title: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <div
        className={`mt-3 break-all text-sm text-slate-800 ${
          mono ? "font-mono" : "font-semibold"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
