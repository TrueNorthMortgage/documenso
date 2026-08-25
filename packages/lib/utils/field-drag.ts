export const DRAG_SCROLL_EDGE_PX = 96;
export const DRAG_SCROLL_MAX_SPEED_PX_PER_SECOND = 480;

type DragScrollDeltaOptions = {
  pointerY: number;
  containerTop: number;
  containerBottom: number;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  elapsedMs: number;
};

/**
 * Calculates a time-based scroll delta for a field being dragged near a
 * scrollable document edge.
 */
export const getDragScrollDelta = ({
  pointerY,
  containerTop,
  containerBottom,
  scrollTop,
  clientHeight,
  scrollHeight,
  elapsedMs,
}: DragScrollDeltaOptions) => {
  if (elapsedMs <= 0 || clientHeight >= scrollHeight) {
    return 0;
  }

  const distanceFromTop = pointerY - containerTop;
  const distanceFromBottom = containerBottom - pointerY;
  let direction = 0;
  let distanceToEdge = DRAG_SCROLL_EDGE_PX;

  if (distanceFromTop < DRAG_SCROLL_EDGE_PX && scrollTop > 0) {
    direction = -1;
    distanceToEdge = distanceFromTop;
  } else if (distanceFromBottom < DRAG_SCROLL_EDGE_PX && scrollTop + clientHeight < scrollHeight) {
    direction = 1;
    distanceToEdge = distanceFromBottom;
  }

  if (direction === 0) {
    return 0;
  }

  const edgeProximity = Math.min(1, Math.max(0, (DRAG_SCROLL_EDGE_PX - distanceToEdge) / DRAG_SCROLL_EDGE_PX));
  const speed = DRAG_SCROLL_MAX_SPEED_PX_PER_SECOND * edgeProximity ** 2;
  const delta = speed * (Math.min(elapsedMs, 50) / 1000);

  if (direction < 0) {
    return -Math.min(delta, scrollTop);
  }

  return Math.min(delta, scrollHeight - clientHeight - scrollTop);
};

type ClampedFieldPositionOptions = {
  x: number;
  y: number;
  pageWidth: number;
  pageHeight: number;
  fieldWidth: number;
  fieldHeight: number;
};

/**
 * Keeps a dragged field inside the target page and returns normalized
 * positions for persistence.
 */
export const getClampedFieldPosition = ({
  x,
  y,
  pageWidth,
  pageHeight,
  fieldWidth,
  fieldHeight,
}: ClampedFieldPositionOptions) => {
  const maxX = Math.max(0, pageWidth - fieldWidth);
  const maxY = Math.max(0, pageHeight - fieldHeight);
  const clampedX = Math.max(0, Math.min(maxX, x));
  const clampedY = Math.max(0, Math.min(maxY, y));

  return {
    x: clampedX,
    y: clampedY,
    positionX: pageWidth > 0 ? clampedX / pageWidth : 0,
    positionY: pageHeight > 0 ? clampedY / pageHeight : 0,
  };
};
