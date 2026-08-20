import { DEFAULT_RECT_BACKGROUND, getRecipientColorStyles } from '@documenso/ui/lib/recipient-colors';
import Konva from 'konva';

import type { FieldToRender, RenderFieldElementOptions } from './field-renderer';
import { calculateFieldPosition, getNumericAttr } from './field-renderer';

export const konvaTextFontFamily =
  '"Noto Sans", "Noto Sans Japanese", "Noto Sans Chinese", "Noto Sans Korean", sans-serif';
export const konvaTextFill = 'black';

export const upsertFieldGroup = (field: FieldToRender, options: RenderFieldElementOptions): Konva.Group => {
  const { pageWidth, pageHeight, pageLayer, editable, scale } = options;

  const { fieldX, fieldY, fieldWidth, fieldHeight } = calculateFieldPosition(field, pageWidth, pageHeight);

  const fieldGroup: Konva.Group =
    pageLayer.findOne(`#${field.renderId}`) ||
    new Konva.Group({
      id: field.renderId,
      name: 'field-group',
    });

  fieldGroup.setAttrs({
    scaleX: 1,
    scaleY: 1,
    x: fieldX,
    y: fieldY,
    dragPageHeight: pageHeight,
    dragPageWidth: pageWidth,
    dragScale: scale,
    dragFieldHeight: fieldHeight,
    dragFieldWidth: fieldWidth,
    draggable: editable,
    dragBoundFunc: (pos) => {
      // Allow the editor to move a field across page boundaries while it is
      // being dragged. The editor validates the final drop target and snaps
      // invalid drops back to the original page.
      if (fieldGroup.isDragging()) {
        return pos;
      }

      const currentPageWidth = getNumericAttr(fieldGroup, 'dragPageWidth') ?? pageWidth;
      const currentPageHeight = getNumericAttr(fieldGroup, 'dragPageHeight') ?? pageHeight;
      const currentScale = getNumericAttr(fieldGroup, 'dragScale') ?? scale;
      const currentFieldWidth = getNumericAttr(fieldGroup, 'dragFieldWidth') ?? fieldWidth;
      const currentFieldHeight = getNumericAttr(fieldGroup, 'dragFieldHeight') ?? fieldHeight;
      const currentMaxXPosition = (currentPageWidth - currentFieldWidth) * currentScale;
      const currentMaxYPosition = (currentPageHeight - currentFieldHeight) * currentScale;

      const newX = Math.max(0, Math.min(currentMaxXPosition, pos.x));
      const newY = Math.max(0, Math.min(currentMaxYPosition, pos.y));

      return { x: newX, y: newY };
    },
  } satisfies Partial<Konva.GroupConfig>);

  return fieldGroup;
};

export const upsertFieldRect = (field: FieldToRender, options: RenderFieldElementOptions): Konva.Rect => {
  const { pageWidth, pageHeight, mode, pageLayer, color } = options;

  const { fieldWidth, fieldHeight } = calculateFieldPosition(field, pageWidth, pageHeight);

  const fieldRect: Konva.Rect =
    pageLayer.findOne(`#${field.renderId}-rect`) ||
    new Konva.Rect({
      id: `${field.renderId}-rect`,
      name: 'field-rect',
    });

  fieldRect.setAttrs({
    width: fieldWidth,
    height: fieldHeight,
    fill: DEFAULT_RECT_BACKGROUND,
    stroke: color ? getRecipientColorStyles(color).baseRing : '#e5e7eb',
    strokeWidth: 2,
    dash: mode === 'edit' && field.conditionalChildRule ? [4, 3] : [],
    cornerRadius: 2,
    strokeScaleEnabled: false,
    visible: mode !== 'export',
  } satisfies Partial<Konva.RectConfig>);

  return fieldRect;
};

