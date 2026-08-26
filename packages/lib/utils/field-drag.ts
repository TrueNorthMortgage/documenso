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

export const FIELD_NUDGE_STEP_PX = 1;
export const FIELD_NUDGE_LARGE_STEP_PX = 10;

const FIELD_NUDGE_DIRECTIONS: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

type FieldNudgeDeltaOptions = {
  key: string;
  isLargeStep?: boolean;
};

/**
 * Maps an arrow key to a page-space offset so a selection can be nudged into
 * place instead of dragged. Returns null for any other key.
 */
export const getFieldNudgeDelta = ({ key, isLargeStep = false }: FieldNudgeDeltaOptions) => {
  const direction = FIELD_NUDGE_DIRECTIONS[key];

  if (!direction) {
    return null;
  }

  const step = isLargeStep ? FIELD_NUDGE_LARGE_STEP_PX : FIELD_NUDGE_STEP_PX;

  return { deltaX: direction.x * step, deltaY: direction.y * step };
};

type ClampedFieldPositionOptions = {
  x: number;
  y: number;
  pageWidth: number;
  pageHeight: number;
  fieldWidth: number;
  fieldHeight: number;
};

export type FieldGroupDragPosition = {
  fieldFormId: string;
  height: number;
  width: number;
  x: number;
  y: number;
};

type ClampedFieldGroupPositionsOptions = {
  anchorFieldFormId: string;
  anchorX: number;
  anchorY: number;
  fields: FieldGroupDragPosition[];
  pageHeight: number;
  pageWidth: number;
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

/**
 * Moves a set of fields as one unit while preserving their relative offsets.
 * The complete selection is clamped to the target page rather than clamping
 * each field separately, which would collapse the layout at page edges.
 */
export const getClampedFieldGroupPositions = ({
  anchorFieldFormId,
  anchorX,
  anchorY,
  fields,
  pageHeight,
  pageWidth,
}: ClampedFieldGroupPositionsOptions) => {
  const anchorField = fields.find((field) => field.fieldFormId === anchorFieldFormId);

  if (!anchorField || fields.length === 0) {
    return [];
  }

  const minX = Math.min(...fields.map((field) => field.x));
  const minY = Math.min(...fields.map((field) => field.y));
  const maxX = Math.max(...fields.map((field) => field.x + field.width));
  const maxY = Math.max(...fields.map((field) => field.y + field.height));
  const desiredDeltaX = anchorX - anchorField.x;
  const desiredDeltaY = anchorY - anchorField.y;
  const minDeltaX = -minX;
  const minDeltaY = -minY;
  const maxDeltaX = pageWidth - maxX;
  const maxDeltaY = pageHeight - maxY;
  const deltaX = Math.max(Math.min(minDeltaX, maxDeltaX), Math.min(Math.max(minDeltaX, maxDeltaX), desiredDeltaX));
  const deltaY = Math.max(Math.min(minDeltaY, maxDeltaY), Math.min(Math.max(minDeltaY, maxDeltaY), desiredDeltaY));

  return fields.map((field) => {
    const x = field.x + deltaX;
    const y = field.y + deltaY;

    return {
      ...field,
      x,
      y,
      positionX: pageWidth > 0 ? x / pageWidth : 0,
      positionY: pageHeight > 0 ? y / pageHeight : 0,
    };
  });
};
