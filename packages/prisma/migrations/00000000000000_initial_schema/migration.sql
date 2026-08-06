CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('DOCUMENSO', 'GOOGLE', 'OIDC');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserSecurityAuditLogType" AS ENUM ('ACCOUNT_PROFILE_UPDATE', 'ACCOUNT_SSO_LINK', 'ACCOUNT_SSO_UNLINK', 'ORGANISATION_SSO_LINK', 'ORGANISATION_SSO_UNLINK', 'AUTH_2FA_DISABLE', 'AUTH_2FA_ENABLE', 'PASSKEY_CREATED', 'PASSKEY_DELETED', 'PASSKEY_UPDATED', 'PASSWORD_RESET', 'PASSWORD_UPDATE', 'SESSION_REVOKED', 'SIGN_OUT', 'SIGN_IN', 'SIGN_IN_FAIL', 'SIGN_IN_2FA_FAIL', 'SIGN_IN_PASSKEY_FAIL');

-- CreateEnum
CREATE TYPE "WebhookTriggerEvents" AS ENUM ('DOCUMENT_CREATED', 'DOCUMENT_SENT', 'DOCUMENT_OPENED', 'DOCUMENT_SIGNED', 'DOCUMENT_COMPLETED', 'DOCUMENT_REJECTED', 'DOCUMENT_CANCELLED', 'RECIPIENT_EXPIRED', 'DOCUMENT_RECIPIENT_COMPLETED', 'DOCUMENT_REMINDER_SENT', 'TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_DELETED', 'TEMPLATE_USED');

-- CreateEnum
CREATE TYPE "WebhookCallStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ApiTokenAlgorithm" AS ENUM ('SHA512');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('DOCUMENT', 'TEMPLATE', 'TEMPLATE_DIRECT_LINK');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('EVERYONE', 'MANAGER_AND_ABOVE', 'ADMIN');

