import { useDebouncedValue } from '@documenso/lib/client-only/hooks/use-debounced-value';
import { AppError } from '@documenso/lib/errors/app-error';
import type { TEditorEnvelope } from '@documenso/lib/types/envelope-editor';
import { trpc } from '@documenso/trpc/react';
import type { TAddTemplateToEnvelopeResponse } from '@documenso/trpc/server/envelope-router/add-template-to-envelope.types';
import type { TFindTemplatesResponse } from '@documenso/trpc/server/template-router/schema';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Input } from '@documenso/ui/primitives/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { CheckIcon, LayersIcon, LoaderIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type ApplyTemplateToEnvelopeItemDialogProps = {
  envelope: TEditorEnvelope;
  envelopeItemId?: string;
  onChanged: () => Promise<void>;
  onAdded?: (item: TAddTemplateToEnvelopeResponse['data']) => Promise<void>;
  mode?: 'apply' | 'add';
  disabled?: boolean;
  trigger?: React.ReactNode;
};

const getTemplateItemIds = (template: TTemplateRow | undefined) => {
  if (!template) {
    return [];
  }

  return template.envelopeItems.map((item) => item.id);
};

const mergeTemplateRows = (rows: TTemplateRow[]) => {
  const byEnvelopeId = new Map<string, TTemplateRow>();

  for (const template of rows) {
    byEnvelopeId.set(template.envelopeId, template);
  }

  return [...byEnvelopeId.values()];
};

type TTemplateRow = TFindTemplatesResponse['data'][number];

const canMapRecipients = ({
  template,
  templateItemId,
  recipients,
}: {
  template: TTemplateRow | undefined;
  templateItemId: string | undefined;
  recipients: TEditorEnvelope['recipients'];
}) => {
  if (!template || !templateItemId) {
    return false;
  }

  const sourceFields = template.fields.filter((field) => field.envelopeItemId === templateItemId);
  const sourceRecipientIds = [...new Set(sourceFields.map((field) => field.recipientId))];

  return sourceRecipientIds.every((sourceRecipientId) => {
    const sourceRecipient = template.recipients.find((recipient) => recipient.id === sourceRecipientId);

    if (!sourceRecipient) {
      return false;
    }

    const compatibleRecipients = recipients.filter((recipient) => recipient.role === sourceRecipient.role);
    const sameSigningOrder = compatibleRecipients.filter(
      (recipient) => recipient.signingOrder === sourceRecipient.signingOrder,
    );

    return (sameSigningOrder.length > 0 ? sameSigningOrder : compatibleRecipients).length === 1;
  });
};

