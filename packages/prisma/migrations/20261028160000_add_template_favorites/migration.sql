CREATE TABLE "TemplateFavorite" (
    "userId" INTEGER NOT NULL,
    "envelopeId" TEXT NOT NULL,
    CONSTRAINT "TemplateFavorite_pkey" PRIMARY KEY ("userId", "envelopeId")
);

CREATE INDEX "TemplateFavorite_envelopeId_idx" ON "TemplateFavorite"("envelopeId");
CREATE INDEX "Envelope_userId_type_source_templateId_idx" ON "Envelope"("userId", "type", "source", "templateId");

ALTER TABLE "TemplateFavorite" ADD CONSTRAINT "TemplateFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateFavorite" ADD CONSTRAINT "TemplateFavorite_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
