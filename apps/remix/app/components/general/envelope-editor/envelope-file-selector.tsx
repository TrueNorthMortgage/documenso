import { useCurrentEnvelopeRender } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { Plural, useLingui } from '@lingui/react/macro';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  hideScrollbar?: boolean;
  orientation?: 'horizontal' | 'vertical';
  secondaryOverride?: React.ReactNode;
  renderItemAction?: (item: { id: string; title: string }) => React.ReactNode;
};

export const EnvelopeRendererFileSelector = ({
  fields,
  className,
  hideScrollbar = true,
  orientation = 'horizontal',
  secondaryOverride,
  renderItemAction,
}: EnvelopeRendererFileSelectorProps) => {
  const { envelopeItems, currentEnvelopeItem, setCurrentEnvelopeItem } = useCurrentEnvelopeRender();

  const { t } = useLingui();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    const container = element?.parentElement;
    if (!element || !container || orientation !== 'horizontal') {
      return;
    }

    // Measure without the arrows so they disappear once the documents fit.
    const styles = getComputedStyle(container);
    const availableWidth = container.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);

    setScrollState({
      hasOverflow: element.scrollWidth > availableWidth + 1,
      canScrollLeft: element.scrollLeft > 1,
      canScrollRight: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    });
  }, [orientation]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    for (const child of element.children) {
      observer.observe(child);
    }
    updateScrollState();

    return () => observer.disconnect();
  }, [envelopeItems, fields, orientation, updateScrollState]);

  const scrollDocuments = (direction: number) => {
    const element = scrollRef.current;
    if (element) {
      element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' });
    }
  };

  const hasOverflow = orientation === 'horizontal' && scrollState.hasOverflow;

  return (
    <div
      className={cn(
        'flex h-fit min-w-0 flex-shrink-0 items-center',
        orientation === 'horizontal' ? 'gap-2 p-4' : 'w-full',
        className,
      )}
    >
      {hasOverflow && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 flex-shrink-0 p-0"
          aria-label={t`Scroll documents left`}
          disabled={!scrollState.canScrollLeft}
          onClick={() => scrollDocuments(-1)}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
      )}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className={cn(
          'flex min-w-0 flex-1',
          hideScrollbar ? 'scrollbar-hidden' : 'document-selector-scrollbar',
          orientation === 'horizontal' ? 'gap-2 overflow-x-auto' : 'flex-col gap-2 overflow-y-auto',
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
      {hasOverflow && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 flex-shrink-0 p-0"
          aria-label={t`Scroll documents right`}
          disabled={!scrollState.canScrollRight}
          onClick={() => scrollDocuments(1)}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