export const ApplyTemplateToEnvelopeItemDialog = ({
  envelope,
  envelopeItemId,
  onChanged,
  onAdded,
  mode = 'apply',
  disabled = false,
  trigger,
}: ApplyTemplateToEnvelopeItemDialogProps) => {
  const { toast } = useToast();
  const { _ } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const [loadedTemplates, setLoadedTemplates] = useState<TTemplateRow[]>([]);
  const [loadedPageKey, setLoadedPageKey] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>();
  const [selectedTemplateItemId, setSelectedTemplateItemId] = useState<string>();
  const [confirmReplacement, setConfirmReplacement] = useState(false);

  const teamTemplatesQuery = trpc.template.findTemplates.useQuery(
    { page, perPage: 25, query: debouncedQuery.trim() || undefined, includeAllFolders: true },
    { enabled: open },
  );
  const organisationTemplatesQuery = trpc.template.findOrganisationTemplates.useQuery(
    { page, perPage: 25, query: debouncedQuery.trim() || undefined },
    { enabled: open },
  );

  const templates = loadedTemplates;

  const selectedTemplate = templates.find((template) => String(template.id) === selectedTemplateId);
  const templateItemIds = getTemplateItemIds(selectedTemplate);
  const targetFields = envelopeItemId ? envelope.fields.filter((field) => field.envelopeItemId === envelopeItemId) : [];
  const isAddMode = mode === 'add';
  const hasTemplateFields = targetFields.some((field) => field.templateSourceItemId !== null);
  const appliedTemplateSourceItemId =
    targetFields.find((field) => field.templateSourceItemId !== null)?.templateSourceItemId ?? null;
  const appliedTemplateQuery = trpc.template.getTemplateBySourceItemId.useQuery(
    { envelopeItemId: appliedTemplateSourceItemId ?? '' },
    { enabled: appliedTemplateSourceItemId !== null },
  );
  const hasRecipientMapping = canMapRecipients({
    template: selectedTemplate,
    templateItemId: selectedTemplateItemId,
    recipients: envelope.recipients,
  });
  const sourceFieldCount = selectedTemplate?.fields.filter(
    (field) => field.envelopeItemId === selectedTemplateItemId,
  ).length;
  const isLoading = teamTemplatesQuery.isLoading || organisationTemplatesQuery.isLoading;
  const isFetchingPage = teamTemplatesQuery.isFetching || organisationTemplatesQuery.isFetching;
  const hasNextPage =
    (teamTemplatesQuery.data?.totalPages ?? 0) > page || (organisationTemplatesQuery.data?.totalPages ?? 0) > page;

  const { mutateAsync: applyTemplate, isPending: isApplying } = trpc.envelope.template.apply.useMutation();
  const { mutateAsync: addTemplate, isPending: isAdding } = trpc.envelope.template.add.useMutation();
  const { mutateAsync: removeTemplate, isPending: isRemoving } = trpc.envelope.template.remove.useMutation();

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery('');
    setPage(1);
    setLoadedTemplates([]);
    setLoadedPageKey('');
    setSelectedTemplateId(undefined);
    setSelectedTemplateItemId(undefined);
    setConfirmReplacement(false);
  }, [open]);

  useEffect(() => {
    setPage(1);
    setLoadedPageKey('');
    setSelectedTemplateId(undefined);
    setSelectedTemplateItemId(undefined);
    setConfirmReplacement(false);
  }, [debouncedQuery]);

  useEffect(() => {
    if (
      !open ||
      teamTemplatesQuery.isFetching ||
      organisationTemplatesQuery.isFetching ||
      !teamTemplatesQuery.isSuccess ||
      !organisationTemplatesQuery.isSuccess ||
      teamTemplatesQuery.data.currentPage !== page ||
      organisationTemplatesQuery.data.currentPage !== page
    ) {
      return;
    }

    const pageKey = `${debouncedQuery}:${page}`;

    if (loadedPageKey === pageKey) {
      return;
    }

    const currentPageTemplates = mergeTemplateRows([
      ...teamTemplatesQuery.data.data,
      ...organisationTemplatesQuery.data.data,
    ]);

    setLoadedTemplates((previousTemplates) =>
      page === 1 ? currentPageTemplates : mergeTemplateRows([...previousTemplates, ...currentPageTemplates]),
    );
    setLoadedPageKey(pageKey);
  }, [
    debouncedQuery,
    loadedPageKey,
    open,
    organisationTemplatesQuery.data,
    organisationTemplatesQuery.isSuccess,
    page,
    teamTemplatesQuery.data,
    teamTemplatesQuery.isSuccess,
  ]);

  useEffect(() => {
    if (selectedTemplate && !templateItemIds.includes(selectedTemplateItemId ?? '')) {
      setSelectedTemplateItemId(templateItemIds[0]);
    }
  }, [selectedTemplate, selectedTemplateItemId, templateItemIds]);

  const onApply = async () => {
    if (
      !selectedTemplate ||
      !selectedTemplateItemId ||
      (!isAddMode && (sourceFieldCount === 0 || !envelopeItemId)) ||
      !hasRecipientMapping
    ) {
      return;
    }

    try {
      if (isAddMode) {
        const { data } = await addTemplate({
          envelopeId: envelope.id,
          templateId: selectedTemplate.id,
          templateItemId: selectedTemplateItemId,
        });

        toast({
          title: _(msg`Document added`),
          description: _(msg`The template document and its fields were added to the envelope.`),
        });
        await onAdded?.(data);
      } else {
        if (!envelopeItemId) {
          return;
        }

        await applyTemplate({
          envelopeId: envelope.id,
          envelopeItemId,
          templateId: selectedTemplate.id,
          templateItemId: selectedTemplateItemId,
          replaceExistingFields: targetFields.length > 0 ? confirmReplacement : false,
        });

        toast({
          title: _(msg`Template applied`),
          description: _(msg`The template fields were added to the document.`),
        });
        await onChanged();
      }
      setOpen(false);
    } catch (error) {
      toast({
        title: isAddMode ? _(msg`Document could not be added`) : _(msg`Template could not be applied`),
        description: AppError.parseError(error).userMessage || _(msg`Please review the template and recipients.`),
        variant: 'destructive',
      });
    }
  };

  const onRemove = async () => {
    if (!envelopeItemId) {
      return;
    }

    try {
      await removeTemplate({ envelopeId: envelope.id, envelopeItemId });

      toast({
        title: _(msg`Template removed`),
        description: _(msg`Template fields were removed from the document.`),
      });
      await onChanged();
      setOpen(false);
    } catch (error) {
      toast({
        title: _(msg`Template could not be removed`),
        description: AppError.parseError(error).userMessage || _(msg`Please try again.`),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !isApplying && !isAdding && !isRemoving && setOpen(value)}>
      {!isAddMode && !trigger && appliedTemplateSourceItemId !== null && (
        <div className="mt-4 mb-2 space-y-1 text-sm">
          <p className="font-medium text-muted-foreground">
            <Trans>Applied template</Trans>
          </p>
          <p className="break-words text-foreground">
            {appliedTemplateQuery.isLoading ? (
              <Trans>Loading template...</Trans>
            ) : appliedTemplateQuery.data?.title ? (
              appliedTemplateQuery.data.title
            ) : (
              <Trans>Template unavailable</Trans>
            )}
          </p>
        </div>
      )}
      <DialogTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={appliedTemplateSourceItemId === null ? 'mt-4 w-full' : 'w-full'}
            disabled={disabled}
          >
            <LayersIcon className="mr-2 h-4 w-4" />
            {hasTemplateFields ? <Trans>Change Template</Trans> : <Trans>Apply Template</Trans>}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-full sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isAddMode ? <Trans>Add document via template</Trans> : <Trans>Apply template</Trans>}
          </DialogTitle>
          <DialogDescription>
            {isAddMode ? (
              <Trans>Add a document and its fields from an accessible template.</Trans>
            ) : (
              <Trans>Apply fields from an accessible template to this document.</Trans>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={_(msg`Search templates`)}
            />
            {isFetchingPage && templates.length > 0 && (
              <LoaderIcon className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {isLoading && templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans>Loading templates...</Trans>
            </p>
          ) : templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans>No templates found.</Trans>
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[64%]">
                      <Trans>Template</Trans>
                    </TableHead>
                    <TableHead className="w-[18%] whitespace-nowrap text-right">
                      <Trans>Documents</Trans>
                    </TableHead>
                    <TableHead className="w-[18%] whitespace-nowrap text-right">
                      <Trans>Fields</Trans>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => {
                    const templateId = String(template.id);
                    const isSelected = selectedTemplateId === templateId;
                    const documentCount = getTemplateItemIds(template).length;

                    return (
                      <TableRow key={template.envelopeId} data-state={isSelected ? 'selected' : undefined}>
                        <TableCell className="min-w-0" truncate={false}>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto w-full min-w-0 justify-start whitespace-normal px-2 py-1 text-left"
                            onClick={() => setSelectedTemplateId(templateId)}
                          >
                            <CheckIcon className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="min-w-0">
                              <span className="block break-words">{template.title}</span>
                              {template.templatePath && (
                                <span className="block break-words text-muted-foreground text-xs">
                                  {template.templatePath}
                                </span>
                              )}
                            </span>
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">{documentCount}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{template.fields.length}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!isLoading && templates.length > 0 && hasNextPage && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={isFetchingPage}
            >
              {isFetchingPage ? <LoaderIcon className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isFetchingPage ? <Trans>Loading templates...</Trans> : <Trans>Load more templates</Trans>}
            </Button>
          )}

          {selectedTemplate && templateItemIds.length > 1 && (
            <Select value={selectedTemplateItemId} onValueChange={setSelectedTemplateItemId}>
              <SelectTrigger>
                <SelectValue placeholder={_(msg`Select a template document`)} />
              </SelectTrigger>
              <SelectContent>
                {templateItemIds.map((itemId, index) => (
                  <SelectItem key={itemId} value={itemId}>
                    <Trans>Template document {index + 1}</Trans>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {!isAddMode && selectedTemplate && (templateItemIds.length === 0 || sourceFieldCount === 0) && (
            <Alert variant="warning">
              <AlertTitle>
                <Trans>This template has no fields</Trans>
              </AlertTitle>
              <AlertDescription>
                <Trans>Select a template that contains fields.</Trans>
              </AlertDescription>
            </Alert>
          )}

          {selectedTemplate && sourceFieldCount !== undefined && sourceFieldCount > 0 && !hasRecipientMapping && (
            <Alert variant="warning">
              <AlertTitle>
                <Trans>Recipients do not match</Trans>
              </AlertTitle>
              <AlertDescription>
                <Trans>The template recipients must match the document by role and signing order.</Trans>
              </AlertDescription>
            </Alert>
          )}

          {selectedTemplate &&
            sourceFieldCount !== undefined &&
            hasRecipientMapping &&
            (isAddMode || sourceFieldCount > 0) && (
              <p className="text-muted-foreground text-sm">
                {isAddMode ? (
                  <Trans>{sourceFieldCount} fields will be added with the template document.</Trans>
                ) : (
                  <Trans>{sourceFieldCount} fields will be applied. The uploaded PDF will not be replaced.</Trans>
                )}
              </p>
            )}

          {!isAddMode && targetFields.length > 0 && (
            <label className="flex min-w-0 items-start gap-2 text-sm">
              <Checkbox
                checked={confirmReplacement}
                onCheckedChange={(value) => setConfirmReplacement(value === true)}
              />
              <span className="min-w-0 leading-5">
                <Trans>Replace all existing fields on this document, including fields added manually.</Trans>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          {!isAddMode && hasTemplateFields && (
            <Button type="button" variant="outline" onClick={() => void onRemove()} disabled={isApplying || isRemoving}>
              <XIcon className="mr-2 h-4 w-4" />
              <Trans>Remove Template</Trans>
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void onApply()}
            disabled={
              isApplying ||
              isAdding ||
              isRemoving ||
              !selectedTemplate ||
              !selectedTemplateItemId ||
              (!isAddMode && sourceFieldCount === 0) ||
              !hasRecipientMapping ||
              (!isAddMode && targetFields.length > 0 && !confirmReplacement)
            }
          >
            {isAddMode ? <Trans>Add Document</Trans> : <Trans>Apply Template</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
