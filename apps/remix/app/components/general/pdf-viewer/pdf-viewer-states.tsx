import { Spinner } from '@documenso/ui/primitives/spinner';
import { Trans } from '@lingui/react/macro';

export const PdfViewerLoadingState = () => {
  return (
    <div className="flex h-[80vh] max-h-[60rem] w-full flex-col items-center justify-center overflow-hidden opacity-50">
      <Spinner />
    </div>
  );
};

export const PdfViewerErrorState = () => {
  return (
    <div className="flex h-[80vh] max-h-[60rem] flex-col items-center justify-center bg-white/50 dark:bg-background">
      <div role="alert" className="max-w-sm px-4 text-center text-muted-foreground">
        <p>
          <Trans>We couldn’t display this document.</Trans>
        </p>
        <p className="mt-1 text-sm">
          <PdfViewerRecoveryMessage />
        </p>
      </div>
    </div>
  );
};

export const PdfViewerRecoveryMessage = () => (
  <Trans>Try reloading. If the problem continues, reopen the link in an updated browser or on another device.</Trans>
);
