import type { ImageLoadingState } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { cn } from '@documenso/ui/lib/utils';
import { Spinner } from '@documenso/ui/primitives/spinner';
import { Trans } from '@lingui/react/macro';

import { PdfViewerRecoveryMessage } from './pdf-viewer-states';

type PdfViewerPageImageProps = {
  imageLoadingState: ImageLoadingState;
  imageProps: React.ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown> & { alt: '' };
};

export const PdfViewerPageImage = ({ imageLoadingState, imageProps }: PdfViewerPageImageProps) => {
  return (
    <>
      {/* Loading State */}
      {imageLoadingState === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground opacity-20">
          <Spinner />
        </div>
      )}

      {imageLoadingState === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center overflow-auto p-2">
          <div role="alert" className="max-w-sm text-center text-muted-foreground">
            <p>
              <Trans>We couldn’t display this page.</Trans>
            </p>
            <p className="mt-1 text-sm">
              <PdfViewerRecoveryMessage />
            </p>
          </div>
        </div>
      )}

      {/* The PDF image. */}
      {imageProps.src && (
        <img {...imageProps} className={cn(imageProps.className, 'select-none')} draggable={false} alt="" />
      )}
    </>
  );
};
