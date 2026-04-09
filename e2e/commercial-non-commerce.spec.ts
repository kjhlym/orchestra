import { expect, test, type Page } from "@playwright/test";
import { readdir, stat } from "fs/promises";
import path from "path";

const workspaceRoot = path.resolve(process.cwd(), ".playwright", "orchestra_projects");

const scenarios = [
  {
    label: "booking service",
    projectName: () => `에어리 예약 센터 ${Date.now()}`,
    audience: "원하는 시간에 빠르게 예약하고 확인받고 싶은 고객",
    description:
      "예약 가능한 시간을 보여주고 신청부터 확정 알림까지 자연스럽게 이어지게 하는 예약 서비스 홈페이지입니다.",
    mustHaves: ["예약 시간 보기", "예약 신청", "확정 알림", "운영 안내", "FAQ"],
    niceToHaves: ["변경/취소 안내", "캘린더 연동", "상담 채널"],
    constraints:
      "복잡한 관리자 화면보다 예약 전환이 먼저 보여야 하고, 실제 예약 서비스처럼 신뢰감 있게 보여야 합니다.",
    assertions: ["Booking Story", "예약 충돌 방지", "운영자가 이해하기 쉬운 상태 관리"],
  },
  {
    label: "brand portfolio",
    projectName: () => `아틀리에 브랜드 스튜디오 ${Date.now()}`,
    audience: "브랜드 작업 결과를 보고 협업을 문의하려는 담당자",
    description:
      "브랜드 아이덴티티와 대표 작업을 보여주고 상담 문의로 이어지게 하는 브랜드 포트폴리오 홈페이지입니다.",
    mustHaves: ["대표 작업", "서비스 소개", "상담 문의", "후기", "FAQ"],
    niceToHaves: ["케이스 스터디", "브랜드 스토리", "작업 방식"],
    constraints:
      "너무 쇼핑몰처럼 보이지 말고, 결과 중심의 포트폴리오 사이트처럼 정돈된 인상을 줘야 합니다.",
    assertions: ["Portfolio Story", "작품이 곧 소개서가 되는 구조", "Client Feedback"],
  },
  {
    label: "internal operations hub",
    projectName: () => `플로우 운영 허브 ${Date.now()}`,
    audience: "승인, 요청, 일정, 공지를 한 곳에서 관리해야 하는 운영팀",
    description:
      "내부 운영팀이 요청, 승인, 일정, 공지, 리포트를 함께 관리하는 내부 운영 포털 홈페이지입니다.",
    mustHaves: ["운영 대시보드", "승인 흐름", "상태 관리", "리포트", "알림"],
    niceToHaves: ["CSV 내보내기", "권한 관리", "빠른 액션"],
    constraints:
      "외부 마케팅 페이지보다 운영 생산성이 먼저 느껴져야 하고, 카드만 많은 포털처럼 보이지 않게 해주세요.",
    assertions: ["Ops Story", "승인 흐름 단순화", "상태 중심의 운영 화면"],
  },
] as const;

for (const scenario of scenarios) {
  test(`creates a ${scenario.label} homepage from /projects/new and opens preview`, async ({ page }) => {
    test.slow();

    const projectName = scenario.projectName();
    const before = await listDirectories(workspaceRoot);

    await page.goto("/projects/new");

    const submitButton = page.getByTestId("new-project-submit");

    await expect(submitButton).toBeDisabled();

    await page.getByTestId("new-project-name").fill(projectName);
    await page.getByTestId("new-project-audience").fill(scenario.audience);
    await page.getByTestId("new-project-description").fill(scenario.description);
    await page.getByTestId("new-project-must-haves").fill(scenario.mustHaves.join("\n"));
    await page.getByTestId("new-project-nice-to-haves").fill(scenario.niceToHaves.join("\n"));
    await page.getByTestId("new-project-constraints").fill(scenario.constraints);

    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await openPreviewAfterCreate(page, projectName);

    await expect(page.getByTestId("preview-copy-link").first()).toBeVisible();
    await expect(page.getByTestId("preview-deploy-prep").first()).toBeVisible();

    for (const expectedText of scenario.assertions) {
      await expect(page.getByText(expectedText).first()).toBeVisible();
    }

    const after = await listDirectories(workspaceRoot);
    const created = after.filter((dir) => !before.includes(dir));

    expect(created.length).toBeGreaterThan(0);
  });
}

async function openPreviewAfterCreate(page: Page, projectName: string) {
  const previewButton = page.getByRole("button", { name: "홈페이지 미리보기 열기" });
  const redirectedToPreview = await page
    .waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (redirectedToPreview) {
    return;
  }

  const previewButtonVisible = await previewButton.isVisible().catch(() => false);

  if (previewButtonVisible) {
    await previewButton.click();
    await page.waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 30_000 });
    return;
  }

  const projectId = await waitForProjectId(page, projectName);
  await page.goto(`/projects/${projectId}/preview`);
  await page.waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 30_000 });
}

async function listDirectories(rootPath: string) {
  const entries = await readdir(rootPath).catch(() => []);
  const directories: string[] = [];

  for (const entry of entries) {
    const info = await stat(path.join(rootPath, entry)).catch(() => null);

    if (info?.isDirectory()) {
      directories.push(entry);
    }
  }

  return directories;
}

async function waitForProjectId(page: Page, projectName: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 120_000) {
    const response = await page.request.get("/api/projects");
    expect(response.ok()).toBeTruthy();

    const projects = (await response.json()) as Array<{ id: string; name: string }>;
    const match = projects.find((project) => project.name === projectName);

    if (match) {
      return match.id;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Timed out waiting for project ${projectName}`);
}