export const createConditionalFieldIndicator = (field: FieldToRender, options: RenderFieldElementOptions) => {
  const { fieldWidth } = calculateFieldPosition(field, options.pageWidth, options.pageHeight);

  const indicator = new Konva.Group({
    name: 'conditional-field-indicator',
    x: Math.max(fieldWidth - 18, 2),
    y: 2,
    listening: false,
  });

  indicator.add(
    new Konva.Circle({
      x: 8,
      y: 8,
      radius: 8,
      fill: '#111827',
      stroke: '#f59e0b',
      strokeWidth: 1,
      listening: false,
    }),
    new Konva.Line({
      points: [3, 8, 5, 5, 8, 4, 11, 5, 13, 8, 11, 11, 8, 12, 5, 11, 3, 8],
      stroke: '#f59e0b',
      strokeWidth: 1.25,
      lineCap: 'round',
      lineJoin: 'round',
      listening: false,
    }),
    new Konva.Circle({
      x: 8,
      y: 8,
      radius: 1.5,
      fill: '#f59e0b',
      listening: false,
    }),
    new Konva.Line({
      points: [3, 3, 13, 13],
      stroke: '#f59e0b',
      strokeWidth: 1.5,
      lineCap: 'round',
      listening: false,
    }),
  );

  return indicator;
};

export const createSpinner = ({ fieldWidth, fieldHeight }: { fieldWidth: number; fieldHeight: number }) => {
  const loadingGroup = new Konva.Group({
    name: 'loading-spinner-group',
  });

  const rect = new Konva.Rect({
    x: 4,
    y: 4,
    width: fieldWidth - 8,
    height: fieldHeight - 8,
    fill: 'white',
    opacity: 0.8,
  });

  const maxSpinnerSize = 10;
  const smallerDimension = Math.min(fieldWidth, fieldHeight);
  const spinnerSize = Math.min(smallerDimension, maxSpinnerSize);

  const spinner = new Konva.Arc({
    x: fieldWidth / 2,
    y: fieldHeight / 2,
    innerRadius: spinnerSize,
    outerRadius: spinnerSize / 2,
    angle: 270,
    rotation: 0,
    fill: 'rgba(122, 195, 85, 1)',
    lineCap: 'round',
  });

  loadingGroup.add(rect);
  loadingGroup.add(spinner);

  const anim = new Konva.Animation((frame) => {
    spinner.rotate(180 * (frame.timeDiff / 500));
  });

  anim.start();

  return loadingGroup;
};

type CreateFieldHoverInteractionOptions = {
  options: RenderFieldElementOptions;
  fieldGroup: Konva.Group;
  fieldRect: Konva.Rect;
};

/**
 * Adds smooth transition-like behavior for hover effects to the field group and rectangle.
 */
export const createFieldHoverInteraction = ({ options, fieldGroup, fieldRect }: CreateFieldHoverInteractionOptions) => {
  const { mode } = options;

  if (mode === 'export' || !options.color) {
    return;
  }

  const hoverColor = getRecipientColorStyles(options.color).baseRingHover;

  fieldGroup.on('mouseover', () => {
    const layer = fieldRect.getLayer();
    if (!layer) {
      return;
    }

    new Konva.Tween({
      node: fieldRect,
      duration: 0.3,
      fill: hoverColor,
    }).play();
  });

  fieldGroup.on('mouseout', () => {
    const layer = fieldRect.getLayer();
    if (!layer) {
      return;
    }

    new Konva.Tween({
      node: fieldRect,
      duration: 0.3,
      fill: DEFAULT_RECT_BACKGROUND,
    }).play();
  });

  fieldGroup.on('transformstart', () => {
    const layer = fieldRect.getLayer();
    if (!layer) {
      return;
    }

    new Konva.Tween({
      node: fieldRect,
      duration: 0.3,
      fill: hoverColor,
    }).play();
  });

  fieldGroup.on('transformend', () => {
    const layer = fieldRect.getLayer();
    if (!layer) {
      return;
    }

    new Konva.Tween({
      node: fieldRect,
      duration: 0.3,
      fill: DEFAULT_RECT_BACKGROUND,
    }).play();
  });
};
