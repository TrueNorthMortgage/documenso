import { AppError } from '@documenso/lib/errors/app-error';
import { ZEmailTemplateDataSchema } from '@documenso/lib/types/email-message';
import { canExecuteTeamAction } from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import { DocumentSendEmailMessageHelper } from '@documenso/ui/components/document/document-send-email-message-helper';
import { Button } from '@documenso/ui/primitives/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { SpinnerBox } from '@documenso/ui/primitives/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { Textarea } from '@documenso/ui/primitives/textarea';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { SettingsHeader } from '~/components/general/settings-header';
import { useCurrentTeam } from '~/providers/team';
import { appMetaTags } from '~/utils/meta';

type EmailTemplateValues = z.infer<typeof ZEmailTemplateDataSchema>;
const emptyTemplate: EmailTemplateValues = { name: '', subject: '', message: '' };

export const meta = () => appMetaTags(msg`Email Templates`);

const TeamEmailTemplates = () => {
  const { t } = useLingui();
  const { toast } = useToast();
  const team = useCurrentTeam();
  const canManage = canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole);
  const [query, setQuery] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const templates = trpc.team.emailMessage.find.useQuery({ teamId: team.id, teamOnly: true });
  const createTemplate = trpc.team.emailMessage.create.useMutation();
  const updateTemplate = trpc.team.emailMessage.update.useMutation();
  const form = useForm<EmailTemplateValues>({
    resolver: zodResolver(ZEmailTemplateDataSchema),
    defaultValues: emptyTemplate,
  });

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTemplates = templates.data?.filter((item) =>
    [item.name ?? '', item.subject, item.message].some((value) => value.toLowerCase().includes(normalizedQuery)),
  );

  const openEditor = (id: string | null, values: EmailTemplateValues) => {
    setEditingId(id);
    form.reset(values);
    setIsEditorOpen(true);
  };

  const onSubmit = async (data: EmailTemplateValues) => {
    try {
      if (editingId) {
        await updateTemplate.mutateAsync({ teamId: team.id, id: editingId, data });
      } else {
        await createTemplate.mutateAsync({ teamId: team.id, ...data });
      }

      setIsEditorOpen(false);
      void templates.refetch();
    } catch (err) {
      const error = AppError.parseError(err);
      toast({
        title: t`Unable to save email template`,
        description: error.userMessage ?? t`Please try again.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <SettingsHeader title={t`Email Templates`} subtitle={t`Reusable subjects and messages for your team.`}>
        {canManage && (
          <Button onClick={() => openEditor(null, emptyTemplate)}>
            <Trans>New template</Trans>
          </Button>
        )}
      </SettingsHeader>

      <Input
        aria-label={t`Search team templates`}
        placeholder={t`Search by name, subject, or message`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-4 max-w-sm"
      />

      {templates.isLoading && <SpinnerBox />}
      {templates.isError && (
        <p role="alert">
          <Trans>Unable to load email templates.</Trans>
        </p>
      )}
      {filteredTemplates?.length === 0 && (
        <p className="text-muted-foreground">
          <Trans>No matching templates.</Trans>
        </p>
      )}
      {filteredTemplates && filteredTemplates.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>Template</Trans>
              </TableHead>
              <TableHead>
                <Trans>Subject</Trans>
              </TableHead>
              {canManage && (
                <TableHead>
                  <span className="sr-only">
                    <Trans>Actions</Trans>
                  </span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTemplates.map(({ id, name, subject, message }) => (
              <TableRow key={id}>
                <TableCell>{name}</TableCell>
                <TableCell>{subject}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditor(id, { name: name ?? '', subject, message })}
                    >
                      <Trans>Edit</Trans>
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canManage && (
        <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? <Trans>Edit email template</Trans> : <Trans>New email template</Trans>}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Trans>Template name</Trans>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={100} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Trans>Subject</Trans>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={255} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Trans>Message</Trans>
                        </FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={4} maxLength={5000} />
                        </FormControl>
                        {field.value.trim() || form.getValues('subject').trim() ? (
                          <FormMessage />
                        ) : form.formState.errors.message ? (
                          <p role="alert" className="text-destructive text-sm">
                            <Trans>Enter a subject or message.</Trans>
                          </p>
                        ) : null}
                      </FormItem>
                    )}
                  />
                  <DocumentSendEmailMessageHelper />
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsEditorOpen(false)}>
                      <Trans>Cancel</Trans>
                    </Button>
                    <Button type="submit">
                      <Trans>Save template</Trans>
                    </Button>
                  </DialogFooter>
                </fieldset>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default TeamEmailTemplates;
