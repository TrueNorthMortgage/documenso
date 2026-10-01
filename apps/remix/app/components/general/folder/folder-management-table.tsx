import { useUpdateSearchParams } from '@documenso/lib/client-only/hooks/use-update-search-params';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { ZUrlSearchParamsSchema } from '@documenso/lib/types/search-params';
import {
  canExecuteTeamAction,
  canManageFolder,
  formatDocumentsPath,
  formatTemplatesPath,
} from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import type { TFolderWithSubfolders } from '@documenso/trpc/server/folder-router/schema';
import { Button } from '@documenso/ui/primitives/button';
import type { DataTableColumnDef } from '@documenso/ui/primitives/data-table';
import { DataTable } from '@documenso/ui/primitives/data-table';
import { DataTablePagination } from '@documenso/ui/primitives/data-table-pagination';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@documenso/ui/primitives/dropdown-menu';
import { Input } from '@documenso/ui/primitives/input';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { FolderType } from '@prisma/client';
import {
  ArrowRightIcon,
  FolderIcon,
  MoreVerticalIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { FolderDeleteDialog } from '~/components/dialogs/folder-delete-dialog';
import { FolderMoveDialog } from '~/components/dialogs/folder-move-dialog';
import { FolderUpdateDialog } from '~/components/dialogs/folder-update-dialog';
import { useCurrentTeam } from '~/providers/team';

type TFolderRow = TFolderWithSubfolders & { depth?: number };

export const FolderManagementTable = ({ type, parentId }: { type: FolderType; parentId: string | null }) => {
  const { _ } = useLingui();
  const { user } = useSession();
  const team = useCurrentTeam();
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const params = ZUrlSearchParamsSchema.parse(Object.fromEntries(searchParams));
  const [folderToMove, setFolderToMove] = useState<TFolderWithSubfolders | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<TFolderWithSubfolders | null>(null);
  const [folderToSettings, setFolderToSettings] = useState<TFolderWithSubfolders | null>(null);
  const [search, setSearch] = useState(params.query ?? '');

  const { data, isLoading, isError } = trpc.folder.getFolders.useQuery(
    { type, parentId, query: params.query, page: params.page, perPage: params.perPage },
    { placeholderData: (previousData) => previousData },
  );
  const { mutateAsync: updateFolder } = trpc.folder.updateFolder.useMutation();
  const utils = trpc.useUtils();
  const canViewOwner = canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole);
  const rootPath = type === FolderType.DOCUMENT ? formatDocumentsPath(team.url) : formatTemplatesPath(team.url);
  const results = data ?? { folders: [], count: 0, currentPage: 1, perPage: 5, totalPages: 1 };

  // Show immediate children beneath their parent while retaining server-side paging of root rows.
  const rows: TFolderRow[] = results.folders.flatMap((folder) => [
    folder,
    ...folder.subfolders.map((subfolder) => ({ ...subfolder, depth: 1 })),
  ]);

  const columns = useMemo<DataTableColumnDef<TFolderRow>[]>(() => {
    const itemLabel = type === FolderType.DOCUMENT ? _(msg`Documents`) : _(msg`Templates`);

    return [
      {
        header: _(msg`Folder`),
        cell: ({ row }) => {
          const depth = row.original.depth ?? 0;
          return (
            <Link
              to={`${rootPath}/f/${row.original.id}`}
              className="flex items-center gap-2 font-medium hover:underline"
              style={{ paddingLeft: `${depth * 1.5}rem` }}
            >
              <FolderIcon className="h-4 w-4 text-documenso" />
              <span className="truncate">{row.original.name}</span>
              {row.original.pinned && <PinIcon className="h-3 w-3 text-documenso" />}
            </Link>
          );
        },
      },
      ...(canViewOwner
        ? [
            {
              header: _(msg`Owner`),
              accessorKey: 'ownerName',
              cell: ({ row }: { row: { original: TFolderRow } }) => row.original.ownerName ?? '—',
            },
          ]
        : []),
      {
        header: itemLabel,
        cell: ({ row }) =>
          type === FolderType.DOCUMENT ? row.original._count.documents : row.original._count.templates,
      },
      { header: _(msg`Subfolders`), cell: ({ row }) => row.original._count.subfolders },
      {
        header: _(msg`Actions`),
        cell: ({ row }) => {
          const folder = row.original;
          const canManage = canManageFolder({
            userId: user.id,
            folderOwnerId: folder.userId,
            currentTeamRole: team.currentTeamRole,
          });
          if (!canManage) {
            return null;
          }
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVerticalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFolderToMove(folder)}>
                  <ArrowRightIcon className="mr-2 h-4 w-4" />
                  <Trans>Move</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await updateFolder({ folderId: folder.id, data: { pinned: !folder.pinned } });
                    updateSearchParams({ page: 1 });
                    await utils.folder.getFolders.invalidate();
                  }}
                >
                  <PinIcon className="mr-2 h-4 w-4" />
                  {folder.pinned ? <Trans>Unpin</Trans> : <Trans>Pin</Trans>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFolderToSettings(folder)}>
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  <Trans>Settings</Trans>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setFolderToDelete(folder)}>
                  <TrashIcon className="mr-2 h-4 w-4" />
                  <Trans>Delete</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ];
  }, [_, canViewOwner, rootPath, team.currentTeamRole, type, updateFolder, updateSearchParams, user.id, utils]);

  return (
    <>
      <div className="relative mb-6 w-full max-w-md">
        <SearchIcon className="absolute top-3 left-2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={_(msg`Search folders or owners...`)}
          value={search}
          className="pl-8"
          onChange={(event) => {
            const query = event.target.value;
            setSearch(query);
            updateSearchParams({ query: query || undefined, page: 1 });
          }}
        />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        currentPage={results.currentPage}
        perPage={results.perPage}
        totalPages={results.totalPages}
        onPaginationChange={(page, perPage) => updateSearchParams({ page, perPage })}
        skeleton={{ enable: isLoading, rows: 8 }}
        error={{ enable: isError }}
        emptyState={
          <p>
            <Trans>No folders found.</Trans>
          </p>
        }
      >
        {(table) =>
          results.totalPages > 1 && <DataTablePagination additionalInformation="VisibleCount" table={table} />
        }
      </DataTable>
      <FolderMoveDialog
        folder={folderToMove}
        isOpen={folderToMove !== null}
        onOpenChange={(open) => !open && setFolderToMove(null)}
      />
      <FolderUpdateDialog
        folder={folderToSettings}
        isOpen={folderToSettings !== null}
        onOpenChange={(open) => !open && setFolderToSettings(null)}
      />
      {folderToDelete && (
        <FolderDeleteDialog folder={folderToDelete} isOpen onOpenChange={(open) => !open && setFolderToDelete(null)} />
      )}
    </>
  );
};
