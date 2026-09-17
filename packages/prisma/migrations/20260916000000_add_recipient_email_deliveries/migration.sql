CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'COMPLAINED');
CREATE TYPE "EmailDeliveryType" AS ENUM ('SIGNING_REQUEST', 'REMINDER');

CREATE TABLE "RecipientEmailDelivery" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "type" "EmailDeliveryType" NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'postmark',
    "providerMessageId" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "failureType" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,

    CONSTRAINT "RecipientEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecipientEmailDelivery_recipientId_attemptedAt_idx" ON "RecipientEmailDelivery"("recipientId", "attemptedAt");
CREATE INDEX "RecipientEmailDelivery_envelopeId_idx" ON "RecipientEmailDelivery"("envelopeId");
CREATE INDEX "RecipientEmailDelivery_providerMessageId_idx" ON "RecipientEmailDelivery"("providerMessageId");

ALTER TABLE "RecipientEmailDelivery" ADD CONSTRAINT "RecipientEmailDelivery_envelopeId_fkey"
FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecipientEmailDelivery" ADD CONSTRAINT "RecipientEmailDelivery_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
