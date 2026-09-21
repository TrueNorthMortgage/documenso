-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN "scheduledSendAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Envelope_scheduledSendAt_idx" ON "Envelope"("scheduledSendAt");
