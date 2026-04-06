import OrchestraView from "@/components/workflow/OrchestraView";
import prisma from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkflowPage({ params }: PageProps) {
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: { projectId: id },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">오케스트라 워크플로우</h2>
        <p className="mt-1 text-muted-foreground">
          자동화된 에이전트 파이프라인을 관리하고 진행 상황을 확인하세요.
        </p>
      </div>

      <OrchestraView
        projectId={id}
        workflow={
          workflow
            ? {
                currentPhase: workflow.currentPhase,
                orchestratorStatus: workflow.orchestratorStatus,
                harnessConfig: workflow.harnessConfig,
              }
            : null
        }
      />
    </div>
  );
}
