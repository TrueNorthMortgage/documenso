import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mailer } from '@documenso/email/mailer';
import { DocumentPreviewEmailTemplate } from '@documenso/email/templates/document-preview';
import { prisma } from '@documenso/prisma';
import {
  DocumentStatus,
  type EmailDeliveryAttempt,
  EmailDeliveryPurpose,
  EmailDeliveryStatus,
  EnvelopeType,
  type Prisma,
} from '@prisma/client';
import { msg } from '@lingui/core/macro';
import { createElement } from 'react';

import { getI18nInstance } from '../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../constants/app';
import { DOCUMENSO_ENCRYPTION_SECONDARY_KEY } from '../../constants/crypto';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { ZDocumentAuthOptionsSchema, ZRecipientAuthOptionsSchema } from '../../types/document-auth';
import { parseEnvelopeShapes } from '../../types/envelope-shape';
import type { RequestMetadata } from '../../universal/extract-request-metadata';
import { getFileServerSide } from '../../universal/upload/get-file.server';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { renderEmailWithI18N } from '../../utils/render-email-with-i18n';
import { pdfToImages } from '../ai/pdf-to-images';
import { applyEmailDeliveryStatus, withEmailDeliveryTransaction } from '../email/email-delivery';
import { getEmailContext } from '../email/get-email-context';
import { getPostmarkDeliveryHeaders, getPostmarkDeliveryScope } from '../email/postmark-config';
import { generatePartialSignedPdf } from '../pdf/generate-partial-signed-pdf';
import { getEnvelopeWhereInput } from './get-envelope-by-id';

export const MAX_PREVIEW_PAGES = 50;
const MAX_PREVIEW_BYTES = 30 * 1024 * 1024;
const MAX_PREVIEW_DIMENSION = 1800;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const getPreviewToken = (previewId: string) => {
  if (!DOCUMENSO_ENCRYPTION_SECONDARY_KEY) {
    throw new AppError(AppErrorCode.NOT_SETUP, { userMessage: 'Preview links are unavailable.' });
  }

  return createHmac('sha256', DOCUMENSO_ENCRYPTION_SECONDARY_KEY).update(`envelope-preview:${previewId}`).digest('hex');
};

const getPreviewUrl = (token: string) => new URL(`/preview/${token}`, NEXT_PUBLIC_WEBAPP_URL()).href;

const previewEnvelopePhase = (correctionStartedAt: Date | null) => ({
  type: EnvelopeType.DOCUMENT,
  deletedAt: null,
  status: correctionStartedAt ? DocumentStatus.PENDING : DocumentStatus.DRAFT,
  correctionStartedAt,
});

const previewSourceSelect = {
  id: true,
  title: true,
  correctionStartedAt: true,
  envelopeItems: {
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, documentDataId: true, shapes: true },
  },
} satisfies Prisma.EnvelopeSelect;

const previewAuthSelect = {
  authOptions: true,
  recipients: { select: { authOptions: true } },
} satisfies Prisma.EnvelopeSelect;

type PreviewSource = Prisma.EnvelopeGetPayload<{ select: typeof previewSourceSelect }>;
type PreviewOwner = { envelopeId: string; teamId: number; userId: number };
type PreviewActor = { id: number; email: string; name: string | null };

const isSamePhase = (left: Date | null, right: Date | null) => left?.getTime() === right?.getTime();
const getRevisionHash = ({ title, envelopeItems }: PreviewSource) =>
  hashToken(JSON.stringify({ title, envelopeItems }));

const isAuthOptionsObjectOrNull = (value: unknown) =>
  value === null || (typeof value === 'object' && !Array.isArray(value));

const canAccessPreviewWithoutVerification = ({
  authOptions,
  recipients,
}: Prisma.EnvelopeGetPayload<{ select: typeof previewAuthSelect }>) => {
  if (!isAuthOptionsObjectOrNull(authOptions)) {
    return false;
  }

  const documentAuth = ZDocumentAuthOptionsSchema.safeParse(authOptions);

  return (
    documentAuth.success &&
    documentAuth.data.globalAccessAuth.length === 0 &&
    recipients.every((recipient) => {
      const recipientAuth = ZRecipientAuthOptionsSchema.safeParse(recipient.authOptions);
      return (
        isAuthOptionsObjectOrNull(recipient.authOptions) &&
        recipientAuth.success &&
        recipientAuth.data.accessAuth.length === 0
      );
    })
  );
};

