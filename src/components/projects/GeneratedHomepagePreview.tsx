import type { GeneratedHomepagePreview } from "@/lib/generated-homepage-preview";
import GeneratedHomepagePreviewActions from "@/components/projects/GeneratedHomepagePreviewActions";

export default function GeneratedHomepagePreview({
  preview,
  projectId,
  workspacePath,
}: {
  preview: GeneratedHomepagePreview;
  projectId: string;
  workspacePath: string;
}) {
  const { blueprint, theme } = preview;
  const darkText = theme.pageShell.includes("text-slate-50");
  const headingTone = darkText ? "text-white" : "text-slate-950";
  const navTone = darkText ? "text-slate-200" : "text-slate-600";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            생성된 홈페이지를 앱 안에서 바로 확인하는 미리보기입니다.
            <div className="mt-1 break-all font-mono text-xs text-emerald-800">{workspacePath}</div>
          </div>
          <GeneratedHomepagePreviewActions projectId={projectId} compact />
        </div>
      </div>

      <main className={theme.pageShell}>
        <header className={theme.headerShell}>
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
            <div className="flex items-center gap-3">
              <div className={theme.logoShell}>
                <span className="text-sm font-semibold">O</span>
              </div>
              <div>
                <div className={`text-[10px] font-semibold uppercase tracking-[0.35em] ${theme.accentLabel}`}>
                  {blueprint.heroEyebrow}
                </div>
                <div className={`text-sm font-semibold ${headingTone}`}>{blueprint.heroTitle}</div>
              </div>
            </div>

            <nav className={`hidden items-center gap-6 text-sm font-medium md:flex ${navTone}`}>
              <a href="#preview-overview" className="transition hover:text-current">
                소개
              </a>
              <a href="#preview-featured" className="transition hover:text-current">
                핵심 섹션
              </a>
              <a href="#preview-process" className="transition hover:text-current">
                흐름
              </a>
              <a href="#preview-faq" className="transition hover:text-current">
                FAQ
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <a href="#preview-faq" className={`hidden md:inline-flex ${theme.footerChipShell}`}>
                안내
              </a>
              <a href="#preview-featured" className={theme.primaryButtonShell}>
                {blueprint.primaryCta}
              </a>
            </div>
          </div>
        </header>

        <section id="preview-overview" className={theme.heroSectionShell}>
          <div className="space-y-8">
            <div className={`inline-flex rounded-full border border-white/70 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] ${theme.accentLabel} shadow-sm`}>
              {blueprint.heroEyebrow}
            </div>

            <div className="space-y-5">
              <h1 className={`max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl ${headingTone}`}>
                {blueprint.heroTitle}
              </h1>
              <p className={`max-w-2xl text-lg leading-8 ${theme.mutedLabel}`}>{blueprint.heroDescription}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a href="#preview-featured" className={theme.primaryButtonShell}>
                {blueprint.primaryCta}
              </a>
              <a href="#preview-process" className={theme.secondaryButtonShell}>
                {blueprint.secondaryCta}
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {blueprint.metrics.map((metric) => (
                <div key={metric.label} className={theme.cardShell}>
                  <div className={`text-xs font-semibold uppercase tracking-[0.22em] ${theme.accentLabel}`}>
                    {metric.label}
                  </div>
                  <div className={`mt-3 text-lg font-semibold ${headingTone}`}>{metric.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-[2.5rem] bg-amber-300/20 blur-3xl" />
            <div className={theme.heroShell}>
              <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className={theme.heroMediaShell}>
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${blueprint.visualAssets?.heroImage ?? blueprint.showcaseItems[0]?.image ?? ""})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <div className={`text-xs font-semibold uppercase tracking-[0.28em] ${theme.accentLabel}`}>
                      한눈에 보는 핵심
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight">{blueprint.heroTitle}</div>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-200">{blueprint.heroDescription}</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className={theme.cardShell}>
                    <div className={`text-xs font-semibold uppercase tracking-[0.28em] ${theme.accentLabel}`}>
                      바로 보기
                    </div>
                    <div className="mt-3 space-y-3">
                      {blueprint.showcaseItems.slice(0, 2).map((item) => (
                        <div key={item.title} className={theme.featuredCardShell}>
                          <div
                            className="h-28 bg-cover bg-center"
                            style={{ backgroundImage: `url(${item.image ?? blueprint.visualAssets?.heroImage ?? ""})` }}
                          />
                          <div className="p-3">
                            <div className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${theme.mutedLabel}`}>
                              {item.tag}
                            </div>
                            <div className={`mt-1 text-sm font-semibold ${headingTone}`}>{item.title}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {blueprint.trustPoints.map((point) => (
                      <div key={point} className={theme.trustChipShell}>
                        {point}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">
          <div className={theme.sectionShell}>
            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>탐색 포인트</div>
            <h2 className={`mt-2 text-2xl font-semibold tracking-tight ${headingTone}`}>
              방문자가 가장 먼저 보게 될 기준입니다
            </h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {blueprint.collectionFilters.map((item) => (
                <span key={item.label} className={theme.chipShell}>
                  {item.label} · {item.note}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="preview-featured" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>핵심 섹션</div>
              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${headingTone}`}>
                고객이 훑게 되는 대표 카드
              </h2>
            </div>
            <div className={`max-w-md text-sm leading-6 ${theme.mutedLabel}`}>
              구현 항목이 아니라 고객이 이해할 메시지로 다듬은 대표 카드입니다.
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {blueprint.showcaseItems.map((item) => (
              <article key={item.title} className={theme.featuredCardShell}>
                <div
                  className="h-40 bg-cover bg-center"
                  style={{ backgroundImage: `url(${item.image ?? blueprint.visualAssets?.heroImage ?? ""})` }}
                />
                <div className="p-5">
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.mutedLabel}`}>
                    {item.tag}
                  </div>
                  <h3 className={`mt-3 text-lg font-semibold ${headingTone}`}>{item.title}</h3>
                  <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>
                  <div className={`mt-3 text-xs font-medium uppercase tracking-[0.18em] ${theme.mutedLabel}`}>
                    {item.details}
                  </div>
                  <div className={`mt-5 text-sm font-semibold ${theme.accentLabel}`}>{item.note}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-4 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {blueprint.valueProps.map((item) => (
              <article key={item.title} className={theme.cardShell}>
                <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>선택 기준</div>
                <h2 className={`mt-3 text-xl font-semibold ${headingTone}`}>{item.title}</h2>
                <p className={`mt-3 text-sm leading-7 ${theme.mutedLabel}`}>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <div className={`grid gap-5 lg:grid-cols-[1fr_1fr] ${theme.sectionShell}`}>
            <div className={theme.cardShell}>
              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>
                {blueprint.editorialSpotlight.eyebrow}
              </div>
              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${headingTone}`}>
                {blueprint.editorialSpotlight.title}
              </h2>
              <p className={`mt-4 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>
                {blueprint.editorialSpotlight.description}
              </p>
              <ul className="mt-6 space-y-3">
                {blueprint.editorialSpotlight.bullets.map((bullet) => (
                  <li key={bullet} className={`flex gap-3 text-sm leading-6 ${darkText ? "text-slate-100" : "text-slate-700"}`}>
                    <span className="mt-2 h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={theme.cardShell}>
              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>
                {blueprint.socialProof.eyebrow}
              </div>
              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${headingTone}`}>
                {blueprint.socialProof.title}
              </h2>
              <div className="mt-6 flex items-end gap-4">
                <div className={`text-5xl font-semibold tracking-tight ${headingTone}`}>{blueprint.socialProof.score}</div>
                <div className={`max-w-xs text-sm leading-6 ${theme.mutedLabel}`}>{blueprint.socialProof.summary}</div>
              </div>
              <div className="mt-6 grid gap-4">
                {blueprint.socialProof.quotes.slice(0, 2).map((quote) => (
                  <article key={`${quote.name}-${quote.role}`} className={theme.featuredCardShell}>
                    <div className="p-5">
                      <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>
                        {quote.role}
                      </div>
                      <h3 className={`mt-2 text-lg font-semibold ${headingTone}`}>{quote.name}</h3>
                      <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{quote.quote}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <div className={theme.sectionShell}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>서비스 카드</div>
                <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${headingTone}`}>
                  전환을 돕는 핵심 안내를 카드로 정리했습니다
                </h2>
              </div>
              <div className={`max-w-md text-sm leading-6 ${theme.mutedLabel}`}>
                첫 화면 아래에서 바로 이해되는 카드 구조로 정보 밀도와 스캔성을 확보합니다.
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {blueprint.serviceCards.map((item) => (
                <article key={item.title} className={theme.cardShell}>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>
                    {item.title}
                  </div>
                  <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="preview-process" className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <div className={theme.processShell}>
            <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>전환 흐름</div>
            <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${headingTone}`}>
              방문자가 다음 행동으로 넘어가는 순서
            </h2>
            <p className={`mt-3 max-w-3xl text-sm leading-7 ${theme.mutedLabel}`}>
              생성 과정의 내부 작업명이 아니라, 방문자가 실제로 체감하는 흐름 위주로 재정리한 카드입니다.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {blueprint.buildPlanCards.map((item) => (
                <article key={item.title} className={theme.cardShell}>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>
                    {item.priority ?? "핵심 포인트"}
                  </div>
                  <h3 className={`mt-2 text-lg font-semibold ${headingTone}`}>{item.title}</h3>
                  <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className={theme.sectionShell}>
              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>프로세스</div>
              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${headingTone}`}>
                구현보다 이해가 먼저 되도록 정리한 단계
              </h2>
              <div className="mt-6 space-y-4">
                {blueprint.processSteps.map((step) => (
                  <article key={step.step} className={theme.cardShell}>
                    <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${theme.accentLabel}`}>
                      {step.step}
                    </div>
                    <h3 className={`mt-2 text-lg font-semibold ${headingTone}`}>{step.title}</h3>
                    <p className={`mt-2 text-sm leading-6 ${theme.mutedLabel}`}>{step.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div id="preview-faq" className={theme.faqShell}>
              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>FAQ</div>
              <h2 className={`mt-2 text-3xl font-semibold tracking-tight ${headingTone}`}>자주 묻는 질문</h2>
              <div className="mt-6 space-y-4">
                {blueprint.faq.map((item) => (
                  <details key={item.question} className={theme.cardShell}>
                    <summary className={`cursor-pointer list-none text-sm font-semibold ${headingTone}`}>
                      {item.question}
                    </summary>
                    <p className={`mt-3 text-sm leading-6 ${theme.mutedLabel}`}>{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-8">
          <div className={theme.footerShell}>
            <div>
              <div className={`text-xs font-semibold uppercase tracking-[0.32em] ${theme.accentLabel}`}>
                미리보기 완료
              </div>
              <p className={`mt-2 max-w-2xl text-sm leading-7 ${theme.mutedLabel}`}>
                생성 직후 결과물을 바로 확인하게 해서, 프로젝트 관리 화면보다 먼저 홈페이지 자체의 가치를 느끼게 합니다.
              </p>
              <div className="mt-5">
                <GeneratedHomepagePreviewActions projectId={projectId} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <a href="#preview-overview" className={theme.footerChipShell}>
                Top
              </a>
              <a href="#preview-featured" className={theme.footerChipShell}>
                핵심 섹션
              </a>
              <a href="#preview-process" className={theme.footerChipShell}>
                흐름
              </a>
              <a href="#preview-faq" className={theme.footerChipShell}>
                FAQ
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
