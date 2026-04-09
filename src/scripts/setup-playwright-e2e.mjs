import { cp, mkdir, rm } from "fs/promises";
import path from "path";

const rootDir = process.cwd();
const tempDir = path.join(rootDir, ".playwright");
const workspaceRoot = path.join(tempDir, "orchestra_projects");
const sourceDbPath = path.join(rootDir, "prisma", "dev.db");
const targetDbPath = path.join(tempDir, "e2e.db");

async function main() {
  await rm(tempDir, { recursive: true, force: true }).catch(() => null);
  await mkdir(workspaceRoot, { recursive: true });
  await cp(sourceDbPath, targetDbPath);
  console.log(
    JSON.stringify({
      workspaceRoot,
      database: targetDbPath,
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
