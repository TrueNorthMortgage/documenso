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
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  MoreVerticalIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { FolderDeleteDialog } from '~/components/dialogs/folder-delete-dialog';
import { FolderMoveDialog } from '~/components/dialogs/folder-move-dialog';
import { FolderUpdateDialog } from '~/components/dialogs/folder-update-dialog';
import { useCurrentTeam } from '~/providers/team';

type TFolderRow = TFolderWithSubfolders & { depth: number; hasChildren: boolean; isExpanded: boolean };
type TFolderSort = 'name' | 'owner' | 'items' | 'subfolders';

export const FolderManagementTable = ({
  type,
  parentId,
  toolbarActions,
  isFolderPage = false,
}: {
  type: FolderType;
  parentId: string | null;
  toolbarActions?: ReactNode;
  isFolderPage?: boolean;
}) => {
  const { _ } = useLingui();
  const { user } = useSession();
  const team = useCurrentTeam();
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const folderPage = Math.max(Number(searchParams.get('folderPage')) || 1, 1);
  const defaultPageSize = isFolderPage ? 50 : 5;
  const pageSizeStorageKey = isFolderPage ? 'documenso.folder-page-size.all' : 'documenso.folder-page-size';
  const [folderPerPage, setFolderPerPage] = useState(defaultPageSize);
  const [folderSort, setFolderSort] = useState<{ by: TFolderSort; direction: 'asc' | 'desc' }>({
    by: 'name',
    direction: 'asc',
  });
  const [folderToMove, setFolderToMove] = useState<TFolderWithSubfolders | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<TFolderWithSubfolders | null>(null);
  const [folderToSettings, setFolderToSettings] = useState<TFolderWithSubfolders | null>(null);
  const [search, setSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    const savedPageSize = Number(window.localStorage.getItem(pageSizeStorageKey));

    if ((isFolderPage ? [10, 25, 50, 100] : [5, 10]).includes(savedPageSize)) {
      setFolderPerPage(savedPageSize);
    }
  }, [isFolderPage, pageSizeStorageKey]);

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
      includeSearchParents: true,
      childDepth: 4,
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
  const results = data ?? { folders: [], count: 0, currentPage: 1, perPage: defaultPageSize, totalPages: 1 };

  const rows = useMemo(() => {
    const isSearching = Boolean(search.trim());
    const folders = new Map<string, TFolderWithSubfolders>();
    for (const folder of [...(data?.searchParents ?? []), ...(data?.folders ?? []), ...(data?.descendants ?? [])]) {
      folders.set(folder.id, folder);
      if (!isSearching) {
        for (const child of folder.subfolders) {
          folders.set(child.id, child);
        }
      }
    }
    const children = new Map<string, TFolderWithSubfolders[]>();
    const roots: TFolderWithSubfolders[] = [];
    for (const folder of folders.values()) {
      if (folder.parentId && folders.has(folder.parentId)) {
        children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder]);
      } else {
        roots.push(folder);
      }
    }
    const visibleRows: TFolderRow[] = [];
    const visited = new Set<string>();
    const appendRow = (folder: TFolderWithSubfolders, depth: number) => {
      if (visited.has(folder.id)) {
        return;
      }
      visited.add(folder.id);
      const nestedFolders = children.get(folder.id) ?? [];
      const isExpanded = isSearching || expandedFolders.has(folder.id);
      visibleRows.push({ ...folder, depth, hasChildren: nestedFolders.length > 0, isExpanded });
      if (isExpanded) {
        for (const child of nestedFolders) {
          appendRow(child, depth + 1);
        }
      }
    };
    for (const folder of roots) {
      appendRow(folder, 0);
    }
    return visibleRows;
  }, [data, expandedFolders, search]);

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
          const folder = row.original;
          return (
            <div className="flex items-center gap-2" style={{ paddingLeft: `${folder.depth * 1.5}rem` }}>
              {folder.hasChildren ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 shrink-0 p-0"
                  aria-label={folder.isExpanded ? _(msg`Collapse folder`) : _(msg`Expand folder`)}
                  aria-expanded={folder.isExpanded}
                  disabled={Boolean(search.trim())}
                  onClick={() => {
                    setExpandedFolders((previous) => {
                      const next = new Set(previous);
                      if (next.has(folder.id)) {
                        next.delete(folder.id);
                      } else {
                        next.add(folder.id);
                      }
                      return next;
                    });
                  }}
                >
                  {folder.isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <Link
                to={`${rootPath}/f/${folder.id}`}
                className="flex min-w-0 items-center gap-2 font-medium hover:underline"
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-documenso" />
                <span className="truncate">{folder.name}</span>
                {folder.pinned && <PinIcon className="h-3 w-3 shrink-0 text-documenso" />}
              </Link>
            </div>
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
    search,
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
          <div className="flex w-full flex-wrap items-center gap-3">
            <div className="relative w-full max-w-md">
              <SearchIcon className="absolute top-3 left-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={canViewOwner ? _(msg`Search folders or owners...`) : _(msg`Search folders...`)}
                value={search}
                className="pr-8 pl-8"
                onChange={(event) => {
                  const query = event.target.value;
                  setSearch(query);
                  setExpandedFolders(new Set());
                  updateSearchParams({ folderPage: 1 });
                }}
              />
              {search && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-8 w-8 p-0"
                  onClick={() => {
                    setSearch('');
                    setExpandedFolders(new Set());
                    updateSearchParams({ folderPage: 1 });
                  }}
                >
                  <XIcon className="h-4 w-4" />
                  <span className="sr-only">
                    <Trans>Clear search</Trans>
                  </span>
                </Button>
              )}
            </div>
            <div className="ml-auto">{toolbarActions}</div>
          </div>
        }
        data={rows}
        currentPage={results.currentPage}
        perPage={results.perPage}
        totalPages={results.totalPages}
        onPaginationChange={(page, perPage) => {
          const nextPage = perPage === folderPerPage ? page : 1;
          setFolderPerPage(perPage);
          window.localStorage.setItem(pageSizeStorageKey, String(perPage));
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
        {(table) => (
          <DataTablePagination
            additionalInformation="VisibleCount"
            pageSizes={isFolderPage ? [10, 25, 50, 100] : [5, 10]}
            table={table}
          />
        )}
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
