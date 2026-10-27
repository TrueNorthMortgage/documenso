import { z } from 'zod';

const ZFolderSortSchema = z.object({
  by: z.enum(['createdAt', 'name', 'owner', 'items', 'subfolders']),
  direction: z.enum(['asc', 'desc']),
});

export type FolderSort = z.infer<typeof ZFolderSortSchema>;

export const DEFAULT_FOLDER_SORT: FolderSort = { by: 'createdAt', direction: 'desc' };

export const parseFolderSort = (saved: string | null, canViewOwner: boolean): FolderSort => {
  const fallback = DEFAULT_FOLDER_SORT;
  try {
    const parsed = ZFolderSortSchema.safeParse(saved ? JSON.parse(saved) : null);
    if (!parsed.success || (parsed.data.by === 'owner' && !canViewOwner)) {
      return fallback;
    }
    return parsed.data;
  } catch {
    return fallback;
  }
};