const getShareableEnvelopeWhere = async ({ envelopeId, teamId, userId }: PreviewOwner) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id: { type: 'envelopeId', id: envelopeId },
    teamId,
    userId,
    type: EnvelopeType.DOCUMENT,
  });

  return {
    ...envelopeWhereInput,
    deletedAt: null,
    AND: [
      {
        OR: [
          { status: DocumentStatus.DRAFT, correctionStartedAt: null },
          { status: DocumentStatus.PENDING, correctionStartedAt: { not: null } },
        ],
      },
    ],
  } satisfies Prisma.EnvelopeWhereUniqueInput;
};

const getActivePreviewWhere = async (token: string) => {
  const where = { tokenHash: hashToken(token), activatedAt: { not: null } };
  const preview = await prisma.envelopePreview.findUnique({
    where,
    select: {
      id: true,
      envelopeId: true,
      correctionStartedAt: true,
      revisionHash: true,
      envelope: { select: previewAuthSelect },
    },
  });

  if (!preview || !canAccessPreviewWithoutVerification(preview.envelope)) {
    return null;
  }

  const phase = previewEnvelopePhase(preview.correctionStartedAt);
  return { preview, phase, where: { ...where, correctionStartedAt: preview.correctionStartedAt, envelope: phase } };
};

export const getSharedEnvelopePreview = async (options: PreviewOwner) => {
  const where = await getShareableEnvelopeWhere(options);
  const envelope = await prisma.envelope.findFirst({
    where,
    select: { id: true, correctionStartedAt: true, ...previewAuthSelect },
  });

  if (!envelope || !canAccessPreviewWithoutVerification(envelope)) {
    return null;
  }

  const preview = await prisma.envelopePreview.findUnique({
    where: { envelopeId: envelope.id, sentAt: { not: null } },
    select: { id: true, tokenHash: true, correctionStartedAt: true },
  });

  if (!preview) {
    return null;
  }

  const token = getPreviewToken(preview.id);

  return {
    previewUrl: hashToken(token) === preview.tokenHash ? getPreviewUrl(token) : null,
    isActive: isSamePhase(preview.correctionStartedAt, envelope.correctionStartedAt),
  };
};

const refreshPreviewPages = async (preview: { id: string; revisionHash: string | null }, source: PreviewSource) => {
  const revisionHash = getRevisionHash(source);

  if (preview.revisionHash === revisionHash) {
    return revisionHash;
  }

  const pages: Prisma.EnvelopePreviewPageCreateWithoutPreviewInput[] = [];
  let totalBytes = 0;

  for (const item of source.envelopeItems) {
    const documentData = await prisma.documentData.findUniqueOrThrow({ where: { id: item.documentDataId } });
    const original = await getFileServerSide(documentData);
    const shapes = parseEnvelopeShapes(item.shapes);
    const data = shapes.length ? await generatePartialSignedPdf({ pdfData: original, fields: [], shapes }) : original;
    const images = await pdfToImages(new Uint8Array(data), {
      maxPages: MAX_PREVIEW_PAGES - pages.length,
      maxDimension: MAX_PREVIEW_DIMENSION,
    });

    for (const page of images) {
      totalBytes += page.image.byteLength;

      if (totalBytes > MAX_PREVIEW_BYTES) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, { userMessage: 'The rendered preview is too large.' });
      }

      pages.push({
        position: pages.length + 1,
        title: item.title,
        number: page.pageNumber,
        width: page.width,
        height: page.height,
        image: new Uint8Array(page.image),
      });
    }
  }

  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Envelope" WHERE id = ${source.id} FOR UPDATE`;
    const current = await tx.envelope.findUnique({
      where: { id: source.id, ...previewEnvelopePhase(source.correctionStartedAt) },
      select: previewSourceSelect,
    });

    if (!current || getRevisionHash(current) !== revisionHash) {
      return null;
    }

    const cached = await tx.envelopePreview.findUniqueOrThrow({
      where: { id: preview.id },
      select: { revisionHash: true },
    });

    if (cached.revisionHash !== revisionHash) {
      await tx.envelopePreviewPage.deleteMany({ where: { previewId: preview.id } });
      await tx.envelopePreviewPage.createMany({ data: pages.map((page) => ({ ...page, previewId: preview.id })) });
      await tx.envelopePreview.update({ where: { id: preview.id }, data: { revisionHash, title: source.title } });
    }

    return revisionHash;
  });
};

