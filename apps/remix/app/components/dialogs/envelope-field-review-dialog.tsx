import { useCurrentEnvelopeRender } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { PDF_VIEWER_CONTENT_SELECTOR, PDF_VIEWER_PAGE_SELECTOR } from '@documenso/lib/constants/pdf-viewer';
import { type FieldReviewStatus, getFieldReview, type ReviewField } from '@documenso/lib/utils/field-review';
import { getClientSideFieldTranslations } from '@documenso/lib/utils/fields';
import { cn } from '@documenso/ui/lib/utils';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Label } from '@documenso/ui/primitives/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import type { Recipient } from '@prisma/client';
import { ArrowRightIcon, ListChecksIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export const EnvelopeFieldReviewDialog = ({
  fields,
  recipients = [],
  isSender = false,
  onOpen,
  buttonClassName,
  trigger,
}: {
  fields: ReviewField[];
  recipients?: Pick<Recipient, 'id' | 'name' | 'email'>[];
  isSender?: boolean;
  onOpen?: () => void;
  buttonClassName?: string;
  trigger?: ReactElement;
}) => {
  const { t, i18n } = useLingui();
  const { envelopeItems, currentEnvelopeItem, setCurrentEnvelopeItem } = useCurrentEnvelopeRender();
  const [isOpen, setIsOpen] = useState(false);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [recipientId, setRecipientId] = useState(String(recipients[0]?.id ?? ''));
  const [selectedField, setSelectedField] = useState<ReviewField | null>(null);
  const [highlightPage, setHighlightPage] = useState<HTMLElement | null>(null);

  const entries = useMemo(
    () => getFieldReview(fields).filter(({ field }) => !isSender || String(field.recipientId) === recipientId),
    [fields, isSender, recipientId],
  );
  const remainingCount = new Set(entries.filter((entry) => entry.isBlocking).map((entry) => entry.requirementKey)).size;
  const fieldTranslations = getClientSideFieldTranslations(i18n);
  const sortedEntries = [...entries].sort((left, right) => {
    const leftOrder = envelopeItems.find((item) => item.id === left.field.envelopeItemId)?.order ?? 0;
    const rightOrder = envelopeItems.find((item) => item.id === right.field.envelopeItemId)?.order ?? 0;
    return (
      leftOrder - rightOrder ||
      left.field.page - right.field.page ||
      Number(left.field.positionY) - Number(right.field.positionY) ||
      Number(left.field.positionX) - Number(right.field.positionX)
    );
  });
  const pageGroups = new Map<string, typeof entries>();
  for (const entry of sortedEntries) {
    if (showIncompleteOnly && !entry.isBlocking) {
      continue;
    }
    const key = `${entry.field.envelopeItemId}-${entry.field.page}`;
    pageGroups.set(key, [...(pageGroups.get(key) ?? []), entry]);
  }

  // Wait for the selected document and virtualized page before highlighting the field.
  useEffect(() => {
    if (!selectedField || currentEnvelopeItem?.id !== selectedField.envelopeItemId) {
      return;
    }

    let requestedContent: Element | null = null;
    const findPage = () => {
      const content = document.querySelector(PDF_VIEWER_CONTENT_SELECTOR);
      if (!content) {
        return;
      }
      if (content !== requestedContent) {
        requestedContent = content;
        content.setAttribute('data-scroll-to-page', String(selectedField.page));
      }
      const page = content.querySelector<HTMLElement>(
        `${PDF_VIEWER_PAGE_SELECTOR}[data-page-number="${selectedField.page}"]`,
      );
      if (page) {
        setHighlightPage(page.parentElement);
      }
    };
    const observer = new MutationObserver(findPage);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(findPage);
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      setSelectedField(null);
      setHighlightPage(null);
    }, 8000);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [selectedField, currentEnvelopeItem?.id]);

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            onOpen?.();
          }
        }}
      >
        <DialogTrigger asChild>
          {trigger ?? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-9 shrink-0 whitespace-nowrap', buttonClassName)}
            >
              <ListChecksIcon className="mr-2 h-4 w-4" />
              <Trans>Review</Trans>
            </Button>
          )}
        </DialogTrigger>
        <DialogContent
          position="center"
          className="flex max-h-[85dvh] flex-col sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            if (selectedField) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <Trans>Review fields</Trans>
            </DialogTitle>
            <DialogDescription>
              {isSender ? (
                <Trans>Review each recipient's saved progress. Click a field to find it in the document.</Trans>
              ) : (
                <Trans>
                  Check your fields and any remaining requirements. Click a field to find it in the document.
                </Trans>
              )}
            </DialogDescription>
          </DialogHeader>
          {isSender && recipients.length > 0 && (
            <Select value={recipientId} onValueChange={setRecipientId}>
              <SelectTrigger aria-label={t`Recipient`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {recipients.map((recipient) => (
                  <SelectItem key={recipient.id} value={String(recipient.id)}>
                    {recipient.name ? `${recipient.name} (${recipient.email})` : recipient.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p role="status">
              <Plural value={remainingCount} one="# requirement remaining" other="# requirements remaining" />
            </p>
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={showIncompleteOnly}
                onCheckedChange={(checked) => setShowIncompleteOnly(checked === true)}
              />
              <Trans>Incomplete only</Trans>
            </Label>
          </div>
          <div className="min-h-0 overflow-y-auto">
            {pageGroups.size === 0 && (
              <p className="py-6 text-center text-muted-foreground text-sm">
                <Trans>No fields to review.</Trans>
              </p>
            )}
            {[...pageGroups.entries()].map(([key, pageEntries]) => {
              const firstField = pageEntries[0].field;
              const documentTitle = envelopeItems.find((item) => item.id === firstField.envelopeItemId)?.title;
              return (
                <section key={key} className="mb-4">
                  <h3 className="sticky top-0 bg-background py-2 font-semibold text-sm">
                    {envelopeItems.length > 1 && <span>{documentTitle} · </span>}
                    <Trans>Page {firstField.page}</Trans>
                  </h3>
                  <ul className="divide-y rounded-md border">
                    {pageEntries.map(({ field, status, groupState, isBlocking }) => (
                      <li key={field.id}>
                        <button
                          type="button"
                          disabled={status === 'hidden'}
                          className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                          onClick={() => {
                            setHighlightPage(null);
                            setSelectedField(field);
                            setCurrentEnvelopeItem(field.envelopeItemId);
                            setIsOpen(false);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm">
                              {field.fieldMeta?.label || fieldTranslations[field.type]}
                            </p>
                            {field.fieldGroup && groupState && (
                              <div className="text-muted-foreground text-xs">
                                <p>{field.fieldGroup.name}</p>
                                <GroupRequirement state={groupState} />
                              </div>
                            )}
                          </div>
                          <Badge variant={isBlocking ? 'destructive' : 'neutral'} className="shrink-0 text-xs">
                            <FieldStatus status={status} />
                          </Badge>
                          {status !== 'hidden' && <ArrowRightIcon className="h-4 w-4 shrink-0" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      {selectedField && highlightPage && createPortal(<FieldHighlight field={selectedField} />, highlightPage)}
    </>
  );
};

const FieldHighlight = ({ field }: { field: ReviewField }) => {
  const { t } = useLingui();
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.focus({ preventScroll: true });
    }
  }, [element]);
  return (
    <section
      ref={setElement}
      tabIndex={-1}
      aria-label={t`Selected field`}
      className="field-review-highlight pointer-events-none absolute z-50 rounded-sm border-[3px] border-amber-700 bg-amber-300/50 ring-2 ring-amber-500/30 ring-offset-1 ring-offset-white dark:bg-amber-300/60 dark:ring-amber-400/40"
      style={{
        left: `${field.positionX}%`,
        top: `${field.positionY}%`,
        width: `${field.width}%`,
        height: `${field.height}%`,
      }}
    />
  );
};

const FieldStatus = ({ status }: { status: FieldReviewStatus }) => {
  switch (status) {
    case 'complete':
      return <Trans>Complete</Trans>;
    case 'required':
      return <Trans>Required — incomplete</Trans>;
    case 'optional':
      return <Trans>Optional — empty</Trans>;
    case 'read-only':
      return <Trans>Read only</Trans>;
    case 'hidden':
      return <Trans>Not applicable</Trans>;
    case 'group-complete':
      return <Trans>Group complete</Trans>;
    case 'group-incomplete':
      return <Trans>Group incomplete</Trans>;
    case 'invalid-group':
      return <Trans>Invalid group rule</Trans>;
  }
};

const GroupRequirement = ({
  state,
}: {
  state: NonNullable<ReturnType<typeof getFieldReview>[number]['groupState']>;
}) => {
  const count = state.validationLength;
  if (count && state.validationRule === 'Select exactly') {
    return (
      <Trans>
        Select exactly {count}. Currently selected: {state.selectedCount}.
      </Trans>
    );
  }
  if (count && state.validationRule === 'Select at least') {
    return (
      <Trans>
        Select at least {count}. Currently selected: {state.selectedCount}.
      </Trans>
    );
  }
  if (count && state.validationRule === 'Select at most') {
    return (
      <Trans>
        Select at most {count}. Currently selected: {state.selectedCount}.
      </Trans>
    );
  }
  return <Trans>Currently selected: {state.selectedCount}.</Trans>;
};
