import {
  type PageRenderData,
  useCurrentEnvelopeRender,
} from '@documenso/lib/client-only/providers/envelope-render-provider';
import {
  DEFAULT_ENVELOPE_TEXT_HAS_BORDER,
  getEnvelopeShapeFill,
  getEnvelopeShapeStrokeStyle,
  getEnvelopeTextStyle,
  parseEnvelopeShapes,
  type TEnvelopeShape,
} from '@documenso/lib/types/envelope-shape';
import { getClampedFieldPosition } from '@documenso/lib/utils/field-drag';
import { cn } from '@documenso/ui/lib/utils';
import { useLingui } from '@lingui/react/macro';
import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import { useEnvelopeShapesEditor } from '../envelope-editor/envelope-shapes-provider';

export const EnvelopeShapeOverlay = ({ pageData }: { pageData: PageRenderData }) => {
  const { t } = useLingui();
  const { currentEnvelopeItem, version, envelopeStatus } = useCurrentEnvelopeRender();
  const editor = useEnvelopeShapesEditor();
  const gesture = useRef<{
    x: number;
    y: number;
    initial: TEnvelopeShape;
    original: TEnvelopeShape[];
    next: TEnvelopeShape[];
  } | null>(null);
  // Editable shapes belong to the same Konva scene as recipient fields.
  // SVG is only used for drawing a new shape and read-only PDF overlays.
  if (
    !currentEnvelopeItem ||
    (editor && !editor.tool) ||
    (version === 'current' && (envelopeStatus === 'COMPLETED' || envelopeStatus === 'REJECTED'))
  ) {
    return null;
  }
  const itemId = currentEnvelopeItem.id;
  const width = pageData.pageWidth * pageData.scale;
  const height = pageData.pageHeight * pageData.scale;
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(99.8, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(99.8, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  };
  const finish = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current && editor) {
      editor.setTool(null);
      void editor.save(itemId, current.next, current.original);
      if (current.initial.type === 'text') {
        editor.setTextToEdit(current.initial.id);
      }
    }
  };
  return (
    <svg
      className={cn('pointer-events-none absolute inset-0 z-30 h-full w-full', {
        'pointer-events-auto touch-none': Boolean(editor?.isEditable && editor.tool),
        'cursor-crosshair': Boolean(editor?.tool && editor.tool !== 'text'),
        'cursor-text': editor?.tool === 'text',
      })}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={t`Document shapes`}
      data-testid={`envelope-shapes-page-${pageData.pageNumber}`}
      onPointerDown={(event) => {
        if (!editor?.isEditable || !editor.tool || event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const { x, y } = point(event);
        const textWidth = Math.min(240, pageData.pageWidth);
        const textHeight = Math.min(56, pageData.pageHeight);
        const textPosition = getClampedFieldPosition({
          x: (x / 100) * pageData.pageWidth,
          y: (y / 100) * pageData.pageHeight,
          fieldWidth: textWidth,
          fieldHeight: textHeight,
          pageWidth: pageData.pageWidth,
          pageHeight: pageData.pageHeight,
        });
        const initial: TEnvelopeShape = {
          id: crypto.randomUUID(),
          type: editor.tool,
          page: pageData.pageNumber,
          positionX: x,
          positionY: y,
          width: 0.1,
          height: editor.tool === 'line' ? 0 : 0.1,
          color: '#000000',
          thickness: 2,
          ...(editor.tool === 'text'
            ? {
                text: '',
                hasBorder: DEFAULT_ENVELOPE_TEXT_HAS_BORDER,
                fontSize: 14,
                textAlign: 'left' as const,
                positionX: textPosition.positionX * 100,
                positionY: textPosition.positionY * 100,
                width: (textWidth / pageData.pageWidth) * 100,
                height: (textHeight / pageData.pageHeight) * 100,
              }
            : {}),
        };
        const original = editor.getShapes(itemId);
        const next = [...original, initial];
        gesture.current = { x, y, initial, original, next };
        editor.preview(itemId, next);
        editor.select({ itemId, id: initial.id });
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || !editor || current.initial.type === 'text') {
          return;
        }
        const { x, y } = point(event);
        const shape = {
          ...current.initial,
          positionX: Math.min(x, current.x),
          positionY: current.initial.type === 'line' ? current.y : Math.min(y, current.y),
          width: Math.max(0.1, Math.abs(x - current.x)),
          height: current.initial.type === 'line' ? 0 : Math.max(0.1, Math.abs(y - current.y)),
        };
        current.next = [...current.original, shape];
        editor.preview(itemId, current.next);
      }}
      onPointerUp={finish}
      onLostPointerCapture={finish}
      onPointerCancel={() => {
        if (gesture.current && editor) {
          editor.preview(itemId, gesture.current.original);
        }
        gesture.current = null;
      }}
    >
      {!editor &&
        parseEnvelopeShapes(currentEnvelopeItem.shapes)
          .filter((shape) => shape.page === pageData.pageNumber)
          .map((shape) => {
            const x = (shape.positionX * width) / 100;
            const y = (shape.positionY * height) / 100;
            const w = (shape.width * width) / 100;
            const h = (shape.height * height) / 100;
            const stroke = getEnvelopeShapeStrokeStyle(shape);
            const props = {
              fill: getEnvelopeShapeFill(shape) ?? 'none',
              stroke: shape.color,
              strokeWidth: shape.thickness * pageData.scale,
              strokeDasharray: stroke.dash.map((length) => length * pageData.scale).join(' '),
              strokeLinecap: stroke.lineCap,
            };
            return shape.type === 'text' ? (
              <foreignObject key={shape.id} x={x} y={y} width={w} height={h}>
                <div
                  style={{
                    color: shape.color,
                    backgroundColor: getEnvelopeShapeFill(shape),
                    boxShadow: shape.hasBorder ? `inset 0 0 0 ${pageData.scale}px #000000` : undefined,
                    fontFamily: getEnvelopeTextStyle(shape).fontFamily,
                    fontSize: (shape.fontSize ?? 14) * pageData.scale,
                    textAlign: shape.textAlign ?? 'left',
                    lineHeight: 1.2,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    overflow: 'hidden',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {shape.text}
                </div>
              </foreignObject>
            ) : shape.type === 'line' ? (
              <line key={shape.id} {...props} x1={x} y1={y} x2={x + w} y2={y + h} />
            ) : shape.type === 'rectangle' ? (
              <rect key={shape.id} {...props} x={x} y={y} width={w} height={h} />
            ) : (
              <ellipse key={shape.id} {...props} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
            );
          })}
    </svg>
  );
};
