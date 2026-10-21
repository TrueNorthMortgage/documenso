import { cn } from '@documenso/ui/lib/utils';
import { Trans } from '@lingui/react/macro';
import { EnvelopeType } from '@prisma/client';
import { FileTextIcon, LayersIcon } from 'lucide-react';

export const EnvelopeSectionHeader = ({ type }: { type: EnvelopeType }) => {
  const isTemplate = type === EnvelopeType.TEMPLATE;
  const Icon = isTemplate ? LayersIcon : FileTextIcon;

  return (
    <div
      className={cn('mb-6 flex items-center gap-3 rounded-lg border p-4', {
        'border-violet-200 bg-violet-50 text-violet-950 dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-100':
          isTemplate,
        'border-border bg-muted/30': !isTemplate,
      })}
    >
      <Icon aria-hidden="true" className="h-6 w-6 shrink-0" />
      <div>
        <h1 className="font-semibold text-xl">{isTemplate ? <Trans>Templates</Trans> : <Trans>Documents</Trans>}</h1>
        <p className={cn('text-sm', !isTemplate && 'text-muted-foreground')}>
          {isTemplate ? (
            <Trans>Create reusable layouts for future documents.</Trans>
          ) : (
            <Trans>Prepare and send documents for signing.</Trans>
          )}
        </p>
      </div>
    </div>
  );
};
