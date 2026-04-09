export const LOCAL_SQLITE_DATABASE_URL = "file:./dev.db";

export function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isDeploymentBuild =
    process.env.CI === "true" || Boolean(process.env.VERCEL);

  if (databaseUrl) {
    return databaseUrl;
  }

  if (!isDeploymentBuild) {
    return LOCAL_SQLITE_DATABASE_URL;
  }

  throw new Error("DATABASE_URL 환경 변수가 배포/CI 환경에서 필요합니다.");
}
