CREATE TABLE "EnvelopeActivityRead" (
    "userId" INTEGER NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvelopeActivityRead_pkey" PRIMARY KEY ("userId", "auditLogId")
);

CREATE INDEX "EnvelopeActivityRead_auditLogId_idx" ON "EnvelopeActivityRead"("auditLogId");

ALTER TABLE "EnvelopeActivityRead" ADD CONSTRAINT "EnvelopeActivityRead_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnvelopeActivityRead" ADD CONSTRAINT "EnvelopeActivityRead_auditLogId_fkey"
    FOREIGN KEY ("auditLogId") REFERENCES "DocumentAuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
