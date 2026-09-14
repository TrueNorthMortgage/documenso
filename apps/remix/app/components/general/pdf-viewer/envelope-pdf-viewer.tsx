import { useCurrentEnvelopeRender } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { PDF_VIEWER_ERROR_MESSAGES } from '@documenso/lib/constants/pdf-viewer-i18n';
import { DEFAULT_PDF_ZOOM_LEVEL, type PdfZoomLevel } from '@documenso/lib/utils/pdf-zoom';
import { cn } from '@documenso/ui/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { useRef, useState } from 'react';

import type { PDFViewerProps } from './pdf-viewer';
import PDFViewerLazy from './pdf-viewer-lazy';

export type EnvelopePdfViewerProps = {
  /**
   * The error message to render when there is an error.
   */
  errorMessage: { title: MessageDescriptor; description: MessageDescriptor } | null;
  showZoomControls?: boolean;
} & Omit<PDFViewerProps, 'data' | 'maxFitWidth' | 'zoomLevel' | 'onZoomLevelChange'>;

export const EnvelopePdfViewer = ({ errorMessage, className, showZoomControls, ...props }: EnvelopePdfViewerProps) => {
  const { t } = useLingui();

  const $el = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<PdfZoomLevel>(DEFAULT_PDF_ZOOM_LEVEL);

  const { currentEnvelopeItem, renderError } = useCurrentEnvelopeRender();

  if (renderError || !currentEnvelopeItem) {
    return (
      <div ref={$el} className={cn('h-full w-full max-w-[800px]', className)} {...props}>
        {renderError ? (
          <Alert variant="destructive" className="mb-4 max-w-[800px]">
            <AlertTitle>{t(errorMessage?.title || PDF_VIEWER_ERROR_MESSAGES.default.title)}</AlertTitle>
            <AlertDescription>
              {t(errorMessage?.description || PDF_VIEWER_ERROR_MESSAGES.default.description)}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex h-[80vh] max-h-[60rem] w-full flex-col items-center justify-center overflow-hidden rounded">
            <p className="text-muted-foreground text-sm">
              <Trans>No document found</Trans>
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <PDFViewerLazy
      key={`${currentEnvelopeItem.envelopeId}-${currentEnvelopeItem.id}`}
      {...props}
      showZoomControls={showZoomControls}
      maxFitWidth={showZoomControls ? 800 : undefined}
      zoomLevel={showZoomControls ? zoomLevel : undefined}
      onZoomLevelChange={showZoomControls ? setZoomLevel : undefined}
      className={cn(showZoomControls ? 'min-h-full w-full flex-shrink-0' : 'h-full w-full max-w-[800px]', className)}
      data={currentEnvelopeItem.data}
    />
  );
};

export default EnvelopePdfViewer;
