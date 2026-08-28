import { Trans } from '@lingui/react/macro';

import { Column, Img, Section, Text } from '../components';
import { TemplateDocumentImage } from './template-document-image';

export type TemplateDocumentRecipientOpenedProps = {
  documentName: string;
  recipientName: string;
  recipientEmail: string;
  assetBaseUrl: string;
};

export const TemplateDocumentRecipientOpened = ({
  documentName,
  recipientName,
  recipientEmail,
  assetBaseUrl,
}: TemplateDocumentRecipientOpenedProps) => {
  const recipientReference =
    recipientName && recipientEmail ? `${recipientName} (${recipientEmail})` : recipientName || recipientEmail;
  const mailOpenImageUrl = new URL('/static/mail-open.png', assetBaseUrl).toString();

  return (
    <>
      <TemplateDocumentImage className="mt-6" assetBaseUrl={assetBaseUrl} />

      <Section>
        <Section className="mb-4">
          <Column align="center">
            <Text className="font-semibold text-[#E3712E] text-base">
              <Img src={mailOpenImageUrl} className="-mt-0.5 mr-2 inline h-7 w-7 align-middle" />
              <Trans>Opened</Trans>
            </Text>
          </Column>
        </Section>

        <Text className="mb-0 text-center font-semibold text-lg text-primary">
          <Trans>
            {recipientReference} has opened "{documentName}"
          </Trans>
        </Text>

        <Text className="mx-auto mt-1 mb-6 max-w-[80%] text-center text-base text-slate-400">
          <Trans>{recipientReference} has opened the document for the first time.</Trans>
        </Text>
      </Section>
    </>
  );
};

export default TemplateDocumentRecipientOpened;
