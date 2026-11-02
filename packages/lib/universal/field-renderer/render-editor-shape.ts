import Konva from 'konva';
import {
  getEnvelopeShapeFill,
  getEnvelopeShapeStrokeStyle,
  getEnvelopeTextBorder,
  getEnvelopeTextStyle,
  type TEnvelopeShape,
} from '../../types/envelope-shape';

export const getEditorShape = (node: Konva.Node): TEnvelopeShape | undefined => node.getAttr('envelopeShape');

export const getEditorFieldGroupFromTarget = (target: Konva.Node): Konva.Node | undefined => {
  const fieldGroup = target.hasName('field-group') ? target : target.findAncestor('.field-group', true);
  if (fieldGroup) {
    return fieldGroup;
  }
  const transformer = target.hasName('back') ? target.getParent() : null;
  if (transformer instanceof Konva.Transformer && transformer.nodes().length === 1) {
    const selected = transformer.nodes()[0];
    return selected.hasName('field-group') ? selected : undefined;
  }
  return undefined;
};

export const getEditorDragOrigin = (
  node: Konva.Group,
  position: { positionX: number; positionY: number } | undefined,
  pageWidth: number,
  pageHeight: number,
) =>
  position
    ? { x: (position.positionX * pageWidth) / 100, y: (position.positionY * pageHeight) / 100 }
    : { x: node.x(), y: node.y() };

export const renderEditorShape = (
  shape: TEnvelopeShape,
  pageWidth: number,
  pageHeight: number,
  existing?: Konva.Group,
) => {
  const width = (shape.width * pageWidth) / 100;
  const height = (shape.height * pageHeight) / 100;
  // Konva rejects transformer boxes less than one screen pixel high before
  // calling boundBoxFunc. Keep thin lines selectable/resizable at every zoom.
  const hitHeight = shape.type === 'line' ? Math.max(8, height) : Math.max(0.1, height);
  const group = existing ?? new Konva.Group({ id: shape.id, name: 'field-group envelope-shape' });
  // Konva recognizes a double-click only when both clicks hit the same node.
  // Selection rerenders must preserve that target while updating the artwork.
  const hitRegion = group.findOne<Konva.Rect>('.content-hit-region') ?? new Konva.Rect({ name: 'content-hit-region' });
  group
    .getChildren()
    .filter((node) => node !== hitRegion)
    .forEach((node) => {
      node.destroy();
    });
  group.setAttrs({
    envelopeShape: shape,
    x: (shape.positionX * pageWidth) / 100,
    y: (shape.positionY * pageHeight) / 100,
    width,
    height: hitHeight,
    scaleX: 1,
    scaleY: 1,
    draggable: true,
    dragPageNumber: shape.page,
    dragFieldWidth: width,
    dragFieldHeight: Math.max(0.1, height),
  });
  // The transparent rectangle participates in the same hit graph as fields.
  hitRegion.setAttrs({
    width,
    y: (height - hitHeight) / 2,
    height: hitHeight,
    fill: 'transparent',
    stroke: 'transparent',
    hitStrokeWidth: 10,
  });
  if (!hitRegion.getParent()) {
    group.add(hitRegion);
  }
  const style = {
    fill: getEnvelopeShapeFill(shape),
    stroke: shape.color,
    strokeWidth: shape.thickness,
    listening: false,
    ...getEnvelopeShapeStrokeStyle(shape),
  };
  if (shape.type === 'text') {
    if (getEnvelopeShapeFill(shape) || shape.hasBorder) {
      group.add(
        new Konva.Rect({
          width,
          height,
          fill: getEnvelopeShapeFill(shape),
          ...getEnvelopeTextBorder(shape),
          listening: false,
        }),
      );
    }
    group.add(new Konva.Text({ ...getEnvelopeTextStyle(shape), width, height, listening: false }));
  } else if (shape.type === 'line') {
    group.add(new Konva.Line({ ...style, points: [0, 0, width, height] }));
  } else if (shape.type === 'rectangle') {
    group.add(new Konva.Rect({ ...style, width, height }));
  } else {
    group.add(new Konva.Ellipse({ ...style, x: width / 2, y: height / 2, radiusX: width / 2, radiusY: height / 2 }));
  }
  return group;
};

export const getEditorShapeGeometry = (
  group: Konva.Group,
  pageWidth: number,
  pageHeight: number,
): TEnvelopeShape | undefined => {
  const shape = getEditorShape(group);
  if (!shape) {
    return undefined;
  }
  const positionX = Math.max(0, Math.min(99.9, (group.x() / pageWidth) * 100));
  const positionY = Math.max(0, Math.min(99.9, (group.y() / pageHeight) * 100));
  return {
    ...shape,
    page: group.getAttr('dragPageNumber') ?? shape.page,
    positionX,
    positionY,
    width: Math.max(0.1, Math.min(100 - positionX, ((group.width() * group.scaleX()) / pageWidth) * 100)),
    height:
      shape.type === 'line'
        ? Math.min(100 - positionY, shape.height * group.scaleY())
        : Math.max(0.1, Math.min(100 - positionY, ((group.height() * group.scaleY()) / pageHeight) * 100)),
  };
};