export const sendEnvelopePreview = async ({
  envelopeId,
  teamId,
  user,
  emails,
  subject,
  message,
  requestMetadata,
}: Omit<PreviewOwner, 'userId'> & {
  user: PreviewActor;
  emails: string[];
  subject?: string;
  message?: string;
  requestMetadata: RequestMetadata;
}) => {
  const where = await getShareableEnvelopeWhere({ envelopeId, teamId, userId: user.id });
  const envelope = await prisma.envelope.findFirst({
    where,
    select: {
      ...previewSourceSelect,
      teamId: true,
      ...previewAuthSelect,
      documentMeta: { select: { emailId: true, emailReplyTo: true, language: true } },
    },
  });

  if (!envelope || envelope.envelopeItems.length === 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      userMessage: 'Select a draft or an envelope being corrected with at least one document.',
    });
  }

  if (!canAccessPreviewWithoutVerification(envelope)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      userMessage: 'Preview links are unavailable when recipient access verification is required.',
    });
  }

  let preview = await prisma.envelopePreview.findUnique({ where: { envelopeId } });

  if (!preview) {
    const id = randomBytes(24).toString('hex');
    await prisma.envelopePreview.createMany({
      data: [{ id, envelopeId, title: envelope.title, tokenHash: hashToken(getPreviewToken(id)) }],
      skipDuplicates: true,
    });
    preview = await prisma.envelopePreview.findUniqueOrThrow({ where: { envelopeId } });
  }

  if (!(await refreshPreviewPages(preview, envelope))) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, { userMessage: 'The envelope changed. Try sending again.' });
  }

  const previewId = preview.id;
  const token = getPreviewToken(previewId);
  const tokenHash = hashToken(token);
  const previewUrl = getPreviewUrl(token);
  const { branding, emailLanguage, senderEmail, replyToEmail, settings } = await getEmailContext({
    emailType: 'RECIPIENT',
    source: { type: 'team', teamId: envelope.teamId },
    meta: envelope.documentMeta,
  });
  const i18n = await getI18nInstance(emailLanguage);
  const baseUrl = NEXT_PUBLIC_WEBAPP_URL();
  const previewTitle = envelope.title;
  const providerScope = getPostmarkDeliveryScope();

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Envelope" WHERE id = ${envelopeId} FOR UPDATE`;
    const current = await tx.envelopePreview.findUnique({
      where: { id: previewId, envelope: previewEnvelopePhase(envelope.correctionStartedAt) },
      select: { correctionStartedAt: true, openedAt: true, envelope: { select: previewAuthSelect } },
    });

    if (!current || !canAccessPreviewWithoutVerification(current.envelope)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { userMessage: 'The envelope changed. Try sending again.' });
    }

    await tx.envelopePreview.update({
      where: { id: previewId },
      data: {
        tokenHash,
        activatedAt: new Date(),
        correctionStartedAt: envelope.correctionStartedAt,
        openedAt: isSamePhase(current.correctionStartedAt, envelope.correctionStartedAt) ? current.openedAt : null,
      },
    });
  });

  const failedEmails: string[] = [];
  let hasSentEmail = false;

  for (const email of emails) {
    const attemptId = randomUUID();
    const emailUrl = new URL(previewUrl);
    emailUrl.searchParams.set('email', attemptId);
    const template = createElement(DocumentPreviewEmailTemplate, {
      title: previewTitle,
      senderName: settings.includeSenderDetails ? user.name || senderEmail.name : senderEmail.name,
      assetBaseUrl: baseUrl,
      previewUrl: emailUrl.href,
      message,
    });

    let html: string;
    let text: string;
    let attempt: EmailDeliveryAttempt;

    try {
      [html, text] = await Promise.all([
        renderEmailWithI18N(template, { lang: emailLanguage, branding }),
        renderEmailWithI18N(template, { lang: emailLanguage, branding, plainText: true }),
      ]);
      attempt = await prisma.emailDeliveryAttempt.create({
        data: {
          id: attemptId,
          operationKey: attemptId,
          envelopeId,
          recipientEmail: email,
          purpose: EmailDeliveryPurpose.PREVIEW,
          provider: providerScope ? 'POSTMARK' : 'SMTP',
          providerScope: providerScope ?? '',
          messageStream: 'outbound',
        },
      });
    } catch (error) {
      console.error('Could not prepare preview email', { envelopeId, attemptId, error });
      failedEmails.push(email);
      continue;
    }

    try {
      await mailer.sendMail({
        to: [{ name: '', address: email }],
        from: senderEmail,
        replyTo: replyToEmail,
        subject: subject || i18n._(msg`Preview: ${previewTitle}`),
        html,
        text,
        headers: providerScope ? getPostmarkDeliveryHeaders(attempt) : undefined,
      });
    } catch {
      failedEmails.push(email);
      try {
        await withEmailDeliveryTransaction(async (tx) => {
          const currentAttempt = await tx.emailDeliveryAttempt.findUnique({ where: { id: attempt.id } });

          if (currentAttempt) {
            await applyEmailDeliveryStatus(tx, currentAttempt, {
              status: EmailDeliveryStatus.SEND_FAILED,
              occurredAt: new Date(),
              failureCode: 'SMTP_SEND_FAILED',
            });
          }
        });
      } catch (error) {
        console.error('Could not record preview email failure', { envelopeId, attemptId, error });
      }
      continue;
    }

    hasSentEmail = true;

    try {
      await withEmailDeliveryTransaction(async (tx) => {
        const sentAt = new Date();
        const attempt = await tx.emailDeliveryAttempt.update({ where: { id: attemptId }, data: { sentAt } });
        await applyEmailDeliveryStatus(tx, attempt, {
          status: EmailDeliveryStatus.ACCEPTED,
          occurredAt: sentAt,
          failureCode: null,
        });
        await tx.envelopePreview.update({ where: { id: previewId }, data: { sentAt } });
        await tx.documentAuditLog.create({
          data: createDocumentAuditLogData({
            envelopeId,
            type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_SENT,
            data: { recipientEmail: email },
            user,
            requestMetadata,
          }),
        });
      });
    } catch (error) {
      console.error('Could not record preview email delivery', { envelopeId, error });
    }
  }

  return { failedEmails, sharedPreview: hasSentEmail ? { previewUrl, isActive: true } : null };
};

