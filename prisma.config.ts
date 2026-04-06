// Prisma가 생성한 설정 파일입니다.
// 필요한 패키지: npm install --save-dev prisma dotenv
import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl!,
  },
});
