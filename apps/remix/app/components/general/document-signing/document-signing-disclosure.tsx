import { cn } from '@documenso/ui/lib/utils';

import { Trans } from '@lingui/react/macro';
import type { HTMLAttributes } from 'react';
import { Link } from 'react-router';

export type DocumentSigningDisclosureProps = HTMLAttributes<HTMLParagraphElement>;

export const DocumentSigningDisclosure = ({ className, ...props }: DocumentSigningDisclosureProps) => {
  return (
    <p className={cn('text-muted-foreground text-xs', className)} {...props}>
      <Trans>
        By clicking to view, complete, or electronically sign documents on our platform, you consent to conduct
        transactions electronically. You agree that your electronic signature—whether entered, drawn, or applied via
        click-to-sign—carries the same legal weight, effect, and enforceability as a physical handwritten signature in
        ink, in accordance with applicable Canadian federal and provincial legislation.
      </Trans>
      <span className="mt-2 block">
        <Trans>
          Read the full{' '}
          <Link className="text-documenso-700 underline" to="/articles/signature-disclosure" target="_blank">
            signature disclosure
          </Link>
          .
        </Trans>
      </span>
    </p>
  );
};
