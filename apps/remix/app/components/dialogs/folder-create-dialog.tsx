import { AppError } from '@documenso/lib/errors/app-error';
import { ZFolderNameSchema } from '@documenso/lib/types/folder-name';
import { formatDocumentsPath, formatTemplatesPath } from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { FolderType } from '@prisma/client';
import type * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronRightIcon, FolderPlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate, useNavigation, useParams } from 'react-router';
import { z } from 'zod';

import { useCurrentTeam } from '~/providers/team';

const ZCreateFolderFormSchema = z.object({
  name: ZFolderNameSchema,
});

type TCreateFolderFormSchema = z.infer<typeof ZCreateFolderFormSchema>;

export type FolderCreateDialogProps = {
  type: FolderType;
  trigger?: React.ReactNode;
  parentFolderId?: string | null;
} & Omit<DialogPrimitive.DialogProps, 'children'>;

export const FolderCreateDialog = ({ type, trigger, parentFolderId, ...props }: FolderCreateDialogProps) => {
  const { t } = useLingui();
  const { toast } = useToast();
  const { folderId } = useParams();
  const team = useCurrentTeam();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== 'idle';
  const restoredDialog = location.state?.folderCreate;
  const shouldRestoreDialog = restoredDialog?.type === type && typeof restoredDialog.name === 'string';

  const parentId = parentFolderId !== undefined ? parentFolderId : folderId;

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(shouldRestoreDialog);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(parentId ?? null);

  const {
    data: destination,
    isPending: isDestinationPending,
    isError: hasDestinationError,
  } = trpc.folder.getFolders.useQuery(
    { type, parentId: selectedParentId, perPage: 1, childDepth: 1 },
    { enabled: isCreateFolderOpen && Boolean(selectedParentId) },
  );
  const hasDestination = !selectedParentId || destination?.breadcrumbs.at(-1)?.id === selectedParentId;

  const { mutateAsync: createFolder } = trpc.folder.createFolder.useMutation();

  const form = useForm<TCreateFolderFormSchema>({
    resolver: zodResolver(ZCreateFolderFormSchema),
    defaultValues: {
      name: shouldRestoreDialog ? restoredDialog.name : '',
    },
  });

  const folderName = form.watch('name').trim();

  const closeDialog = () => {
    setIsCreateFolderOpen(false);
    if (location.state?.folderCreate) {
      const { folderCreate: _, ...state } = location.state;
      void navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state,
        preventScrollReset: true,
      });
    }
  };

  const changeDestination = (nextParentId: string | null) => {
    setSelectedParentId(nextParentId);
    const rootPath = type === FolderType.DOCUMENT ? formatDocumentsPath(team.url) : formatTemplatesPath(team.url);
    const nextPath =
      location.pathname === `${rootPath}/folders`
        ? `${rootPath}/folders${nextParentId ? `?parentId=${encodeURIComponent(nextParentId)}` : ''}`
        : nextParentId
          ? `${rootPath}/f/${encodeURIComponent(nextParentId)}`
          : rootPath;

    void navigate(nextPath, {
      replace: true,
      preventScrollReset: true,
      state: { ...location.state, folderCreate: { type, name: form.getValues('name') } },
    });
  };

  const onSubmit = async (data: TCreateFolderFormSchema) => {
    if (!hasDestination || hasDestinationError || isNavigating) {
      return;
    }

    try {
      await createFolder({
        name: data.name,
        parentId: selectedParentId ?? undefined,
        type,
      });

      closeDialog();

      toast({
        description: t`Folder created successfully`,
      });
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: t`Failed to create folder`,
        description: error.userMessage ?? t`An error occurred while creating the folder. Please try again.`,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (!isCreateFolderOpen) {
      form.reset({ name: '' });
    }
  }, [isCreateFolderOpen, form]);

  return (
    <Dialog
      {...props}
      open={isCreateFolderOpen}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setSelectedParentId(parentId ?? null);
          setIsCreateFolderOpen(true);
        } else {
          closeDialog();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="flex items-center" data-testid="folder-create-button">
            <FolderPlusIcon className="mr-2 h-4 w-4" />
            {parentId ? <Trans>Create subfolder</Trans> : <Trans>Create Folder</Trans>}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {selectedParentId ? <Trans>Create subfolder</Trans> : <Trans>Create New Folder</Trans>}
          </DialogTitle>
          <DialogDescription>
            <Trans>Enter a name for your new folder. Folders help you organise your items.</Trans>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <fieldset disabled={form.formState.isSubmitting || isNavigating} className="space-y-4">
              <div className="space-y-2">
                <p className="font-medium text-sm">
                  <Trans>Location</Trans>
                </p>
                {selectedParentId && isDestinationPending ? (
                  <p role="status" className="text-muted-foreground text-sm">
                    <Trans>Loading folder location...</Trans>
                  </p>
                ) : hasDestinationError || !hasDestination ? (
                  <p role="alert" className="text-destructive text-sm">
                    <Trans>Unable to load the folder location. Close this dialog and try again.</Trans>
                  </p>
                ) : (
                  <ol aria-label={t`Folder location`} className="flex flex-wrap items-center gap-1 text-sm">
                    <li aria-current={!selectedParentId ? 'location' : undefined}>
                      {selectedParentId ? (
                        <button
                          type="button"
                          className="underline underline-offset-4 hover:no-underline"
                          onClick={() => changeDestination(null)}
                        >
                          <Trans>Home</Trans>
                        </button>
                      ) : (
                        <Trans>Home</Trans>
                      )}
                    </li>
                    {selectedParentId &&
                      destination?.breadcrumbs.map((folder) => (
                        <li
                          key={folder.id}
                          className="flex min-w-0 items-center gap-1"
                          aria-current={folder.id === selectedParentId ? 'location' : undefined}
                        >
                          <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {folder.id === selectedParentId ? (
                            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{folder.name}</span>
                          ) : (
                            <button
                              type="button"
                              className="min-w-0 break-words underline underline-offset-4 [overflow-wrap:anywhere] hover:no-underline"
                              onClick={() => changeDestination(folder.id)}
                            >
                              {folder.name}
                            </button>
                          )}
                        </li>
                      ))}
                    <li className="flex min-w-0 items-center gap-1 font-medium">
                      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                        {folderName || <Trans>New folder name</Trans>}
                      </span>
                    </li>
                  </ol>
                )}
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans>Folder Name</Trans>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t`My Folder`} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={closeDialog}>
                  <Trans>Cancel</Trans>
                </Button>

                <Button
                  type="submit"
                  loading={form.formState.isSubmitting}
                  disabled={!hasDestination || hasDestinationError}
                >
                  <Trans>Create</Trans>
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
