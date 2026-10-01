import { useCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { formatDocumentsPath, formatTemplatesPath } from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { Skeleton } from '@documenso/ui/primitives/skeleton';
import { Trans } from '@lingui/react/macro';
import { FolderType } from '@prisma/client';
import { ArrowUpIcon, FolderIcon, HomeIcon } from 'lucide-react';
import { Link } from 'react-router';

import { FolderCreateDialog } from '~/components/dialogs/folder-create-dialog';
import { DocumentUploadButtonLegacy } from '~/components/general/document/document-upload-button-legacy';
import { useCurrentTeam } from '~/providers/team';

import { EnvelopeUploadButton } from '../envelope/envelope-upload-button';
import { FolderManagementTable } from './folder-management-table';

export type FolderGridProps = {
  type: FolderType;
  parentId: string | null;
};

/** @deprecated Kept as the dashboard integration point; folders now render as a management table. */
export const FolderGrid = ({ type, parentId }: FolderGridProps) => {
  const team = useCurrentTeam();
  const organisation = useCurrentOrganisation();
  const { data: foldersData, isPending } = trpc.folder.getFolders.useQuery({ type, parentId });
  const rootPath = type === FolderType.DOCUMENT ? formatDocumentsPath(team.url) : formatTemplatesPath(team.url);
  const parentFolder = foldersData?.breadcrumbs.at(-2);
  const parentPath = parentFolder ? `${rootPath}/f/${parentFolder.id}` : rootPath;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div
          className="flex flex-1 items-center font-medium text-muted-foreground text-sm"
          data-testid="folder-grid-breadcrumbs"
        >
          {parentId && (
            <Link to={parentPath} className="mr-3 flex items-center hover:text-foreground" title="Go to parent folder">
              <ArrowUpIcon className="h-4 w-4" />
              <span className="sr-only">
                <Trans>Go to parent folder</Trans>
              </span>
            </Link>
          )}
          <Link to={rootPath} className="flex items-center hover:text-muted-foreground/80">
            <HomeIcon className="mr-2 h-4 w-4" />
            <Trans>Home</Trans>
          </Link>
          {isPending && parentId ? (
            <div className="flex items-center">
              <Skeleton className="mx-3 h-4 w-1 rotate-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          ) : (
            foldersData?.breadcrumbs.map((folder) => (
              <div key={folder.id} className="flex items-center">
                <span className="px-3">/</span>
                <Link to={`${rootPath}/f/${folder.id}`} className="flex items-center hover:text-muted-foreground/80">
                  <FolderIcon className="mr-2 h-4 w-4" />
                  <span>{folder.name}</span>
                </Link>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-4 sm:flex-row sm:justify-end">
          <EnvelopeUploadButton type={type} folderId={parentId || undefined} />
          {type === FolderType.DOCUMENT && (
            <Button asChild variant="outline">
              <Link to={formatTemplatesPath(team.url)}>
                <Trans>Start from Template</Trans>
              </Link>
            </Button>
          )}
          {organisation.organisationClaim.flags.allowLegacyEnvelopes && <DocumentUploadButtonLegacy type={type} />}
          <FolderCreateDialog type={type} parentFolderId={parentId ?? undefined} />
        </div>
      </div>

      <FolderManagementTable type={type} parentId={parentId} />
    </div>
  );
};
