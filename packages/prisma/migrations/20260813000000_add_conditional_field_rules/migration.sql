-- CreateEnum
CREATE TYPE "ConditionalFieldRuleOperator" AS ENUM ('EQUALS', 'ANY_TEXT');

-- CreateTable
CREATE TABLE "ConditionalFieldRule" (
    "id" SERIAL NOT NULL,
    "childFieldId" INTEGER NOT NULL,
    "parentFieldId" INTEGER NOT NULL,
    "operator" "ConditionalFieldRuleOperator" NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConditionalFieldRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConditionalFieldRule_childFieldId_key" ON "ConditionalFieldRule"("childFieldId");

-- CreateIndex
CREATE INDEX "ConditionalFieldRule_parentFieldId_idx" ON "ConditionalFieldRule"("parentFieldId");

-- AddForeignKey
ALTER TABLE "ConditionalFieldRule" ADD CONSTRAINT "ConditionalFieldRule_childFieldId_fkey" FOREIGN KEY ("childFieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionalFieldRule" ADD CONSTRAINT "ConditionalFieldRule_parentFieldId_fkey" FOREIGN KEY ("parentFieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
