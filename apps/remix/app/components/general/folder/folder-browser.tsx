import { useUpdateSearchParams } from '@documenso/lib/client-only/hooks/use-update-search-params';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { DEFAULT_FOLDER_SORT, type FolderSort, parseFolderSort } from '@documenso/lib/utils/folder-sort';
import { canExecuteTeamAction, formatDocumentsPath, formatTemplatesPath } from '@documenso/lib/utils/teams';
import { Button } from '@documenso/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@documenso/ui/primitives/dropdown-menu';
import { Trans, useLingui } from '@lingui/react/macro';
import { FolderType } from '@prisma/client';
import { ArrowDownUpIcon, ArrowUpRightIcon, ChevronDownIcon, LayoutGridIcon, ListIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { useCurrentTeam } from '~/providers/team';

import { FolderCards } from './folder-cards';
import { FolderManagementTable } from './folder-management-table';

type FolderBrowserProps = { type: FolderType; parentId: string | null; isFolderPage?: boolean };

export const FolderBrowser = ({ type, parentId, isFolderPage = false }: FolderBrowserProps) => {
  const { t } = useLingui();
  const { user } = useSession();
  const team = useCurrentTeam();
  const updateSearchParams = useUpdateSearchParams();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [folderSort, setFolderSort] = useState<FolderSort>(DEFAULT_FOLDER_SORT);
  const storageKey = `documenso.folder-view.${user.id}`;
  const sortStorageKey = `documenso.folder-sort.${user.id}`;
  const canViewOwner = canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole);

  useEffect(() => {
    try {
      setFolderSort(parseFolderSort(window.localStorage.getItem(sortStorageKey), canViewOwner));
    } catch {
      setFolderSort(DEFAULT_FOLDER_SORT);
    }
  }, [sortStorageKey, canViewOwner]);

  const changeSort = (nextSort: FolderSort) => {
    setFolderSort(nextSort);
    updateSearchParams({ folderPage: 1 });
    try {
      window.localStorage.setItem(sortStorageKey, JSON.stringify(nextSort));
    } catch {
      // Sorting still works when browser storage is unavailable.
    }
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setView(saved === 'table' ? 'table' : 'grid');
    } catch {
      // Storage may be unavailable in restricted browser sessions.
    }
  }, [storageKey]);

  const changeView = (nextView: 'grid' | 'table') => {
    setView(nextView);
    try {
      window.localStorage.setItem(storageKey, nextView);
    } catch {
      // The layout can still be changed without persisting the preference.
    }
  };
  const rootPath = type === FolderType.DOCUMENT ? formatDocumentsPath(team.url) : formatTemplatesPath(team.url);
  const foldersPath = `${rootPath}/folders${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ''}`;

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" aria-label={t`Sort folders`}>
            <ArrowDownUpIcon className="mr-2 h-4 w-4" />
            {folderSort.by === 'createdAt' && folderSort.direction === 'desc' ? (
              <Trans>Recently created</Trans>
            ) : folderSort.by === 'name' && folderSort.direction === 'asc' ? (
              <Trans>Alphabetical</Trans>
            ) : (
              <Trans>Sort folders</Trans>
            )}
            <ChevronDownIcon className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={`${folderSort.by}:${folderSort.direction}`}
            onValueChange={(value) => {
              if (value === 'createdAt:desc') {
                changeSort({ by: 'createdAt', direction: 'desc' });
              } else if (value === 'name:asc') {
                changeSort({ by: 'name', direction: 'asc' });
              }
            }}
          >
            <DropdownMenuRadioItem value="createdAt:desc">
              <Trans>Recently created</Trans>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name:asc">
              <Trans>Alphabetical</Trans>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <fieldset aria-label={t`Folder layout`} className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={view === 'grid' ? 'default' : 'outline'}
          aria-pressed={view === 'grid'}
          onClick={() => changeView('grid')}
        >
          <LayoutGridIcon className="mr-2 h-4 w-4" />
          <Trans>Grid</Trans>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === 'table' ? 'default' : 'outline'}
          aria-pressed={view === 'table'}
          onClick={() => changeView('table')}
        >
          <ListIcon className="mr-2 h-4 w-4" />
          <Trans>Table</Trans>
        </Button>
      </fieldset>
      {!isFolderPage && (
        <Button asChild size="sm" variant="ghost">
          <Link to={foldersPath}>
            <Trans>View all folders</Trans>
            <ArrowUpRightIcon className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">
          <Trans>Folders</Trans>
        </h2>
      </div>
      {view === 'table' ? (
        <FolderManagementTable
          key={`${team.id}:${type}:${parentId}`}
          type={type}
          parentId={parentId}
          toolbarActions={toolbarActions}
          isFolderPage={isFolderPage}
          folderSort={folderSort}
          onSortChange={changeSort}
        />
      ) : (
        <FolderCards
          key={`${team.id}:${type}:${parentId}`}
          type={type}
          parentId={parentId}
          toolbarActions={toolbarActions}
          perPage={isFolderPage ? 50 : 6}
          folderSort={folderSort}
        />
      )}
    </div>
  );
};
