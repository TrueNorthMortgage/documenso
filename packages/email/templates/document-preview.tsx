import { Trans, useLingui } from '@lingui/react/macro';

import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from '../components';
import { TemplateBrandLogo, TemplateBrandLogoStyles } from '../template-components/template-brand-logo';
import { TemplateCustomMessageBody } from '../template-components/template-custom-message-body';
import { TemplateFooter } from '../template-components/template-footer';

type DocumentPreviewEmailTemplateProps = {
  title: string;
  senderName: string;
  previewUrl: string;
  assetBaseUrl: string;
  message?: string;
};

export const DocumentPreviewEmailTemplate = ({
  title,
  senderName,
  previewUrl,
  assetBaseUrl,
  message,
}: DocumentPreviewEmailTemplateProps) => {
  const { t } = useLingui();

  return (
    <Html>
      <Head>
        <TemplateBrandLogoStyles />
      </Head>
      <Preview>{t`${senderName} shared a preview of ${title}`}</Preview>
      <Body className="mx-auto my-auto bg-white font-sans">
        <Container className="mx-auto mt-8 max-w-xl rounded-lg border border-slate-200 border-solid p-4">
          <TemplateBrandLogo assetBaseUrl={assetBaseUrl} className="mb-4 h-6" />
          <Text className="text-center font-semibold text-lg text-primary">
            <Trans>
              {senderName} shared a preview of {title}
            </Trans>
          </Text>
          {message && (
            <Section>
              <TemplateCustomMessageBody text={message} />
            </Section>
          )}
          <Section className="my-6 text-center">
            <Button
              className="rounded-lg bg-documenso-500 px-6 py-3 font-medium text-black no-underline"
              href={previewUrl}
            >
              <Trans>View document</Trans>
            </Button>
          </Section>
          <Text className="text-center text-slate-500">
            <Trans>
              This is a preview of the documents. If you need to sign, you’ll receive a separate email.
            </Trans>
          </Text>
        </Container>
        <Container className="mx-auto mt-8 max-w-xl">
          <Hr />
          <TemplateFooter />
        </Container>
      </Body>
    </Html>
  );
};
