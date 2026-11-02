import Konva from 'konva';
import '../../server-only/konva/skia-backend';
import { describe, expect, it, vi } from 'vitest';

import type { TEnvelopeShape } from '../../types/envelope-shape';
import { ENVELOPE_TEXT_FONT_FAMILIES } from '../../types/envelope-shape';
import { renderEnvelopeShapes } from './render-envelope-shapes';

describe('PDF shape rendering', () => {
  it('exports black text-box borders while preserving borderless legacy and explicit settings', () => {
    const text: TEnvelopeShape = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'text',
      page: 1,
      positionX: 10,
      positionY: 20,
      width: 30,
      height: 10,
      color: '#123456',
      thickness: 2,
      text: 'Note',
    };
    const layer = { add: vi.fn() } as unknown as Konva.Layer;
    renderEnvelopeShapes(layer, [{ ...text, hasBorder: true }, { ...text, hasBorder: false }, text], 600, 800);
    const nodes = vi.mocked(layer.add).mock.calls.map(([node]) => node);
    expect(nodes.map((node) => node.getClassName())).toEqual(['Rect', 'Text', 'Text', 'Text']);
    expect(nodes[0].getAttrs()).toMatchObject({
      x: 60,
      y: 160,
      width: 180,
      height: 80,
      stroke: '#000000',
      strokeWidth: 1,
    });
    expect(nodes[1].getAttr('fill')).toBe('#123456');
  });
  it.each(Object.entries(ENVELOPE_TEXT_FONT_FAMILIES))('uses the chosen %s family in PDF text', (fontFamily, font) => {
    const layer = { add: vi.fn() } as unknown as Konva.Layer;
    renderEnvelopeShapes(
      layer,
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          type: 'text',
          page: 1,
          positionX: 10,
          positionY: 10,
          width: 30,
          height: 20,
          color: '#000000',
          thickness: 2,
          text: 'Sender note',
          fontFamily: fontFamily as TEnvelopeShape['fontFamily'],
        },
      ],
      600,
      800,
    );
    expect(vi.mocked(layer.add).mock.calls[0][0].getAttr('fontFamily')).toBe(font.cssFamily);
  });
  it('exports an optional full text-box background below the text without a border', () => {
    const text: TEnvelopeShape = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'text',
      page: 1,
      positionX: 10,
      positionY: 20,
      width: 30,
      height: 10,
      color: '#123456',
      thickness: 2,
      text: 'Sender note',
      fillColor: '#fedcba',
    };
    const layer = { add: vi.fn() } as unknown as Konva.Layer;
    renderEnvelopeShapes(layer, [text, { ...text, fillColor: null }], 600, 800);
    const nodes = vi.mocked(layer.add).mock.calls.map(([node]) => node);
    expect(nodes.map((node) => node.getClassName())).toEqual(['Rect', 'Text', 'Text']);
    expect(nodes[0].getAttrs()).toMatchObject({ x: 60, y: 160, width: 180, height: 80, fill: '#fedcba' });
    expect(nodes[0].getAttr('stroke')).toBeUndefined();
    expect(nodes[1].getAttrs()).toMatchObject({ text: 'Sender note', fill: '#123456' });
  });
  it.each(['rectangle', 'ellipse'] as const)('exports %s backgrounds and retains transparent legacy shapes', (type) => {
    const base: TEnvelopeShape = {
      id: '00000000-0000-4000-8000-000000000001',
      type,
      page: 1,
      positionX: 10,
      positionY: 10,
      width: 20,
      height: 20,
      color: '#000000',
      thickness: 2,
    };
    const layer = { add: vi.fn() } as unknown as Konva.Layer;
    renderEnvelopeShapes(layer, [{ ...base, fillColor: '#fedcba' }, { ...base, fillColor: null }, base], 600, 800);
    expect(vi.mocked(layer.add).mock.calls.map(([node]) => node.getAttr('fill'))).toEqual([
      '#fedcba',
      undefined,
      undefined,
    ]);
  });
  it.each([
    'right',
    'justify',
  ] as const)('exports %s-aligned sender text with custom color and page coordinates', (textAlign) => {
    const layer = { add: vi.fn() } as unknown as Konva.Layer;
    renderEnvelopeShapes(
      layer,
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          type: 'text',
          page: 1,
          positionX: 10,
          positionY: 20,
          width: 30,
          height: 10,
          color: '#7c3aed',
          thickness: 2,
          text: 'Sender note\nSecond line',
          fontSize: 18,
          textAlign,
        },
      ],
      600,
      800,
    );
    const text = vi.mocked(layer.add).mock.calls[0][0];
    expect(text.getClassName()).toBe('Text');
    expect(text.getAttrs()).toMatchObject({
      x: 60,
      y: 160,
      width: 180,
      height: 80,
      text: 'Sender note\nSecond line',
      fill: '#7c3aed',
      fontSize: 18,
      align: textAlign,
    });
  });
  it.each([
    { borderStyle: 'solid' as const, dash: [], lineCap: 'butt' },
    { borderStyle: 'dashed' as const, dash: [8, 4], lineCap: 'butt' },
    { borderStyle: 'dotted' as const, dash: [0, 5], lineCap: 'round' },
  ])('renders $borderStyle borders in PDF overlays', ({ borderStyle, dash, lineCap }) => {
    const layer = { add: vi.fn() } as unknown as Konva.Layer;
    const shape: TEnvelopeShape = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'rectangle',
      page: 1,
      positionX: 10,
      positionY: 10,
      width: 20,
      height: 20,
      color: '#000000',
      thickness: 2,
      borderStyle,
    };
    renderEnvelopeShapes(layer, [shape], 600, 800);
    expect(vi.mocked(layer.add).mock.calls[0][0].getAttrs()).toMatchObject({ dash, lineCap });
  });
  it('appends transparent markup after fields at the expected PDF coordinates', () => {
    const nodes: Konva.Node[] = [new Konva.Rect({ name: 'existing-signature' })];
    const layer = { add: vi.fn((node: Konva.Node) => nodes.push(node)) } as unknown as Konva.Layer;
    const base: TEnvelopeShape = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'line',
      page: 1,
      positionX: 10,
      positionY: 20,
      width: 30,
      height: 10,
      thickness: 2,
      color: '#b91c1c',
    };
    renderEnvelopeShapes(layer, [base, { ...base, type: 'rectangle' }, { ...base, type: 'ellipse' }], 600, 800);

    expect(nodes.map((node) => node.getClassName())).toEqual(['Rect', 'Line', 'Rect', 'Ellipse']);
    expect(nodes[1].getAttr('points')).toEqual([60, 160, 240, 240]);
    expect(nodes[2].getAttrs()).toMatchObject({
      x: 60,
      y: 160,
      width: 180,
      height: 80,
      stroke: '#b91c1c',
      strokeWidth: 2,
    });
    expect(nodes[3].getAttrs()).toMatchObject({ x: 150, y: 200, radiusX: 90, radiusY: 40 });
    expect(nodes.slice(1).every((node) => node.getAttr('fill') === undefined)).toBe(true);
  });
});
