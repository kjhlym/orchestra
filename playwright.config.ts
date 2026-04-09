import fs from "fs";
import path from "path";
import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const shouldUseWebServer = process.env.PLAYWRIGHT_USE_WEBSERVER !== "0";
const defaultChromeExecutablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeExecutablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ?? (fs.existsSync(defaultChromeExecutablePath) ? defaultChromeExecutablePath : undefined);

const config = defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    ...(chromeExecutablePath
      ? {
          launchOptions: {
            executablePath: chromeExecutablePath,
          },
        }
      : {}),
  },
});

if (shouldUseWebServer) {
  config.webServer = {
    command: `node src/scripts/setup-playwright-e2e.mjs && npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/projects/new`,
    cwd: path.resolve(__dirname),
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: {
      signal: "SIGKILL",
      timeout: 0,
    },
    env: {
      ...process.env,
      DATABASE_URL: "file:../.playwright/e2e.db",
      GEMINI_API_KEY: "",
      ORCHESTRA_PROJECTS_ROOT: ".playwright/orchestra_projects",
    },
  };
}

export default config;
