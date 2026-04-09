import { expect, test, type Page } from "@playwright/test";
import { readdir, stat } from "fs/promises";
import path from "path";

const workspaceRoot = path.resolve(process.cwd(), ".playwright", "orchestra_projects");

const scenarios = [
  {
    label: "fashion commerce",
    projectName: () => `모노라벨 패션 ${Date.now()}`,
    audience: "트렌디한 데일리룩과 시즌 컬렉션을 찾는 고객",
    description:
      "의류 컬렉션과 스타일 제안을 보여주고 구매까지 이어지게 하는 패션 이커머스 홈페이지입니다.",
    mustHaves: ["베스트 상품", "신상 컬렉션", "카테고리 필터", "가격 정보", "구매 안내", "후기"],
    niceToHaves: ["룩북", "사이즈 가이드", "스타일 추천"],
    constraints:
      "과한 문구 대신 세련된 브랜드 무드가 먼저 보이고, 실제 쇼핑 흐름처럼 자연스럽게 구매를 유도해야 합니다.",
  },
  {
    label: "beauty commerce",
    projectName: () => `오드 스킨케어 ${Date.now()}`,
    audience: "민감성 피부에 맞는 스킨케어 제품을 찾는 고객",
    description:
      "스킨케어 라인업과 사용 루틴을 소개하고 구매까지 이어지게 하는 화장품 판매 홈페이지입니다.",
    mustHaves: ["베스트 상품", "제품 라인업", "카테고리 필터", "가격 정보", "구매 안내", "후기"],
    niceToHaves: ["성분 안내", "루틴 제안", "FAQ"],
    constraints:
      "의학적 효능을 과장하지 말고, 깨끗하고 신뢰감 있는 판매형 홈페이지처럼 보여야 합니다.",
  },
  {
    label: "furniture commerce",
    projectName: () => `아뜰리에 리빙 ${Date.now()}`,
    audience: "공간 분위기를 바꿀 가구와 리빙 제품을 찾는 고객",
    description:
      "소파, 테이블, 조명 같은 리빙 제품을 소개하고 구매로 이어지게 하는 가구 판매 홈페이지입니다.",
    mustHaves: ["추천 상품", "신상품 컬렉션", "카테고리 필터", "가격 정보", "구매 안내", "후기"],
    niceToHaves: ["공간별 추천", "배송 안내", "브랜드 스토리"],
    constraints:
      "카탈로그처럼 밋밋하지 않게 하되, 실제 가구 쇼핑몰처럼 가격과 구매 흐름이 명확하게 보여야 합니다.",
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
    await expect(page.locator("#collection-filters")).toBeVisible();
    await expect(page.locator("#shopping-guide")).toBeVisible();
    await expect(page.locator("#reviews")).toBeVisible();
    await expect(page.getByText(/₩/).first()).toBeVisible();

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
