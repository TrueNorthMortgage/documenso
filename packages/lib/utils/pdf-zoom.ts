export const PDF_ZOOM_LEVELS = [50, 75, 100, 125, 150, 200] as const;

export type PdfZoomLevel = (typeof PDF_ZOOM_LEVELS)[number];

export const DEFAULT_PDF_ZOOM_LEVEL: PdfZoomLevel = 100;

export const getNextPdfZoomLevel = (current: PdfZoomLevel, direction: 'in' | 'out'): PdfZoomLevel => {
  const currentIndex = PDF_ZOOM_LEVELS.indexOf(current);
  const nextIndex = direction === 'in' ? currentIndex + 1 : currentIndex - 1;
  const boundedIndex = Math.max(0, Math.min(PDF_ZOOM_LEVELS.length - 1, nextIndex));

  return PDF_ZOOM_LEVELS[boundedIndex];
};

export const getCenteredPdfZoomScrollLeft = ({
  currentScrollLeft,
  viewportWidth,
  viewerOffset,
  viewerWidth,
  pageFitWidth,
  currentZoomLevel,
  nextZoomLevel,
  maxScrollLeft,
}: {
  currentScrollLeft: number;
  viewportWidth: number;
  viewerOffset: number;
  viewerWidth: number;
  pageFitWidth: number;
  currentZoomLevel: PdfZoomLevel;
  nextZoomLevel: PdfZoomLevel;
  maxScrollLeft: number;
}) => {
  const getPageOffset = (zoomLevel: PdfZoomLevel) => Math.max(0, (viewerWidth - (pageFitWidth * zoomLevel) / 100) / 2);
  const currentPageOffset = viewerOffset + getPageOffset(currentZoomLevel);
  const nextPageOffset = viewerOffset + getPageOffset(nextZoomLevel);
  const currentCenterOffset = currentScrollLeft + viewportWidth / 2 - currentPageOffset;
  const scaleRatio = nextZoomLevel / currentZoomLevel;
  const nextScrollLeft = nextPageOffset + currentCenterOffset * scaleRatio - viewportWidth / 2;

  return Math.min(Math.max(nextScrollLeft, 0), Math.max(maxScrollLeft, 0));
};
