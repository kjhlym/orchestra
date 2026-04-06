import AgentCard from "@/components/agents/AgentCard";
import prisma from "@/lib/prisma";

export default async function AgentsPage() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">에이전트 모니터</h2>
        <p className="mt-1 text-muted-foreground">
          오케스트레이터가 사용하는 기본 에이전트 상태와 현재 작업을 확인합니다.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center">
          <div className="text-lg font-semibold">에이전트가 아직 준비되지 않았습니다</div>
          <p className="mt-2 text-sm text-slate-500">
            워크플로우를 시작하면 기본 기획, 디자인, 개발, QA 에이전트가 자동으로 준비됩니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
