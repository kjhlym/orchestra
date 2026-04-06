"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { getAgentStatusLabel, WORKFLOW_PHASES } from '@/lib/display';

type WorkflowViewModel = {
  currentPhase: string;
  orchestratorStatus: string;
  harnessConfig?: string | null;
} | null;

type HarnessConfigSummary = {
  provider?: string;
  model?: string;
  lastMessage?: string;
  lastRunAt?: string;
};

type StartWorkflowResponse = {
  message?: string;
  error?: string;
};

export default function OrchestraView({
  projectId,
  workflow,
}: {
  projectId: string;
  workflow: WorkflowViewModel;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const phaseIndex = Math.max(0, WORKFLOW_PHASES.findIndex((phase) => phase.id === workflow?.currentPhase));
  const harnessConfig = parseHarnessConfig(workflow?.harnessConfig ?? null);
  const isFinished = workflow?.currentPhase === 'retro';

  async function handleStartPipeline() {
    setActionMessage(null);
    setActionError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/workflow/start`, {
        method: 'POST',
      });

      const payload = (await response.json().catch(() => null)) as StartWorkflowResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || '파이프라인 실행을 시작하지 못했습니다.');
      }

      setActionMessage(payload?.message ?? '파이프라인 단계를 실행했습니다.');
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : '파이프라인 실행 중 알 수 없는 오류가 발생했습니다.'
      );
    }
  }

  return (
    <div className="space-y-8">
      <div className="relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -translate-y-1/2 z-0 hidden md:block"></div>
        <div className="absolute top-1/2 left-0 h-1 bg-green-500 -translate-y-1/2 z-0 hidden md:block transition-all duration-500" 
             style={{ width: `${(phaseIndex / (WORKFLOW_PHASES.length - 1)) * 100}%` }}></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between gap-4">
          {WORKFLOW_PHASES.map((phase, i) => {
            const isCompleted = i < phaseIndex;
            const isCurrent = i === phaseIndex;
            
            return (
              <div key={phase.id} className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 
                  ${isCompleted ? 'bg-green-100 border-green-500 text-green-600' : 
                    isCurrent ? 'bg-blue-100 border-blue-500 text-blue-600 shadow-lg scale-110' : 
                    'bg-white border-gray-300 text-gray-400'}`}>
                  {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <CircleDashed className={`w-6 h-6 ${isCurrent ? 'animate-spin-slow' : ''}`} />}
                </div>
                <div className={`mt-3 font-semibold text-sm ${isCurrent ? 'text-blue-700' : 'text-gray-600'}`}>
                  {phase.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Card>
        <CardContent className="p-6 text-center">
          <h4 className="text-lg font-medium mb-2">오케스트레이터 제어 센터</h4>
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            <Badge variant="secondary">상태: {getAgentStatusLabel(workflow?.orchestratorStatus ?? 'idle')}</Badge>
            {harnessConfig?.provider && (
              <Badge variant="outline">엔진: {String(harnessConfig.provider)}</Badge>
            )}
            {harnessConfig?.model && (
              <Badge variant="outline">모델: {String(harnessConfig.model)}</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto mb-6">
            오케스트레이터는 하니스 설정에 따라 에이전트를 조율합니다.
            자동화 단계는 애자일 스크럼 흐름에 맞춰 기획부터 실행까지 작업을 전환합니다.
          </p>
          {harnessConfig?.lastMessage && (
            <div className="mx-auto mb-4 max-w-xl rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <div className="font-medium">최근 실행 결과</div>
              <div className="mt-1">{harnessConfig.lastMessage}</div>
              {harnessConfig.lastRunAt && (
                <div className="mt-2 text-xs text-blue-700">
                  마지막 실행: {formatLastRun(harnessConfig.lastRunAt)}
                </div>
              )}
            </div>
          )}
          {actionMessage && (
            <div
              aria-live="polite"
              className="mx-auto mb-4 max-w-xl rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {actionMessage}
            </div>
          )}
          {actionError && (
            <div
              aria-live="polite"
              className="mx-auto mb-4 max-w-xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {actionError}
            </div>
          )}
          <div className="flex justify-center gap-4">
            <button
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50"
              disabled={workflow?.orchestratorStatus === 'running' || isPending || isFinished}
              onClick={handleStartPipeline}
            >
              {isFinished
                ? '파이프라인 완료'
                : isPending || workflow?.orchestratorStatus === 'running'
                  ? '파이프라인 실행 중...'
                  : '파이프라인 시작'}
            </button>
            <button className="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md font-medium transition-colors">
              하니스 설정
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function parseHarnessConfig(harnessConfig: string | null): HarnessConfigSummary | null {
  if (!harnessConfig) {
    return null;
  }

  try {
    const parsed = JSON.parse(harnessConfig) as Record<string, unknown>;
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      lastMessage: typeof parsed.lastMessage === 'string' ? parsed.lastMessage : undefined,
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : undefined,
    };
  } catch {
    return null;
  }
}

function formatLastRun(value: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
