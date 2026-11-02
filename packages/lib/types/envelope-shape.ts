import { DocumentStatus } from '@prisma/client';
import { z } from 'zod';
import { SIGNATURE_FONT_FAMILIES, SIGNATURE_FONT_FAMILY_KEYS } from '../constants/signatures';

export const ENVELOPE_TEXT_FONT_FAMILIES = {
  arial: { label: 'Arial', cssFamily: 'Arial' },
  inter: { label: 'Inter', cssFamily: 'Inter' },
  notoSans: { label: 'Noto Sans', cssFamily: 'Noto Sans' },
  ...SIGNATURE_FONT_FAMILIES,
};

export const ZEnvelopeShapeSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(['line', 'rectangle', 'ellipse', 'text']),
    page: z.number().int().min(1),
    positionX: z.number().finite().min(0).max(100),
    positionY: z.number().finite().min(0).max(100),
    width: z.number().finite().min(0.1).max(100),
    height: z.number().finite().min(0).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fillColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    thickness: z.number().int().min(1).max(4),
    borderStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    text: z.string().max(2000).optional(),
    fontSize: z.number().int().min(8).max(72).optional(),
    fontFamily: z.enum(['arial', 'inter', 'notoSans', ...SIGNATURE_FONT_FAMILY_KEYS]).optional(),
    hasBorder: z.boolean().optional(),
    textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  })
  .superRefine((shape, ctx) => {
    if (shape.positionX + shape.width > 100 || shape.positionY + shape.height > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Shape must remain inside the page' });
    }

    if (shape.type !== 'line' && shape.height < 0.1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Shape height must be positive' });
    }
    if (shape.fillColor && shape.type === 'line') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Lines do not support a background color' });
    }
  });

export const ZEnvelopeShapesSchema = ZEnvelopeShapeSchema.array()
  .max(500)
  .superRefine((shapes, ctx) => {
    if (new Set(shapes.map((shape) => shape.id)).size !== shapes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Shape IDs must be unique' });
    }
  });

export type TEnvelopeShape = z.infer<typeof ZEnvelopeShapeSchema>;

export const DEFAULT_ENVELOPE_TEXT_HAS_BORDER = true;

export const getEnvelopeTextBorder = (shape: Pick<TEnvelopeShape, 'hasBorder'>) => ({
  stroke: shape.hasBorder ? '#000000' : undefined,
  strokeWidth: shape.hasBorder ? 1 : 0,
});

export const getEnvelopeShapeFill = (shape: Pick<TEnvelopeShape, 'type' | 'fillColor'>) =>
  shape.type !== 'line' ? (shape.fillColor ?? undefined) : undefined;

export const getEnvelopeTextStyle = (shape: TEnvelopeShape) => ({
  text: shape.text ?? '',
  fontSize: shape.fontSize ?? 14,
  fontFamily: ENVELOPE_TEXT_FONT_FAMILIES[shape.fontFamily ?? 'arial'].cssFamily,
  align: shape.textAlign ?? 'left',
  fill: shape.color,
  lineHeight: 1.2,
  wrap: 'word',
});

export const getEnvelopeShapeStrokeStyle = (shape: Pick<TEnvelopeShape, 'borderStyle' | 'thickness'>) => ({
  dash:
    shape.borderStyle === 'dashed'
      ? [shape.thickness * 4, shape.thickness * 2]
      : shape.borderStyle === 'dotted'
        ? [0, shape.thickness * 2.5]
        : [],
  lineCap: shape.borderStyle === 'dotted' ? ('round' as const) : ('butt' as const),
});

export const parseEnvelopeShapes = (value: unknown): TEnvelopeShape[] => ZEnvelopeShapesSchema.parse(value ?? []);

export const canEditEnvelopeShapes = (envelope: {
  internalVersion: number;
  status: DocumentStatus;
  correctionStartedAt: Date | null;
}) =>
  envelope.internalVersion === 2 &&
  (envelope.status === DocumentStatus.DRAFT ||
    (envelope.status === DocumentStatus.PENDING && envelope.correctionStartedAt !== null));
