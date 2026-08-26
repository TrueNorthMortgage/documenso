import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

import { Body, Container, Head, Html, Preview, Section } from '../components';
import { TemplateBrandLogo, TemplateBrandLogoStyles } from '../template-components/template-brand-logo';
import { TemplateDocumentRecipientOpened } from '../template-components/template-document-recipient-opened';
import { TemplateFooter } from '../template-components/template-footer';

export type DocumentRecipientOpenedEmailTemplateProps = {
  documentName?: string;
  recipientName?: string;
  recipientEmail?: string;
  assetBaseUrl?: string;
};

export const DocumentRecipientOpenedEmailTemplate = ({
  documentName = 'Open Source Pledge.pdf',
  recipientName = 'John Doe',
  recipientEmail = 'john@example.com',
  assetBaseUrl = 'http://localhost:3002',
}: DocumentRecipientOpenedEmailTemplateProps) => {
  const { _ } = useLingui();
  const recipientReference = recipientName || recipientEmail;
  const previewText = msg`${recipientReference} has opened ${documentName}`;

  return (
    <Html>
      <Head>
        <TemplateBrandLogoStyles />
      </Head>
      <Preview>{_(previewText)}</Preview>

      <Body className="mx-auto my-auto font-sans">
        <Section className="bg-white">
          <Container className="mx-auto mt-8 mb-2 max-w-xl rounded-lg border border-slate-200 border-solid p-2 backdrop-blur-sm">
            <Section className="p-2">
              <TemplateBrandLogo assetBaseUrl={assetBaseUrl} className="mb-4 h-6" />

              <TemplateDocumentRecipientOpened
                documentName={documentName}
                recipientName={recipientName}
                recipientEmail={recipientEmail}
                assetBaseUrl={assetBaseUrl}
              />
            </Section>
          </Container>

          <Container className="mx-auto max-w-xl">
            <TemplateFooter />
          </Container>
        </Section>
      </Body>
    </Html>
  );
};

export default DocumentRecipientOpenedEmailTemplate;
