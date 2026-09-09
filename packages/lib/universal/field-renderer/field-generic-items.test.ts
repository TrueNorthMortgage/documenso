import { FieldType } from '@prisma/client';
import Konva from 'konva';
import { describe, expect, it } from 'vitest';

import {
  CONDITIONAL_FIELD_SELECTION_STROKE,
  getConditionalFieldIndicatorPosition,
  getConditionalFieldSelectionLabelPosition,
  getFieldIndicatorNodes,
  getFieldIndicatorPosition,
  getFieldRectStyles,
  upsertRequiredFieldIndicator,
} from './field-generic-items';

describe('getFieldRectStyles', () => {
  it('uses a red border for fields selected as conditional children in the editor', () => {
    expect(getFieldRectStyles({ isHighlighted: true, conditionalChildRule: null }, { mode: 'edit' })).toEqual({
      stroke: CONDITIONAL_FIELD_SELECTION_STROKE,
      strokeWidth: 3,
      dash: [],
    });
  });

  it('does not apply the editor highlight outside edit mode', () => {
    expect(getFieldRectStyles({ isHighlighted: true, conditionalChildRule: null }, { mode: 'sign' })).toEqual({
      stroke: '#e5e7eb',
      strokeWidth: 2,
      dash: [],
    });
  });

  it('places the conditional indicator outside the field bounds', () => {
    expect(
      getConditionalFieldIndicatorPosition({
        fieldX: 100,
        fieldY: 50,
        fieldWidth: 40,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({
      x: 124,
      y: 30,
    });
  });

  it('places the indicator at the field top edge when there is no room above', () => {
    expect(
      getConditionalFieldIndicatorPosition({
        fieldX: 550,
        fieldY: 2,
        fieldWidth: 40,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({
      x: 574,
      y: 2,
    });
  });

  it('places the first indicator at the field top right and additional indicators to its left', () => {
    expect(
      getFieldIndicatorPosition({
        fieldX: 100,
        fieldY: 50,
        fieldWidth: 100,
        indicatorIndex: 0,
        indicatorCount: 2,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({ x: 184, y: 30 });

    expect(
      getFieldIndicatorPosition({
        fieldX: 100,
        fieldY: 50,
        fieldWidth: 100,
        indicatorIndex: 1,
        indicatorCount: 2,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({ x: 164, y: 30 });
  });

  it('uses the rightmost slot when only one indicator is active', () => {
    expect(
      getFieldIndicatorPosition({
        fieldX: 100,
        fieldY: 50,
        fieldWidth: 100,
        indicatorIndex: 0,
        indicatorCount: 1,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({ x: 184, y: 30 });
  });

  it('compacts active indicator nodes when an earlier indicator is absent', () => {
    const validationIndicator = new Konva.Group({ id: 'field-validation-group-indicator' });
    const pageLayer = {
      findOne: (selector: string) =>
        selector === '#field-validation-group-indicator' ? validationIndicator : undefined,
    } as unknown as Konva.Layer;

    expect(getFieldIndicatorNodes('field', pageLayer)).toEqual([validationIndicator]);
  });

  it('creates a Font Awesome triangle-exclamation required-field indicator', () => {
    let addedIndicator: Konva.Group | undefined;
    const pageLayer = {
      findOne: () => undefined,
      add: (indicator: Konva.Group) => {
        addedIndicator = indicator;
      },
    } as unknown as Konva.Layer;
    const field = {
      renderId: 'field',
      envelopeItemId: 'envelope-item',
      recipientId: 1,
      type: FieldType.TEXT,
      page: 1,
      customText: '',
      inserted: false,
      width: 20,
      height: 5,
      positionX: 10,
      positionY: 10,
    } as const;

    const indicator = upsertRequiredFieldIndicator(field, {
      pageLayer,
      pageWidth: 600,
      pageHeight: 800,
      mode: 'edit',
      scale: 1,
      translations: null,
    });

    expect(indicator.id()).toBe('field-required-indicator');
    expect(indicator.name()).toBe('required-field-indicator');
    expect(indicator.visible()).toBe(false);
    expect(addedIndicator).toBe(indicator);
    expect(indicator.find('.required-indicator-icon')).toHaveLength(1);
    expect(indicator.findOne('.required-indicator-icon')?.getAttr('data')).toContain('M256 32');
  });

  it('supports more than two indicator slots', () => {
    expect(
      getFieldIndicatorPosition({
        fieldX: 100,
        fieldY: 50,
        fieldWidth: 100,
        indicatorIndex: 0,
        indicatorCount: 3,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({ x: 184, y: 30 });

    expect(
      getFieldIndicatorPosition({
        fieldX: 100,
        fieldY: 50,
        fieldWidth: 100,
        indicatorIndex: 2,
        indicatorCount: 3,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({ x: 144, y: 30 });
  });

  it('places the compact temporary field name below the field', () => {
    expect(
      getConditionalFieldSelectionLabelPosition({
        fieldX: 100,
        fieldY: 50,
        fieldHeight: 20,
        labelWidth: 34,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({ x: 100, y: 74, width: 34 });
  });
});
