ALTER TABLE "EnvelopePreview" ADD COLUMN "activatedAt" TIMESTAMP(3);

UPDATE "EnvelopePreview" SET "activatedAt" = "sentAt" WHERE "sentAt" IS NOT NULL;
