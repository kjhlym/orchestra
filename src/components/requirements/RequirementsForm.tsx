'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Layers3, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getBacklogPriorityLabel } from '@/lib/display';
import { buildFallbackBootstrapDraft } from '@/lib/bootstrap-draft';
import type {
  BootstrapEvent,
  GenerationSource,
  GeneratedBacklogRecord,
  DesignAuditRecord,
  HomepageAuditRecord,
  RoleQualityStatsRecord,
  ProjectBootstrapInput,
} from '@/lib/bootstrap';
import { isProjectBootstrapInput } from '@/lib/bootstrap';

function createEmptyFormData(): ProjectBootstrapInput {
  return {
    name: '',
    description: '',
    techStack: {
      framework: '',
      css: '',
      database: '',
      deployment: '',
    },
    requirements: {
      targetAudience: '',
      mustHaves: '',
      niceToHaves: '',
      constraints: '',
    },
  };
}

const EMPTY_FORM_DATA: ProjectBootstrapInput = createEmptyFormData();
const EMPTY_VISUAL_ASSET_DRAFT = {
  heroImage: '',
  galleryImages: '',
};

const BOOTSTRAP_PRESETS = [
  {
    label: '브랜드 홈페이지',
    idea: '브랜드 소개 홈페이지',
    description: '브랜드 가치와 핵심 메시지를 보여주는 범용 홈페이지 구조',
  },
  {
    label: '서비스 랜딩',
    idea: '서비스 소개 랜딩 페이지',
    description: '문의나 전환을 유도하는 서비스형 랜딩 구조',
  },
  {
    label: '내부 포털',
    idea: '팀 내부 운영 포털',
    description: '사내 요청, 승인, 작업 추적을 묶는 범용 운영 구조',
  },
] as const;

type BootstrapDraftResponse = {
  draft: ProjectBootstrapInput;
  source?: GenerationSource | null;
  reason?: string | null;
};

function getGenerationSourceLabel(source: GenerationSource | null, noun: string) {
  if (source === 'gemini') {
    return noun;
  }

  if (source === 'fallback') {
    return `로컬 ${noun}`;
  }

  return `${noun} 대기`;
}

