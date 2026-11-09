ALTER TABLE "EmailMessage"
    DROP CONSTRAINT "EmailMessage_source_check",
    ADD CONSTRAINT "EmailMessage_source_check" CHECK (
      ("ownerId" IS NULL AND "name" IS NOT NULL AND "lastSentAt" IS NULL)
      OR ("ownerId" IS NOT NULL AND "name" IS NULL)
    );
