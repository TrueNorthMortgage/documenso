import Konva from 'konva';
import { describe, expect, it } from 'vitest';

import {
  CONDITIONAL_FIELD_SELECTION_STROKE,
  getConditionalFieldIndicatorPosition,
  getConditionalFieldSelectionLabelPosition,
  getFieldIndicatorNodes,
  getFieldIndicatorPosition,
  getFieldRectStyles,
} from './field-generic-items';

describe('getFieldRectStyles', () => {
  it('uses a red border for fields selected as conditional children in the editor', () => {
    expect(getFieldRectStyles({ isHighlighted: true, conditionalChildRule: null }, { mode: 'edit' })).toEqual({
      fill: 'rgba(255, 255, 255, 0.001)',
      stroke: CONDITIONAL_FIELD_SELECTION_STROKE,
      strokeWidth: 3,
      dash: [],
    });
  });

  it('does not apply the editor highlight outside edit mode', () => {
    expect(getFieldRectStyles({ isHighlighted: true, conditionalChildRule: null }, { mode: 'sign' })).toEqual({
      fill: 'rgba(255, 255, 255, 0.001)',
      stroke: '#e5e7eb',
      strokeWidth: 2,
      dash: [],
    });
  });

  it('shades required fields with the same recipient color in edit and sign mode', () => {
    const field = { isHighlighted: false, conditionalChildRule: null };
    const editStyles = getFieldRectStyles(field, { mode: 'edit', color: 'readOnly', isRequired: true });
    const signStyles = getFieldRectStyles(field, { mode: 'sign', color: 'readOnly', isRequired: true });

    expect(editStyles).toEqual({
      fill: 'rgba(176, 176, 176, 1)',
      stroke: 'rgba(176, 176, 176, 1)',
      strokeWidth: 2,
      dash: [],
    });
    expect(signStyles).toEqual(editStyles);
  });

  it('does not shade required fields in export mode', () => {
    expect(
      getFieldRectStyles(
        { isHighlighted: false, conditionalChildRule: null },
        { mode: 'export', color: 'readOnly', isRequired: true },
      ).fill,
    ).toBe('rgba(255, 255, 255, 0.001)');
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
