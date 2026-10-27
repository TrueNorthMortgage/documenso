import { useDebouncedValue } from '@documenso/lib/client-only/hooks/use-debounced-value';
import type { FolderSort } from '@documenso/lib/utils/folder-sort';
import { canExecuteTeamAction } from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import type { TFolderWithSubfolders } from '@documenso/trpc/server/folder-router/schema';
import { Button } from '@documenso/ui/primitives/button';
import { Input } from '@documenso/ui/primitives/input';
import { Skeleton } from '@documenso/ui/primitives/skeleton';
import { Trans, useLingui } from '@lingui/react/macro';
import type { FolderType } from '@prisma/client';
import { ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { FolderDeleteDialog } from '~/components/dialogs/folder-delete-dialog';
import { FolderMoveDialog } from '~/components/dialogs/folder-move-dialog';
import { FolderUpdateDialog } from '~/components/dialogs/folder-update-dialog';
import { useCurrentTeam } from '~/providers/team';

import { FolderCard } from './folder-card';

export const FolderCards = ({
  type,
  parentId,
  toolbarActions,
  perPage = 6,
  folderSort,
}: {
  type: FolderType;
  parentId: string | null;
  toolbarActions?: ReactNode;
  perPage?: number;
  folderSort: FolderSort;
}) => {
  const { t } = useLingui();
  const team = useCurrentTeam();
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search, 250);
  const [loadedPageCount, setLoadedPageCount] = useState(1);
  const [settledFolders, setSettledFolders] = useState<{
    query: string;
    folders: TFolderWithSubfolders[];
  } | null>(null);
  const [folderToMove, setFolderToMove] = useState<TFolderWithSubfolders | null>(null);
  const [folderToSettings, setFolderToSettings] = useState<TFolderWithSubfolders | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<TFolderWithSubfolders | null>(null);
  const canViewOwner = canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole);
  const {
    data,
    isLoading,
    isError,
    isFetching,
    isFetchingNextPage,
    isPlaceholderData,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = trpc.folder.getFolders.useInfiniteQuery(
    {
      placeholderData: (previousData) => previousData,
      type,
      parentId,
      query: query.trim() || undefined,
      perPage,
      sortBy: folderSort.by,
      sortDirection: folderSort.direction,
    },
    {
      getNextPageParam: (lastPage) =>
        lastPage.currentPage < lastPage.totalPages ? lastPage.currentPage + 1 : undefined,
    },
  );
  // Folder actions can reorder pages; avoid duplicate cards while refreshed pages settle.
  const folders = [
    ...new Map(data?.pages.flatMap((page) => page.folders).map((folder) => [folder.id, folder]) ?? []).values(),
  ];
  const isSearching = search.trim() !== query.trim();
  const isRestoringPages = Boolean(data && hasNextPage && data.pages.length < loadedPageCount && !isError);
  const isUpdatingOrder = isPlaceholderData || isRestoringPages;
  const visibleFolders = isUpdatingOrder && settledFolders?.query === query.trim() ? settledFolders.folders : folders;

  // Keep the last complete set visible until all requested batches are ready.
  // Loading more appends cards, and changing order replaces the set once.
  useEffect(() => {
    if (data && !isPlaceholderData && !isRestoringPages && !isError) {
      setSettledFolders({
        query: query.trim(),
        folders: [...new Map(data.pages.flatMap((page) => page.folders).map((folder) => [folder.id, folder])).values()],
      });
    }
  }, [data, isPlaceholderData, isRestoringPages, isError, query]);

  // A sort change has its own query cache. Reload the same number of batches
  // in that order instead of dropping back to the first batch.
  useEffect(() => {
    if (isRestoringPages && !isPlaceholderData && !isFetching && !isSearching) {
      void fetchNextPage();
    }
  }, [isRestoringPages, isPlaceholderData, isFetching, isSearching, fetchNextPage]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <SearchIcon className="absolute top-3 left-2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label={t`Search folders`}
            placeholder={canViewOwner ? t`Search folders or owners...` : t`Search folders...`}
            value={search}
            maxLength={200}
            className="pr-8 pl-8"
            onChange={(event) => {
              setSearch(event.target.value);
              setLoadedPageCount(1);
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
                setLoadedPageCount(1);
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
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy={isFetching || isSearching || isRestoringPages}
      >
        {isLoading
          ? Array.from({ length: perPage * loadedPageCount }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))
          : visibleFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onMove={setFolderToMove}
                onSettings={setFolderToSettings}
                onDelete={setFolderToDelete}
              />
            ))}
      </div>
      {isError && (
        <div role="alert" className="mt-4 flex items-center justify-center gap-3">
          <p>
            <Trans>Unable to load folders.</Trans>
          </p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      )}
      {!isLoading && !isError && folders.length === 0 && (
        <p className="py-6 text-center text-muted-foreground">
          <Trans>No folders found.</Trans>
        </p>
      )}
      {hasNextPage && !isError && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            loading={isFetchingNextPage || isRestoringPages}
            disabled={isFetching || isSearching || isRestoringPages}
            onClick={() => setLoadedPageCount((data?.pages.length ?? 0) + 1)}
          >
            <Trans>Load more</Trans>
            <ChevronDownIcon className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
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
