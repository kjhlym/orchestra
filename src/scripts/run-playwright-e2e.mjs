import { spawn } from "child_process";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  const specArgs = process.argv.slice(2);

  await runNodeScript("src/scripts/setup-playwright-e2e.mjs");

  const dev = spawn(getNpmCommand(), ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: "file:../.playwright/e2e.db",
      GEMINI_API_KEY: "",
      ORCHESTRA_PROJECTS_ROOT: ".playwright/orchestra_projects",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  dev.stdout.on("data", (chunk) => process.stdout.write(chunk));
  dev.stderr.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer(baseUrl, 120_000);

    await runPlaywright(specArgs);
  } finally {
    await stopProcess(dev);
  }
}

async function runNodeScript(scriptPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${scriptPath} failed (${code ?? "unknown"}${signal ? `, ${signal}` : ""})`));
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/projects/new`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function runPlaywright(specArgs) {
  await new Promise((resolve, reject) => {
    const args = ["playwright", "test", ...specArgs];
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_USE_WEBSERVER: "0",
      },
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`playwright test failed (${code ?? "unknown"}${signal ? `, ${signal}` : ""})`));
    });
  });
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      resolve(undefined);
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
