import { promises as fs } from "fs";
import path from "path";
import type { GeneratedBacklogItem, ProjectBootstrapInput } from "@/lib/bootstrap";

export const WORKSPACES_ROOT =
  process.env.ORCHESTRA_PROJECTS_ROOT ?? "D:\\rpa\\orchestra_projects";

type WorkspaceResult = {
  slug: string;
  workspacePath: string;
};

export async function createProjectWorkspace(
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  await fs.mkdir(WORKSPACES_ROOT, { recursive: true });

  const slug = await createUniqueSlug(input.name);
  const workspacePath = path.join(WORKSPACES_ROOT, slug);

  await fs.mkdir(workspacePath, { recursive: true });

  try {
    await writeCommonWorkspaceFiles(workspacePath, slug, input, backlogItems);
    await writeFrameworkScaffold(workspacePath, slug, input, backlogItems);
  } catch (error) {
    await fs.rm(workspacePath, { recursive: true, force: true });
    throw error;
  }

  return { slug, workspacePath } satisfies WorkspaceResult;
}

function slugifyProjectName(value: string) {
  const normalized = value
    .normalize("NFC")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "new-project";
}

async function createUniqueSlug(projectName: string) {
  const base = slugifyProjectName(projectName);

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const targetPath = path.join(WORKSPACES_ROOT, candidate);

    try {
      await fs.access(targetPath);
    } catch {
      return candidate;
    }
  }

  throw new Error("사용 가능한 프로젝트 슬러그를 생성하지 못했습니다.");
}

async function writeCommonWorkspaceFiles(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const docsDir = path.join(workspacePath, "docs");

  await fs.mkdir(docsDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, ".gitignore"), buildGitignore(), "utf8"),
    fs.writeFile(path.join(workspacePath, "README.md"), buildWorkspaceReadme(input, slug), "utf8"),
    fs.writeFile(
      path.join(workspacePath, "project.context.json"),
      JSON.stringify(
        {
          slug,
          generatedAt: new Date().toISOString(),
          input,
          backlogItems,
        },
        null,
        2
      ),
      "utf8"
    ),
    fs.writeFile(path.join(docsDir, "requirements.md"), buildRequirementsMarkdown(input), "utf8"),
    fs.writeFile(path.join(docsDir, "backlog.md"), buildBacklogMarkdown(backlogItems), "utf8"),
  ]);
}

async function writeFrameworkScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  switch (input.techStack.framework) {
    case "vue":
      await writeVueScaffold(workspacePath, slug, input, backlogItems);
      return;
    case "svelte":
      await writeSvelteScaffold(workspacePath, slug, input, backlogItems);
      return;
    case "python":
      await writeFastApiScaffold(workspacePath, input, backlogItems);
      return;
    case "nextjs":
    default:
      await writeNextScaffold(workspacePath, slug, input, backlogItems);
      return;
  }
}

async function writeNextScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const appDir = path.join(workspacePath, "src", "app");

  await fs.mkdir(appDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "package.json"), buildNextPackageJson(slug), "utf8"),
    fs.writeFile(path.join(workspacePath, "tsconfig.json"), buildNextTsConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "next-env.d.ts"), buildNextEnvDts(), "utf8"),
    fs.writeFile(path.join(workspacePath, "next.config.ts"), buildNextConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "eslint.config.mjs"), buildNextEslintConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "postcss.config.mjs"), buildPostCssConfig(), "utf8"),
    fs.writeFile(path.join(appDir, "globals.css"), buildNextGlobalsCss(), "utf8"),
    fs.writeFile(path.join(appDir, "layout.tsx"), buildNextLayout(input), "utf8"),
    fs.writeFile(path.join(appDir, "page.tsx"), buildNextPage(input, backlogItems), "utf8"),
  ]);
}

