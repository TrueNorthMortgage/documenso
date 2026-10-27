import { ZFolderTypeSchema } from '@documenso/lib/types/folder-type';
import { ZFindResultResponse, ZFindSearchParamsSchema } from '@documenso/lib/types/search-params';
import { DocumentVisibility } from '@documenso/prisma/generated/types';
import FolderSchema from '@documenso/prisma/generated/zod/modelSchema/FolderSchema';
import { z } from 'zod';

export const ZFolderSchema = FolderSchema.pick({
  id: true,
  name: true,
  userId: true,
  teamId: true,
  parentId: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
  visibility: true,
  type: true,
}).extend({
  ownerName: z.string().nullable().optional(),
});

export type TFolder = z.infer<typeof ZFolderSchema>;

const ZFolderCountSchema = z.object({
  documents: z.number(),
  templates: z.number(),
  subfolders: z.number(),
});

const ZSubfolderSchema = ZFolderSchema.extend({
  subfolders: z.array(z.any()),
  _count: ZFolderCountSchema,
});

export const ZFolderWithSubfoldersSchema = ZFolderSchema.extend({
  subfolders: z.array(ZSubfolderSchema),
  _count: ZFolderCountSchema,
});

export type TFolderWithSubfolders = z.infer<typeof ZFolderWithSubfoldersSchema>;

const ZFolderParentIdSchema = z
  .string()
  .describe('The folder ID to place this folder within. Leave empty to place folder at the root level.');

export const ZCreateFolderRequestSchema = z.object({
  name: z.string().trim().min(1),
  parentId: ZFolderParentIdSchema.optional(),
  type: ZFolderTypeSchema.optional(),
});

export const ZCreateFolderResponseSchema = ZFolderSchema;

export const ZUpdateFolderRequestSchema = z.object({
  folderId: z.string().describe('The ID of the folder to update'),
  data: z.object({
    name: z.string().trim().min(1).optional().describe('The name of the folder'),
    parentId: ZFolderParentIdSchema.optional().nullable(),
    visibility: z.nativeEnum(DocumentVisibility).optional().describe('The visibility of the folder'),
    pinned: z.boolean().optional().describe('Whether the folder should be pinned'),
  }),
});

export type TUpdateFolderRequestSchema = z.infer<typeof ZUpdateFolderRequestSchema>;

export const ZUpdateFolderResponseSchema = ZFolderSchema;

export const ZDeleteFolderRequestSchema = z.object({
  folderId: z.string(),
});

export const ZFolderSortBySchema = z.enum(['createdAt', 'name', 'owner', 'items', 'subfolders']);

export const ZGetFoldersSchema = ZFindSearchParamsSchema.extend({
  query: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  includeSearchParents: z.boolean().optional(),
  childDepth: z.number().int().min(1).max(4).optional(),
  cursor: z.number().int().positive().max(1_000_000).optional(),
  parentId: z.string().min(1).max(128).nullable().optional(),
  type: ZFolderTypeSchema.optional(),
  sortBy: ZFolderSortBySchema.optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const ZGetFoldersResponseSchema = z.object({
  searchParents: z.array(ZFolderWithSubfoldersSchema),

  folders: z.array(ZFolderWithSubfoldersSchema),
  breadcrumbs: z.array(ZFolderSchema),
  type: ZFolderTypeSchema.optional(),
  count: z.number(),
  currentPage: z.number(),
  perPage: z.number(),
  totalPages: z.number(),
});

export type TGetFoldersResponse = z.infer<typeof ZGetFoldersResponseSchema>;

export const ZFindFoldersRequestSchema = ZFindSearchParamsSchema.extend({
  parentId: z.string().optional().describe('Filter folders by the parent folder ID'),
  type: ZFolderTypeSchema.optional().describe('Filter folders by the folder type'),
});

export const ZFindFoldersResponseSchema = ZFindResultResponse.extend({
  data: z.array(ZFolderSchema),
});

export const ZFindFoldersInternalRequestSchema = ZFindSearchParamsSchema.extend({
  parentId: z.string().nullable().optional(),
  type: ZFolderTypeSchema.optional(),
});

export const ZFindFoldersInternalResponseSchema = z.object({
  data: z.array(ZFolderWithSubfoldersSchema),
  breadcrumbs: z.array(ZFolderSchema),
  type: ZFolderTypeSchema.optional(),
});

export type TFindFoldersResponse = z.infer<typeof ZFindFoldersResponseSchema>;
