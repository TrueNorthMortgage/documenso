-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DELIVERED', 'DELAYED', 'BOUNCED', 'BLOCKED', 'SPAM_COMPLAINT', 'SEND_FAILED');

-- CreateEnum
CREATE TYPE "EmailDeliveryPurpose" AS ENUM ('INVITATION', 'CORRECTION', 'RESEND', 'REMINDER');

-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN     "emailDeliveryEmail" VARCHAR(255),
ADD COLUMN     "emailDeliveryStatus" "EmailDeliveryStatus",
ADD COLUMN     "latestEmailDeliveryAttemptId" TEXT;

-- CreateTable
CREATE TABLE "EmailDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "recipientEmail" VARCHAR(255) NOT NULL,
    "purpose" "EmailDeliveryPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerScope" TEXT NOT NULL,
    "messageStream" TEXT NOT NULL,
    "providerServerId" INTEGER,
    "providerMessageId" TEXT,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureCode" TEXT,

    CONSTRAINT "EmailDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDeliveryEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "attemptId" TEXT,
    "provider" TEXT NOT NULL,
    "providerScope" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureCode" TEXT,
    "outcome" TEXT NOT NULL,

    CONSTRAINT "EmailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDeliveryAttempt_operationKey_key" ON "EmailDeliveryAttempt"("operationKey");

-- CreateIndex
CREATE INDEX "EmailDeliveryAttempt_envelopeId_idx" ON "EmailDeliveryAttempt"("envelopeId");

-- CreateIndex
CREATE INDEX "EmailDeliveryAttempt_recipientId_requestedAt_idx" ON "EmailDeliveryAttempt"("recipientId", "requestedAt");

-- CreateIndex
CREATE INDEX "EmailDeliveryAttempt_provider_providerScope_providerMessage_idx" ON "EmailDeliveryAttempt"("provider", "providerScope", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDeliveryEvent_eventKey_key" ON "EmailDeliveryEvent"("eventKey");

-- CreateIndex
CREATE INDEX "EmailDeliveryEvent_attemptId_idx" ON "EmailDeliveryEvent"("attemptId");

-- CreateIndex
CREATE INDEX "EmailDeliveryEvent_provider_providerScope_providerMessageId_idx" ON "EmailDeliveryEvent"("provider", "providerScope", "providerMessageId");

-- CreateIndex
CREATE INDEX "EmailDeliveryEvent_receivedAt_idx" ON "EmailDeliveryEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_latestEmailDeliveryAttemptId_key" ON "Recipient"("latestEmailDeliveryAttemptId");

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_latestEmailDeliveryAttemptId_fkey" FOREIGN KEY ("latestEmailDeliveryAttemptId") REFERENCES "EmailDeliveryAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDeliveryAttempt" ADD CONSTRAINT "EmailDeliveryAttempt_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDeliveryAttempt" ADD CONSTRAINT "EmailDeliveryAttempt_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDeliveryEvent" ADD CONSTRAINT "EmailDeliveryEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "EmailDeliveryAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