export const getEnvelopePreview = async (token: string) => {
  const active = await getActivePreviewWhere(token);

  if (!active) {
    return null;
  }

  const source = await prisma.envelope.findUnique({
    where: { id: active.preview.envelopeId, ...active.phase },
    select: previewSourceSelect,
  });

  if (!source || source.envelopeItems.length === 0) {
    return null;
  }

  const revisionHash = await refreshPreviewPages(active.preview, source);

  if (!revisionHash) {
    return null;
  }

  const preview = await prisma.envelopePreview.findUnique({
    where: { ...active.where, revisionHash },
    select: {
      title: true,
      revisionHash: true,
      envelope: { select: previewAuthSelect },
      pages: {
        orderBy: { position: 'asc' },
        select: { position: true, title: true, number: true, width: true, height: true },
      },
    },
  });

  if (!preview || !canAccessPreviewWithoutVerification(preview.envelope)) {
    return null;
  }

  return { title: preview.title, revisionHash: preview.revisionHash, pages: preview.pages };
};

export const getEnvelopePreviewPage = async (
  token: string,
  position: number,
  revisionHash: string,
  requestMetadata: RequestMetadata,
  emailAttemptId?: string,
) => {
  const active = await getActivePreviewWhere(token);

  if (!active) {
    return null;
  }

  const where = { ...active.where, revisionHash };
  const preview = await prisma.envelopePreview.findUnique({
    where,
    select: {
      envelopeId: true,
      openedAt: true,
      envelope: { select: previewAuthSelect },
      pages: { where: { position }, select: { image: true } },
    },
  });
  const page = preview?.pages[0];

  if (!preview || !page || !canAccessPreviewWithoutVerification(preview.envelope)) {
    return null;
  }

  if (emailAttemptId) {
    await prisma.$transaction(async (tx) => {
      const attemptWhere = {
        id: emailAttemptId,
        envelopeId: preview.envelopeId,
        purpose: EmailDeliveryPurpose.PREVIEW,
        openedAt: null,
        status: { not: EmailDeliveryStatus.SEND_FAILED },
      } satisfies Prisma.EmailDeliveryAttemptWhereInput;
      const attempt = await tx.emailDeliveryAttempt.findUnique({
        where: attemptWhere,
        select: { recipientEmail: true },
      });

      if (!attempt) {
        return;
      }

      // PostgreSQL rechecks openedAt after a concurrent update commits.
      const { count } = await tx.emailDeliveryAttempt.updateMany({
        where: attemptWhere,
        data: { openedAt: new Date() },
      });

      if (count === 1) {
        await tx.documentAuditLog.create({
          data: createDocumentAuditLogData({
            envelopeId: preview.envelopeId,
            type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED,
            data: { recipientEmail: attempt.recipientEmail, attemptId: emailAttemptId },
            requestMetadata,
          }),
        });
      }
    });
  } else if (!preview.openedAt) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.envelopePreview.updateMany({
        where: { ...where, openedAt: null },
        data: { openedAt: new Date() },
      });

      if (count === 1) {
        await tx.documentAuditLog.create({
          data: createDocumentAuditLogData({
            envelopeId: preview.envelopeId,
            type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED,
            data: {},
            requestMetadata,
          }),
        });
      }
    });
  }

  return page.image;
};
