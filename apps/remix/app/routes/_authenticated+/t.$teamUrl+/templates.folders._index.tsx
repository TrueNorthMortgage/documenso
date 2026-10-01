import { FolderType } from '@documenso/lib/types/folder-type';
import { formatTemplatesPath } from '@documenso/lib/utils/teams';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { HomeIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { FolderCreateDialog } from '~/components/dialogs/folder-create-dialog';
import { FolderManagementTable } from '~/components/general/folder/folder-management-table';
import { useCurrentTeam } from '~/providers/team';
import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Templates`);
}

export default function TemplatesFoldersPage() {
  const team = useCurrentTeam();
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get('parentId');

  return (
    <div className="mx-auto w-full max-w-screen-xl px-4 md:px-8">
      <div className="flex w-full items-center justify-between">
        <Link
          to={formatTemplatesPath(team.url)}
          className="flex items-center font-medium text-muted-foreground text-sm hover:text-muted-foreground/80"
        >
          <HomeIcon className="mr-2 h-4 w-4" />
          <Trans>Home</Trans>
        </Link>
        <FolderCreateDialog type={FolderType.TEMPLATE} parentFolderId={parentId} />
      </div>
      <h1 className="my-6 truncate font-semibold text-2xl md:text-3xl">
        <Trans>All Folders</Trans>
      </h1>
      <FolderManagementTable type={FolderType.TEMPLATE} parentId={parentId} />
    </div>
  );
}
