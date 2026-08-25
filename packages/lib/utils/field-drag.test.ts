import { describe, expect, it } from 'vitest';

import { getClampedFieldPosition, getDragScrollDelta } from './field-drag';

describe('getDragScrollDelta', () => {
  const baseOptions = {
    containerTop: 100,
    containerBottom: 700,
    scrollTop: 500,
    clientHeight: 600,
    scrollHeight: 3000,
  };

  it('does not scroll while the pointer is away from the edges', () => {
    expect(getDragScrollDelta({ ...baseOptions, pointerY: 400, elapsedMs: 16 })).toBe(0);
  });

  it('scrolls proportionally to elapsed time near the bottom edge', () => {
    const oneFrame = getDragScrollDelta({ ...baseOptions, pointerY: 700, elapsedMs: 16 });
    const twoFrames = getDragScrollDelta({ ...baseOptions, pointerY: 700, elapsedMs: 32 });

    expect(oneFrame).toBeGreaterThan(0);
    expect(twoFrames).toBeCloseTo(oneFrame * 2);
  });

  it('does not scroll beyond the top or bottom bounds', () => {
    expect(getDragScrollDelta({ ...baseOptions, pointerY: 100, scrollTop: 2, elapsedMs: 100 })).toBe(-2);
    expect(getDragScrollDelta({ ...baseOptions, pointerY: 700, scrollTop: 2400, elapsedMs: 100 })).toBe(0);
  });
});

describe('getClampedFieldPosition', () => {
  it('clamps a field to the target page and returns normalized coordinates', () => {
    expect(
      getClampedFieldPosition({
        x: 950,
        y: -20,
        pageWidth: 1000,
        pageHeight: 1200,
        fieldWidth: 100,
        fieldHeight: 80,
      }),
    ).toEqual({
      x: 900,
      y: 0,
      positionX: 0.9,
      positionY: 0,
    });
  });
});
