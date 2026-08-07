-- CreateEnum
CREATE TYPE "PendingPreparationStatus" AS ENUM ('PENDING', 'COMMITTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PendingPreparation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PendingPreparationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedEnvelopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingPreparation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingPreparationDocumentData" (
    "id" TEXT NOT NULL,
    "pendingPreparationId" TEXT NOT NULL,
    "documentDataId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "fileMetadata" JSONB NOT NULL,

    CONSTRAINT "PendingPreparationDocumentData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingPreparation_teamId_actorEmail_status_idx" ON "PendingPreparation"("teamId", "actorEmail", "status");

-- CreateIndex
CREATE INDEX "PendingPreparation_expiresAt_status_idx" ON "PendingPreparation"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "PendingPreparationDocumentData_documentDataId_idx" ON "PendingPreparationDocumentData"("documentDataId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPreparationDocumentData_pendingPreparationId_order_key" ON "PendingPreparationDocumentData"("pendingPreparationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPreparationDocumentData_pendingPreparationId_documen_key" ON "PendingPreparationDocumentData"("pendingPreparationId", "documentDataId");

-- AddForeignKey
ALTER TABLE "PendingPreparation" ADD CONSTRAINT "PendingPreparation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPreparationDocumentData" ADD CONSTRAINT "PendingPreparationDocumentData_pendingPreparationId_fkey" FOREIGN KEY ("pendingPreparationId") REFERENCES "PendingPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPreparationDocumentData" ADD CONSTRAINT "PendingPreparationDocumentData_documentDataId_fkey" FOREIGN KEY ("documentDataId") REFERENCES "DocumentData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
