import { AppError, AppErrorCode } from '../../errors/app-error';
import { ZFolderNameSchema } from '../../types/folder-name';

export const validateFolderName = (name: string) => {
  const result = ZFolderNameSchema.safeParse(name);

  if (!result.success) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Invalid folder name',
      userMessage: result.error.issues[0]?.message ?? 'Invalid folder name',
    });
  }

  return result.data;
};
