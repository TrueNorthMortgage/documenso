import { DocumentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  canEditEnvelopeShapes,
  ENVELOPE_TEXT_FONT_FAMILIES,
  getEnvelopeTextStyle,
  parseEnvelopeShapes,
  ZEnvelopeShapesSchema,
} from './envelope-shape';

const shape = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'rectangle',
  page: 1,
  positionX: 10,
  positionY: 20,
  width: 30,
  height: 15,
  color: '#000000',
  thickness: 2,
};

describe('document shape validation', () => {
  it('preserves explicit text-border preferences without adding borders to legacy content', () => {
    expect(parseEnvelopeShapes([{ ...shape, type: 'text' }])[0].hasBorder).toBeUndefined();
    expect(parseEnvelopeShapes([{ ...shape, type: 'text', hasBorder: false }])[0].hasBorder).toBe(false);
    expect(parseEnvelopeShapes([{ ...shape, type: 'text', hasBorder: true }])[0].hasBorder).toBe(true);
    expect(ZEnvelopeShapesSchema.safeParse([{ ...shape, type: 'text', hasBorder: 'yes' }]).success).toBe(false);
  });
  it.each(
    Object.entries(ENVELOPE_TEXT_FONT_FAMILIES),
  )('preserves %s font selections and resolves their bundled family', (fontFamily, font) => {
    const text = parseEnvelopeShapes([{ ...shape, type: 'text', fontFamily }])[0];
    expect(text.fontFamily).toBe(fontFamily);
    expect(getEnvelopeTextStyle(text).fontFamily).toBe(font.cssFamily);
  });
  it('keeps Arial for legacy content and rejects unknown fonts', () => {
    expect(getEnvelopeTextStyle(parseEnvelopeShapes([{ ...shape, type: 'text' }])[0]).fontFamily).toBe('Arial');
    expect(ZEnvelopeShapesSchema.safeParse([{ ...shape, type: 'text', fontFamily: 'unknown' }]).success).toBe(false);
  });
  it.each(['rectangle', 'ellipse', 'text'])('preserves optional backgrounds for %s shapes', (type) => {
    expect(parseEnvelopeShapes([{ ...shape, type, fillColor: '#7c3aed' }])[0].fillColor).toBe('#7c3aed');
    expect(parseEnvelopeShapes([{ ...shape, type, fillColor: null }])[0].fillColor).toBeNull();
    expect(parseEnvelopeShapes([{ ...shape, type }])[0].fillColor).toBeUndefined();
  });
  it.each([
    { type: 'rectangle', fillColor: 'url(https://example.test)' },
    { type: 'line', fillColor: '#ffffff' },
    { type: 'text', fillColor: 'transparent' },
  ])('rejects invalid backgrounds: %j', (invalid) => {
    expect(ZEnvelopeShapesSchema.safeParse([{ ...shape, ...invalid }]).success).toBe(false);
  });
  it('preserves sender text and formatting alongside legacy shapes', () => {
    const text = {
      ...shape,
      id: '00000000-0000-4000-8000-000000000002',
      type: 'text',
      text: 'Sender note\nSecond line — café',
      fontSize: 18,
      textAlign: 'center',
    };
    expect(parseEnvelopeShapes([shape, text])).toEqual([shape, text]);
  });

  it.each([
    { text: 'a'.repeat(2001) },
    { fontSize: 7 },
    { fontSize: 73 },
    { fontSize: 12.5 },
    { textAlign: 'distributed' },
  ])('rejects invalid text content or formatting: %j', (invalid) => {
    expect(ZEnvelopeShapesSchema.safeParse([{ ...shape, type: 'text', ...invalid }]).success).toBe(false);
  });
  it('supports empty legacy items and valid shapes', () => {
    expect(parseEnvelopeShapes(undefined)).toEqual([]);
    expect(parseEnvelopeShapes([shape])).toEqual([shape]);
    expect(ZEnvelopeShapesSchema.parse([{ ...shape, type: 'line', height: 0 }])).toHaveLength(1);
  });
  it('preserves justified text and custom hexadecimal colors', () => {
    const content = { ...shape, type: 'text', text: 'Custom color', textAlign: 'justify', color: '#aB34eF' };
    expect(parseEnvelopeShapes([content])).toEqual([content]);
  });
  it.each(['red', '#abc', '#12345678', 'url(https://example.test)', '#xyzxyz'])('rejects invalid color %s', (color) => {
    expect(ZEnvelopeShapesSchema.safeParse([{ ...shape, color }]).success).toBe(false);
  });

  it.each(['solid', 'dashed', 'dotted'])('preserves the %s border style', (borderStyle) => {
    expect(parseEnvelopeShapes([{ ...shape, borderStyle }])[0].borderStyle).toBe(borderStyle);
  });
  it('rejects unsupported border types', () => {
    expect(ZEnvelopeShapesSchema.safeParse([{ ...shape, borderStyle: 'custom' }]).success).toBe(false);
  });

  it.each([
    { positionX: 90 },
    { positionY: 90 },
    { width: 0 },
    { height: -1 },
    { height: 0 },
    { page: 0 },
    { page: 1.5 },
    { thickness: 5 },
    { thickness: 1.5 },
    { color: 'url(https://example.test)' },
    { positionX: NaN },
  ])('rejects invalid or out-of-page shapes: %j', (invalid) => {
    expect(ZEnvelopeShapesSchema.safeParse([{ ...shape, ...invalid }]).success).toBe(false);
  });

  it('rejects duplicate IDs and excessive item sizes', () => {
    expect(ZEnvelopeShapesSchema.safeParse([shape, shape]).success).toBe(false);
    expect(ZEnvelopeShapesSchema.safeParse(Array.from({ length: 501 }, () => shape)).success).toBe(false);
  });
});

describe('shape edit permissions', () => {
  it('allows drafts and active corrections', () => {
    expect(canEditEnvelopeShapes({ internalVersion: 2, status: DocumentStatus.DRAFT, correctionStartedAt: null })).toBe(
      true,
    );
    expect(
      canEditEnvelopeShapes({ internalVersion: 2, status: DocumentStatus.PENDING, correctionStartedAt: new Date() }),
    ).toBe(true);
  });

  it.each([
    DocumentStatus.PENDING,
    DocumentStatus.COMPLETED,
    DocumentStatus.REJECTED,
  ])('locks %s outside correction', (status) => {
    expect(canEditEnvelopeShapes({ internalVersion: 2, status, correctionStartedAt: null })).toBe(false);
  });

  it('does not unlock completed, rejected or legacy documents through correction metadata', () => {
    expect(
      canEditEnvelopeShapes({ internalVersion: 2, status: DocumentStatus.COMPLETED, correctionStartedAt: new Date() }),
    ).toBe(false);
    expect(
      canEditEnvelopeShapes({ internalVersion: 2, status: DocumentStatus.REJECTED, correctionStartedAt: new Date() }),
    ).toBe(false);
    expect(canEditEnvelopeShapes({ internalVersion: 1, status: DocumentStatus.DRAFT, correctionStartedAt: null })).toBe(
      false,
    );
  });
});
