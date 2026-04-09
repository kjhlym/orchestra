import { expect, test, type Page } from "@playwright/test";
import { readdir, stat } from "fs/promises";
import path from "path";

const workspaceRoot = path.resolve(process.cwd(), ".playwright", "orchestra_projects");

test("creates a jewelry commerce homepage from /projects/new and opens preview", async ({ page }) => {
  test.slow();
  const projectName = `루미에르 주얼리 ${Date.now()}`;

  const before = await listDirectories(workspaceRoot);

  await page.goto("/projects/new");

  const submitButton = page.getByTestId("new-project-submit");

  await expect(submitButton).toBeDisabled();

  await page.getByTestId("new-project-name").fill(projectName);
  await page
    .getByTestId("new-project-audience")
    .fill("기념일 선물과 데일리 주얼리를 찾는 고객");
  await page
    .getByTestId("new-project-description")
    .fill("골드와 실버 컬렉션을 소개하고 구매까지 이어지게 하는 주얼리 이커머스 홈페이지입니다.");
  await page
    .getByTestId("new-project-must-haves")
    .fill(
      [
        "베스트 상품",
        "신상품 컬렉션",
        "카테고리 필터",
        "가격 정보",
        "구매 안내",
        "후기",
      ].join("\n")
    );
  await page
    .getByTestId("new-project-nice-to-haves")
    .fill(["선물 포장 안내", "브랜드 스토리", "FAQ"].join("\n"));
  await page
    .getByTestId("new-project-constraints")
    .fill("과한 장식은 피하되 실제 판매 사이트처럼 장바구니와 결제 흐름이 자연스럽게 느껴져야 합니다.");

  await expect(submitButton).toBeEnabled();

  await submitButton.click();

  const previewButton = page.getByRole("button", { name: "홈페이지 미리보기 열기" });
  const redirectedToPreview = await page
    .waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!redirectedToPreview) {
    const previewButtonVisible = await previewButton
      .isVisible()
      .catch(() => false);

    if (previewButtonVisible) {
      await previewButton.click();
      await page.waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 30_000 });
    } else {
      const projectId = await waitForProjectId(page, projectName);
      await page.goto(`/projects/${projectId}/preview`);
      await page.waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 30_000 });
    }
  }

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
