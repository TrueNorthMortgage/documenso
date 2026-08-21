import { DEFAULT_RECT_BACKGROUND, getRecipientColorStyles } from '@documenso/ui/lib/recipient-colors';
import Konva from 'konva';

import type { FieldToRender, RenderFieldElementOptions } from './field-renderer';
import { calculateFieldPosition, getNumericAttr } from './field-renderer';

export const konvaTextFontFamily =
  '"Noto Sans", "Noto Sans Japanese", "Noto Sans Chinese", "Noto Sans Korean", sans-serif';
export const konvaTextFill = 'black';
export const CONDITIONAL_FIELD_SELECTION_STROKE = '#ef4444';
const CONDITIONAL_FIELD_INDICATOR_SIZE = 16;
const CONDITIONAL_FIELD_INDICATOR_GAP = 4;
const CONDITIONAL_FIELD_SELECTION_LABEL_GAP = 4;
const CONDITIONAL_FIELD_SELECTION_LABEL_HEIGHT = 14;
const CONDITIONAL_FIELD_SELECTION_LABEL_HORIZONTAL_PADDING = 8;
const CONDITIONAL_FIELD_SELECTION_LABEL_MIN_WIDTH = 16;

export const getFieldRectStyles = (
  field: Pick<FieldToRender, 'conditionalChildRule' | 'isHighlighted'>,
  options: Pick<RenderFieldElementOptions, 'color' | 'mode'>,
) => {
  const isHighlighted = options.mode === 'edit' && field.isHighlighted;

  return {
    stroke: isHighlighted
      ? CONDITIONAL_FIELD_SELECTION_STROKE
      : options.color
        ? getRecipientColorStyles(options.color).baseRing
        : '#e5e7eb',
    strokeWidth: isHighlighted ? 3 : 2,
    dash: options.mode === 'edit' && field.conditionalChildRule ? [4, 3] : [],
  };
};

export const getConditionalFieldIndicatorPosition = ({
  fieldX,
  fieldY,
  fieldWidth,
  fieldHeight,
  pageWidth,
  pageHeight,
}: {
  fieldX: number;
  fieldY: number;
  fieldWidth: number;
  fieldHeight: number;
  pageWidth: number;
  pageHeight: number;
}) => {
  const maxIndicatorX = Math.max(0, pageWidth - CONDITIONAL_FIELD_INDICATOR_SIZE);
  const x = Math.min(Math.max(0, fieldX + fieldWidth - CONDITIONAL_FIELD_INDICATOR_SIZE), maxIndicatorX);
  const abovePosition = fieldY - CONDITIONAL_FIELD_INDICATOR_SIZE - CONDITIONAL_FIELD_INDICATOR_GAP;
  const belowPosition = fieldY + fieldHeight + CONDITIONAL_FIELD_INDICATOR_GAP;
  const fitsAbove = abovePosition >= 0;

  return {
    x,
    y: fitsAbove ? abovePosition : Math.min(belowPosition, Math.max(0, pageHeight - CONDITIONAL_FIELD_INDICATOR_SIZE)),
  };
};

export const getConditionalFieldSelectionLabelPosition = ({
  fieldX,
  fieldY,
  fieldHeight,
  labelWidth,
  pageWidth,
  pageHeight,
}: {
  fieldX: number;
  fieldY: number;
  fieldHeight: number;
  labelWidth: number;
  pageWidth: number;
  pageHeight: number;
}) => {
  const width = Math.max(CONDITIONAL_FIELD_SELECTION_LABEL_MIN_WIDTH, labelWidth);
  const maxX = Math.max(0, pageWidth - width);
  const x = Math.min(Math.max(0, fieldX), maxX);
  const y = Math.min(
    fieldY + fieldHeight + CONDITIONAL_FIELD_SELECTION_LABEL_GAP,
    Math.max(0, pageHeight - CONDITIONAL_FIELD_SELECTION_LABEL_HEIGHT),
  );

  return { x, y, width };
};

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
    ...getFieldRectStyles(field, { color, mode }),
    cornerRadius: 2,
    strokeScaleEnabled: false,
    visible: mode !== 'export',
  } satisfies Partial<Konva.RectConfig>);

  return fieldRect;
};

