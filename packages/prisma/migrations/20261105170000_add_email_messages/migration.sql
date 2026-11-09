CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "name" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailMessage_source_check" CHECK (
      ("ownerId" IS NULL AND "name" IS NOT NULL AND "lastSentAt" IS NULL)
      OR ("ownerId" IS NOT NULL AND "name" IS NULL AND "lastSentAt" IS NOT NULL)
    )
);

CREATE TABLE "EmailMessageFavorite" (
    "userId" INTEGER NOT NULL,
    "messageId" TEXT NOT NULL,
    CONSTRAINT "EmailMessageFavorite_pkey" PRIMARY KEY ("userId", "messageId")
);

CREATE INDEX "EmailMessage_teamId_ownerId_lastSentAt_idx" ON "EmailMessage"("teamId", "ownerId", "lastSentAt");
CREATE INDEX "EmailMessageFavorite_messageId_idx" ON "EmailMessageFavorite"("messageId");
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessageFavorite" ADD CONSTRAINT "EmailMessageFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessageFavorite" ADD CONSTRAINT "EmailMessageFavorite_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
