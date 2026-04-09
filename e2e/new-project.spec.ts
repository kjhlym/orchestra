import { expect, test } from "@playwright/test";
import { readdir, stat } from "fs/promises";
import path from "path";

const workspaceRoot = path.resolve(process.cwd(), ".playwright", "orchestra_projects");

test("creates a homepage from /projects/new and redirects to preview", async ({ page }) => {
  test.slow();

  const before = await listDirectories(workspaceRoot);

  await page.goto("/projects/new");

  const submitButton = page.getByTestId("new-project-submit");

  await expect(submitButton).toBeDisabled();

  await page.getByTestId("new-project-name").fill("오케스트라 브랜드 스튜디오");
  await page.getByTestId("new-project-audience").fill("브랜드를 알아보는 방문자와 협업 문의 고객");
  await page
    .getByTestId("new-project-description")
    .fill("브랜드 가치와 서비스 강점을 간결하게 소개하고 문의까지 이어지게 하는 홈페이지입니다.");
  await page
    .getByTestId("new-project-must-haves")
    .fill(["브랜드 소개", "서비스 소개", "대표 작업", "문의"].join("\n"));
  await page
    .getByTestId("new-project-nice-to-haves")
    .fill(["FAQ", "갤러리", "후기"].join("\n"));
  await page
    .getByTestId("new-project-constraints")
    .fill("과한 장식, 복잡한 문구, 지나치게 강한 세일즈 톤은 피해주세요.");

  await expect(submitButton).toBeEnabled();

  await submitButton.click();

  const previewButton = page.getByRole("button", { name: "홈페이지 미리보기 열기" });
  const redirectedToPreview = await page
    .waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!redirectedToPreview) {
    await expect(previewButton).toBeVisible({ timeout: 120_000 });
    await previewButton.click();
    await page.waitForURL(/\/projects\/[^/]+\/preview$/, { timeout: 30_000 });
  }

  await expect(page.getByTestId("preview-copy-link").first()).toBeVisible();
  await expect(page.getByTestId("preview-deploy-prep").first()).toBeVisible();
  await expect(
    page.getByText("생성된 홈페이지를 앱 안에서 바로 확인하는 미리보기입니다.")
  ).toBeVisible();
  await expect(page.getByText(".playwright/orchestra_projects").first()).toBeVisible();

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
