import { NEXT_PUBLIC_SOURCE_URL } from '@documenso/lib/constants/app';
import { cn } from '@documenso/ui/lib/utils';
import { Trans } from '@lingui/react/macro';
import type { HTMLAttributes } from 'react';
import { Link } from 'react-router';

export type SourceAttributionFooterProps = HTMLAttributes<HTMLElement>;

export const SourceAttributionFooter = ({ className, ...props }: SourceAttributionFooterProps) => {
  const sourceUrl = NEXT_PUBLIC_SOURCE_URL();

  if (!sourceUrl) {
    return null;
  }

  return (
    <footer className={cn('text-muted-foreground text-sm', className)} {...props}>
      <Trans>
        Powered by{' '}
        <Link
          to={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline-offset-4 hover:underline"
        >
          Documenso
        </Link>
      </Trans>
    </footer>
  );
};
