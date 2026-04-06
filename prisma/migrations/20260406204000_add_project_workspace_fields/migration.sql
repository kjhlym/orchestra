-- AlterTable
ALTER TABLE "Project" ADD COLUMN "slug" TEXT;
ALTER TABLE "Project" ADD COLUMN "workspacePath" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
