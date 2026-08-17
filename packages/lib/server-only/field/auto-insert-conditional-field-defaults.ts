import { DEFAULT_DOCUMENT_DATE_FORMAT } from '@documenso/lib/constants/date-formats';
import { DEFAULT_DOCUMENT_TIME_ZONE } from '@documenso/lib/constants/time-zones';
import type { TDocumentMeta } from '@documenso/lib/types/document-meta';
import { getConditionalFieldVisibility } from '@documenso/lib/universal/conditional-field-visibility';
import type { Prisma } from '@prisma/client';
import { FieldType } from '@prisma/client';
import { DateTime } from 'luxon';

import { extractFieldAutoInsertValues } from './extract-field-auto-insert-values';

export const autoInsertConditionalFieldDefaults = async ({
  tx,
  envelopeItemId,
  fieldIds,
  documentMeta,
}: {
  tx: Prisma.TransactionClient;
  envelopeItemId: string;
  fieldIds: number[];
  documentMeta: Pick<TDocumentMeta, 'timezone' | 'dateFormat'> | null;
}) => {
  if (fieldIds.length === 0) {
    return [];
  }

  const fields = await tx.field.findMany({
    where: {
      envelopeItemId,
    },
    include: {
      conditionalChildRule: true,
      envelope: {
        select: {
          internalVersion: true,
        },
      },
      recipient: {
        select: {
          email: true,
        },
      },
    },
  });

  const visibility = getConditionalFieldVisibility(
    fields.map((field) => ({
      ...field,
      envelopeInternalVersion: field.envelope.internalVersion,
    })),
  );

  const fieldsToInsert = fields.flatMap((field) => {
    if (!fieldIds.includes(field.id) || field.inserted || visibility.get(field.id) === false) {
      return [];
    }

    if (field.type === FieldType.DATE) {
      return [
        {
          id: field.id,
          customText: DateTime.now()
            .setZone(documentMeta?.timezone ?? DEFAULT_DOCUMENT_TIME_ZONE)
            .toFormat(documentMeta?.dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT),
        },
      ];
    }

    const autoInsertValue = extractFieldAutoInsertValues(field, field.recipient ?? { email: '' });

    return autoInsertValue
      ? [
          {
            id: field.id,
            customText: autoInsertValue.customText,
          },
        ]
      : [];
  });

  return await Promise.all(
    fieldsToInsert.map(({ id, customText }) =>
      tx.field.update({
        where: {
          id,
        },
        data: {
          customText,
          inserted: true,
        },
      }),
    ),
  );
};
