import { describe, expect, it } from 'vitest';

import {
  getClampedFieldGroupPositions,
  getClampedFieldPosition,
  getDragScrollDelta,
  getFieldNudgeDelta,
} from './field-drag';

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

describe('getClampedFieldGroupPositions', () => {
  const fields = [
    { fieldFormId: 'first', x: 100, y: 200, width: 100, height: 40 },
    { fieldFormId: 'second', x: 250, y: 300, width: 80, height: 60 },
  ];

  it('preserves field offsets while moving the selection', () => {
    expect(
      getClampedFieldGroupPositions({
        anchorFieldFormId: 'first',
        anchorX: 300,
        anchorY: 400,
        fields,
        pageWidth: 1000,
        pageHeight: 1200,
      }),
    ).toEqual([
      { ...fields[0], x: 300, y: 400, positionX: 0.3, positionY: 1 / 3 },
      { ...fields[1], x: 450, y: 500, positionX: 0.45, positionY: 5 / 12 },
    ]);
  });

  it('clamps the complete selection without collapsing its layout', () => {
    const positions = getClampedFieldGroupPositions({
      anchorFieldFormId: 'first',
      anchorX: 950,
      anchorY: 1180,
      fields,
      pageWidth: 1000,
      pageHeight: 1200,
    });

    expect(positions).toEqual([
      { ...fields[0], x: 770, y: 1040, positionX: 0.77, positionY: 1040 / 1200 },
      { ...fields[1], x: 920, y: 1140, positionX: 0.92, positionY: 0.95 },
    ]);
  });

  it('returns no positions when the anchor is missing', () => {
    expect(
      getClampedFieldGroupPositions({
        anchorFieldFormId: 'missing',
        anchorX: 0,
        anchorY: 0,
        fields,
        pageWidth: 1000,
        pageHeight: 1200,
      }),
    ).toEqual([]);
  });
});

describe('getFieldNudgeDelta', () => {
  it('maps each arrow key to a single pixel offset', () => {
    expect(getFieldNudgeDelta({ key: 'ArrowUp' })).toEqual({ deltaX: 0, deltaY: -1 });
    expect(getFieldNudgeDelta({ key: 'ArrowDown' })).toEqual({ deltaX: 0, deltaY: 1 });
    expect(getFieldNudgeDelta({ key: 'ArrowLeft' })).toEqual({ deltaX: -1, deltaY: 0 });
    expect(getFieldNudgeDelta({ key: 'ArrowRight' })).toEqual({ deltaX: 1, deltaY: 0 });
  });

  it('uses a coarser step while shift is held', () => {
    expect(getFieldNudgeDelta({ key: 'ArrowRight', isLargeStep: true })).toEqual({ deltaX: 10, deltaY: 0 });
    expect(getFieldNudgeDelta({ key: 'ArrowUp', isLargeStep: true })).toEqual({ deltaX: 0, deltaY: -10 });
  });

  it('ignores keys that are not arrow keys', () => {
    expect(getFieldNudgeDelta({ key: 'a' })).toBeNull();
    expect(getFieldNudgeDelta({ key: 'Delete' })).toBeNull();
    expect(getFieldNudgeDelta({ key: 'arrowup' })).toBeNull();
  });
});

describe('nudging a multi field selection', () => {
  const selection = [
    { fieldFormId: 'a', height: 40, width: 100, x: 100, y: 100 },
    { fieldFormId: 'b', height: 40, width: 100, x: 300, y: 500 },
  ];

  it('moves every selected field by the same offset', () => {
    const nudge = getFieldNudgeDelta({ key: 'ArrowRight' });

    const positions = getClampedFieldGroupPositions({
      anchorFieldFormId: 'a',
      anchorX: selection[0].x + (nudge?.deltaX ?? 0),
      anchorY: selection[0].y + (nudge?.deltaY ?? 0),
      fields: selection,
      pageWidth: 1000,
      pageHeight: 1200,
    });

    expect(positions.map(({ fieldFormId, x, y }) => ({ fieldFormId, x, y }))).toEqual([
      { fieldFormId: 'a', x: 101, y: 100 },
      { fieldFormId: 'b', x: 301, y: 500 },
    ]);
  });

  it('holds the whole selection still once any edge is reached', () => {
    const flushSelection = [
      { fieldFormId: 'a', height: 40, width: 100, x: 100, y: 100 },
      { fieldFormId: 'b', height: 40, width: 100, x: 900, y: 500 },
    ];

    const positions = getClampedFieldGroupPositions({
      anchorFieldFormId: 'a',
      anchorX: 101,
      anchorY: 100,
      fields: flushSelection,
      pageWidth: 1000,
      pageHeight: 1200,
    });

    expect(positions.map(({ fieldFormId, x, y }) => ({ fieldFormId, x, y }))).toEqual([
      { fieldFormId: 'a', x: 100, y: 100 },
      { fieldFormId: 'b', x: 900, y: 500 },
    ]);
  });
});
