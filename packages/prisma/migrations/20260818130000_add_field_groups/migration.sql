-- CreateTable
CREATE TABLE "FieldGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "fontSize" INTEGER,
    "direction" TEXT,
    "validationRule" TEXT,
    "validationLength" INTEGER,
    "envelopeId" TEXT NOT NULL,
    "envelopeItemId" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Field" ADD COLUMN "fieldGroupId" TEXT;

-- CreateIndex
CREATE INDEX "FieldGroup_envelopeId_idx" ON "FieldGroup"("envelopeId");
CREATE INDEX "FieldGroup_envelopeItemId_idx" ON "FieldGroup"("envelopeItemId");
CREATE INDEX "FieldGroup_recipientId_idx" ON "FieldGroup"("recipientId");
CREATE INDEX "Field_fieldGroupId_idx" ON "Field"("fieldGroupId");

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_fieldGroupId_fkey" FOREIGN KEY ("fieldGroupId") REFERENCES "FieldGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldGroup" ADD CONSTRAINT "FieldGroup_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldGroup" ADD CONSTRAINT "FieldGroup_envelopeItemId_fkey" FOREIGN KEY ("envelopeItemId") REFERENCES "EnvelopeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldGroup" ADD CONSTRAINT "FieldGroup_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