async function writeVueScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const srcDir = path.join(workspacePath, "src");

  await fs.mkdir(srcDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "package.json"), buildVuePackageJson(slug), "utf8"),
    fs.writeFile(path.join(workspacePath, "tsconfig.json"), buildVueTsConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "vite.config.ts"), buildVueViteConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "index.html"), buildVueIndexHtml(input), "utf8"),
    fs.writeFile(path.join(srcDir, "main.ts"), buildVueMainTs(), "utf8"),
    fs.writeFile(path.join(srcDir, "App.vue"), buildVueApp(input, backlogItems), "utf8"),
    fs.writeFile(path.join(srcDir, "style.css"), buildVueStyleCss(), "utf8"),
  ]);
}

async function writeSvelteScaffold(
  workspacePath: string,
  slug: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const srcDir = path.join(workspacePath, "src");

  await fs.mkdir(srcDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "package.json"), buildSveltePackageJson(slug), "utf8"),
    fs.writeFile(path.join(workspacePath, "tsconfig.json"), buildSvelteTsConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "vite.config.ts"), buildSvelteViteConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "svelte.config.js"), buildSvelteConfig(), "utf8"),
    fs.writeFile(path.join(workspacePath, "index.html"), buildVueIndexHtml(input), "utf8"),
    fs.writeFile(path.join(srcDir, "main.ts"), buildSvelteMainTs(), "utf8"),
    fs.writeFile(path.join(srcDir, "App.svelte"), buildSvelteApp(input, backlogItems), "utf8"),
  ]);
}

async function writeFastApiScaffold(
  workspacePath: string,
  input: ProjectBootstrapInput,
  backlogItems: GeneratedBacklogItem[]
) {
  const appDir = path.join(workspacePath, "app");

  await fs.mkdir(appDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(workspacePath, "requirements.txt"), buildFastApiRequirements(), "utf8"),
    fs.writeFile(path.join(appDir, "main.py"), buildFastApiMainPy(input, backlogItems), "utf8"),
  ]);
}

function buildGitignore() {
  return ["node_modules", ".next", "dist", "__pycache__", ".venv", ".env", ".DS_Store", ""].join("\n");
}

function buildWorkspaceReadme(input: ProjectBootstrapInput, slug: string) {
  return [
    `# ${input.name}`,
    "",
    "오케스트라가 생성한 독립 워크스페이스입니다.",
    "",
    `- slug: \`${slug}\``,
    `- framework: \`${input.techStack.framework || "unspecified"}\``,
    `- css: \`${input.techStack.css || "unspecified"}\``,
    `- database: \`${input.techStack.database || "unspecified"}\``,
    `- deployment: \`${input.techStack.deployment || "unspecified"}\``,
    "",
    "세부 요구사항은 `docs/requirements.md`, 초기 백로그는 `docs/backlog.md`를 확인하세요.",
    "",
    "## 실행",
    "",
    "선택한 프레임워크에 맞는 의존성을 설치한 뒤 실행하세요.",
    "",
    "```bash",
    "npm install",
    "npm run dev",
    "```",
    "",
  ].join("\n");
}

function buildRequirementsMarkdown(input: ProjectBootstrapInput) {
  return [
    "# Requirements",
    "",
    `## 프로젝트명`,
    input.name,
    "",
    "## 설명",
    input.description || "설명 없음",
    "",
    "## 기술 스택",
    `- Framework: ${input.techStack.framework || "-"}`,
    `- CSS: ${input.techStack.css || "-"}`,
    `- Database: ${input.techStack.database || "-"}`,
    `- Deployment: ${input.techStack.deployment || "-"}`,
    "",
    "## 타깃 사용자",
    input.requirements.targetAudience || "-",
    "",
    "## Must Haves",
    input.requirements.mustHaves || "-",
    "",
    "## Nice To Haves",
    input.requirements.niceToHaves || "-",
    "",
    "## Constraints",
    input.requirements.constraints || "-",
    "",
  ].join("\n");
}

function buildBacklogMarkdown(backlogItems: GeneratedBacklogItem[]) {
  return [
    "# Initial Backlog",
    "",
    ...backlogItems.flatMap((item, index) => [
      `## ${index + 1}. ${item.title}`,
      `- Priority: ${item.priority}`,
      `- Story Points: ${item.storyPoints}`,
      `- Description: ${item.description}`,
      `- User Story: ${item.userStory}`,
      "- Acceptance Criteria:",
      ...item.acceptanceCriteria.map((criterion) => `  - ${criterion}`),
      "",
    ]),
  ].join("\n");
}

