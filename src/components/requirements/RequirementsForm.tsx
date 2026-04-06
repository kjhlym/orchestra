'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getBacklogPriorityLabel, getTechStackLabel } from '@/lib/display';
import type {
  BootstrapEvent,
  GeneratedBacklogRecord,
  ProjectBootstrapInput,
} from '@/lib/bootstrap';

export default function RequirementsForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [streamMessages, setStreamMessages] = useState<string[]>([]);
  const [generatedBacklogs, setGeneratedBacklogs] = useState<GeneratedBacklogRecord[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProjectBootstrapInput>({
    name: '',
    description: '',
    techStack: {
      framework: '',
      css: '',
      database: '',
      deployment: ''
    },
    requirements: {
      targetAudience: '',
      mustHaves: '',
      niceToHaves: '',
      constraints: '',
    }
  });

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

  const handleSubmit = async () => {
    setLoading(true);
    setSubmitError(null);
    setStreamMessages([]);
    setGeneratedBacklogs([]);
    setCreatedProjectId(null);

    try {
      const res = await fetch('/api/projects/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errorBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error || '프로젝트를 생성하지 못했습니다.');
      }

      if (!res.body) {
        throw new Error('서버 스트림을 읽지 못했습니다.');
      }

      await consumeEventStream(res.body, (event) => {
        if (event.type === 'status') {
          setStreamMessages((prev) => [...prev, event.message]);
          return;
        }

        if (event.type === 'project-created') {
          setCreatedProjectId(event.projectId);
          setStreamMessages((prev) => [...prev, `${event.projectName} 프로젝트가 생성되었습니다.`]);
          return;
        }

        if (event.type === 'backlog-created') {
          setGeneratedBacklogs((prev) => [...prev, event.backlog]);
          setStreamMessages((prev) => [
            ...prev,
            `${event.index}/${event.total} 백로그 저장: ${event.backlog.title}`,
          ]);
          return;
        }

        if (event.type === 'complete') {
          setStreamMessages((prev) => [...prev, `백로그 ${event.backlogCount}개 생성이 완료되었습니다.`]);
          router.push(`/projects/${event.projectId}/backlog`);
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.message);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setSubmitError(message);
      console.error(err);
      if (createdProjectId) {
        setStreamMessages((prev) => [...prev, '프로젝트는 생성되었지만 AI 백로그 처리 중 문제가 발생했습니다.']);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">새 팩토리 프로젝트 만들기</h1>
        <p className="text-muted-foreground mt-2">
          새 애자일 소프트웨어 프로젝트의 요구사항, 명세, 기술 스택을 정의하세요.
        </p>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="basic">A. 기본 정보</TabsTrigger>
          <TabsTrigger value="tech">B. 기술 스택</TabsTrigger>
          <TabsTrigger value="agile">C. 사용자 스토리</TabsTrigger>
          <TabsTrigger value="review">D. 검토 및 생성</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle>기본 프로젝트 정보</CardTitle>
              <CardDescription>무엇을 왜 만드는지 정리하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">프로젝트명 <span className="text-red-500">*</span></Label>
                <Input 
                  id="name" 
                  placeholder="예: 아크미 이커머스 플랫폼" 
                  value={formData.name}
                  onChange={(e) => handleChange('name', '', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">비즈니스 목표 / 설명</Label>
                <Textarea 
                  id="description" 
                  placeholder="이 프로젝트가 제공할 핵심 가치를 설명하세요." 
                  rows={4}
                  value={formData.description}
                  onChange={(e) => handleChange('description', '', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">타깃 사용자(페르소나)</Label>
                <Input 
                  id="audience" 
                  placeholder="예: 빠른 식사를 원하는 직장인" 
                  value={formData.requirements.targetAudience}
                  onChange={(e) => handleChange('requirements', 'targetAudience', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tech">
          <Card>
            <CardHeader>
              <CardTitle>기술 스택</CardTitle>
              <CardDescription>팩토리 에이전트가 사용할 기반 기술을 선택하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agile">
          <Card>
            <CardHeader>
              <CardTitle>애자일 요구사항 (MoSCoW)</CardTitle>
              <CardDescription>시스템이 반드시 수행해야 할 일을 정의하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>필수 기능 (MVP)</Label>
                <Textarea 
                  placeholder="- 사용자로서 내 데이터를 저장하기 위해 로그인하고 싶다.&#10;- 관리자로서 사용자 계정을 관리하고 싶다." 
                  rows={4}
                  value={formData.requirements.mustHaves}
                  onChange={(e) => handleChange('requirements', 'mustHaves', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>있으면 좋은 기능</Label>
                <Textarea 
                  placeholder="- 다크 모드 지원&#10;- 분석 대시보드" 
                  rows={3}
                  value={formData.requirements.niceToHaves}
                  onChange={(e) => handleChange('requirements', 'niceToHaves', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>제약 사항 및 비기능 요구사항</Label>
                <Textarea 
                  placeholder="예: 2초 이내 로딩, 접근성 AA 준수" 
                  rows={2}
                  value={formData.requirements.constraints}
                  onChange={(e) => handleChange('requirements', 'constraints', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <Card>
            <CardHeader>
              <CardTitle>검토 및 팩토리 초기화</CardTitle>
              <CardDescription>프로젝트 정보를 검토하고 오케스트레이터가 백로그를 준비하도록 시작하세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-md space-y-4 text-sm border">
                <div>
                  <span className="font-semibold block mb-1">프로젝트명:</span>
                  {formData.name || <span className="text-red-400">프로젝트명을 입력하세요</span>}
                </div>
                <div>
                  <span className="font-semibold block mb-1">기술 스택:</span>
                  {Object.values(formData.techStack)
                    .filter(Boolean)
                    .map((entry) => getTechStackLabel(entry))
                    .join(', ') || '선택 없음'}
                </div>
                <div>
                  <span className="font-semibold block mb-1">자동 백로그 생성:</span>
                  <span className="text-green-600 font-medium">실행 시 Gemini가 Phase 2 백로그를 생성합니다.</span>
                </div>
              </div>

              {(loading || streamMessages.length > 0 || generatedBacklogs.length > 0 || submitError) && (
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-lg border bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">실시간 진행 상태</div>
                        <div className="text-xs text-muted-foreground">Phase 2와 AI 엔진 연동 실행 로그</div>
                      </div>
                      <Badge variant="secondary">{loading ? '실행 중' : '대기'}</Badge>
                    </div>

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

                    {createdProjectId && !loading && (
                      <div className="mt-4">
                        <button
                          type="button"
                          className="text-sm font-medium text-blue-700 hover:underline"
                          onClick={() => router.push(`/projects/${createdProjectId}/backlog`)}
                        >
                          생성된 프로젝트 열기
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <div className="text-sm font-semibold">생성된 백로그 미리보기</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      AI가 저장한 항목이 순서대로 표시됩니다.
                    </div>

                    <div className="mt-4 space-y-3">
                      {generatedBacklogs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">아직 생성된 백로그가 없습니다.</p>
                      ) : (
                        generatedBacklogs.map((backlog) => (
                          <div key={backlog.id} className="rounded-md border bg-gray-50 p-3">
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
            </CardContent>
            <CardFooter className="flex justify-end gap-4 mt-4">
              <Button variant="outline" onClick={() => router.back()}>취소</Button>
              <Button 
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50" 
                onClick={handleSubmit}
                disabled={!formData.name || loading}
              >
                {loading ? 'Phase 2 실행 중...' : '프로젝트 생성 및 AI 백로그 시작'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
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
