import { Column, Img, Row, Section } from '../components';
import { useBranding } from '../providers/branding';

export interface TemplateDocumentImageProps {
  assetBaseUrl: string;
  className?: string;
}

export const TemplateDocumentImage = ({ assetBaseUrl, className }: TemplateDocumentImageProps) => {
  const branding = useBranding();

  const getAssetUrl = (path: string) => {
    return new URL(path, assetBaseUrl).toString();
  };

  return (
    <Section className={className}>
      <Row className="table-fixed">
        <Column />

        <Column>
          <Img className="mx-auto h-42" src={getAssetUrl('/static/document.png')} alt={branding.brandingName} />
        </Column>

        <Column />
      </Row>
    </Section>
  );
};

export default TemplateDocumentImage;