export const createConditionalFieldIndicator = (field: FieldToRender) => {
  const indicator = new Konva.Group({
    id: `${field.renderId}-conditional-indicator`,
    name: 'conditional-field-indicator',
    listening: false,
  });

  indicator.add(
    new Konva.Circle({
      x: 8,
      y: 8,
      radius: 8,
      fill: 'rgba(245, 158, 11, 0.12)',
      stroke: '#f59e0b',
      strokeWidth: 1,
      listening: false,
    }),
    new Konva.Line({
      points: [1.5, 8, 4.5, 4.5, 8, 3, 11.5, 4.5, 14.5, 8, 11.5, 11.5, 8, 13, 4.5, 11.5, 1.5, 8],
      stroke: '#f59e0b',
      strokeWidth: 1.4,
      lineCap: 'round',
      lineJoin: 'round',
      listening: false,
    }),
    new Konva.Circle({
      x: 8,
      y: 8,
      radius: 2,
      fill: '#f59e0b',
      listening: false,
    }),
    new Konva.Line({
      points: [2.5, 2.5, 13.5, 13.5],
      stroke: '#f59e0b',
      strokeWidth: 1.6,
      lineCap: 'round',
      listening: false,
    }),
  );

  return indicator;
};

export const upsertConditionalFieldIndicator = (field: FieldToRender, options: RenderFieldElementOptions) => {
  const { fieldX, fieldY, fieldWidth, fieldHeight } = calculateFieldPosition(
    field,
    options.pageWidth,
    options.pageHeight,
  );
  const existingIndicator = options.pageLayer.findOne(`#${field.renderId}-conditional-indicator`);
  const indicator =
    existingIndicator instanceof Konva.Group ? existingIndicator : createConditionalFieldIndicator(field);
  const position = getConditionalFieldIndicatorPosition({
    fieldX,
    fieldY,
    fieldWidth,
    fieldHeight,
    pageWidth: options.pageWidth,
    pageHeight: options.pageHeight,
  });

  indicator.setAttrs(position);

  if (!existingIndicator) {
    options.pageLayer.add(indicator);
  }

  return indicator;
};

export const upsertConditionalFieldSelectionLabel = (field: FieldToRender, options: RenderFieldElementOptions) => {
  const { fieldX, fieldY, fieldHeight } = calculateFieldPosition(field, options.pageWidth, options.pageHeight);
  const existingLabel = options.pageLayer.findOne(`#${field.renderId}-conditional-selection-label`);
  const label =
    existingLabel instanceof Konva.Group
      ? existingLabel
      : new Konva.Group({
          id: `${field.renderId}-conditional-selection-label`,
          name: 'conditional-selection-label',
          listening: false,
        });

  if (!(existingLabel instanceof Konva.Group)) {
    label.add(
      new Konva.Rect({
        name: 'conditional-selection-label-background',
        cornerRadius: 3,
        listening: false,
      }),
      new Konva.Text({
        name: 'conditional-selection-label-text',
        listening: false,
      }),
    );
  }

  const background = label.findOne('.conditional-selection-label-background');
  const text = label.findOne('.conditional-selection-label-text');

  if (!(background instanceof Konva.Rect) || !(text instanceof Konva.Text)) {
    return label;
  }

  text.setAttrs({
    text: field.selectionLabel,
    fontFamily: konvaTextFontFamily,
    fontSize: 9,
    fontStyle: 'bold',
  });

  const labelWidth = Math.ceil(text.getTextWidth()) + CONDITIONAL_FIELD_SELECTION_LABEL_HORIZONTAL_PADDING;

  const position = getConditionalFieldSelectionLabelPosition({
    fieldX,
    fieldY,
    fieldHeight,
    labelWidth,
    pageWidth: options.pageWidth,
    pageHeight: options.pageHeight,
  });

  label.setAttrs({ x: position.x, y: position.y });
  background.setAttrs({
    width: position.width,
    height: CONDITIONAL_FIELD_SELECTION_LABEL_HEIGHT,
    fill: 'rgba(255, 255, 255, 0.95)',
    stroke: '#d1d5db',
    strokeWidth: 1,
  });
  text.setAttrs({
    x: CONDITIONAL_FIELD_SELECTION_LABEL_HORIZONTAL_PADDING / 2,
    y: 1,
    width: position.width - CONDITIONAL_FIELD_SELECTION_LABEL_HORIZONTAL_PADDING,
    height: CONDITIONAL_FIELD_SELECTION_LABEL_HEIGHT - 2,
    fill: '#374151',
    align: 'center',
    verticalAlign: 'middle',
    ellipsis: true,
    wrap: 'none',
  });

  if (!(existingLabel instanceof Konva.Group)) {
    existingLabel?.destroy();
    options.pageLayer.add(label);
  }

  return label;
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
