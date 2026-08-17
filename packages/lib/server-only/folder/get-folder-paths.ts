import { prisma } from '@documenso/prisma';

type FolderPathNode = {
  id: string;
  name: string;
  parentId: string | null;
};

export const getFolderPaths = async (folderIds: string[]) => {
  const requestedFolderIds = [...new Set(folderIds)];
  const folders = new Map<string, FolderPathNode>();
  let pendingFolderIds = requestedFolderIds;

  while (pendingFolderIds.length > 0) {
    const currentFolders = await prisma.folder.findMany({
      where: {
        id: {
          in: pendingFolderIds,
        },
      },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    });

    const nextFolderIds = new Set<string>();

    for (const folder of currentFolders) {
      folders.set(folder.id, folder);

      if (folder.parentId && !folders.has(folder.parentId)) {
        nextFolderIds.add(folder.parentId);
      }
    }

    pendingFolderIds = [...nextFolderIds];
  }

  const folderPaths = new Map<string, string>();

  const getPath = (folderId: string, visitedFolderIds = new Set<string>()): string | undefined => {
    const existingPath = folderPaths.get(folderId);

    if (existingPath) {
      return existingPath;
    }

    const folder = folders.get(folderId);

    if (!folder || visitedFolderIds.has(folderId)) {
      return undefined;
    }

    const nextVisitedFolderIds = new Set(visitedFolderIds).add(folderId);
    const parentPath = folder.parentId ? getPath(folder.parentId, nextVisitedFolderIds) : undefined;
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;

    folderPaths.set(folderId, path);

    return path;
  };

  for (const folderId of requestedFolderIds) {
    getPath(folderId);
  }

  return folderPaths;
};
