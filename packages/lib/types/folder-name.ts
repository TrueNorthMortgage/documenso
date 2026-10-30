import { z } from 'zod';

export const MAX_FOLDER_NAME_LENGTH = 255;

export const ZFolderNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Folder name cannot be empty' })
  .max(MAX_FOLDER_NAME_LENGTH, { message: `Folder name must be ${MAX_FOLDER_NAME_LENGTH} characters or fewer` })
  .regex(/^[^\p{Cc}]*$/u, { message: 'Folder name cannot contain control characters' });
