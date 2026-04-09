import { spawn } from "child_process";
import { cp, mkdir, rm } from "fs/promises";
import path from "path";

const CHECK_PORT = Number(process.env.CHECK_PORT ?? 4010);
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${CHECK_PORT}`;
const READY_TIMEOUT_MS = Number(process.env.CHECK_READY_TIMEOUT_MS ?? 120000);
const ROOT_DIR = process.cwd();
const TEMP_DIR = path.join(ROOT_DIR, ".check");
const SOURCE_DB_PATH = path.join(ROOT_DIR, "prisma", "dev.db");
const TEMP_DB_PATH = path.join(TEMP_DIR, "check.db");
const TEMP_WORKSPACES_ROOT = path.join(TEMP_DIR, "orchestra_projects");
const REGRESSION_WORKSPACE = path.join(TEMP_WORKSPACES_ROOT, "운영-콘텐츠-허브-비평");
const CHECK_DATABASE_URL = "file:../.check/check.db";

async function main() {
  await prepareCheckEnvironment();

  const dev = spawn(getNpmCommand(), ["run", "dev", "--", "--port", String(CHECK_PORT)], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(CHECK_PORT),
      DATABASE_URL: CHECK_DATABASE_URL,
      ORCHESTRA_PROJECTS_ROOT: TEMP_WORKSPACES_ROOT,
      GEMINI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let ready = false;

  const stopDev = async () => {
    if (dev.exitCode !== null || dev.signalCode !== null) {
      return;
    }

    dev.kill("SIGTERM");

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (dev.exitCode === null && dev.signalCode === null) {
          dev.kill("SIGKILL");
        }
        resolve(undefined);
      }, 5000);

      dev.once("exit", () => {
        clearTimeout(timeout);
        resolve(undefined);
      });
    });
  };

  try {
    await waitForReady(dev, CHECK_PORT, READY_TIMEOUT_MS);
    ready = true;
    await runSmoke(BASE_URL, "smoke:critic");
    await runRoleRegression({
      role: "planner",
      minCount: 1,
      expectedLabel: "planner",
    });
    await runRoleRegression({
      role: "designer",
      minCount: 2,
      expectedLabel: "designer",
    });
    await runRoleRegression({
      role: "tester",
      minCount: 1,
      expectedLabel: "tester",
    });
    console.log(`check passed against ${BASE_URL}`);
  } finally {
    if (!ready && dev.exitCode === null && dev.signalCode === null) {
      console.error("dev server did not become ready before shutdown");
    }

    await stopDev();
    await rm(TEMP_DIR, { recursive: true, force: true }).catch(() => null);
  }
}

async function prepareCheckEnvironment() {
  await rm(TEMP_DIR, { recursive: true, force: true }).catch(() => null);
  await mkdir(TEMP_DIR, { recursive: true });
  await mkdir(TEMP_WORKSPACES_ROOT, { recursive: true });
  await cp(SOURCE_DB_PATH, TEMP_DB_PATH);
}

function waitForReady(dev, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      dev.stdout.off("data", onStdout);
      dev.stderr.off("data", onStderr);
      dev.off("exit", onExit);
      dev.off("error", onError);
    };

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      result();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`dev server did not become ready on port ${port}`)));
    }, timeoutMs);

    const onStdout = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      buffer += text;

      if (buffer.includes("Local:") && buffer.includes(String(port))) {
        finish(resolve);
      }
    };

    const onStderr = (chunk) => {
      process.stderr.write(chunk);
    };

    const onExit = (code, signal) => {
      finish(() =>
        reject(
          new Error(
            `dev server exited before becoming ready (${code ?? "unknown"}${signal ? `, ${signal}` : ""})`
          )
        )
      );
    };

    const onError = (error) => {
      finish(() => reject(error));
    };

    dev.stdout.on("data", onStdout);
    dev.stderr.on("data", onStderr);
    dev.once("exit", onExit);
    dev.once("error", onError);
  });
}

function runSmoke(baseUrl, scriptName) {
  return new Promise((resolve, reject) => {
    const smoke = spawn(
      getNpmCommand(),
      ["run", scriptName],
      {
        cwd: ROOT_DIR,
        env: {
          ...process.env,
          BASE_URL: baseUrl,
          DATABASE_URL: CHECK_DATABASE_URL,
          ORCHESTRA_PROJECTS_ROOT: TEMP_WORKSPACES_ROOT,
          GEMINI_API_KEY: "",
        },
        stdio: "inherit",
      }
    );

    smoke.once("error", reject);
    smoke.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(
          `critic smoke failed (${code ?? "unknown"}${signal ? `, ${signal}` : ""})`
        )
      );
    });
  });
}

function runRoleRegression({ role, minCount, expectedLabel }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "src/scripts/role-regression.mjs",
        "--workspace",
        REGRESSION_WORKSPACE,
        "--role",
        role,
        "--min-count",
        String(minCount),
        "--expected-label",
        expectedLabel,
      ],
      {
        cwd: ROOT_DIR,
        env: {
          ...process.env,
          BASE_URL,
          DATABASE_URL: CHECK_DATABASE_URL,
          ORCHESTRA_PROJECTS_ROOT: TEMP_WORKSPACES_ROOT,
          GEMINI_API_KEY: "",
        },
        stdio: "inherit",
      }
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(
          `${role} regression failed (${code ?? "unknown"}${signal ? `, ${signal}` : ""})`
        )
      );
    });
  });
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
