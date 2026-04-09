import { readdir, readFile, rm, stat } from "fs/promises";
import path from "path";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3005";
const WORKSPACE_ROOT = process.env.ORCHESTRA_PROJECTS_ROOT?.trim()
  ? path.resolve(process.env.ORCHESTRA_PROJECTS_ROOT.trim())
  : path.resolve(process.cwd(), "..", "orchestra_projects");
const PROJECT_NAME = `비평-스모크-${Date.now()}`;

async function main() {
  const before = new Set(await listDirectories(WORKSPACE_ROOT));
  const projectDir = await bootstrapProject(before);

  try {
    const README = await readFile(path.join(projectDir, "README.md"), "utf8");
    const roleQuality = await readFile(path.join(projectDir, "docs", "role-quality.md"), "utf8");
    const implementationGuide = await readFile(
      path.join(projectDir, "docs", "implementation-guide.md"),
      "utf8"
    );
    const context = JSON.parse(
      await readFile(path.join(projectDir, "project.context.json"), "utf8")
    );

    assertContains(README, "## Critic Lens", "README");
    assertContains(README, "patterns:", "README");
    assertContains(roleQuality, "### Critic Lens", "role-quality.md");
    assertContains(roleQuality, "비평:", "role-quality.md");
    assertContains(implementationGuide, "### 비평", "implementation-guide.md");
    assertContains(implementationGuide, "## Repair Focus", "implementation-guide.md");
    assert(Boolean(context.repairProfile), "project.context.json should include a repairProfile");
    assert(
      Number(context?.roleQualityStats?.critic ?? 0) > 0,
      "critic count should be greater than zero"
    );

    console.log(
      JSON.stringify({
        projectDir,
        criticCount: context.roleQualityStats.critic,
        criticFocus: context.repairProfile.focusMessages.find((item) => item.role === "critic")?.message,
      })
    );
  } finally {
    if (projectDir && (await exists(projectDir))) {
      await rm(projectDir, { recursive: true, force: true });
    } else {
      const after = new Set(await listDirectories(WORKSPACE_ROOT));
      for (const dir of after) {
        if (!before.has(dir)) {
          await rm(path.join(WORKSPACE_ROOT, dir), { recursive: true, force: true }).catch(() => null);
        }
      }
    }
  }
}

async function bootstrapProject(before) {
  const input = {
    name: PROJECT_NAME,
    description:
      "사내 운영 포털과 콘텐츠 허브를 합친 웹사이트로, 승인, 요청, 일정, 공지, 문서, 검색, 알림, 통계, 권한, 태그, 필터, 감사 기록, 고객 문의, 작업 추적, 리포트, 데이터 내보내기까지 한 곳에서 관리한다.",
    techStack: {
      framework: "Next.js",
      css: "Tailwind CSS",
      database: "SQLite",
      deployment: "Vercel",
    },
    requirements: {
      targetAudience: "운영팀, 콘텐츠 편집자, 관리자가 함께 쓰는 내부 중심 사용자",
      mustHaves:
        "대시보드, 승인 흐름, 요청 목록, 상태 변경, 검색, 필터, 문서 조회, 공지, 일정, 알림, 권한 관리, 활동 로그, 리포트, CSV 내보내기, 모바일 대응",
      niceToHaves:
        "상태별 뷰, 즐겨찾기, 저장 검색, 최근 본 항목, 태그 관리, 빠른 액션, 멀티 셀렉트, 하이라이트, 북마크, 다국어 준비, 다크 모드 토글",
      constraints:
        "포털과 문서 허브가 한 제품처럼 보이게 하되, 카드 남발과 중복 섹션은 피하고, 헤더 중심 구조, 증명 요소, 가로 쇼케이스, 구조화된 푸터를 유지한다.",
    },
  };

  const response = await fetch(`${BASE_URL}/api/projects/bootstrap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`bootstrap failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("bootstrap response body is missing");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let projectDir = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let markerIndex;
    while ((markerIndex = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, markerIndex).trim();
      buffer = buffer.slice(markerIndex + 2);

      if (!raw.startsWith("data:")) continue;

      const payload = raw.slice(5).trim();
      if (!payload) continue;

      const event = JSON.parse(payload);

      if (event.type === "project-created") {
        projectDir = await waitForNewWorkspace(before);
      }

      if (event.type === "error") {
        throw new Error(event.message || "bootstrap emitted an error");
      }

      if (event.type === "complete") {
        if (!projectDir) {
          projectDir = await waitForNewWorkspace(before);
        }

        return projectDir;
      }
    }
  }

  throw new Error("bootstrap completed without a complete event");
}

async function waitForNewWorkspace(before) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await listDirectories(WORKSPACE_ROOT);
    const created = current.filter((dir) => !before.has(dir));

    if (created.length > 0) {
      if (created.length === 1) {
        return path.join(WORKSPACE_ROOT, created[0]);
      }

      const candidates = await Promise.all(
        created.map(async (dir) => ({
          dir,
          mtimeMs: (await stat(path.join(WORKSPACE_ROOT, dir))).mtimeMs,
        }))
      );

      candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
      return path.join(WORKSPACE_ROOT, candidates[0].dir);
    }

    await sleep(250);
  }

  throw new Error("could not detect created workspace");
}

async function listDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function assertContains(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label} is missing ${needle}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
