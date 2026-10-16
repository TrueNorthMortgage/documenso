import { z } from 'zod';

const ZFolderSortSchema = z.object({
  by: z.enum(['name', 'owner', 'items', 'subfolders']),
  direction: z.enum(['asc', 'desc']),
});

export type FolderSort = z.infer<typeof ZFolderSortSchema>;

export const parseFolderSort = (saved: string | null, canViewOwner: boolean): FolderSort => {
  const fallback: FolderSort = { by: 'name', direction: 'asc' };
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
