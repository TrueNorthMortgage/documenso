import { useCurrentEnvelopeRender } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { cn } from '@documenso/ui/lib/utils';
import { Plural } from '@lingui/react/macro';

type EnvelopeItemSelectorProps = {
  number: number;
  primaryText: React.ReactNode;
  secondaryText: React.ReactNode;
  isSelected: boolean;
  buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
  actionSlot?: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
};

export const EnvelopeItemSelector = ({
  number,
  primaryText,
  secondaryText,
  isSelected,
  buttonProps,
  actionSlot,
  orientation = 'horizontal',
}: EnvelopeItemSelectorProps) => {
  return (
    <button
      title={typeof primaryText === 'string' ? primaryText : undefined}
      className={cn(
        'group flex h-fit cursor-pointer items-center rounded-lg border transition-colors',
        orientation === 'horizontal' ? 'max-w-72 flex-shrink-0' : 'w-full',
        'space-x-3 px-4 py-3',
        isSelected
          ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400'
          : 'border-border bg-muted/50 hover:bg-muted/70',
      )}
      {...buttonProps}
    >
      <div
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-medium text-xs ${
          isSelected ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-600'
        }`}
      >
        {number}
      </div>
      <div className="min-w-0 text-left">
        <div className="truncate font-medium text-sm">{primaryText}</div>
        <div className="text-gray-500 text-xs">{secondaryText}</div>
      </div>
      {actionSlot ?? (
        <div
          className={cn('h-2 w-2 flex-shrink-0 rounded-full', {
            'bg-green-500': isSelected,
          })}
        />
      )}
    </button>
  );
};

type EnvelopeRendererFileSelectorProps = {
  fields: { envelopeItemId: string }[];
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  secondaryOverride?: React.ReactNode;
  renderItemAction?: (item: { id: string; title: string }) => React.ReactNode;
};

export const EnvelopeRendererFileSelector = ({
  fields,
  className,
  orientation = 'horizontal',
  secondaryOverride,
  renderItemAction,
}: EnvelopeRendererFileSelectorProps) => {
  const { envelopeItems, currentEnvelopeItem, setCurrentEnvelopeItem } = useCurrentEnvelopeRender();

  return (
    <div
      className={cn(
        'scrollbar-hidden flex h-fit flex-shrink-0',
        orientation === 'horizontal' ? 'space-x-2 overflow-x-auto p-4' : 'w-full flex-col space-y-2 overflow-y-auto',
        className,
      )}
    >
      {envelopeItems.map((doc, i) => (
        <EnvelopeItemSelector
          key={doc.id}
          number={i + 1}
          primaryText={doc.title}
          secondaryText={
            secondaryOverride ?? (
              <Plural
                one="1 Field"
                other="# Fields"
                value={fields.filter((field) => field.envelopeItemId === doc.id).length}
              />
            )
          }
          isSelected={currentEnvelopeItem?.id === doc.id}
          buttonProps={{
            onClick: () => setCurrentEnvelopeItem(doc.id),
          }}
          orientation={orientation}
          actionSlot={renderItemAction?.(doc)}
        />
      ))}
    </div>
  );
};
