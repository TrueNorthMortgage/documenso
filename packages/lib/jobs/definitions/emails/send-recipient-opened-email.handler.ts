import { mailer } from '@documenso/email/mailer';
import { DocumentRecipientOpenedEmailTemplate } from '@documenso/email/templates/document-recipient-opened';
import { prisma } from '@documenso/prisma';
import { msg } from '@lingui/core/macro';
import { EnvelopeType } from '@prisma/client';
import { createElement } from 'react';

import { getI18nInstance } from '../../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import { getEmailContext } from '../../../server-only/email/get-email-context';
import { extractDerivedDocumentEmailSettings } from '../../../types/document-email';
import { isRecipientEmailValidForSending } from '../../../utils/recipients';
import { renderEmailWithI18N } from '../../../utils/render-email-with-i18n';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendRecipientOpenedEmailJobDefinition } from './send-recipient-opened-email';

export const run = async ({ payload, io }: { payload: TSendRecipientOpenedEmailJobDefinition; io: JobRunIO }) => {
  const { envelopeId, recipientId } = payload;

  const envelope = await prisma.envelope.findFirst({
    where: {
      id: envelopeId,
      type: EnvelopeType.DOCUMENT,
      recipients: {
        some: {
          id: recipientId,
        },
      },
    },
    include: {
      recipients: {
        where: {
          id: recipientId,
        },
      },
      user: {
        select: {
          email: true,
          name: true,
        },
      },
      documentMeta: true,
    },
  });

  if (!envelope) {
    throw new Error('Document not found');
  }

  const [recipient] = envelope.recipients;

  if (!recipient) {
    throw new Error('Document has no recipient');
  }

  const isRecipientOpenedEmailEnabled = extractDerivedDocumentEmailSettings(envelope.documentMeta).recipientOpened;

  if (!isRecipientOpenedEmailEnabled) {
    return;
  }

  const { email: recipientEmail, name: recipientName } = recipient;
  const { user: owner } = envelope;

  if (owner.email === recipientEmail || !isRecipientEmailValidForSending(recipient)) {
    return;
  }

  const { branding, emailLanguage, senderEmail } = await getEmailContext({
    emailType: 'INTERNAL',
    source: {
      type: 'team',
      teamId: envelope.teamId,
    },
    meta: envelope.documentMeta,
  });

  const assetBaseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';
  const recipientReference = recipientName || recipientEmail;
  const i18n = await getI18nInstance(emailLanguage);

  const template = createElement(DocumentRecipientOpenedEmailTemplate, {
    documentName: envelope.title,
    recipientName,
    recipientEmail,
    assetBaseUrl,
  });

  await io.runTask('send-recipient-opened-email', async () => {
    const [html, text] = await Promise.all([
      renderEmailWithI18N(template, { lang: emailLanguage, branding }),
      renderEmailWithI18N(template, {
        lang: emailLanguage,
        branding,
        plainText: true,
      }),
    ]);

    await mailer.sendMail({
      to: {
        name: owner.name ?? '',
        address: owner.email,
      },
      from: senderEmail,
      subject: i18n._(msg`${recipientReference} has opened "${envelope.title}"`),
      html,
      text,
    });
  });
};
