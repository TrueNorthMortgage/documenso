-- CreateEnum
CREATE TYPE "FieldGroupType" AS ENUM ('OPTION_GROUP', 'VALIDATION_GROUP');

-- AlterTable
ALTER TABLE "FieldGroup" ADD COLUMN "groupType" "FieldGroupType" NOT NULL DEFAULT 'OPTION_GROUP';
