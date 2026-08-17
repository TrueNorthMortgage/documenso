import { FieldType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ConditionalFieldRuleOperator } from '../../types/conditional-field';
import { autoInsertConditionalFieldDefaults } from './auto-insert-conditional-field-defaults';

describe('autoInsertConditionalFieldDefaults', () => {
  it('restores automatic values for fields that become visible', async () => {
    const fields = [
      {
        id: 1,
        type: FieldType.RADIO,
        customText: '0',
        inserted: true,
        fieldMeta: {
          type: 'radio',
          direction: 'vertical',
          values: [
            { id: 1, value: 'Yes', checked: false },
            { id: 2, value: 'No', checked: false },
          ],
        },
        envelopeItemId: 'item-1',
        recipientId: 1,
        conditionalChildRule: null,
        envelope: { internalVersion: 2 },
        recipient: { email: 'recipient@example.com' },
      },
      {
        id: 2,
        type: FieldType.TEXT,
        customText: '',
        inserted: false,
        fieldMeta: { type: 'text', text: 'default text' },
        envelopeItemId: 'item-1',
        recipientId: 1,
        conditionalChildRule: {
          id: 12,
          childFieldId: 2,
          parentFieldId: 1,
          operator: ConditionalFieldRuleOperator.EQUALS,
          value: 'Yes',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        envelope: { internalVersion: 2 },
        recipient: { email: 'recipient@example.com' },
      },
      {
        id: 3,
        type: FieldType.DATE,
        customText: '',
        inserted: false,
        fieldMeta: { type: 'date' },
        envelopeItemId: 'item-1',
        recipientId: 1,
        conditionalChildRule: {
          id: 13,
          childFieldId: 3,
          parentFieldId: 1,
          operator: ConditionalFieldRuleOperator.EQUALS,
          value: 'Yes',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        envelope: { internalVersion: 2 },
        recipient: { email: 'recipient@example.com' },
      },
    ];

    const update = vi.fn(async ({ where, data }: { where: { id: number }; data: object }) => ({
      ...fields.find((field) => field.id === where.id),
      ...data,
    }));

    const tx = {
      field: {
        findMany: vi.fn().mockResolvedValue(fields),
        update,
      },
    } as never;

    const updatedFields = await autoInsertConditionalFieldDefaults({
      tx,
      envelopeItemId: 'item-1',
      fieldIds: [2, 3],
      documentMeta: {
        timezone: 'UTC',
        dateFormat: 'yyyy-MM-dd',
      },
    });

    expect(updatedFields).toHaveLength(2);
    expect(update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { customText: 'default text', inserted: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: expect.objectContaining({ inserted: true }),
    });
  });
});
