import Link from "next/link";
import KanbanBoard from "@/components/sprint/KanbanBoard";
import { Button } from "@/components/ui/button";
import prisma from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SprintPage({ params }: PageProps) {
  const { id } = await params;

  const sprint = await prisma.sprint.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: {
      tasks: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!sprint) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">스프린트 보드</h2>
          <p className="mt-1 text-muted-foreground">
            파이프라인을 시작하면 초기 백로그가 Sprint 1 작업으로 전환됩니다.
          </p>
        </div>

        <div className="rounded-xl border border-dashed bg-white p-10 text-center">
          <div className="text-lg font-semibold">아직 생성된 스프린트가 없습니다</div>
          <p className="mt-2 text-sm text-slate-500">
            오케스트라 워크플로우에서 파이프라인을 시작해 Sprint 1을 생성하세요.
          </p>
          <Link href={`/projects/${id}/workflow`} className="mt-6 inline-flex">
            <Button>오케스트라 워크플로우 열기</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{sprint.name}</h2>
          <p className="mt-1 text-muted-foreground">
            {sprint.goal || "현재 스프린트 목표가 아직 설정되지 않았습니다."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard title="작업 수" value={`${sprint.tasks.length}개`} />
          <StatCard title="예상 속도" value={`${sprint.velocity ?? 0}pt`} />
        </div>
      </div>

      <KanbanBoard tasks={sprint.tasks} />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
