import { FieldType } from '@prisma/client';

export const getDefaultFieldDimensions = (type: FieldType | null) => {
  if (type === FieldType.INITIALS) {
    return { width: 36, height: 36 };
  }

  if (type === FieldType.CHECKBOX) {
    return { width: 30, height: 30 };
  }

  return { width: 90, height: 30 };
};