function parseUrlList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export default function RequirementsForm() {
  const router = useRouter();
  const redirectTimerRef = useRef<number | null>(null);
  const requestVersionRef = useRef(0);
  const previewRequestRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSeed, setDraftSeed] = useState('');
  const [draftSource, setDraftSource] = useState<GenerationSource | null>(null);
  const [backlogSource, setBacklogSource] = useState<GenerationSource | null>(null);
  const [homepageAudit, setHomepageAudit] = useState<HomepageAuditRecord | null>(null);
  const [designAudit, setDesignAudit] = useState<DesignAuditRecord | null>(null);
  const [roleQualityStats, setRoleQualityStats] = useState<RoleQualityStatsRecord | null>(null);
  const [roleExecutionOrder, setRoleExecutionOrder] = useState<string[] | null>(null);
  const [visualAssetDraft, setVisualAssetDraft] = useState(EMPTY_VISUAL_ASSET_DRAFT);
  const [referenceSiteUrl, setReferenceSiteUrl] = useState('');
  const [referenceSiteNotes, setReferenceSiteNotes] = useState('');
  const [referenceSiteSummary, setReferenceSiteSummary] = useState<{
    siteUrl?: string;
    title?: string;
    highlights?: string[];
    summary: string;
  } | null>(null);
  const [referenceSitePreviewLoading, setReferenceSitePreviewLoading] = useState(false);
  const [referenceSitePreviewError, setReferenceSitePreviewError] = useState<string | null>(null);
  const [designMood, setDesignMood] = useState('깔끔한');
  const [streamMessages, setStreamMessages] = useState<string[]>([]);
  const [generatedBacklogs, setGeneratedBacklogs] = useState<GeneratedBacklogRecord[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProjectBootstrapInput>(EMPTY_FORM_DATA);

  const referenceSiteUrlValue = referenceSiteUrl.trim();
  const referenceSiteNotesValue = referenceSiteNotes.trim();
  const heroImageUrlValue = visualAssetDraft.heroImage.trim();
  const galleryImageUrls = parseUrlList(visualAssetDraft.galleryImages);
  const hasReferenceSite = Boolean(referenceSiteUrlValue || referenceSiteNotesValue);
  const referenceSiteUrlIsValid = !referenceSiteUrlValue || isHttpUrl(referenceSiteUrlValue);
  const heroImageIsValid = !heroImageUrlValue || isHttpUrl(heroImageUrlValue);
  const invalidGalleryImageUrls = galleryImageUrls.filter((url) => !isHttpUrl(url));

  const canCreateProject = Boolean(formData.name.trim() || draftSeed.trim());
  const hasLiveResult = Boolean(
    loading ||
      streamMessages.length > 0 ||
      generatedBacklogs.length > 0 ||
      submitError ||
      homepageAudit ||
      designAudit ||
      roleQualityStats ||
      referenceSiteSummary
  );

  const clearRedirectTimer = () => {
    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  };

  const schedulePreviewRedirect = (projectId: string, requestVersion: number, delayMs: number) => {
    clearRedirectTimer();
    redirectTimerRef.current = window.setTimeout(() => {
      if (requestVersion === requestVersionRef.current) {
        router.replace(`/projects/${projectId}/preview`);
      }
    }, delayMs);
  };

  const beginFreshProject = () => {
    requestVersionRef.current += 1;
    clearRedirectTimer();
    setLoading(false);
    setDraftLoading(false);
    setDraftSeed('');
    setDraftSource(null);
    setBacklogSource(null);
    setHomepageAudit(null);
    setDesignAudit(null);
    setRoleQualityStats(null);
    setRoleExecutionOrder(null);
    setVisualAssetDraft({ ...EMPTY_VISUAL_ASSET_DRAFT });
    setReferenceSiteUrl('');
    setReferenceSiteNotes('');
    setReferenceSiteSummary(null);
    setReferenceSitePreviewLoading(false);
    setReferenceSitePreviewError(null);
    setDesignMood('깔끔한');
    setStreamMessages([]);
    setGeneratedBacklogs([]);
    setSubmitError(null);
    setCreatedProjectId(null);
    setFormData(createEmptyFormData());
  };

  useEffect(() => clearRedirectTimer, []);

  const resolveSubmissionInput = () => {
    if (formData.name.trim()) {
      return { input: formData, autoFilled: false };
    }

    const idea = draftSeed.trim() || formData.description.trim();
    if (!idea) {
      return null;
    }

    const fallbackDraft = buildFallbackBootstrapDraft(idea);
    return { input: fallbackDraft, autoFilled: true };
  };

  const handleChange = (section: keyof typeof formData, field: string, value: string) => {
    if (section === 'name' || section === 'description') {
      setFormData((prev) => ({ ...prev, [section]: value }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [section]: {
          ...(prev[section] as Record<string, string>),
          [field]: value
        }
      }));
    }
  };

  const handleAutoFill = async (ideaOverride?: string) => {
    clearRedirectTimer();
    const requestVersion = ++requestVersionRef.current;
    setDraftLoading(true);
    setSubmitError(null);
    setDraftSource(null);
    setHomepageAudit(null);
    setDesignAudit(null);
    setRoleQualityStats(null);
    setRoleExecutionOrder(null);
    setReferenceSiteSummary(null);
    setReferenceSitePreviewLoading(false);
    setReferenceSitePreviewError(null);

    const idea = ideaOverride?.trim() || draftSeed.trim() || formData.name || formData.description;
    setFormData(buildFallbackBootstrapDraft(idea));

    try {
      const response = await fetch('/api/projects/bootstrap/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error || '자동 작성을 시작하지 못했습니다.');
      }

      const payload = (await response.json().catch(() => null)) as BootstrapDraftResponse | null;

      if (!payload || !isProjectBootstrapInput(payload.draft)) {
        throw new Error('자동 작성 응답 형식이 올바르지 않습니다.');
      }

      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      setFormData(payload.draft);
      setDraftSource(payload.source ?? 'gemini');
      setStreamMessages([]);
      setGeneratedBacklogs([]);
      setCreatedProjectId(null);
      setHomepageAudit(null);
      setDesignAudit(null);
      setRoleQualityStats(null);
      setRoleExecutionOrder(null);
      setReferenceSiteSummary(null);
      setReferenceSitePreviewLoading(false);
      setReferenceSitePreviewError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setSubmitError(message);
      setDraftSource('fallback');
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setDraftLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!referenceSiteUrlValue) {
      setReferenceSiteSummary(null);
      setReferenceSitePreviewLoading(false);
      setReferenceSitePreviewError(null);
      return;
    }

    if (!referenceSiteUrlIsValid) {
      setReferenceSitePreviewError('http:// 또는 https:// 로 시작하는 주소를 입력해 주세요.');
      setReferenceSitePreviewLoading(false);
      return;
    }

    const requestVersion = ++previewRequestRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setReferenceSitePreviewLoading(true);

      fetch('/api/projects/bootstrap/reference-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: referenceSiteUrlValue }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(errorBody?.error || '참고 사이트를 미리 읽지 못했습니다.');
          }

          return (await response.json()) as {
            summary?: string;
            title?: string;
            highlights?: string[];
            description?: string;
          };
        })
        .then((payload) => {
          if (requestVersion !== previewRequestRef.current) {
            return;
          }

          setReferenceSiteSummary({
            siteUrl: referenceSiteUrlValue,
            title: payload.title,
            highlights: payload.highlights,
            summary: payload.summary || '참고 사이트 요약을 불러왔습니다.',
          });
          setReferenceSitePreviewError(null);
        })
        .catch((error) => {
          if (requestVersion !== previewRequestRef.current) {
            return;
          }

          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }

          setReferenceSitePreviewError(error instanceof Error ? error.message : '참고 사이트를 미리 읽지 못했습니다.');
        })
        .finally(() => {
          if (requestVersion === previewRequestRef.current) {
            setReferenceSitePreviewLoading(false);
          }
        });
    }, 500);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [referenceSiteUrlValue, referenceSiteUrlIsValid]);

  const buildVisualAssetsPayload = (projectName: string) => {
    const heroImage = heroImageUrlValue;
    const galleryImages = galleryImageUrls;

    if (!heroImage && galleryImages.length === 0) {
      return undefined;
    }

    return {
      ...(heroImage
        ? {
            hero: {
              source: heroImage,
              alt: `${projectName || '프로젝트'} hero image`,
            },
          }
        : {}),
      ...(galleryImages.length
        ? {
            gallery: galleryImages.map((source, index) => ({
              source,
              alt: `${projectName || '프로젝트'} gallery image ${index + 1}`,
            })),
          }
        : {}),
    };
  };

  const handleSubmit = async () => {
    clearRedirectTimer();
    const requestVersion = ++requestVersionRef.current;
    const resolved = resolveSubmissionInput();

    if (!resolved) {
      setSubmitError('프로젝트명 또는 아이디어를 입력하세요.');
      return;
    }

    if (resolved.autoFilled) {
      setFormData(resolved.input);
      setDraftSource('fallback');
    }

    if (!referenceSiteUrlIsValid) {
      setSubmitError('참고 사이트 URL은 http:// 또는 https:// 형식이어야 합니다.');
      return;
    }

    if (!heroImageIsValid) {
      setSubmitError('대표 이미지 URL은 http:// 또는 https:// 형식이어야 합니다.');
      return;
    }

    if (invalidGalleryImageUrls.length > 0) {
      setSubmitError('참고 이미지 URL들에 유효하지 않은 주소가 섞여 있습니다.');
      return;
    }

    setLoading(true);
    setSubmitError(null);
    setStreamMessages([]);
    setGeneratedBacklogs([]);
    setCreatedProjectId(null);
    setBacklogSource(null);
    setHomepageAudit(null);
    setDesignAudit(null);
    setRoleQualityStats(null);
    setRoleExecutionOrder(null);
    setReferenceSiteSummary(null);

    try {
      const visualAssetPlan = buildVisualAssetsPayload(resolved.input.name.trim());
      const designReference =
        referenceSiteUrlValue || referenceSiteNotesValue || designMood.trim()
          ? {
              ...(referenceSiteUrlValue ? { siteUrl: referenceSiteUrlValue } : {}),
              ...(referenceSiteNotesValue ? { notes: referenceSiteNotesValue } : {}),
              ...(designMood.trim() ? { mood: designMood.trim() } : {}),
            }
          : undefined;

      const submissionInput = {
        ...resolved.input,
        ...(designReference ? { designReference } : {}),
        ...(visualAssetPlan ? { visualAssetPlan } : {}),
      };

      const res = await fetch('/api/projects/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionInput)
      });

      if (!res.ok) {
        const errorBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error || '프로젝트를 생성하지 못했습니다.');
      }

      if (!res.body) {
        throw new Error('서버 스트림을 읽지 못했습니다.');
      }

      await consumeEventStream(res.body, (event) => {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }

        if (event.type === 'status') {
          setStreamMessages((prev) => [...prev, event.message]);
          return;
        }

        if (event.type === 'generation-source') {
          if (event.stage === 'backlog') {
            setBacklogSource(event.source);
          }

          const message = event.message;
          if (typeof message === 'string' && message.length > 0) {
            setStreamMessages((prev) => [...prev, message]);
          }
          return;
        }

        if (event.type === 'homepage-audit') {
          setHomepageAudit(event.audit);

          const message = event.message;
          if (typeof message === 'string' && message.length > 0) {
            setStreamMessages((prev) => [...prev, message]);
          }

          return;
        }

        if (event.type === 'design-audit') {
          setDesignAudit(event.audit);

          const message = event.message;
          if (typeof message === 'string' && message.length > 0) {
            setStreamMessages((prev) => [...prev, message]);
          }

          return;
        }

        if (event.type === 'role-quality') {
          setRoleQualityStats(event.stats);
          setRoleExecutionOrder(Array.isArray(event.roleExecutionOrder) ? event.roleExecutionOrder : null);

          const message = event.message;
          if (typeof message === 'string' && message.length > 0) {
            setStreamMessages((prev) => [...prev, message]);
          }

          return;
        }

        if (event.type === 'design-reference-summary') {
          setReferenceSiteSummary({
            siteUrl: event.siteUrl,
            title: event.title,
            highlights: event.highlights,
            summary: event.summary,
          });

          const message = event.message;
          if (typeof message === 'string' && message.length > 0) {
            setStreamMessages((prev) => [...prev, message]);
          }

          return;
        }

        if (event.type === 'project-created') {
          setCreatedProjectId(event.projectId);
          setStreamMessages((prev) => [...prev, `${event.projectName} 프로젝트가 생성되었습니다.`]);
          schedulePreviewRedirect(event.projectId, requestVersion, 700);
          return;
        }

        if (event.type === 'backlog-created') {
          setGeneratedBacklogs((prev) => [...prev, event.backlog]);
          setStreamMessages((prev) => [
            ...prev,
            `${event.index}/${event.total} 생성 항목 저장: ${event.backlog.title}`,
          ]);
          return;
        }

        if (event.type === 'complete') {
          setStreamMessages((prev) => [
            ...prev,
            `생성 항목 ${event.backlogCount}개가 완료되었습니다.`,
            '홈페이지 미리보기로 이동합니다.',
          ]);
          schedulePreviewRedirect(event.projectId, requestVersion, 450);
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.message);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setSubmitError(message);
      console.error(err);
      if (createdProjectId) {
        setStreamMessages((prev) => [...prev, '프로젝트는 생성되었지만 자동 작성 처리 중 문제가 발생했습니다.']);
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  };

  const renderResultPanel = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">생성 결과</div>
            <div className="text-xs text-muted-foreground">오른쪽에는 결과와 검수만 보입니다.</div>
          </div>
          <Badge variant={loading ? 'secondary' : 'outline'}>
            {loading ? '생성 중' : hasLiveResult ? '표시 중' : '대기'}
          </Badge>
        </div>
      </div>

      {(hasLiveResult || createdProjectId) && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">상태</div>
                <div className="text-xs text-muted-foreground">생성 로그와 검수 결과만 표시합니다.</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="secondary">{loading ? '실행 중' : '대기'}</Badge>
                <Badge
                  variant={backlogSource === 'fallback' ? 'outline' : 'secondary'}
                  className={
                    backlogSource === 'fallback'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'text-slate-700'
                  }
                >
                  {getGenerationSourceLabel(backlogSource, '구조')}
                </Badge>
                {homepageAudit && (
                  <Badge
                    variant={homepageAudit.passed ? 'secondary' : 'outline'}
                    className={
                      homepageAudit.passed
                        ? 'text-slate-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }
                  >
                    {homepageAudit.passed
                      ? `홈페이지 검수 ${homepageAudit.score}점`
                      : `홈페이지 검수 실패 ${homepageAudit.score}점`}
                  </Badge>
                )}
                {designAudit && (
                  <Badge
                    variant={designAudit.passed ? 'secondary' : 'outline'}
                    className={
                      designAudit.passed
                        ? 'text-slate-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }
                  >
                    {designAudit.passed
                      ? `디자인 검수 ${designAudit.score}점`
                      : `디자인 검수 실패 ${designAudit.score}점`}
                  </Badge>
                )}
              </div>
            </div>

            {referenceSiteSummary && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                  참고 사이트 요약
                </div>
                <div className="mt-2 font-semibold">
                  {referenceSiteSummary.title || (referenceSiteSummary.siteUrl ? getUrlHost(referenceSiteSummary.siteUrl) : '참고 사이트')}
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-900/80">{referenceSiteSummary.summary}</p>
                {referenceSiteSummary.highlights?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {referenceSiteSummary.highlights.slice(0, 3).map((highlight) => (
                      <span
                        key={highlight}
                        className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-medium text-emerald-800"
                      >
                        {highlight}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {homepageAudit && (
              <div
                className={
                  homepageAudit.passed
                    ? 'mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800'
                    : 'mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'
                }
              >
                <div className="font-semibold">
                  {homepageAudit.passed ? '홈페이지 품질 검수 통과' : '홈페이지 품질 검수 필요'}
                </div>
                <div className="mt-1 text-xs">
                  {homepageAudit.framework} · {homepageAudit.filePath}
                </div>
                {homepageAudit.messages.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs leading-5">
                    {homepageAudit.messages.map((message) => (
                      <li key={message}>- {message}</li>
                    ))}
                  </ul>
                )}
                {renderRoleFindings(homepageAudit.roleFindings)}
              </div>
            )}

            {designAudit && (
              <div
                className={
                  designAudit.passed
                    ? 'mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800'
                    : 'mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'
                }
              >
                <div className="font-semibold">
                  {designAudit.passed ? '디자인 품질 검수 통과' : '디자인 품질 검수 필요'}
                </div>
                <div className="mt-1 text-xs">
                  {designAudit.framework} · {designAudit.filePath}
                </div>
                {designAudit.messages.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs leading-5">
                    {designAudit.messages.map((message) => (
                      <li key={message}>- {message}</li>
                    ))}
                  </ul>
                )}
                {renderRoleFindings(designAudit.roleFindings)}
              </div>
            )}

            {roleQualityStats && (
              <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs text-slate-700 shadow-sm">
                <div className="font-semibold text-slate-900">역할 누적 카운트</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(roleQualityStats).map(([role, count]) => (
                    <Badge key={role} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      {role}: {count}
                    </Badge>
                  ))}
                </div>
                {roleExecutionOrder?.length ? (
                  <div className="mt-3">
                    <div className="font-semibold text-slate-900">실행 순서</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {roleExecutionOrder.map((role, index) => (
                        <Badge key={`${role}-${index}`} variant="secondary" className="text-slate-700">
                          {index + 1}. {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {streamMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">생성을 시작하면 진행 상태가 여기에 표시됩니다.</p>
              ) : (
                streamMessages.map((message, index) => (
                  <div key={`${message}-${index}`} className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {message}
                  </div>
                ))
              )}
            </div>

            {submitError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            )}

            {createdProjectId && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => router.push(`/projects/${createdProjectId}/preview`)}
                >
                  홈페이지 미리보기 열기
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    beginFreshProject();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  새로 작성
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
            <div className="text-sm font-semibold">생성 항목</div>
            <div className="mt-1 text-xs text-muted-foreground">생성된 항목만 순서대로 보여줍니다.</div>

            <div className="mt-4 space-y-3">
              {generatedBacklogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 생성된 항목이 없습니다.</p>
              ) : (
                generatedBacklogs.map((backlog) => (
                  <div key={backlog.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-gray-900">{backlog.title}</div>
                      <Badge variant="outline">{getBacklogPriorityLabel(backlog.priority)}</Badge>
                    </div>
                    {backlog.userStory && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-2">{backlog.userStory}</p>
                    )}
                    {backlog.storyPoints && (
                      <div className="mt-2 text-xs font-medium text-gray-500">
                        스토리 포인트 {backlog.storyPoints}p
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div id="project-form" className="relative isolate w-full max-w-7xl mx-auto overflow-hidden rounded-[36px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_30px_120px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-28 top-0 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute -left-20 top-40 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
      </div>

      <div className="mb-6 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(6,95,70,0.9))] px-5 py-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:px-6 sm:py-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge className="border-white/15 bg-white/10 text-white">생성 흐름</Badge>
            <Badge className="border-white/15 bg-white/10 text-white">입력 → 결과</Badge>
            <Badge className="border-white/15 bg-white/10 text-white">작업 폴더 분리</Badge>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              범용 홈페이지 제작
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-white/75">
              왼쪽에서 입력하고 오른쪽에서 결과를 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-white/70">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">템플릿 조합</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">레퍼런스 반영</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">검수 자동화</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">외부 저장</span>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              type="button"
              className="rounded-full bg-white text-slate-950 hover:bg-white/90"
              onClick={() => document.getElementById('project-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              폼으로 바로 이동
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/80">
              <Sparkles className="h-4 w-4 text-emerald-200" />
              입력하면 결과가 바로 보입니다
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-white/80">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
            <Layers3 className="h-4 w-4" />
            작업 폴더 분리
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
            <ShieldCheck className="h-4 w-4" />
            즉시 확인
          </span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-6">
          <Card className="rounded-[24px] border border-slate-200/80 bg-white/85 shadow-sm backdrop-blur">
            <CardContent className="space-y-5 py-5 sm:py-6">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Step 1 / 4</div>
                  <div className="text-sm font-semibold text-slate-900">사이트 한 줄 설명</div>
                  <div className="text-sm leading-6 text-slate-600">
                    무엇을 만드는지 한 문장으로 적어 주세요. 이 문장이 전체 구조를 이끕니다.
                  </div>
                </div>
                <Badge
                  variant={draftSource === 'fallback' ? 'outline' : 'secondary'}
                  className={
                    draftSource === 'fallback'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'text-slate-700'
                  }
                >
                  {draftLoading ? '자동 작성 중' : getGenerationSourceLabel(draftSource, '자동 작성')}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {BOOTSTRAP_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraftSeed(preset.idea);
                      void handleAutoFill(preset.idea);
                    }}
                    disabled={draftLoading}
                    title={preset.description}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              {draftSource === 'fallback' && !draftLoading && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  자동 작성 응답이 맞지 않아 로컬 작성본으로 표시하고 있습니다.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={draftSeed}
                  onChange={(e) => setDraftSeed(e.target.value)}
                  placeholder="예: 새로운 홈페이지 아이디어"
                  data-testid="new-project-idea"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleAutoFill()}
                  disabled={draftLoading}
                  data-testid="new-project-autofill"
                >
                  {draftLoading ? '자동 작성 중...' : '자동 작성 채우기'}
                </Button>
              </div>
              <div className="text-xs text-slate-500">
                아이디어만 넣어도 시작할 수 있고, 버튼으로 자동 작성을 먼저 채운 뒤 수정해도 됩니다.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader className="space-y-2 pb-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Step 2 / 4</div>
              <CardTitle>브랜드와 참고 디자인</CardTitle>
              <CardDescription>이름, 설명, 분위기, 참고 사이트와 이미지 역할을 분리해서 정리합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pb-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">프로젝트명 <span className="text-red-500">*</span></Label>
                  <Input
                    id="name"
                    placeholder="예: 브랜드 홈페이지"
                    value={formData.name}
                    onChange={(e) => handleChange('name', '', e.target.value)}
                    data-testid="new-project-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audience">누구를 위한 사이트인가요?</Label>
                  <Input
                    id="audience"
                    placeholder="예: 정보를 찾는 방문자"
                    value={formData.requirements.targetAudience}
                    onChange={(e) => handleChange('requirements', 'targetAudience', e.target.value)}
                    data-testid="new-project-audience"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">브랜드 소개 / 사이트 목표</Label>
                <Textarea
                  id="description"
                  placeholder="이 사이트가 전달해야 할 핵심 메시지를 적어 주세요."
                  rows={4}
                  value={formData.description}
                  onChange={(e) => handleChange('description', '', e.target.value)}
                  data-testid="new-project-description"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reference-site-url">참고 사이트 URL</Label>
                  <Input
                    id="reference-site-url"
                    placeholder="https://..."
                    value={referenceSiteUrl}
                    onChange={(e) => setReferenceSiteUrl(e.target.value)}
                    aria-invalid={referenceSiteUrlValue ? !referenceSiteUrlIsValid : undefined}
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    구조, 정보 배치, 톤앤매너를 참고할 사이트를 넣어주세요.
                  </p>
                  {referenceSiteUrlValue && !referenceSiteUrlIsValid && (
                    <p className="text-xs font-medium text-rose-600">
                      http:// 또는 https:// 로 시작하는 주소만 입력할 수 있습니다.
                    </p>
                  )}
                  {referenceSiteUrlValue && referenceSiteUrlIsValid && (
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs text-slate-600">
                      <div className="font-semibold text-slate-900">참고 사이트 미리보기</div>
                      <div className="mt-1 truncate">{getUrlHost(referenceSiteUrlValue)}</div>
                      <a
                        className="mt-1 inline-flex text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                        href={referenceSiteUrlValue}
                        target="_blank"
                        rel="noreferrer"
                      >
                        새 창으로 열기
                      </a>
                    </div>
                  )}
                  {referenceSitePreviewLoading && (
                    <p className="text-xs text-slate-500">참고 사이트를 읽는 중입니다...</p>
                  )}
                  {referenceSitePreviewError && referenceSiteUrlValue && referenceSiteUrlIsValid && (
                    <p className="text-xs font-medium text-rose-600">{referenceSitePreviewError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>분위기</Label>
                  <Select value={designMood} onValueChange={(value) => setDesignMood(value ?? '깔끔한')}>
                    <SelectTrigger>
                      <SelectValue placeholder="분위기 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="깔끔한">깔끔한</SelectItem>
                      <SelectItem value="고급스러운">고급스러운</SelectItem>
                      <SelectItem value="감각적인">감각적인</SelectItem>
                      <SelectItem value="친근한">친근한</SelectItem>
                      <SelectItem value="실험적인">실험적인</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference-site-notes">참고 포인트</Label>
                <Textarea
                  id="reference-site-notes"
                  placeholder="예: 헤더가 깔끔했으면 좋겠고, 카드 간격은 넉넉하게 보고 싶어요."
                  rows={3}
                  value={referenceSiteNotes}
                  onChange={(e) => setReferenceSiteNotes(e.target.value)}
                />
                <p className="text-xs leading-5 text-slate-500">
                  참고 사이트를 왜 넣는지 적어주면 생성 결과가 더 정확해집니다.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero-image">대표 이미지 URL</Label>
                <Input
                  id="hero-image"
                  placeholder="https://..."
                  value={visualAssetDraft.heroImage}
                  onChange={(e) =>
                    setVisualAssetDraft((prev) => ({ ...prev, heroImage: e.target.value }))
                  }
                  aria-invalid={heroImageUrlValue ? !heroImageIsValid : undefined}
                />
                <p className="text-xs leading-5 text-slate-500">
                  메인 히어로 영역에 바로 쓰일 한 장의 핵심 이미지를 넣어주세요.
                </p>
                {heroImageUrlValue && !heroImageIsValid && (
                  <p className="text-xs font-medium text-rose-600">
                    http:// 또는 https:// 로 시작하는 주소만 입력할 수 있습니다.
                  </p>
                )}
                {heroImageUrlValue && heroImageIsValid && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/80">
                    <div className="flex items-center justify-between border-b border-slate-200/80 px-3 py-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">대표 이미지 미리보기</span>
                      <span className="truncate">{getUrlHost(heroImageUrlValue)}</span>
                    </div>
                    {/* External preview images are user-provided and intentionally rendered as plain img tags. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={heroImageUrlValue}
                      alt="대표 이미지 미리보기"
                      className="h-40 w-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gallery-images">참고 이미지 URL들</Label>
                <Textarea
                  id="gallery-images"
                  placeholder="한 줄에 하나씩 입력하거나 쉼표로 구분하세요."
                  rows={4}
                  value={visualAssetDraft.galleryImages}
                  onChange={(e) =>
                    setVisualAssetDraft((prev) => ({ ...prev, galleryImages: e.target.value }))
                  }
                />
                <p className="text-xs leading-5 text-slate-500">
                  무드보드, 섹션 카드, 레이아웃 참고용 이미지를 여러 장 넣어주세요.
                </p>
                {invalidGalleryImageUrls.length > 0 && (
                  <p className="text-xs font-medium text-rose-600">
                    유효하지 않은 URL이 있습니다. http:// 또는 https:// 로 시작하는지 확인해 주세요.
                  </p>
                )}
                {galleryImageUrls.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                    <div className="text-xs font-semibold text-slate-900">참고 이미지 미리보기</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {galleryImageUrls.slice(0, 6).map((url) => (
                        <div key={url} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {/* External preview images are user-provided and intentionally rendered as plain img tags. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="참고 이미지 미리보기"
                            className="h-28 w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader className="space-y-2 pb-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Step 3 / 4</div>
              <CardTitle>꼭 들어갈 내용</CardTitle>
              <CardDescription>섹션 구성과 피하고 싶은 느낌을 사용자 언어로 적습니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <div className="space-y-2">
                <Label>필수 섹션 / 기능</Label>
                <Textarea
                  placeholder="- 소개&#10;- 서비스&#10;- 후기&#10;- 문의"
                  rows={4}
                  value={formData.requirements.mustHaves}
                  onChange={(e) => handleChange('requirements', 'mustHaves', e.target.value)}
                  data-testid="new-project-must-haves"
                />
              </div>
              <div className="space-y-2">
                <Label>있으면 좋은 내용</Label>
                <Textarea
                  placeholder="- FAQ&#10;- 갤러리&#10;- 위치 안내"
                  rows={3}
                  value={formData.requirements.niceToHaves}
                  onChange={(e) => handleChange('requirements', 'niceToHaves', e.target.value)}
                  data-testid="new-project-nice-to-haves"
                />
              </div>
              <div className="space-y-2">
                <Label>금지 스타일 / 제약</Label>
                <Textarea
                  placeholder="예: 쇼핑몰 느낌, 과한 장식, 복잡한 문구"
                  rows={2}
                  value={formData.requirements.constraints}
                  onChange={(e) => handleChange('requirements', 'constraints', e.target.value)}
                  data-testid="new-project-constraints"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader className="space-y-2 pb-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Step 4 / 4</div>
              <CardTitle>검토 후 생성</CardTitle>
              <CardDescription>입력 내용을 확인하고 홈페이지를 만듭니다. 고급 옵션은 필요할 때만 열어주세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm shadow-sm sm:grid-cols-2">
                <div>
                  <span className="mb-1 block font-semibold">프로젝트명</span>
                  {formData.name || <span className="text-red-400">프로젝트명을 입력하세요</span>}
                </div>
                <div>
                  <span className="mb-1 block font-semibold">분위기</span>
                  {designMood}
                </div>
                <div>
                  <span className="mb-1 block font-semibold">참고 사이트</span>
                  {hasReferenceSite ? '있음' : '없음'}
                  {referenceSiteSummary && (
                    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      요약 반영됨
                    </div>
                  )}
                </div>
                <div>
                  <span className="mb-1 block font-semibold">이미지 입력</span>
                  {visualAssetDraft.heroImage.trim() || visualAssetDraft.galleryImages.trim() ? '있음' : '없음'}
                </div>
              </div>

              <details className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  고급 생성 옵션
                </summary>
                <div className="mt-2 text-xs text-slate-500">
                  참고 사이트는 구조와 톤 기준 메모로 저장되고, 대표 이미지는 메인 히어로에, 참고 이미지는 섹션 카드와 무드보드에 사용됩니다.
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>프론트엔드 프레임워크</Label>
                    <Select
                      value={formData.techStack.framework || null}
                      onValueChange={(val) => handleChange('techStack', 'framework', String(val ?? ''))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="프레임워크 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nextjs">Next.js (React)</SelectItem>
                        <SelectItem value="vue">Vue.js / Nuxt</SelectItem>
                        <SelectItem value="svelte">SvelteKit</SelectItem>
                        <SelectItem value="python">Python FastAPI (템플릿)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>스타일링 방식</Label>
                    <Select
                      value={formData.techStack.css || null}
                      onValueChange={(val) => handleChange('techStack', 'css', String(val ?? ''))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="CSS 방식 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tailwind">Tailwind CSS</SelectItem>
                        <SelectItem value="vanilla">바닐라 CSS</SelectItem>
                        <SelectItem value="scss">SCSS / SASS</SelectItem>
                        <SelectItem value="styled">Styled Components</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>데이터베이스</Label>
                    <Select
                      value={formData.techStack.database || null}
                      onValueChange={(val) => handleChange('techStack', 'database', String(val ?? ''))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="데이터베이스 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sqlite">SQLite (Prisma)</SelectItem>
                        <SelectItem value="postgres">PostgreSQL</SelectItem>
                        <SelectItem value="mongodb">MongoDB</SelectItem>
                        <SelectItem value="supabase">Supabase</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>배포 대상</Label>
                    <Select
                      value={formData.techStack.deployment || null}
                      onValueChange={(val) => handleChange('techStack', 'deployment', String(val ?? ''))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="배포 대상 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vercel">Vercel</SelectItem>
                        <SelectItem value="cloudflare">Cloudflare Pages/Workers</SelectItem>
                        <SelectItem value="aws">AWS</SelectItem>
                        <SelectItem value="local">로컬 전용</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </details>
            </CardContent>
            <CardFooter className="mt-4 flex justify-end gap-4 pb-6">
              <Button variant="outline" onClick={() => router.back()}>취소</Button>
              <Button
                className="bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={loading || !canCreateProject}
                data-testid="new-project-submit"
              >
                {loading ? '홈페이지 생성 중...' : '홈페이지 만들기'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-6 h-fit">
          <Card className="rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader className="space-y-2">
              <CardTitle>생성 결과</CardTitle>
              <CardDescription>이 패널에는 생성 결과와 검수 결과가 표시됩니다.</CardDescription>
            </CardHeader>
            <CardContent>{renderResultPanel()}</CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

async function consumeEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: BootstrapEvent) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');

      if (!data) {
        continue;
      }

      onEvent(JSON.parse(data) as BootstrapEvent);
    }

    if (done) {
      break;
    }
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
    <div className="mt-3 rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-xs text-slate-700 shadow-sm">
      <div className="font-semibold text-slate-900">역할별 실패 메시지</div>
      <div className="mt-2 space-y-2">
        {entries.map(([role, messages]) => (
          <div key={role}>
            <div className="font-medium uppercase tracking-[0.2em] text-slate-500">{role}</div>
            <ul className="mt-1 space-y-1 leading-5">
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
