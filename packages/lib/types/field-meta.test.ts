import { FieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  canFieldTypeUseBulkSetting,
  DEFAULT_INITIALS_OVERFLOW_MODE,
  DEFAULT_NAME_OVERFLOW_MODE,
  DEFAULT_NUMBER_OVERFLOW_MODE,
  DEFAULT_TEXT_OVERFLOW_MODE,
  FIELD_META_DEFAULT_VALUES,
  resolveFieldOverflowMode,
  ZEnvelopeFieldAndMetaSchema,
  ZTextFieldMeta,
} from './field-meta';

describe('text field required defaults', () => {
  it('requires newly placed text fields by default', () => {
    expect(FIELD_META_DEFAULT_VALUES[FieldType.TEXT]).toMatchObject({ type: 'text', required: true });
    expect(ZEnvelopeFieldAndMetaSchema.parse({ type: FieldType.TEXT }).fieldMeta).toMatchObject({
      type: 'text',
      required: true,
    });
  });

  it('preserves an explicitly optional text field', () => {
    expect(
      ZEnvelopeFieldAndMetaSchema.parse({
        type: FieldType.TEXT,
        fieldMeta: { type: 'text', required: false },
      }).fieldMeta,
    ).toMatchObject({ type: 'text', required: false });
  });

  it('does not reinterpret legacy text metadata as required', () => {
    expect(ZTextFieldMeta.parse({ type: 'text' }).required).toBeUndefined();
    expect(
      ZEnvelopeFieldAndMetaSchema.parse({ type: FieldType.TEXT, fieldMeta: { type: 'text' } }).fieldMeta,
    ).not.toHaveProperty('required');
  });

  it('preserves defaults for other optional field types', () => {
    for (const type of [FieldType.NUMBER, FieldType.RADIO, FieldType.CHECKBOX, FieldType.DROPDOWN]) {
      expect(FIELD_META_DEFAULT_VALUES[type]).toMatchObject({ required: false });
    }
  });
});

describe('field overflow defaults', () => {
  it('keeps initials horizontal and other generic text fields automatic', () => {
    expect(DEFAULT_INITIALS_OVERFLOW_MODE).toBe('horizontal');
    expect(DEFAULT_NAME_OVERFLOW_MODE).toBe('auto');
    expect(DEFAULT_NUMBER_OVERFLOW_MODE).toBe('auto');
    expect(DEFAULT_TEXT_OVERFLOW_MODE).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'initials' })).toBe('horizontal');
    expect(resolveFieldOverflowMode({ type: 'name' })).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'number' })).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'text' })).toBe('auto');
  });

  it('uses the field type when metadata is missing', () => {
    expect(resolveFieldOverflowMode(undefined, 'INITIALS')).toBe('horizontal');
    expect(resolveFieldOverflowMode(undefined, 'NAME')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'NUMBER')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'TEXT')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'DATE')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'EMAIL')).toBe('auto');
  });

  it('preserves explicit overflow settings', () => {
    expect(resolveFieldOverflowMode({ type: 'initials', overflow: 'crop' })).toBe('crop');
    expect(resolveFieldOverflowMode({ type: 'name', overflow: 'crop' })).toBe('crop');
    expect(resolveFieldOverflowMode({ type: 'text', overflow: 'horizontal' })).toBe('horizontal');
  });
});

describe('bulk field setting support', () => {
  it('matches the settings supported by each field type', () => {
    expect(canFieldTypeUseBulkSetting(FieldType.TEXT, 'required')).toBe(true);
    expect(canFieldTypeUseBulkSetting(FieldType.TEXT, 'readOnly')).toBe(true);
    expect(canFieldTypeUseBulkSetting(FieldType.INITIALS, 'required')).toBe(true);
    expect(canFieldTypeUseBulkSetting(FieldType.INITIALS, 'readOnly')).toBe(false);
    expect(canFieldTypeUseBulkSetting(FieldType.NAME, 'required')).toBe(false);
    expect(canFieldTypeUseBulkSetting(FieldType.DATE, 'readOnly')).toBe(false);
    expect(canFieldTypeUseBulkSetting(FieldType.SIGNATURE, 'required')).toBe(false);
    expect(canFieldTypeUseBulkSetting(FieldType.FREE_SIGNATURE, 'readOnly')).toBe(false);
  });
});