-- CreateEnum
CREATE TYPE "FolderType" AS ENUM ('DOCUMENT', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "EnvelopeType" AS ENUM ('DOCUMENT', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "PendingPreparationStatus" AS ENUM ('PENDING', 'COMMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocumentDataType" AS ENUM ('S3_PATH', 'BYTES', 'BYTES_64');

-- CreateEnum
CREATE TYPE "DocumentSigningOrder" AS ENUM ('PARALLEL', 'SEQUENTIAL');

-- CreateEnum
CREATE TYPE "DocumentDistributionMethod" AS ENUM ('EMAIL', 'NONE');

-- CreateEnum
CREATE TYPE "ReadStatus" AS ENUM ('NOT_OPENED', 'OPENED');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('NOT_SENT', 'SENT');

-- CreateEnum
CREATE TYPE "SigningStatus" AS ENUM ('NOT_SIGNED', 'SIGNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecipientRole" AS ENUM ('CC', 'SIGNER', 'VIEWER', 'APPROVER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('SIGNATURE', 'FREE_SIGNATURE', 'INITIALS', 'NAME', 'EMAIL', 'DATE', 'TEXT', 'NUMBER', 'RADIO', 'CHECKBOX', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "OrganisationType" AS ENUM ('PERSONAL', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "OrganisationGroupType" AS ENUM ('INTERNAL_ORGANISATION', 'INTERNAL_TEAM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OrganisationMemberRole" AS ENUM ('ADMIN', 'MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('ADMIN', 'MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "OrganisationMemberInviteStatus" AS ENUM ('ACCEPTED', 'PENDING', 'DECLINED');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('PUBLIC', 'PRIVATE', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BackgroundJobTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailDomainStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "source" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSignedIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roles" "Role"[] DEFAULT ARRAY['USER']::"Role"[],
    "identityProvider" "IdentityProvider" NOT NULL DEFAULT 'DOCUMENSO',
    "avatarImageId" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorBackupCodes" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamProfile" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "teamId" INTEGER NOT NULL,
    "bio" TEXT,

    CONSTRAINT "TeamProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSecurityAuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "UserSecurityAuditLogType" NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "UserSecurityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "credentialId" BYTEA NOT NULL,
    "credentialPublicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT[],

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousVerificationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" SERIAL NOT NULL,
    "secondaryId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "eventTriggers" "WebhookTriggerEvents"[],
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookCall" (
    "id" TEXT NOT NULL,
    "status" "WebhookCallStatus" NOT NULL,
    "url" TEXT NOT NULL,
    "event" "WebhookTriggerEvents" NOT NULL,
    "requestBody" JSONB NOT NULL,
    "responseCode" INTEGER NOT NULL,
    "responseHeaders" JSONB,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "webhookId" TEXT NOT NULL,

    CONSTRAINT "WebhookCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "algorithm" "ApiTokenAlgorithm" NOT NULL DEFAULT 'SHA512',
    "expires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "teamId" INTEGER NOT NULL,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "planId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionClaim" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "teamCount" INTEGER NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "envelopeItemCount" INTEGER NOT NULL,
    "flags" JSONB NOT NULL,

    CONSTRAINT "SubscriptionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationClaim" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "originalSubscriptionClaimId" TEXT,
    "teamCount" INTEGER NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "envelopeItemCount" INTEGER NOT NULL,
    "flags" JSONB NOT NULL,

    CONSTRAINT "OrganisationClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "created_at" INTEGER,
    "ext_expires_in" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "password" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'EVERYONE',
    "type" "FolderType" NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL,
    "secondaryId" TEXT NOT NULL,
    "externalId" TEXT,
    "type" "EnvelopeType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "DocumentSource" NOT NULL,
    "qrToken" TEXT,
    "internalVersion" INTEGER NOT NULL,
    "useLegacyFieldInsertion" BOOLEAN NOT NULL DEFAULT false,
    "authOptions" JSONB,
    "formValues" JSONB,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'EVERYONE',
    "templateType" "TemplateType" NOT NULL DEFAULT 'PRIVATE',
    "publicTitle" TEXT NOT NULL DEFAULT '',
    "publicDescription" TEXT NOT NULL DEFAULT '',
    "templateId" INTEGER,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "folderId" TEXT,
    "documentMetaId" TEXT NOT NULL,

    CONSTRAINT "Envelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingPreparation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PendingPreparationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedEnvelopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingPreparation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingPreparationDocumentData" (
    "id" TEXT NOT NULL,
    "pendingPreparationId" TEXT NOT NULL,
    "documentDataId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "fileMetadata" JSONB NOT NULL,

    CONSTRAINT "PendingPreparationDocumentData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "documentDataId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,

    CONSTRAINT "EnvelopeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAuditLog" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "userId" INTEGER,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "DocumentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentData" (
    "id" TEXT NOT NULL,
    "type" "DocumentDataType" NOT NULL,
    "data" TEXT NOT NULL,
    "initialData" TEXT NOT NULL,

    CONSTRAINT "DocumentData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentMeta" (
    "id" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT,
    "timezone" TEXT DEFAULT 'Etc/UTC',
    "dateFormat" TEXT DEFAULT 'yyyy-MM-dd hh:mm a',
    "redirectUrl" TEXT,
    "signingOrder" "DocumentSigningOrder" NOT NULL DEFAULT 'PARALLEL',
    "allowDictateNextSigner" BOOLEAN NOT NULL DEFAULT false,
    "typedSignatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "uploadSignatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "drawSignatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "distributionMethod" "DocumentDistributionMethod" NOT NULL DEFAULT 'EMAIL',
    "emailSettings" JSONB,
    "emailReplyTo" TEXT,
    "emailId" TEXT,
    "envelopeExpirationPeriod" JSONB,
    "reminderSettings" JSONB,

    CONSTRAINT "DocumentMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeAttachment" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "envelopeId" TEXT NOT NULL,

    CONSTRAINT "EnvelopeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" SERIAL NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL DEFAULT '',
    "token" TEXT NOT NULL,
    "documentDeletedAt" TIMESTAMP(3),
    "expired" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "expirationNotifiedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "lastReminderSentAt" TIMESTAMP(3),
    "nextReminderAt" TIMESTAMP(3),
    "authOptions" JSONB,
    "signingOrder" INTEGER,
    "rejectionReason" TEXT,
    "role" "RecipientRole" NOT NULL DEFAULT 'SIGNER',
    "readStatus" "ReadStatus" NOT NULL DEFAULT 'NOT_OPENED',
    "signingStatus" "SigningStatus" NOT NULL DEFAULT 'NOT_SIGNED',
    "sendStatus" "SendStatus" NOT NULL DEFAULT 'NOT_SENT',

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" SERIAL NOT NULL,
    "secondaryId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "envelopeItemId" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "type" "FieldType" NOT NULL,
    "page" INTEGER NOT NULL,
    "positionX" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "positionY" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "width" DECIMAL(65,30) NOT NULL DEFAULT -1,
    "height" DECIMAL(65,30) NOT NULL DEFAULT -1,
    "customText" TEXT NOT NULL,
    "inserted" BOOLEAN NOT NULL,
    "fieldMeta" JSONB,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "signatureImageAsBase64" TEXT,
    "typedSignature" TEXT,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShareLink" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "OrganisationType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "avatarImageId" TEXT,
    "customerId" TEXT,
    "organisationClaimId" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "organisationGlobalSettingsId" TEXT NOT NULL,
    "organisationAuthenticationPortalId" TEXT NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationMember" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "OrganisationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationMemberInvite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "OrganisationMemberInviteStatus" NOT NULL DEFAULT 'PENDING',
    "organisationId" TEXT NOT NULL,
    "organisationRole" "OrganisationMemberRole" NOT NULL,

    CONSTRAINT "OrganisationMemberInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "type" "OrganisationGroupType" NOT NULL,
    "organisationRole" "OrganisationMemberRole" NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "OrganisationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "organisationMemberId" TEXT NOT NULL,

    CONSTRAINT "OrganisationGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamGroup" (
    "id" TEXT NOT NULL,
    "organisationGroupId" TEXT NOT NULL,
    "teamRole" "TeamMemberRole" NOT NULL,
    "teamId" INTEGER NOT NULL,

    CONSTRAINT "TeamGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationGlobalSettings" (
    "id" TEXT NOT NULL,
    "documentVisibility" "DocumentVisibility" NOT NULL DEFAULT 'EVERYONE',
    "documentLanguage" TEXT NOT NULL DEFAULT 'en',
    "includeSenderDetails" BOOLEAN NOT NULL DEFAULT true,
    "includeSigningCertificate" BOOLEAN NOT NULL DEFAULT true,
    "includeAuditLog" BOOLEAN NOT NULL DEFAULT false,
    "documentTimezone" TEXT,
    "documentDateFormat" TEXT NOT NULL DEFAULT 'yyyy-MM-dd hh:mm a',
    "delegateDocumentOwnership" BOOLEAN NOT NULL DEFAULT false,
    "typedSignatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "uploadSignatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "drawSignatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultRecipients" JSONB,
    "emailId" TEXT,
    "emailReplyTo" TEXT,
    "emailDocumentSettings" JSONB NOT NULL,
    "brandingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "brandingLogo" TEXT NOT NULL DEFAULT '',
    "brandingUrl" TEXT NOT NULL DEFAULT '',
    "brandingCompanyDetails" TEXT NOT NULL DEFAULT '',
    "brandingColors" JSONB,
    "brandingCss" TEXT NOT NULL DEFAULT '',
    "envelopeExpirationPeriod" JSONB,
    "reminderSettings" JSONB,
    "aiFeaturesEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrganisationGlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamGlobalSettings" (
    "id" TEXT NOT NULL,
    "documentVisibility" "DocumentVisibility",
    "documentLanguage" TEXT,
    "documentTimezone" TEXT,
    "documentDateFormat" TEXT,
    "delegateDocumentOwnership" BOOLEAN,
    "includeSenderDetails" BOOLEAN,
    "includeSigningCertificate" BOOLEAN,
    "includeAuditLog" BOOLEAN,
    "typedSignatureEnabled" BOOLEAN,
    "uploadSignatureEnabled" BOOLEAN,
    "drawSignatureEnabled" BOOLEAN,
    "defaultRecipients" JSONB,
    "emailId" TEXT,
    "emailReplyTo" TEXT,
    "emailDocumentSettings" JSONB,
    "brandingEnabled" BOOLEAN,
    "brandingLogo" TEXT,
    "brandingUrl" TEXT,
    "brandingCompanyDetails" TEXT,
    "brandingColors" JSONB,
    "brandingCss" TEXT,
    "envelopeExpirationPeriod" JSONB,
    "reminderSettings" JSONB,
    "aiFeaturesEnabled" BOOLEAN,

    CONSTRAINT "TeamGlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatarImageId" TEXT,
    "organisationId" TEXT NOT NULL,
    "teamGlobalSettingsId" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamEmail" (
    "teamId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "TeamEmail_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "TeamEmailVerification" (
    "teamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamEmailVerification_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "TemplateDirectLink" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabled" BOOLEAN NOT NULL,
    "directTemplateRecipientId" INTEGER NOT NULL,

    CONSTRAINT "TemplateDirectLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "lastModifiedByUserId" INTEGER,
    "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "retried" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "lastRetriedAt" TIMESTAMP(3),

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJobTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BackgroundJobTaskStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "retried" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "jobId" TEXT NOT NULL,

    CONSTRAINT "BackgroundJobTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarImage" (
    "id" TEXT NOT NULL,
    "bytes" TEXT NOT NULL,

    CONSTRAINT "AvatarImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDomain" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "EmailDomainStatus" NOT NULL DEFAULT 'PENDING',
    "selector" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "emailName" TEXT NOT NULL,
    "emailDomainId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "OrganisationEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationAuthenticationPortal" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "wellKnownUrl" TEXT NOT NULL DEFAULT '',
    "defaultOrganisationRole" "OrganisationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "autoProvisionUsers" BOOLEAN NOT NULL DEFAULT true,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowPersonalOrganisations" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrganisationAuthenticationPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- Initialize the counters used to generate document and template IDs.
INSERT INTO "Counter" ("id", "value") VALUES
    ('document', COALESCE((
        SELECT MAX(CAST(SPLIT_PART("secondaryId", '_', 2) AS INTEGER))
        FROM "Envelope"
        WHERE "secondaryId" ~ '^document_[0-9]+$'
    ), 0)),
    ('template', COALESCE((
        SELECT MAX(CAST(SPLIT_PART("secondaryId", '_', 2) AS INTEGER))
        FROM "Envelope"
        WHERE "secondaryId" ~ '^template_[0-9]+$'
    ), 0));

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key","action","bucket")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeamProfile_teamId_key" ON "TeamProfile"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousVerificationToken_id_key" ON "AnonymousVerificationToken"("id");

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousVerificationToken_token_key" ON "AnonymousVerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_secondaryId_key" ON "VerificationToken"("secondaryId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_token_key" ON "ApiToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_planId_key" ON "Subscription"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organisationId_key" ON "Subscription"("organisationId");

-- CreateIndex
CREATE INDEX "Subscription_organisationId_idx" ON "Subscription"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_sessionToken_idx" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Folder_userId_idx" ON "Folder"("userId");

-- CreateIndex
CREATE INDEX "Folder_teamId_idx" ON "Folder"("teamId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "Folder_type_idx" ON "Folder"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Envelope_secondaryId_key" ON "Envelope"("secondaryId");

-- CreateIndex
CREATE UNIQUE INDEX "Envelope_documentMetaId_key" ON "Envelope"("documentMetaId");

-- CreateIndex
CREATE INDEX "Envelope_type_idx" ON "Envelope"("type");

-- CreateIndex
CREATE INDEX "Envelope_status_idx" ON "Envelope"("status");

-- CreateIndex
CREATE INDEX "Envelope_userId_idx" ON "Envelope"("userId");

-- CreateIndex
CREATE INDEX "Envelope_teamId_idx" ON "Envelope"("teamId");

-- CreateIndex
CREATE INDEX "Envelope_folderId_idx" ON "Envelope"("folderId");

-- CreateIndex
CREATE INDEX "Envelope_createdAt_idx" ON "Envelope"("createdAt");

-- CreateIndex
CREATE INDEX "PendingPreparation_teamId_actorEmail_status_idx" ON "PendingPreparation"("teamId", "actorEmail", "status");

-- CreateIndex
CREATE INDEX "PendingPreparation_expiresAt_status_idx" ON "PendingPreparation"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "PendingPreparationDocumentData_documentDataId_idx" ON "PendingPreparationDocumentData"("documentDataId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPreparationDocumentData_pendingPreparationId_order_key" ON "PendingPreparationDocumentData"("pendingPreparationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPreparationDocumentData_pendingPreparationId_documen_key" ON "PendingPreparationDocumentData"("pendingPreparationId", "documentDataId");

-- CreateIndex
CREATE INDEX "EnvelopeItem_envelopeId_idx" ON "EnvelopeItem"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeItem_documentDataId_key" ON "EnvelopeItem"("documentDataId");

-- CreateIndex
CREATE INDEX "DocumentAuditLog_envelopeId_idx" ON "DocumentAuditLog"("envelopeId");

-- CreateIndex
CREATE INDEX "EnvelopeAttachment_envelopeId_idx" ON "EnvelopeAttachment"("envelopeId");

-- CreateIndex
CREATE INDEX "Recipient_token_idx" ON "Recipient"("token");

-- CreateIndex
CREATE INDEX "Recipient_email_idx" ON "Recipient"("email");

-- CreateIndex
CREATE INDEX "Recipient_envelopeId_idx" ON "Recipient"("envelopeId");

-- CreateIndex
CREATE INDEX "Recipient_signedAt_idx" ON "Recipient"("signedAt");

-- CreateIndex
CREATE INDEX "Recipient_expiresAt_idx" ON "Recipient"("expiresAt");

-- CreateIndex
CREATE INDEX "Recipient_email_documentDeletedAt_envelopeId_idx" ON "Recipient"("email", "documentDeletedAt", "envelopeId");

-- CreateIndex
CREATE INDEX "Recipient_email_envelopeId_idx" ON "Recipient"("email", "envelopeId");

-- CreateIndex
CREATE INDEX "Recipient_email_signingStatus_envelopeId_role_idx" ON "Recipient"("email", "signingStatus", "envelopeId", "role");

-- CreateIndex
CREATE INDEX "Recipient_nextReminderAt_idx" ON "Recipient"("nextReminderAt");

-- CreateIndex
CREATE INDEX "Recipient_email_trgm_idx" ON "Recipient" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Recipient_name_trgm_idx" ON "Recipient" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Field_secondaryId_key" ON "Field"("secondaryId");

-- CreateIndex
CREATE INDEX "Field_envelopeId_idx" ON "Field"("envelopeId");

-- CreateIndex
CREATE INDEX "Field_envelopeItemId_idx" ON "Field"("envelopeItemId");

-- CreateIndex
CREATE INDEX "Field_recipientId_idx" ON "Field"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_fieldId_key" ON "Signature"("fieldId");

-- CreateIndex
CREATE INDEX "Signature_recipientId_idx" ON "Signature"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareLink_slug_key" ON "DocumentShareLink"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareLink_envelopeId_email_key" ON "DocumentShareLink"("envelopeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_url_key" ON "Organisation"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_customerId_key" ON "Organisation"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_organisationClaimId_key" ON "Organisation"("organisationClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_organisationGlobalSettingsId_key" ON "Organisation"("organisationGlobalSettingsId");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_organisationAuthenticationPortalId_key" ON "Organisation"("organisationAuthenticationPortalId");

-- CreateIndex
CREATE INDEX "Organisation_name_idx" ON "Organisation"("name");

-- CreateIndex
CREATE INDEX "Organisation_ownerUserId_idx" ON "Organisation"("ownerUserId");

-- CreateIndex
CREATE INDEX "OrganisationMember_organisationId_idx" ON "OrganisationMember"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMember_userId_organisationId_key" ON "OrganisationMember"("userId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMemberInvite_token_key" ON "OrganisationMemberInvite"("token");

-- CreateIndex
CREATE INDEX "OrganisationGroup_organisationId_idx" ON "OrganisationGroup"("organisationId");

-- CreateIndex
CREATE INDEX "OrganisationGroupMember_groupId_idx" ON "OrganisationGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "OrganisationGroupMember_organisationMemberId_idx" ON "OrganisationGroupMember"("organisationMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationGroupMember_organisationMemberId_groupId_key" ON "OrganisationGroupMember"("organisationMemberId", "groupId");

-- CreateIndex
CREATE INDEX "TeamGroup_teamId_idx" ON "TeamGroup"("teamId");

-- CreateIndex
CREATE INDEX "TeamGroup_organisationGroupId_idx" ON "TeamGroup"("organisationGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamGroup_teamId_organisationGroupId_key" ON "TeamGroup"("teamId", "organisationGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_url_key" ON "Team"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Team_teamGlobalSettingsId_key" ON "Team"("teamGlobalSettingsId");

-- CreateIndex
CREATE INDEX "Team_name_idx" ON "Team"("name");

-- CreateIndex
CREATE INDEX "Team_organisationId_idx" ON "Team"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEmail_teamId_key" ON "TeamEmail"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEmail_email_key" ON "TeamEmail"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEmailVerification_teamId_key" ON "TeamEmailVerification"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEmailVerification_token_key" ON "TeamEmailVerification"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDirectLink_id_key" ON "TemplateDirectLink"("id");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDirectLink_envelopeId_key" ON "TemplateDirectLink"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDirectLink_token_key" ON "TemplateDirectLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_selector_key" ON "EmailDomain"("selector");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomain_domain_key" ON "EmailDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationEmail_email_key" ON "OrganisationEmail"("email");

-- CreateIndex
CREATE INDEX "RateLimit_createdAt_idx" ON "RateLimit"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarImageId_fkey" FOREIGN KEY ("avatarImageId") REFERENCES "AvatarImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamProfile" ADD CONSTRAINT "TeamProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSecurityAuditLog" ADD CONSTRAINT "UserSecurityAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookCall" ADD CONSTRAINT "WebhookCall_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_documentMetaId_fkey" FOREIGN KEY ("documentMetaId") REFERENCES "DocumentMeta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPreparation" ADD CONSTRAINT "PendingPreparation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPreparationDocumentData" ADD CONSTRAINT "PendingPreparationDocumentData_pendingPreparationId_fkey" FOREIGN KEY ("pendingPreparationId") REFERENCES "PendingPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingPreparationDocumentData" ADD CONSTRAINT "PendingPreparationDocumentData_documentDataId_fkey" FOREIGN KEY ("documentDataId") REFERENCES "DocumentData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeItem" ADD CONSTRAINT "EnvelopeItem_documentDataId_fkey" FOREIGN KEY ("documentDataId") REFERENCES "DocumentData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeItem" ADD CONSTRAINT "EnvelopeItem_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuditLog" ADD CONSTRAINT "DocumentAuditLog_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeAttachment" ADD CONSTRAINT "EnvelopeAttachment_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_envelopeItemId_fkey" FOREIGN KEY ("envelopeItemId") REFERENCES "EnvelopeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_organisationClaimId_fkey" FOREIGN KEY ("organisationClaimId") REFERENCES "OrganisationClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_avatarImageId_fkey" FOREIGN KEY ("avatarImageId") REFERENCES "AvatarImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_organisationGlobalSettingsId_fkey" FOREIGN KEY ("organisationGlobalSettingsId") REFERENCES "OrganisationGlobalSettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_organisationAuthenticationPortalId_fkey" FOREIGN KEY ("organisationAuthenticationPortalId") REFERENCES "OrganisationAuthenticationPortal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMember" ADD CONSTRAINT "OrganisationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMember" ADD CONSTRAINT "OrganisationMember_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMemberInvite" ADD CONSTRAINT "OrganisationMemberInvite_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationGroup" ADD CONSTRAINT "OrganisationGroup_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationGroupMember" ADD CONSTRAINT "OrganisationGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OrganisationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationGroupMember" ADD CONSTRAINT "OrganisationGroupMember_organisationMemberId_fkey" FOREIGN KEY ("organisationMemberId") REFERENCES "OrganisationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGroup" ADD CONSTRAINT "TeamGroup_organisationGroupId_fkey" FOREIGN KEY ("organisationGroupId") REFERENCES "OrganisationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGroup" ADD CONSTRAINT "TeamGroup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationGlobalSettings" ADD CONSTRAINT "OrganisationGlobalSettings_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "OrganisationEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGlobalSettings" ADD CONSTRAINT "TeamGlobalSettings_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "OrganisationEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_avatarImageId_fkey" FOREIGN KEY ("avatarImageId") REFERENCES "AvatarImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_teamGlobalSettingsId_fkey" FOREIGN KEY ("teamGlobalSettingsId") REFERENCES "TeamGlobalSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEmail" ADD CONSTRAINT "TeamEmail_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEmailVerification" ADD CONSTRAINT "TeamEmailVerification_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDirectLink" ADD CONSTRAINT "TemplateDirectLink_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_lastModifiedByUserId_fkey" FOREIGN KEY ("lastModifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJobTask" ADD CONSTRAINT "BackgroundJobTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDomain" ADD CONSTRAINT "EmailDomain_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationEmail" ADD CONSTRAINT "OrganisationEmail_emailDomainId_fkey" FOREIGN KEY ("emailDomainId") REFERENCES "EmailDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationEmail" ADD CONSTRAINT "OrganisationEmail_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