function buildNextPackageJson(slug: string) {
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "eslint",
      },
      dependencies: {
        next: "15.5.14",
        react: "19.1.0",
        "react-dom": "19.1.0",
      },
      devDependencies: {
        "@eslint/eslintrc": "^3",
        "@tailwindcss/postcss": "^4",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        eslint: "^9",
        "eslint-config-next": "15.5.14",
        tailwindcss: "^4",
        typescript: "^5",
      },
    },
    null,
    2
  );
}

function buildNextTsConfig() {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: false,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  );
}

function buildNextEnvDts() {
  return [
    '/// <reference types="next" />',
    '/// <reference types="next/image-types/global" />',
    "",
    "// This file is auto-generated by Next.js.",
    "",
  ].join("\n");
}

function buildNextConfig() {
  return ['const nextConfig = {', "  reactStrictMode: true,", "};", "", "export default nextConfig;", ""].join(
    "\n"
  );
}

function buildNextEslintConfig() {
  return [
    'import { FlatCompat } from "@eslint/eslintrc";',
    "",
    "const compat = new FlatCompat({",
    "  baseDirectory: import.meta.dirname,",
    "});",
    "",
    'const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];',
    "",
    "export default eslintConfig;",
    "",
  ].join("\n");
}

function buildPostCssConfig() {
  return ['export default {', "  plugins: {", '    "@tailwindcss/postcss": {},', "  },", "};", ""].join("\n");
}

function buildNextGlobalsCss() {
  return [
    '@import "tailwindcss";',
    "",
    ":root {",
    "  --background: #ffffff;",
    "  --foreground: #111827;",
    "}",
    "",
    "html {",
    "  scroll-behavior: smooth;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "  background: var(--background);",
    "  color: var(--foreground);",
    "  font-family: Arial, sans-serif;",
    "}",
    "",
    "a {",
    "  color: inherit;",
    "  text-decoration: none;",
    "}",
    "",
    "* {",
    "  box-sizing: border-box;",
    "}",
    "",
  ].join("\n");
}

function buildNextLayout(input: ProjectBootstrapInput) {
  return [
    'import type { Metadata } from "next";',
    'import "./globals.css";',
    "",
    "export const metadata: Metadata = {",
    `  title: ${JSON.stringify(input.name)},`,
    `  description: ${JSON.stringify(input.description || `${input.name} 프로젝트`)},`,
    "};",
    "",
    "export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {",
    "  return (",
    '    <html lang="ko">',
    "      <body>{children}</body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildNextPage(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const topItems = backlogItems.slice(0, 4);

  return [
    "const backlogItems = " + JSON.stringify(topItems, null, 2) + ";",
    "",
    "export default function Home() {",
    "  return (",
    '    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white md:px-10">',
    '      <section className="mx-auto max-w-6xl rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#111827_0%,#0f172a_50%,#1f2937_100%)] p-8 shadow-2xl md:p-12">',
    '        <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">',
    "          Orchestrated Independent Project",
    "        </div>",
    `        <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl">${escapeTemplateLiteral(
      input.name
    )}</h1>`,
    `        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">${escapeTemplateLiteral(
      input.description || "프로젝트 설명을 여기에 작성하세요."
    )}</p>`,
    '        <div className="mt-10 grid gap-4 md:grid-cols-3">',
    `          <Metric label="Framework" value="${escapeTemplateLiteral(input.techStack.framework || "nextjs")}" />`,
    `          <Metric label="Database" value="${escapeTemplateLiteral(input.techStack.database || "-")}" />`,
    `          <Metric label="Deployment" value="${escapeTemplateLiteral(input.techStack.deployment || "-")}" />`,
    "        </div>",
    "      </section>",
    "",
    '      <section className="mx-auto mt-10 max-w-6xl rounded-[32px] bg-white p-8 text-slate-900 md:p-12">',
    '        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">',
    "          <div>",
    '            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">Target Audience</div>',
    `            <p className="mt-4 text-lg leading-8 text-slate-600">${escapeTemplateLiteral(
      input.requirements.targetAudience || "타깃 사용자 정보를 추가하세요."
    )}</p>`,
    '            <div className="mt-8 rounded-3xl bg-slate-100 p-6">',
    '              <div className="text-sm font-semibold text-slate-500">Must Haves</div>',
    `              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">${escapeTemplateLiteral(
      input.requirements.mustHaves || "-"
    )}</pre>`,
    "            </div>",
    "          </div>",
    '          <div className="grid gap-4 md:grid-cols-2">',
    "            {backlogItems.map((item) => (",
    '              <article key={item.title} className="rounded-3xl border border-slate-200 p-5 shadow-sm">',
    '                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.priority}</div>',
    '                <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>',
    '                <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>',
    '                <div className="mt-4 text-xs font-medium text-emerald-700">{item.storyPoints} story points</div>',
    "              </article>",
    "            ))}",
    "          </div>",
    "        </div>",
    "      </section>",
    "    </main>",
    "  );",
    "}",
    "",
    'function Metric({ label, value }: { label: string; value: string }) {',
    "  return (",
    '    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">',
    '      <div className="text-sm text-slate-400">{label}</div>',
    '      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>',
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function buildVuePackageJson(slug: string) {
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        vue: "^3.5.13",
      },
      devDependencies: {
        "@vitejs/plugin-vue": "^5.2.1",
        typescript: "^5.7.3",
        vite: "^6.0.5",
      },
    },
    null,
    2
  );
}

