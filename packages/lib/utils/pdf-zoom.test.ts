import { describe, expect, it } from 'vitest';

import { DEFAULT_PDF_ZOOM_LEVEL, getCenteredPdfZoomScrollLeft, getNextPdfZoomLevel } from './pdf-zoom';

describe('getNextPdfZoomLevel', () => {
  it('starts at 100 percent', () => {
    expect(DEFAULT_PDF_ZOOM_LEVEL).toBe(100);
  });

  it('moves to the next preset in either direction', () => {
    expect(getNextPdfZoomLevel(100, 'in')).toBe(125);
    expect(getNextPdfZoomLevel(100, 'out')).toBe(75);
  });

  it('does not exceed the minimum or maximum zoom levels', () => {
    expect(getNextPdfZoomLevel(50, 'out')).toBe(50);
    expect(getNextPdfZoomLevel(200, 'in')).toBe(200);
  });
});

describe('getCenteredPdfZoomScrollLeft', () => {
  const baseOptions = {
    currentScrollLeft: 0,
    viewportWidth: 800,
    viewerOffset: 0,
    viewerWidth: 800,
    pageFitWidth: 800,
    maxScrollLeft: 800,
  };

  it('keeps the viewport center fixed while zooming in', () => {
    expect(
      getCenteredPdfZoomScrollLeft({
        ...baseOptions,
        currentZoomLevel: 100,
        nextZoomLevel: 150,
      }),
    ).toBe(200);
  });

  it('centers the page inside the fit-to-width viewport at lower zoom levels', () => {
    expect(
      getCenteredPdfZoomScrollLeft({
        ...baseOptions,
        currentZoomLevel: 100,
        nextZoomLevel: 50,
        maxScrollLeft: 0,
      }),
    ).toBe(0);
  });

  it('keeps the result within the available horizontal scroll range', () => {
    expect(
      getCenteredPdfZoomScrollLeft({
        ...baseOptions,
        currentZoomLevel: 100,
        nextZoomLevel: 200,
        maxScrollLeft: 100,
      }),
    ).toBe(100);
  });

  it('centers a capped page when the viewer is wider than its fit width', () => {
    expect(
      getCenteredPdfZoomScrollLeft({
        ...baseOptions,
        viewerWidth: 1000,
        viewportWidth: 800,
        pageFitWidth: 800,
        currentZoomLevel: 100,
        nextZoomLevel: 150,
        maxScrollLeft: 200,
      }),
    ).toBe(50);
  });
});
