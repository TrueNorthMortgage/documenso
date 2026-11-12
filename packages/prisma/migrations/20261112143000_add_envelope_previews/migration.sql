CREATE TABLE "EnvelopePreview" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "correctionStartedAt" TIMESTAMP(3),
    "revisionHash" TEXT,
    CONSTRAINT "EnvelopePreview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnvelopePreviewPage" (
    "previewId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "image" BYTEA NOT NULL,
    CONSTRAINT "EnvelopePreviewPage_pkey" PRIMARY KEY ("previewId", "position")
);

CREATE UNIQUE INDEX "EnvelopePreview_envelopeId_key" ON "EnvelopePreview"("envelopeId");
CREATE UNIQUE INDEX "EnvelopePreview_tokenHash_key" ON "EnvelopePreview"("tokenHash");

ALTER TABLE "EnvelopePreview" ADD CONSTRAINT "EnvelopePreview_envelopeId_fkey"
    FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopePreviewPage" ADD CONSTRAINT "EnvelopePreviewPage_previewId_fkey"
    FOREIGN KEY ("previewId") REFERENCES "EnvelopePreview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
