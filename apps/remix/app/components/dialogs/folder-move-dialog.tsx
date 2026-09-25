import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
import type { TFolderWithSubfolders } from '@documenso/trpc/server/folder-router/schema';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import type * as DialogPrimitive from '@radix-ui/react-dialog';
import { FolderIcon, HomeIcon, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export type FolderMoveDialogProps = {
  folder: TFolderWithSubfolders | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
} & Omit<DialogPrimitive.DialogProps, 'children'>;

const ZMoveFolderFormSchema = z.object({
  targetFolderId: z.string().nullable(),
});

type TMoveFolderFormSchema = z.infer<typeof ZMoveFolderFormSchema>;

const isDescendantFolder = (
  folderId: string,
  potentialDescendant: TFolderWithSubfolders,
  folders: TFolderWithSubfolders[],
) => {
  let parentId = potentialDescendant.parentId;

  while (parentId) {
    if (parentId === folderId) {
      return true;
    }

    parentId = folders.find((folder) => folder.id === parentId)?.parentId ?? null;
  }

  return false;
};

const getFolderPath = (folder: TFolderWithSubfolders, folders: TFolderWithSubfolders[]) => {
  const names = [folder.name];
  let parentId = folder.parentId;

  while (parentId) {
    const parentFolder = folders.find((candidate) => candidate.id === parentId);

    if (!parentFolder) {
      break;
    }

    names.unshift(parentFolder.name);
    parentId = parentFolder.parentId ?? null;
  }

  return names.join(' / ');
};

export const FolderMoveDialog = ({ folder, isOpen, onOpenChange }: FolderMoveDialogProps) => {
  const { t } = useLingui();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  const { mutateAsync: moveFolder } = trpc.folder.updateFolder.useMutation();

  const { data: foldersData, isLoading: isFoldersLoading } = trpc.folder.findFoldersInternal.useQuery(
    {
      type: folder?.type,
    },
    {
      enabled: isOpen && Boolean(folder),
    },
  );

  const form = useForm<TMoveFolderFormSchema>({
    resolver: zodResolver(ZMoveFolderFormSchema),
    defaultValues: {
      targetFolderId: folder?.parentId ?? null,
    },
  });

  const onFormSubmit = async ({ targetFolderId }: TMoveFolderFormSchema) => {
    if (!folder) {
      return;
    }

    try {
      await moveFolder({
        folderId: folder.id,
        data: {
          parentId: targetFolderId || null,
        },
      });

      onOpenChange(false);

      toast({
        title: t`Folder moved successfully`,
      });
    } catch (err) {
      const error = AppError.parseError(err);

      if (error.code === AppErrorCode.NOT_FOUND) {
        toast({
          title: t`Folder not found`,
          description: t`The folder you are trying to move does not exist.`,
          variant: 'destructive',
        });

        return;
      }

      toast({
        title: t`Failed to move folder`,
        description: t`An unknown error occurred while moving the folder.`,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (!isOpen) {
      form.reset();
      setSearchTerm('');
    }
  }, [isOpen, form]);

  const folders = foldersData?.data ?? [];

  const filteredFolders = folders.filter(
    (f) =>
      f.id !== folder?.id &&
      f.type === folder?.type &&
      !isDescendantFolder(folder?.id ?? '', f, folders) &&
      (searchTerm === '' || f.name.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Move Folder</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Select a destination for this folder.</Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute top-3 left-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t`Search folders...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onFormSubmit)}>
            <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
              <FormField
                control={form.control}
                name="targetFolderId"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="max-h-96 space-y-2 overflow-y-auto">
                        {isFoldersLoading ? (
                          <div className="flex h-10 items-center justify-center">
                            <Trans>Loading folders...</Trans>
                          </div>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant={!field.value ? 'default' : 'outline'}
                              className="w-full justify-start"
                              disabled={!folder?.parentId}
                              onClick={() => field.onChange(null)}
                            >
                              <HomeIcon className="mr-2 h-4 w-4" />
                              <Trans>Home</Trans>
                            </Button>

                            {filteredFolders.map((f) => (
                              <Button
                                key={f.id}
                                type="button"
                                disabled={f.id === folder?.parentId}
                                variant={field.value === f.id ? 'default' : 'outline'}
                                className="w-full justify-start"
                                onClick={() => field.onChange(f.id)}
                              >
                                <FolderIcon className="mr-2 h-4 w-4" />
                                {getFolderPath(f, folders)}
                              </Button>
                            ))}
                            {searchTerm && filteredFolders?.length === 0 && (
                              <div className="px-2 py-2 text-center text-muted-foreground text-sm">
                                <Trans>No folders found</Trans>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button type="submit" disabled={isFoldersLoading} loading={form.formState.isSubmitting}>
                  <Trans>Move</Trans>
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