function buildVueTsConfig() {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        module: "ESNext",
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        skipLibCheck: true,
        moduleResolution: "Bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "preserve",
        strict: true,
      },
      include: ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"],
    },
    null,
    2
  );
}

function buildVueViteConfig() {
  return [
    'import { defineConfig } from "vite";',
    'import vue from "@vitejs/plugin-vue";',
    "",
    "export default defineConfig({",
    "  plugins: [vue()],",
    "});",
    "",
  ].join("\n");
}

function buildVueIndexHtml(input: ProjectBootstrapInput) {
  return [
    "<!doctype html>",
    '<html lang="ko">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${escapeHtml(input.name)}</title>`,
    "  </head>",
    "  <body>",
    '    <div id="app"></div>',
    '    <script type="module" src="/src/main.ts"></script>',
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

function buildVueMainTs() {
  return ['import { createApp } from "vue";', 'import App from "./App.vue";', 'import "./style.css";', "", "createApp(App).mount(\"#app\");", ""].join("\n");
}

function buildVueApp(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const items = backlogItems.slice(0, 4);
  return [
    "<script setup lang=\"ts\">",
    "const backlogItems = " + JSON.stringify(items, null, 2),
    "</script>",
    "",
    "<template>",
    '  <main class="page">',
    '    <section class="hero">',
    `      <div class="eyebrow">Independent Workspace</div>`,
    `      <h1>${escapeHtml(input.name)}</h1>`,
    `      <p>${escapeHtml(input.description || "프로젝트 설명을 추가하세요.")}</p>`,
    "    </section>",
    '    <section class="grid">',
    '      <article v-for=\"item in backlogItems\" :key=\"item.title\" class=\"card\">',
    '        <div class=\"priority\">{{ item.priority }}</div>',
    '        <h2>{{ item.title }}</h2>',
    '        <p>{{ item.description }}</p>',
    "      </article>",
    "    </section>",
    "  </main>",
    "</template>",
    "",
  ].join("\n");
}

function buildVueStyleCss() {
  return [
    ":root {",
    "  font-family: Arial, sans-serif;",
    "  color: #0f172a;",
    "  background: #f8fafc;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "}",
    "",
    ".page {",
    "  min-height: 100vh;",
    "  padding: 48px 24px;",
    "}",
    "",
    ".hero {",
    "  max-width: 960px;",
    "  margin: 0 auto;",
    "}",
    "",
    ".eyebrow {",
    "  color: #059669;",
    "  font-weight: 700;",
    "  text-transform: uppercase;",
    "  letter-spacing: 0.2em;",
    "  font-size: 12px;",
    "}",
    "",
    "h1 {",
    "  font-size: 56px;",
    "  margin: 16px 0;",
    "}",
    "",
    ".grid {",
    "  max-width: 960px;",
    "  margin: 32px auto 0;",
    "  display: grid;",
    "  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));",
    "  gap: 16px;",
    "}",
    "",
    ".card {",
    "  background: white;",
    "  border-radius: 24px;",
    "  padding: 20px;",
    "  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);",
    "}",
    "",
    ".priority {",
    "  font-size: 12px;",
    "  text-transform: uppercase;",
    "  color: #64748b;",
    "}",
    "",
  ].join("\n");
}

function buildSveltePackageJson(slug: string) {
  return JSON.stringify(
    {
      name: slug,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        svelte: "^5.16.0",
      },
      devDependencies: {
        "@sveltejs/vite-plugin-svelte": "^5.0.3",
        svelte: "^5.16.0",
        typescript: "^5.7.3",
        vite: "^6.0.5",
      },
    },
    null,
    2
  );
}

