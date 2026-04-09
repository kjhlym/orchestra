import { mkdir, readFile, readdir, rm } from "fs/promises";
import path from "path";

const DEFAULT_WORKSPACE = "../orchestra_projects/운영-콘텐츠-허브-비평";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4010";
const DEFAULT_INPUT = {
  name: "운영 콘텐츠 허브 비평",
  description:
    "사내 운영 포털과 콘텐츠 허브를 결합한 웹사이트로, 요청 관리, 승인, 공지, 문서, 검색, 일정, 리포트, 알림, 권한, 내보내기까지 한 곳에서 다룬다.",
  techStack: {
    framework: "Next.js",
    css: "Tailwind CSS",
    database: "SQLite",
    deployment: "Vercel",
  },
  requirements: {
    targetAudience: "운영팀, 콘텐츠 편집자, 관리자",
    mustHaves:
      "대시보드, 요청 목록, 승인 흐름, 상태 변경, 문서 조회, 공지, 일정, 검색, 필터, 알림, 리포트, CSV 내보내기",
    niceToHaves:
      "저장 검색, 즐겨찾기, 최근 본 항목, 태그 관리, 빠른 액션, 다국어 준비, 모바일 대응",
    constraints:
      "포털과 문서 허브가 한 제품처럼 보여야 하고, 카드 남발과 반복 섹션은 피하면서 헤더 중심 구조와 명확한 CTA를 유지한다.",
  },
};

function parseArgs(argv) {
  const args = {
    workspace: DEFAULT_WORKSPACE,
    role: "",
    minCount: 1,
    expectedLabel: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--workspace") {
      args.workspace = argv[++index] ?? args.workspace;
      continue;
    }

    if (token === "--role") {
      args.role = argv[++index] ?? args.role;
      continue;
    }

    if (token === "--min-count") {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--min-count must be a non-negative number");
      }
      args.minCount = value;
      continue;
    }

    if (token === "--expected-label") {
      args.expectedLabel = argv[++index] ?? args.expectedLabel;
      continue;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.role) {
    throw new Error("--role is required");
  }

  const workspacePath = await ensureWorkspaceExists(path.join(process.cwd(), args.workspace));
  const context = JSON.parse(await readFile(path.join(workspacePath, "project.context.json"), "utf8"));
  const roleQuality = await readFile(path.join(workspacePath, "docs", "role-quality.md"), "utf8");
  const implementationGuide = await readFile(
    path.join(workspacePath, "docs", "implementation-guide.md"),
    "utf8"
  );

  const stats = context.repairProfile?.roleQualityStats ?? context.roleQualityStats ?? {};
  const count = Number(stats[args.role] ?? 0);

  assert(
    count >= args.minCount,
    `${args.role} count should be at least ${args.minCount}, got ${count}`
  );

  if (args.expectedLabel) {
    assert(
      roleQuality.includes(args.expectedLabel) || implementationGuide.includes(args.expectedLabel),
      `expected label ${args.expectedLabel} not found in role documents`
    );
  }

  assert(
    implementationGuide.includes("## Repair Focus"),
    "implementation-guide.md should include Repair Focus"
  );

  assert(
    roleQuality.includes("## Repair Focus"),
    "role-quality.md should include Repair Focus"
  );

  console.log(
    JSON.stringify({
      workspace: args.workspace,
      role: args.role,
      count,
      repairFocus: context.repairProfile?.focusMessages?.find((item) => item.role === args.role)?.message ?? null,
    })
  );
}

async function ensureWorkspaceExists(workspacePath) {
  try {
    const existingContext = JSON.parse(
      await readFile(path.join(workspacePath, "project.context.json"), "utf8")
    );
    const existingStats =
      existingContext.repairProfile?.roleQualityStats ?? existingContext.roleQualityStats ?? {};

    if (
      Number(existingStats.planner ?? 0) >= 1 &&
      Number(existingStats.critic ?? 0) >= 1 &&
      Number(existingStats.designer ?? 0) >= 2 &&
      Number(existingStats.tester ?? 0) >= 1
    ) {
      return workspacePath;
    }

    await rm(workspacePath, { recursive: true, force: true });
  } catch {
    await mkdir(path.dirname(workspacePath), { recursive: true });
  }

  const input = {
    ...DEFAULT_INPUT,
    name: `${DEFAULT_INPUT.name} ${Date.now()}`,
  };
  const workspaceRoot = path.dirname(workspacePath);
  const before = new Set(await listDirectories(workspaceRoot));
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
  let createdWorkspace = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let markerIndex;
    while ((markerIndex = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, markerIndex).trim();
      buffer = buffer.slice(markerIndex + 2);

      if (!raw.startsWith("data:")) {
        continue;
      }

      const payload = raw.slice(5).trim();
      if (!payload) {
        continue;
      }

      const event = JSON.parse(payload);

      if (event.type === "project-created") {
        createdWorkspace = await waitForWorkspace(workspaceRoot, before);
      }

      if (event.type === "error") {
        throw new Error(event.message || "bootstrap emitted an error");
      }

      if (event.type === "complete") {
        if (!createdWorkspace) {
          createdWorkspace = await waitForWorkspace(workspaceRoot, before);
        }
        return createdWorkspace;
      }
    }
  }

  throw new Error("bootstrap completed without a complete event");
}

async function waitForWorkspace(workspaceRoot, before) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const directories = await listDirectories(workspaceRoot);
    const created = directories.find((dir) => !before.has(dir));

    if (created) {
      return path.join(workspaceRoot, created);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("expected a generated workspace but none appeared");
}

async function listDirectories(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
