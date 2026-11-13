ALTER TYPE "EmailDeliveryPurpose" ADD VALUE 'PREVIEW';

ALTER TABLE "EmailDeliveryAttempt"
  ALTER COLUMN "recipientId" DROP NOT NULL,
  ADD COLUMN "openedAt" TIMESTAMP(3);
