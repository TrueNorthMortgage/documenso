import { FieldType } from '@prisma/client';

export const getDefaultFieldDimensions = (type: FieldType | null) =>
  type === FieldType.INITIALS ? { width: 36, height: 36 } : { width: 90, height: 30 };
