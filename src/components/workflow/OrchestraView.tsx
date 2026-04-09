"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { getAgentStatusLabel, getAgentTypeLabel, WORKFLOW_PHASES } from '@/lib/display';

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
  homepageAudit?: {
    passed: boolean;
    score: number;
    checkedAt: string;
    framework: string;
    filePath: string;
    messages: string[];
    roleFindings?: Record<string, string[]>;
    skipped?: boolean;
  };
  roleQualityStats?: Record<string, number>;
  roleExecutionOrder?: string[];
  strictHarness?: {
    mode: string;
    lockedCategory: string;
    scopeLock: {
      projectName: string;
      primaryPage: string;
      allowedSections: string[];
      forbiddenDrifts: string[];
    };
    nonNegotiables: string[];
    roleContracts: Record<
      string,
      {
        objective: string;
        requiredOutput: string;
        forbidden: string[];
        successCriteria: string[];
      }
    >;
  };
  repairProfile?: {
    focusRoles: string[];
    focusMessages: Array<{
      role: string;
      message: string;
      count: number;
    }>;
    roleQualityStats: Record<string, number>;
  };
  designAudit?: {
    passed: boolean;
    score: number;
    checkedAt: string;
    framework: string;
    filePath: string;
    stylePath: string;
    messages: string[];
    roleFindings?: Record<string, string[]>;
    skipped?: boolean;
  };
  executionBrief?: {
    category?: string;
    primaryPage?: string;
    roleBriefs?: Record<string, string>;
    roleChecklists?: Record<string, string[]>;
    qualityChecklist?: string[];
    topBacklogs?: Array<{
      title: string;
      priority: string;
      storyPoints: number;
    }>;
  };
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
        if (response.status === 409) {
          throw new Error(payload?.error || '다른 워크플로우 실행이 진행 중입니다.');
        }
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
          {harnessConfig?.executionBrief && (
            <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-amber-100 bg-amber-50/70 p-5 text-left">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
                    역할 브리프
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {harnessConfig.executionBrief.primaryPage || '프로젝트 실행 브리프'}
                  </div>
                </div>
                {harnessConfig.executionBrief.category && (
                  <Badge variant="outline" className="border-amber-200 bg-white text-amber-700">
                    {harnessConfig.executionBrief.category}
                  </Badge>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries(harnessConfig.executionBrief.roleBriefs ?? {}).map(([role, brief]) => (
                  <div key={role} className="rounded-lg border border-white/70 bg-white/80 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                      {getAgentTypeLabel(role)}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{brief}</div>
                    {(() => {
                      const roleChecklistItems = harnessConfig.executionBrief?.roleChecklists?.[role] ?? [];

                      return roleChecklistItems.length ? (
                        <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
                          {roleChecklistItems.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      ) : null;
                    })()}
                  </div>
                ))}
              </div>

              {harnessConfig.executionBrief.qualityChecklist?.length ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    품질 기준
                  </div>
                  <ul className="mt-2 grid gap-2 md:grid-cols-2">
                    {harnessConfig.executionBrief.qualityChecklist.map((item) => (
                      <li key={item} className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm text-slate-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {harnessConfig.executionBrief.topBacklogs?.length ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    우선 백로그
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {harnessConfig.executionBrief.topBacklogs.map((item) => (
                      <Badge key={item.title} variant="secondary">
                        {item.priority}: {item.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {harnessConfig?.strictHarness && (
            <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-rose-100 bg-rose-50/80 p-5 text-left">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-700">
                    Strict Harness
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    범위를 벗어나지 못하게 잠근 실행 계약
                  </div>
                </div>
                <Badge variant="secondary" className="text-slate-700">
                  {harnessConfig.strictHarness.lockedCategory}
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/80 bg-white/90 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">
                    Scope Lock
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {harnessConfig.strictHarness.scopeLock.primaryPage}
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {harnessConfig.strictHarness.scopeLock.allowedSections.join(" · ")}
                  </div>
                </div>
                <div className="rounded-lg border border-white/80 bg-white/90 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">
                    Non-Negotiables
                  </div>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                    {harnessConfig.strictHarness.nonNegotiables.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries(harnessConfig.strictHarness.roleContracts).map(([role, contract]) => (
                  <div key={role} className="rounded-lg border border-white/80 bg-white/90 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">
                      {getAgentTypeLabel(role)}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{contract.objective}</div>
                    <div className="mt-2 text-xs text-slate-600">{contract.requiredOutput}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      금지: {contract.forbidden.join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {harnessConfig?.homepageAudit && (
            <div
              className={`mx-auto mb-4 max-w-4xl rounded-xl p-5 text-left ${
                harnessConfig.homepageAudit.passed
                  ? 'border border-green-100 bg-green-50/80'
                  : 'border border-amber-100 bg-amber-50/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div
                    className={`text-xs font-semibold uppercase tracking-[0.28em] ${
                      harnessConfig.homepageAudit.passed ? 'text-green-700' : 'text-amber-700'
                    }`}
                  >
                    Homepage Audit
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {harnessConfig.homepageAudit.passed
                      ? '홈페이지 품질 검수를 통과했습니다.'
                      : '홈페이지 품질 검수가 필요합니다.'}
                  </div>
                </div>
                <Badge
                  variant={harnessConfig.homepageAudit.passed ? 'secondary' : 'outline'}
                  className={
                    harnessConfig.homepageAudit.passed
                      ? 'text-slate-700'
                      : 'border-amber-200 bg-white text-amber-700'
                  }
                >
                  {harnessConfig.homepageAudit.skipped
                    ? '스킵'
                    : `${harnessConfig.homepageAudit.score}점`}
                </Badge>
              </div>
              <div className="mt-3 text-xs text-slate-600">
                {harnessConfig.homepageAudit.framework} · {harnessConfig.homepageAudit.filePath}
              </div>
              {harnessConfig.homepageAudit.messages.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {harnessConfig.homepageAudit.messages.map((message) => (
                    <li key={message}>- {message}</li>
                  ))}
                </ul>
              )}
              {renderRoleFindings(harnessConfig.homepageAudit.roleFindings)}
            </div>
          )}
          {harnessConfig?.roleQualityStats && (
            <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-slate-200 bg-slate-50/80 p-5 text-left">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Role Quality
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    역할별 누적 실패 카운트
                  </div>
                </div>
                {harnessConfig.repairProfile?.focusRoles?.length ? (
                  <Badge variant="secondary" className="text-slate-700">
                    포커스: {harnessConfig.repairProfile.focusRoles.join(", ")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    누적 기록
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(harnessConfig.roleQualityStats).map(([role, count]) => (
                  <Badge key={role} variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {getAgentTypeLabel(role)}: {count}
                  </Badge>
                ))}
              </div>
              {(harnessConfig.repairProfile?.focusMessages?.some((item) => item.role === 'critic') ||
                (harnessConfig.roleQualityStats.critic ?? 0) > 0) && (
                <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                        Critic Lens
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        비평이 먼저 잡아낸 과밀, 중복, 렌더 비용
                      </div>
                    </div>
                    <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                      {getAgentTypeLabel('critic')}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(harnessConfig.repairProfile?.focusMessages ?? [])
                      .filter((item) => item.role === 'critic')
                      .slice(0, 2)
                      .map((item) => (
                        <div key={`${item.role}-${item.message}`} className="rounded-lg border border-white bg-white p-3 text-sm text-slate-700">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
                            {getAgentTypeLabel(item.role)} · {item.count}
                          </div>
                          <div className="mt-1">{item.message}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {harnessConfig.roleExecutionOrder?.length ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    실행 순서
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {harnessConfig.roleExecutionOrder.map((role, index) => (
                      <Badge key={`${role}-${index}`} variant="secondary" className="text-slate-700">
                        {index + 1}. {getAgentTypeLabel(role)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {harnessConfig.repairProfile?.focusMessages?.length ? (
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    재생성 포커스
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {harnessConfig.repairProfile.focusMessages.map((item) => (
                      <div key={`${item.role}-${item.message}`} className="rounded-lg border border-white bg-white p-3 text-sm text-slate-700">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {getAgentTypeLabel(item.role)} · {item.count}
                        </div>
                        <div className="mt-1">{item.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {harnessConfig?.designAudit && (
            <div
              className={`mx-auto mb-4 max-w-4xl rounded-xl p-5 text-left ${
                harnessConfig.designAudit.passed
                  ? 'border border-green-100 bg-green-50/80'
                  : 'border border-amber-100 bg-amber-50/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div
                    className={`text-xs font-semibold uppercase tracking-[0.28em] ${
                      harnessConfig.designAudit.passed ? 'text-green-700' : 'text-amber-700'
                    }`}
                  >
                    Design Audit
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {harnessConfig.designAudit.passed
                      ? '디자인 품질 검수를 통과했습니다.'
                      : '디자인 품질 검수가 필요합니다.'}
                  </div>
                </div>
                <Badge
                  variant={harnessConfig.designAudit.passed ? 'secondary' : 'outline'}
                  className={
                    harnessConfig.designAudit.passed
                      ? 'text-slate-700'
                      : 'border-amber-200 bg-white text-amber-700'
                  }
                >
                  {harnessConfig.designAudit.skipped
                    ? '스킵'
                    : `${harnessConfig.designAudit.score}점`}
                </Badge>
              </div>
              <div className="mt-3 text-xs text-slate-600">
                {harnessConfig.designAudit.framework} · {harnessConfig.designAudit.filePath}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                스타일: {harnessConfig.designAudit.stylePath}
              </div>
              {harnessConfig.designAudit.messages.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {harnessConfig.designAudit.messages.map((message) => (
                    <li key={message}>- {message}</li>
                  ))}
                </ul>
              )}
              {renderRoleFindings(harnessConfig.designAudit.roleFindings)}
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
    const executionBrief = parsed.executionBrief;
    const executionBriefRecord =
      executionBrief && typeof executionBrief === 'object'
        ? (executionBrief as Record<string, unknown>)
        : null;
    const homepageAudit = parsed.homepageAudit;
    const homepageAuditRecord =
      homepageAudit && typeof homepageAudit === 'object'
        ? (homepageAudit as Record<string, unknown>)
        : null;
    const designAudit = parsed.designAudit;
    const designAuditRecord =
      designAudit && typeof designAudit === 'object'
        ? (designAudit as Record<string, unknown>)
        : null;
    const roleQualityStats = parsed.roleQualityStats;
    const roleQualityStatsRecord =
      roleQualityStats && typeof roleQualityStats === 'object'
        ? (roleQualityStats as Record<string, unknown>)
        : null;
    const strictHarness = parsed.strictHarness ?? executionBriefRecord?.strictHarness;
    const strictHarnessRecord =
      strictHarness && typeof strictHarness === 'object'
        ? (strictHarness as Record<string, unknown>)
        : null;
    const roleExecutionOrder = parsed.roleExecutionOrder;
    const roleExecutionOrderRecord =
      Array.isArray(roleExecutionOrder)
        ? (roleExecutionOrder as unknown[]).filter(
            (value): value is string => typeof value === 'string'
          )
        : null;
    const repairProfile = parsed.repairProfile;
    const repairProfileRecord =
      repairProfile && typeof repairProfile === 'object'
        ? (repairProfile as Record<string, unknown>)
        : null;
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      lastMessage: typeof parsed.lastMessage === 'string' ? parsed.lastMessage : undefined,
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : undefined,
      homepageAudit: homepageAuditRecord
        ? {
            passed: homepageAuditRecord.passed === true,
            score: typeof homepageAuditRecord.score === 'number' ? homepageAuditRecord.score : 0,
            checkedAt:
              typeof homepageAuditRecord.checkedAt === 'string'
                ? homepageAuditRecord.checkedAt
                : '',
            framework:
              typeof homepageAuditRecord.framework === 'string'
                ? homepageAuditRecord.framework
                : 'unknown',
            filePath:
              typeof homepageAuditRecord.filePath === 'string'
                ? homepageAuditRecord.filePath
                : '',
            messages: Array.isArray(homepageAuditRecord.messages)
              ? (homepageAuditRecord.messages as unknown[]).filter(
                  (value): value is string => typeof value === 'string'
                )
              : [],
            roleFindings:
              typeof homepageAuditRecord.roleFindings === 'object' &&
              homepageAuditRecord.roleFindings !== null
                ? (Object.fromEntries(
                    Object.entries(homepageAuditRecord.roleFindings as Record<string, unknown>).map(
                      ([role, items]) =>
                        [
                          role,
                          Array.isArray(items)
                            ? items.filter((value): value is string => typeof value === 'string')
                            : [],
                        ] as const
                    )
                  ) as Record<string, string[]>)
                : undefined,
            skipped: homepageAuditRecord.skipped === true,
          }
        : undefined,
      roleQualityStats: roleQualityStatsRecord
        ? Object.fromEntries(
            Object.entries(roleQualityStatsRecord).map(([role, count]) => [
              role,
              typeof count === 'number' ? count : 0,
            ])
          )
        : undefined,
      strictHarness: strictHarnessRecord
        ? {
            mode: typeof strictHarnessRecord.mode === 'string' ? strictHarnessRecord.mode : 'strict',
            lockedCategory:
              typeof strictHarnessRecord.lockedCategory === 'string'
                ? strictHarnessRecord.lockedCategory
                : 'generic',
            scopeLock:
              typeof strictHarnessRecord.scopeLock === 'object' &&
              strictHarnessRecord.scopeLock !== null
                ? {
                    projectName:
                      typeof (strictHarnessRecord.scopeLock as Record<string, unknown>).projectName ===
                      'string'
                        ? ((strictHarnessRecord.scopeLock as Record<string, unknown>)
                            .projectName as string)
                        : '',
                    primaryPage:
                      typeof (strictHarnessRecord.scopeLock as Record<string, unknown>).primaryPage ===
                      'string'
                        ? ((strictHarnessRecord.scopeLock as Record<string, unknown>)
                            .primaryPage as string)
                        : '',
                    allowedSections: Array.isArray(
                      (strictHarnessRecord.scopeLock as Record<string, unknown>).allowedSections
                    )
                      ? ((strictHarnessRecord.scopeLock as Record<string, unknown>).allowedSections as unknown[]).filter(
                          (value): value is string => typeof value === 'string'
                        )
                      : [],
                    forbiddenDrifts: Array.isArray(
                      (strictHarnessRecord.scopeLock as Record<string, unknown>).forbiddenDrifts
                    )
                      ? ((strictHarnessRecord.scopeLock as Record<string, unknown>).forbiddenDrifts as unknown[]).filter(
                          (value): value is string => typeof value === 'string'
                        )
                      : [],
                  }
                : {
                    projectName: '',
                    primaryPage: '',
                    allowedSections: [],
                    forbiddenDrifts: [],
                  },
            nonNegotiables: Array.isArray(strictHarnessRecord.nonNegotiables)
              ? (strictHarnessRecord.nonNegotiables as unknown[]).filter(
                  (value): value is string => typeof value === 'string'
                )
              : [],
            roleContracts:
              typeof strictHarnessRecord.roleContracts === 'object' &&
              strictHarnessRecord.roleContracts !== null
                ? (Object.fromEntries(
                    Object.entries(strictHarnessRecord.roleContracts as Record<string, unknown>).map(
                      ([role, contract]) => [
                        role,
                        contract && typeof contract === 'object'
                          ? {
                              objective:
                                typeof (contract as Record<string, unknown>).objective === 'string'
                                  ? ((contract as Record<string, unknown>).objective as string)
                                  : '',
                              requiredOutput:
                                typeof (contract as Record<string, unknown>).requiredOutput === 'string'
                                  ? ((contract as Record<string, unknown>).requiredOutput as string)
                                  : '',
                              forbidden: Array.isArray(
                                (contract as Record<string, unknown>).forbidden
                              )
                                ? ((contract as Record<string, unknown>).forbidden as unknown[]).filter(
                                    (value): value is string => typeof value === 'string'
                                  )
                                : [],
                              successCriteria: Array.isArray(
                                (contract as Record<string, unknown>).successCriteria
                              )
                                ? ((contract as Record<string, unknown>).successCriteria as unknown[]).filter(
                                    (value): value is string => typeof value === 'string'
                                  )
                                : [],
                            }
                          : {
                              objective: '',
                              requiredOutput: '',
                              forbidden: [],
                              successCriteria: [],
                            },
                      ]
                    )
                  ) as Record<
                    string,
                    {
                      objective: string;
                      requiredOutput: string;
                      forbidden: string[];
                      successCriteria: string[];
                    }
                  >)
                : {},
          }
        : undefined,
      roleExecutionOrder: roleExecutionOrderRecord ?? undefined,
      repairProfile: repairProfileRecord
        ? {
            focusRoles: Array.isArray(repairProfileRecord.focusRoles)
              ? (repairProfileRecord.focusRoles as unknown[]).filter(
                  (value): value is string => typeof value === 'string'
                )
              : [],
            focusMessages: Array.isArray(repairProfileRecord.focusMessages)
              ? (repairProfileRecord.focusMessages as unknown[])
                  .map((item) => {
                    if (!item || typeof item !== 'object') {
                      return null;
                    }

                    const record = item as Record<string, unknown>;
                    return {
                      role: typeof record.role === 'string' ? record.role : 'unknown',
                      message: typeof record.message === 'string' ? record.message : '',
                      count: typeof record.count === 'number' ? record.count : 0,
                    };
                  })
                  .filter(
                    (item): item is {
                      role: string;
                      message: string;
                      count: number;
                    } => Boolean(item)
                  )
              : [],
            roleQualityStats: typeof repairProfileRecord.roleQualityStats === 'object' &&
              repairProfileRecord.roleQualityStats !== null
                ? Object.fromEntries(
                    Object.entries(repairProfileRecord.roleQualityStats as Record<string, unknown>).map(
                      ([role, count]) => [role, typeof count === 'number' ? count : 0]
                    )
                  )
                : {},
          }
        : undefined,
      designAudit: designAuditRecord
        ? {
            passed: designAuditRecord.passed === true,
            score: typeof designAuditRecord.score === 'number' ? designAuditRecord.score : 0,
            checkedAt:
              typeof designAuditRecord.checkedAt === 'string' ? designAuditRecord.checkedAt : '',
            framework:
              typeof designAuditRecord.framework === 'string'
                ? designAuditRecord.framework
                : 'unknown',
            filePath:
              typeof designAuditRecord.filePath === 'string'
                ? designAuditRecord.filePath
                : '',
            stylePath:
              typeof designAuditRecord.stylePath === 'string'
                ? designAuditRecord.stylePath
                : '',
            messages: Array.isArray(designAuditRecord.messages)
              ? (designAuditRecord.messages as unknown[]).filter(
                  (value): value is string => typeof value === 'string'
                )
              : [],
            roleFindings:
              typeof designAuditRecord.roleFindings === 'object' &&
              designAuditRecord.roleFindings !== null
                ? (Object.fromEntries(
                    Object.entries(designAuditRecord.roleFindings as Record<string, unknown>).map(
                      ([role, items]) =>
                        [
                          role,
                          Array.isArray(items)
                            ? items.filter((value): value is string => typeof value === 'string')
                            : [],
                        ] as const
                    )
                  ) as Record<string, string[]>)
                : undefined,
            skipped: designAuditRecord.skipped === true,
          }
        : undefined,
      executionBrief: executionBriefRecord
          ? {
              category:
                typeof executionBriefRecord.category === 'string'
                  ? executionBriefRecord.category
                  : undefined,
              primaryPage:
                typeof executionBriefRecord.primaryPage === 'string'
                  ? executionBriefRecord.primaryPage
                  : undefined,
              roleBriefs:
                typeof executionBriefRecord.roleBriefs === 'object' &&
                executionBriefRecord.roleBriefs !== null
                  ? Object.fromEntries(
                      Object.entries(executionBriefRecord.roleBriefs as Record<string, unknown>).filter(
                        (entry): entry is [string, string] => typeof entry[1] === 'string'
                      )
                    )
                  : undefined,
              roleChecklists:
                typeof executionBriefRecord.roleChecklists === 'object' &&
                executionBriefRecord.roleChecklists !== null
                  ? (Object.fromEntries(
                      Object.entries(executionBriefRecord.roleChecklists as Record<string, unknown>).map(
                        ([role, items]) =>
                          [
                            role,
                            Array.isArray(items)
                              ? items.filter((value): value is string => typeof value === 'string')
                              : [],
                          ] as const
                      )
                    ) as Record<string, string[]>)
                  : undefined,
              qualityChecklist:
                Array.isArray(executionBriefRecord.qualityChecklist)
                  ? (executionBriefRecord.qualityChecklist as unknown[]).filter(
                      (value): value is string => typeof value === 'string'
                    )
                  : undefined,
              topBacklogs:
                Array.isArray(executionBriefRecord.topBacklogs)
                  ? (executionBriefRecord.topBacklogs as unknown[])
                      .map((item) => {
                        if (!item || typeof item !== 'object') {
                          return null;
                        }

                        const record = item as Record<string, unknown>;
                        return {
                          title: typeof record.title === 'string' ? record.title : 'Unnamed backlog',
                          priority:
                            typeof record.priority === 'string' ? record.priority : 'unknown',
                          storyPoints:
                            typeof record.storyPoints === 'number' ? record.storyPoints : 0,
                        };
                      })
                      .filter(
                        (
                          item
                        ): item is {
                          title: string;
                          priority: string;
                          storyPoints: number;
                        } => Boolean(item)
                      )
                  : undefined,
            }
          : undefined,
    };
  } catch {
    return null;
  }
}

function renderRoleFindings(roleFindings?: Record<string, string[]>) {
  if (!roleFindings) {
    return null;
  }

  const entries = Object.entries(roleFindings).filter(([, messages]) => messages.length > 0);

  if (!entries.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-white/70 bg-white/80 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        역할별 실패 메시지
      </div>
      <div className="mt-2 space-y-3">
        {entries.map(([role, messages]) => (
          <div key={role}>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {getAgentTypeLabel(role)}
            </div>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {messages.map((message) => (
                <li key={message}>- {message}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
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
