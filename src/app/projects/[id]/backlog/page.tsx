import BacklogItem from "@/components/backlog/BacklogItem";
import prisma from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BacklogPage({ params }: PageProps) {
  const { id } = await params;

  const backlogs = await prisma.productBacklog.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">제품 백로그</h2>
        <p className="mt-1 text-muted-foreground">
          요구사항에서 생성된 초기 백로그를 확인하고 스프린트 후보를 검토합니다.
        </p>
      </div>

      {backlogs.length === 0 ? (
        <EmptyState
          title="백로그가 없습니다"
          description="새 프로젝트 생성 후 Gemini 초기화가 완료되면 여기에 제품 백로그가 표시됩니다."
        />
      ) : (
        <div>
          {backlogs.map((item) => (
            <BacklogItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-white p-10 text-center">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}
