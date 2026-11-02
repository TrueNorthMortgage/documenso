import Konva from 'konva';

import {
  getEnvelopeShapeFill,
  getEnvelopeShapeStrokeStyle,
  getEnvelopeTextBorder,
  getEnvelopeTextStyle,
  type TEnvelopeShape,
} from '../../types/envelope-shape';

// Append after recipient fields so markup stays above every field in PDF exports.
export const renderEnvelopeShapes = (
  layer: Konva.Layer,
  shapes: TEnvelopeShape[],
  pageWidth: number,
  pageHeight: number,
) => {
  for (const shape of shapes) {
    const x = (shape.positionX / 100) * pageWidth;
    const y = (shape.positionY / 100) * pageHeight;
    const width = (shape.width / 100) * pageWidth;
    const height = (shape.height / 100) * pageHeight;
    const style = {
      fill: getEnvelopeShapeFill(shape),
      stroke: shape.color,
      strokeWidth: shape.thickness,
      listening: false,
      ...getEnvelopeShapeStrokeStyle(shape),
    };

    if (shape.type === 'text') {
      if (getEnvelopeShapeFill(shape) || shape.hasBorder) {
        layer.add(
          new Konva.Rect({
            x,
            y,
            width,
            height,
            fill: getEnvelopeShapeFill(shape),
            ...getEnvelopeTextBorder(shape),
            listening: false,
          }),
        );
      }
      layer.add(new Konva.Text({ ...getEnvelopeTextStyle(shape), x, y, width, height, listening: false }));
    } else if (shape.type === 'line') {
      layer.add(new Konva.Line({ ...style, points: [x, y, x + width, y + height] }));
    } else if (shape.type === 'rectangle') {
      layer.add(new Konva.Rect({ ...style, x, y, width, height }));
    } else {
      layer.add(
        new Konva.Ellipse({ ...style, x: x + width / 2, y: y + height / 2, radiusX: width / 2, radiusY: height / 2 }),
      );
    }
  }
};
