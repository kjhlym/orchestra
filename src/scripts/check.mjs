import { spawn } from "child_process";

const CHECK_PORT = Number(process.env.CHECK_PORT ?? 4010);
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${CHECK_PORT}`;
const READY_TIMEOUT_MS = Number(process.env.CHECK_READY_TIMEOUT_MS ?? 120000);

async function main() {
  const dev = spawn(getNpmCommand(), ["run", "dev", "--", "--port", String(CHECK_PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(CHECK_PORT),
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
    await runNpmScript("smoke:planner");
    await runNpmScript("smoke:designer");
    await runNpmScript("smoke:tester");
    console.log(`check passed against ${BASE_URL}`);
  } finally {
    if (!ready && dev.exitCode === null && dev.signalCode === null) {
      console.error("dev server did not become ready before shutdown");
    }

    await stopDev();
  }
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
        cwd: process.cwd(),
        env: {
          ...process.env,
          BASE_URL: baseUrl,
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

function runNpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(getNpmCommand(), ["run", scriptName], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(`${scriptName} failed (${code ?? "unknown"}${signal ? `, ${signal}` : ""})`)
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
