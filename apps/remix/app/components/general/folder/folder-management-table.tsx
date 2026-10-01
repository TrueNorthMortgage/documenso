import { useUpdateSearchParams } from '@documenso/lib/client-only/hooks/use-update-search-params';
import { useSession } from '@documenso/lib/client-only/providers/session';
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
  ArrowDownIcon,
  ArrowDownUpIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  FolderIcon,
  MoreVerticalIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { FolderDeleteDialog } from '~/components/dialogs/folder-delete-dialog';
import { FolderMoveDialog } from '~/components/dialogs/folder-move-dialog';
import { FolderUpdateDialog } from '~/components/dialogs/folder-update-dialog';
import { useCurrentTeam } from '~/providers/team';

type TFolderRow = TFolderWithSubfolders & { depth?: number };
type TFolderSort = 'name' | 'owner' | 'items' | 'subfolders';

export const FolderManagementTable = ({ type, parentId }: { type: FolderType; parentId: string | null }) => {
  const { _ } = useLingui();
  const { user } = useSession();
  const team = useCurrentTeam();
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const folderPage = Math.max(Number(searchParams.get('folderPage')) || 1, 1);
  const [folderPerPage, setFolderPerPage] = useState(5);
  const [folderSort, setFolderSort] = useState<{ by: TFolderSort; direction: 'asc' | 'desc' }>({
    by: 'name',
    direction: 'asc',
  });
  const [folderToMove, setFolderToMove] = useState<TFolderWithSubfolders | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<TFolderWithSubfolders | null>(null);
  const [folderToSettings, setFolderToSettings] = useState<TFolderWithSubfolders | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const savedPageSize = Number(window.localStorage.getItem('documenso.folder-page-size'));

    if (savedPageSize === 5 || savedPageSize === 10) {
      setFolderPerPage(savedPageSize);
    }
  }, []);

  useEffect(() => {
    const savedSort = window.localStorage.getItem('documenso.folder-sort');

    if (savedSort) {
      try {
        const parsedSort = JSON.parse(savedSort) as { by?: TFolderSort; direction?: 'asc' | 'desc' };
        if (['name', 'owner', 'items', 'subfolders'].includes(parsedSort.by ?? '') && parsedSort.direction) {
          setFolderSort({ by: parsedSort.by as TFolderSort, direction: parsedSort.direction });
        }
      } catch {
        window.localStorage.removeItem('documenso.folder-sort');
      }
    }
  }, []);

  const { data, isLoading, isError } = trpc.folder.getFolders.useQuery(
    {
      type,
      parentId,
      query: search.trim() || undefined,
      page: folderPage,
      perPage: folderPerPage,
      sortBy: folderSort.by,
      sortDirection: folderSort.direction,
    },
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
    const sortHeader = (label: string, sortBy: TFolderSort) => {
      const isActive = folderSort.by === sortBy;
      const SortIcon = isActive ? (folderSort.direction === 'asc' ? ArrowUpIcon : ArrowDownIcon) : ArrowDownUpIcon;

      return (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => {
            const direction: 'asc' | 'desc' = isActive && folderSort.direction === 'asc' ? 'desc' : 'asc';
            const nextSort = { by: sortBy, direction };
            setFolderSort(nextSort);
            window.localStorage.setItem('documenso.folder-sort', JSON.stringify(nextSort));
            updateSearchParams({ folderPage: 1 });
          }}
        >
          {label}
          <SortIcon className="ml-1 h-3 w-3" />
        </Button>
      );
    };

    return [
      {
        id: 'name',
        header: sortHeader(_(msg`Folder`), 'name'),
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
              header: sortHeader(_(msg`Owner`), 'owner'),
              accessorKey: 'ownerName',
              cell: ({ row }: { row: { original: TFolderRow } }) => row.original.ownerName ?? '—',
            },
          ]
        : []),
      {
        id: 'items',
        header: sortHeader(itemLabel, 'items'),
        cell: ({ row }) =>
          type === FolderType.DOCUMENT ? row.original._count.documents : row.original._count.templates,
      },
      {
        id: 'subfolders',
        header: sortHeader(_(msg`Subfolders`), 'subfolders'),
        cell: ({ row }) => row.original._count.subfolders,
      },
      {
        id: 'actions',
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
                    updateSearchParams({ folderPage: 1 });
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
    ] as DataTableColumnDef<TFolderRow>[];
  }, [
    _,
    canViewOwner,
    folderSort,
    rootPath,
    team.currentTeamRole,
    type,
    updateFolder,
    updateSearchParams,
    user.id,
    utils,
  ]);

  return (
    <>
      <DataTable
        columns={columns}
        toolbar={
          <div className="relative w-full max-w-md">
            <SearchIcon className="absolute top-3 left-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={canViewOwner ? _(msg`Search folders or owners...`) : _(msg`Search folders...`)}
              value={search}
              className="pl-8"
              onChange={(event) => {
                const query = event.target.value;
                setSearch(query);
                updateSearchParams({ folderPage: 1 });
              }}
            />
          </div>
        }
        data={rows}
        currentPage={results.currentPage}
        perPage={results.perPage}
        totalPages={results.totalPages}
        onPaginationChange={(page, perPage) => {
          const nextPage = perPage === folderPerPage ? page : 1;
          setFolderPerPage(perPage);
          window.localStorage.setItem('documenso.folder-page-size', String(perPage));
          updateSearchParams({ folderPage: nextPage });
        }}
        skeleton={{ enable: isLoading, rows: 8 }}
        error={{ enable: isError }}
        emptyState={
          <p>
            <Trans>No folders found.</Trans>
          </p>
        }
      >
        {(table) => <DataTablePagination additionalInformation="VisibleCount" pageSizes={[5, 10]} table={table} />}
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
