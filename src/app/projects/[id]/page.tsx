import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import { formatKoreanDate, getBacklogPriorityLabel, getProjectStatusLabel, parseTechStack } from "@/lib/display";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectRootPage({ params }: PageProps) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workflow: true,
      backlogs: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const techStack = parseTechStack(project.techStack);
  const backlogCount = project.backlogs.length;
  const summaryBacklogs = project.backlogs.slice(0, 3);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <CardContent className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:px-8 lg:py-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-slate-950 text-white">프로젝트 요약</Badge>
              <Badge variant="outline">{getProjectStatusLabel(project.status)}</Badge>
              <Badge variant="outline">생성 항목 {backlogCount}개</Badge>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {project.name}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                생성된 프로젝트의 기본 정보와 다음 행동을 한 화면에서 확인합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <ActionLink href={`/projects/${project.id}/preview`} variant="solid">
                홈페이지 미리보기
              </ActionLink>
              <ActionLink href={`/projects/${project.id}/backlog`} variant="outline">
                생성 항목 보기
              </ActionLink>
              <ActionLink href={`/projects/${project.id}/workflow`} variant="outline">
                워크플로우 보기
              </ActionLink>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">업데이트</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{formatKoreanDate(project.updatedAt)}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">마지막 생성 및 수정 시점입니다.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">작업 폴더</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">분리 저장됨</div>
              <p className="mt-1 text-sm leading-6 text-slate-600 break-all">
                {project.workspacePath || "외부 작업 폴더에 저장됨"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <div className="space-y-6">
          <Card className="border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>핵심 정보</CardTitle>
              <CardDescription>프로젝트에 들어간 내용만 간단하게 확인합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock label="설명" value={project.description || "설명 없음"} />
                <InfoBlock label="상태" value={getProjectStatusLabel(project.status)} />
                <InfoBlock
                  label="기술 스택"
                  value={techStack?.length ? techStack.join(" · ") : "선택 없음"}
                />
                <InfoBlock label="생성 항목" value={`${backlogCount}개`} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>생성 항목 미리보기</CardTitle>
              <CardDescription>처음 생성된 항목 일부만 보여줍니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summaryBacklogs.length === 0 ? (
                <p className="text-sm text-slate-500">아직 생성된 항목이 없습니다.</p>
              ) : (
                summaryBacklogs.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-slate-950">{item.title}</div>
                      <Badge variant="outline">{getBacklogPriorityLabel(item.priority)}</Badge>
                    </div>
                    {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>다음 행동</CardTitle>
              <CardDescription>이 프로젝트에서 바로 이어서 할 작업입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <QuickAction label="홈페이지 미리보기" href={`/projects/${project.id}/preview`} />
              <QuickAction label="전체 생성 항목 보기" href={`/projects/${project.id}/backlog`} />
              <QuickAction label="작업 흐름 보기" href={`/projects/${project.id}/workflow`} />
              <QuickAction label="에이전트 확인" href={`/projects/${project.id}/agents`} />
            </CardContent>
          </Card>

          {project.workflow && (
            <Card className="border-slate-200/80 bg-white/90 shadow-sm">
              <CardHeader>
                <CardTitle>워크플로우 상태</CardTitle>
                <CardDescription>생성 후 이어지는 자동화 상태입니다.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700">
                <div>단계: {project.workflow.currentPhase}</div>
                <div>오케스트레이터: {project.workflow.orchestratorStatus}</div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm leading-6 text-slate-900">{value}</div>
    </div>
  );
}

function QuickAction({ label, href }: { label: string; href: string }) {
  return (
    <ActionLink href={href} variant="outline" fullWidth>
      {label}
    </ActionLink>
  );
}

function ActionLink({
  href,
  children,
  variant,
  fullWidth,
}: {
  href: string;
  children: ReactNode;
  variant: "solid" | "outline";
  fullWidth?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors";
  const style =
    variant === "solid"
      ? "bg-slate-950 text-white hover:bg-slate-800"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <Link href={href} className={`${base} ${style} ${fullWidth ? "w-full justify-start" : ""}`}>
      {children}
    </Link>
  );
}