function buildSvelteTsConfig() {
  return JSON.stringify(
    {
      compilerOptions: {
        module: "ESNext",
        target: "ES2020",
        moduleResolution: "Bundler",
        strict: true,
        types: ["svelte"],
      },
      include: ["src/**/*.ts", "src/**/*.svelte"],
    },
    null,
    2
  );
}

function buildSvelteViteConfig() {
  return [
    'import { defineConfig } from "vite";',
    'import { svelte } from "@sveltejs/vite-plugin-svelte";',
    "",
    "export default defineConfig({",
    "  plugins: [svelte()],",
    "});",
    "",
  ].join("\n");
}

function buildSvelteConfig() {
  return ["export default {", "  compilerOptions: {", "    dev: true,", "  },", "};", ""].join("\n");
}

function buildSvelteMainTs() {
  return ['import App from "./App.svelte";', "", "const app = new App({", "  target: document.getElementById(\"app\")!,", "});", "", "export default app;", ""].join("\n");
}

function buildSvelteApp(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const items = backlogItems.slice(0, 4);
  return [
    "<script lang=\"ts\">",
    "  const backlogItems = " + JSON.stringify(items, null, 2),
    "</script>",
    "",
    '<svelte:head><title>' + escapeHtml(input.name) + "</title></svelte:head>",
    "",
    '<main class=\"page\">',
    '  <section class=\"hero\">',
    '    <div class=\"eyebrow\">Independent Workspace</div>',
    `    <h1>${escapeHtml(input.name)}</h1>`,
    `    <p>${escapeHtml(input.description || "프로젝트 설명을 추가하세요.")}</p>`,
    "  </section>",
    '  <section class=\"grid\">',
    "    {#each backlogItems as item}",
    '      <article class=\"card\">',
    '        <div class=\"priority\">{item.priority}</div>',
    "        <h2>{item.title}</h2>",
    "        <p>{item.description}</p>",
    "      </article>",
    "    {/each}",
    "  </section>",
    "</main>",
    "",
    "<style>",
    buildVueStyleCss(),
    "</style>",
    "",
  ].join("\n");
}

function buildFastApiRequirements() {
  return ["fastapi==0.115.8", "uvicorn[standard]==0.34.0", ""].join("\n");
}

function buildFastApiMainPy(input: ProjectBootstrapInput, backlogItems: GeneratedBacklogItem[]) {
  const items = backlogItems
    .slice(0, 5)
    .map((item) => `        {"title": ${JSON.stringify(item.title)}, "priority": ${JSON.stringify(item.priority)}},`)
    .join("\n");

  return [
    "from fastapi import FastAPI",
    "",
    "app = FastAPI(title=" + JSON.stringify(input.name) + ")",
    "",
    "@app.get('/')",
    "def read_root():",
    "    return {",
    "        'name': " + JSON.stringify(input.name) + ",",
    "        'description': " + JSON.stringify(input.description || "") + ",",
    "        'backlog': [",
    items,
    "        ],",
    "    }",
    "",
  ].join("\n");
}

function escapeTemplateLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
