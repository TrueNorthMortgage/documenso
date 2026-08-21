import { describe, expect, it } from 'vitest';

import {
  CONDITIONAL_FIELD_SELECTION_STROKE,
  getConditionalFieldIndicatorPosition,
  getConditionalFieldSelectionLabelPosition,
  getFieldRectStyles,
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
        fieldHeight: 20,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({
      x: 124,
      y: 30,
    });
  });

  it('places the indicator below fields at the top of the page', () => {
    expect(
      getConditionalFieldIndicatorPosition({
        fieldX: 550,
        fieldY: 2,
        fieldWidth: 40,
        fieldHeight: 20,
        pageWidth: 600,
        pageHeight: 800,
      }),
    ).toEqual({
      x: 574,
      y: 26,
    });
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
