import { FieldType, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { TFieldGroup } from '../types/field-group';
import { fieldsContainUnsignedRequiredField } from './advanced-fields-helpers';
import { getFieldReview, type ReviewField } from './field-review';

const field = (id: number, overrides: Partial<ReviewField> = {}): ReviewField => ({
  id,
  secondaryId: String(id),
  envelopeId: 'envelope-1',
  envelopeItemId: 'item-1',
  recipientId: 1,
  type: FieldType.INITIALS,
  page: 1,
  positionX: new Prisma.Decimal(10),
  positionY: new Prisma.Decimal(10),
  width: new Prisma.Decimal(10),
  height: new Prisma.Decimal(5),
  inserted: false,
  customText: '',
  fieldMeta: null,
  fieldGroupId: null,
  templateSourceItemId: null,
  ...overrides,
});

const group: TFieldGroup = {
  id: 'group-1',
  name: 'Initials',
  type: FieldType.INITIALS,
  groupType: 'VALIDATION_GROUP',
  required: true,
  readOnly: false,
  fontSize: null,
  direction: null,
  validationRule: 'Select exactly',
  validationLength: 1,
  envelopeId: 'envelope-1',
  envelopeItemId: 'item-1',
  recipientId: 1,
};

describe('field review', () => {
  it('distinguishes missing required fields from optional empty fields and completed fields', () => {
    const entries = getFieldReview([
      field(1),
      field(2, { type: FieldType.TEXT, fieldMeta: { type: 'text', required: false } }),
      field(3, { inserted: true, customText: 'JS' }),
    ]);
    expect(entries.map((entry) => entry.status)).toEqual(['required', 'optional', 'complete']);
    expect(entries.filter((entry) => entry.isBlocking).map((entry) => entry.field.id)).toEqual([1]);
  });

  it('does not count hidden conditional fields as blockers', () => {
    const entries = getFieldReview([
      field(1, { type: FieldType.TEXT, inserted: true, customText: 'No' }),
      field(2, {
        conditionalChildRule: {
          id: 1,
          parentFieldId: 1,
          childFieldId: 2,
          operator: 'EQUALS',
          value: 'Yes',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ]);
    expect(entries[1].status).toBe('hidden');
    expect(entries[1].isBlocking).toBe(false);
  });

  it('shows unfilled members of a satisfied group as group complete', () => {
    const fields = [
      field(1, { fieldGroupId: group.id, fieldGroup: group, inserted: true, customText: 'JS' }),
      field(2, { fieldGroupId: group.id, fieldGroup: group }),
    ];
    expect(getFieldReview(fields).every((entry) => entry.status === 'group-complete')).toBe(true);
    expect(fieldsContainUnsignedRequiredField(fields)).toBe(false);
  });

  it('counts an unsatisfied group once and reports it even when every member is inserted', () => {
    const fields = [1, 2].map((id) =>
      field(id, {
        fieldGroupId: group.id,
        fieldGroup: group,
        inserted: true,
        customText: 'JS',
      }),
    );
    const entries = getFieldReview(fields);
    expect(entries.every((entry) => entry.status === 'group-incomplete')).toBe(true);
    expect(new Set(entries.filter((entry) => entry.isBlocking).map((entry) => entry.requirementKey)).size).toBe(1);
    expect(fieldsContainUnsignedRequiredField(fields)).toBe(true);
  });

  it('reports impossible group rules instead of suggesting all fields are complete', () => {
    const invalidGroup = { ...group, validationLength: 3 };
    const entries = getFieldReview([field(1, { fieldGroupId: group.id, fieldGroup: invalidGroup })]);
    expect(entries[0].status).toBe('invalid-group');
    expect(entries[0].isBlocking).toBe(true);
  });

  it('shows an empty read-only field without asking the signer to fill it', () => {
    const [entry] = getFieldReview([
      field(1, { type: FieldType.TEXT, fieldMeta: { type: 'text', required: false, readOnly: true } }),
    ]);
    expect(entry.status).toBe('read-only');
    expect(entry.isBlocking).toBe(false);
  });

  it('makes a conditional requirement blocking when the parent answer reveals it', () => {
    const parent = field(1, { type: FieldType.TEXT, inserted: true, customText: 'No' });
    const child = field(2, {
      conditionalChildRule: {
        id: 1,
        parentFieldId: 1,
        childFieldId: 2,
        operator: 'EQUALS',
        value: 'Yes',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect(getFieldReview([parent, child])[1].isBlocking).toBe(false);
    const entry = getFieldReview([{ ...parent, customText: 'Yes' }, child])[1];
    expect(entry.status).toBe('required');
    expect(entry.isBlocking).toBe(true);
  });

  it('excludes saved answers in hidden group members from the group requirement', () => {
    const entries = getFieldReview([
      field(1, { type: FieldType.TEXT, inserted: true, customText: 'No' }),
      field(2, { fieldGroupId: group.id, fieldGroup: group, inserted: true, customText: 'JS' }),
      field(3, {
        fieldGroupId: group.id,
        fieldGroup: group,
        inserted: true,
        customText: 'JS',
        conditionalChildRule: {
          id: 1,
          parentFieldId: 1,
          childFieldId: 3,
          operator: 'EQUALS',
          value: 'Yes',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ]);
    expect(entries[1].status).toBe('group-complete');
    expect(entries[1].groupState?.selectedCount).toBe(1);
    expect(entries[2].status).toBe('hidden');
    expect(entries.every((entry) => !entry.isBlocking)).toBe(true);
  });

  it('allows an optional radio group to remain empty', () => {
    const optionalGroup: TFieldGroup = {
      ...group,
      type: FieldType.RADIO,
      groupType: 'OPTION_GROUP',
      required: false,
      validationRule: null,
      validationLength: null,
    };
    const entries = getFieldReview([
      field(1, { type: FieldType.RADIO, fieldGroupId: group.id, fieldGroup: optionalGroup }),
      field(2, { type: FieldType.RADIO, fieldGroupId: group.id, fieldGroup: optionalGroup }),
    ]);
    expect(entries.every((entry) => entry.status === 'group-complete' && !entry.isBlocking)).toBe(true);
  });
});
