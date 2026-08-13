-- AlterTable
ALTER TABLE "Field" ADD COLUMN "templateSourceItemId" TEXT;

-- CreateIndex
CREATE INDEX "Field_templateSourceItemId_idx" ON "Field"("templateSourceItemId");
