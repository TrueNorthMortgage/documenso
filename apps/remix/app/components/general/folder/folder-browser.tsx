import { useSession } from '@documenso/lib/client-only/providers/session';
import { formatDocumentsPath, formatTemplatesPath } from '@documenso/lib/utils/teams';
import { Button } from '@documenso/ui/primitives/button';
import { Trans, useLingui } from '@lingui/react/macro';
import { FolderType } from '@prisma/client';
import { ArrowUpRightIcon, LayoutGridIcon, ListIcon } from 'lucide-react';
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
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const storageKey = `documenso.folder-view.${user.id}`;
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
          type={type}
          parentId={parentId}
          toolbarActions={toolbarActions}
          isFolderPage={isFolderPage}
        />
      ) : (
        <FolderCards
          key={`${team.id}:${type}:${parentId}`}
          type={type}
          parentId={parentId}
          toolbarActions={toolbarActions}
          perPage={isFolderPage ? 50 : 6}
        />
      )}
    </div>
  );
};
