import Konva from 'konva';
import '../../server-only/konva/skia-backend';
import { describe, expect, it } from 'vitest';
import type { TEnvelopeShape } from '../../types/envelope-shape';
import {
  getEditorDragOrigin,
  getEditorFieldGroupFromTarget,
  getEditorShapeGeometry,
  renderEditorShape,
} from './render-editor-shape';

const shape: TEnvelopeShape = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'rectangle',
  page: 1,
  positionX: 20,
  positionY: 30,
  width: 40,
  height: 20,
  color: '#000000',
  thickness: 2,
};

describe('shapes in the field editor scene', () => {
  it('renders a black text border independently of its font color and removes it on request', () => {
    const text: TEnvelopeShape = { ...shape, type: 'text', text: 'Visible note', color: '#b91c1c', hasBorder: true };
    const group = renderEditorShape(text, 600, 800);
    expect(group.getChildren()[1].getAttrs()).toMatchObject({ stroke: '#000000', strokeWidth: 1 });
    expect(group.getChildren()[2].getAttr('fill')).toBe('#b91c1c');
    renderEditorShape({ ...text, hasBorder: false }, 600, 800, group);
    expect(group.getChildren().map((node) => node.getClassName())).toEqual(['Rect', 'Text']);
  });
  it('fills the text wrapper behind the glyphs and clears it without changing text or selection', () => {
    const text: TEnvelopeShape = { ...shape, type: 'text', text: 'Sender note', fillColor: '#fedcba' };
    const group = renderEditorShape(text, 600, 800);
    const hitRegion = group.getChildren()[0];
    expect(group.getChildren().map((node) => node.getClassName())).toEqual(['Rect', 'Rect', 'Text']);
    expect(group.getChildren()[1].getAttrs()).toMatchObject({
      width: 240,
      height: 160,
      fill: '#fedcba',
      listening: false,
    });
    expect(group.getChildren()[2].getAttrs()).toMatchObject({ text: text.text, fill: text.color });
    renderEditorShape({ ...text, fillColor: null }, 600, 800, group);
    expect(group.getChildren()).toHaveLength(2);
    expect(group.getChildren()[0]).toBe(hitRegion);
    expect(group.getChildren()[1].getAttrs()).toMatchObject({ text: text.text, fill: text.color });
  });
  it.each([
    'rectangle',
    'ellipse',
  ] as const)('renders and clears %s backgrounds without changing the outline or hit target', (type) => {
    const group = renderEditorShape({ ...shape, type, fillColor: '#fedcba' }, 600, 800);
    const hitRegion = group.getChildren()[0];
    expect(group.getChildren()[1].getAttrs()).toMatchObject({ fill: '#fedcba', stroke: shape.color });
    renderEditorShape({ ...shape, type, fillColor: null }, 600, 800, group);
    expect(group.getChildren()[0]).toBe(hitRegion);
    expect(group.getChildren()[1].getAttr('fill')).toBeUndefined();
  });
  it('resolves a single selected text through the selection transformer that intercepts its second click', () => {
    const group = renderEditorShape({ ...shape, type: 'text', text: 'Edit me' }, 600, 800);
    const root = new Konva.Group();
    const transformer = new Konva.Transformer({ shouldOverdrawWholeArea: true });
    root.add(group, transformer);
    transformer.nodes([group]);
    const back = transformer.findOne('.back');
    const resizeHandle = transformer.findOne('.top-left');
    if (!back || !resizeHandle) {
      throw new Error('Expected transformer hit targets');
    }
    expect(getEditorFieldGroupFromTarget(back)).toBe(group);
    expect(getEditorFieldGroupFromTarget(resizeHandle)).toBeUndefined();
    transformer.nodes([group, new Konva.Group({ name: 'field-group' })]);
    expect(getEditorFieldGroupFromTarget(back)).toBeUndefined();
  });
  it.each<TEnvelopeShape['type']>([
    'line',
    'rectangle',
    'ellipse',
    'text',
  ])('gives %s shapes a full hit region and field-compatible selection group', (type) => {
    const group = renderEditorShape({ ...shape, type, height: type === 'line' ? 0 : 20 }, 600, 800);
    expect(group.hasName('field-group')).toBe(true);
    expect(group.draggable()).toBe(true);
    const hitRegion = group.getChildren()[0] as Konva.Rect;
    expect(hitRegion.fill()).toBe('transparent');
    expect(hitRegion.listening()).toBe(true);
    expect(hitRegion.width()).toBe(240);
    expect(group.getChildren()[1].listening()).toBe(false);
  });
  it('preserves sender text and formatting when moving and resizing its field-compatible group', () => {
    const text: TEnvelopeShape = {
      ...shape,
      type: 'text',
      text: 'Sender note\nNext line',
      fontSize: 18,
      textAlign: 'center',
    };
    const group = renderEditorShape(text, 600, 800);
    expect(group.getChildren()[1].getAttrs()).toMatchObject({
      text: text.text,
      fontSize: 18,
      align: 'center',
      fill: shape.color,
      width: 240,
      height: 160,
    });
    group.scale({ x: 1.5, y: 1.5 });
    expect(getEditorShapeGeometry(group, 600, 800)).toMatchObject({ ...text, width: 60, height: 30 });
  });
  it.each([
    { borderStyle: 'solid' as const, dash: [], lineCap: 'butt' },
    { borderStyle: 'dashed' as const, dash: [8, 4], lineCap: 'butt' },
    { borderStyle: 'dotted' as const, dash: [0, 5], lineCap: 'round' },
  ])('renders $borderStyle borders in the editor', ({ borderStyle, dash, lineCap }) => {
    const group = renderEditorShape({ ...shape, borderStyle }, 600, 800);
    expect(group.getChildren()[1].getAttrs()).toMatchObject({ dash, lineCap });
  });
  it('keeps the same selected node when saved shape data rerenders', () => {
    const group = renderEditorShape(shape, 600, 800);
    const selected = [group];
    expect(renderEditorShape({ ...shape, color: '#1d4ed8' }, 600, 800, group)).toBe(selected[0]);
    expect(group.getChildren()).toHaveLength(2);
  });
  it('keeps the click target between text selection renders so Konva can recognize a double-click', () => {
    const text: TEnvelopeShape = { ...shape, type: 'text', text: 'Sender note' };
    const group = renderEditorShape(text, 600, 800);
    const clickTarget = group.getChildren()[0];
    renderEditorShape(text, 600, 800, group);
    expect(group.getChildren()[0]).toBe(clickTarget);
  });
  it('uses the same marquee bounds as fields and persists grouped movement and resize', () => {
    const group = renderEditorShape(shape, 600, 800);
    const field = new Konva.Group({ x: 50, y: 100, width: 60, height: 20 });
    field.add(new Konva.Rect({ width: 60, height: 20 }));
    const marquee = { x: 40, y: 90, width: 330, height: 320 };
    expect(
      [field, group].filter((node) => Konva.Util.haveIntersection(marquee, node.getClientRect({ skipStroke: true }))),
    ).toEqual([field, group]);
    group.position({ x: 150, y: 280 });
    group.scale({ x: 1.5, y: 1.5 });
    expect(getEditorShapeGeometry(group, 600, 800)).toMatchObject({
      positionX: 25,
      positionY: 35,
      width: 60,
      height: 30,
    });
  });
  it('preserves mixed-group spacing when Konva moves the anchor before dragstart', () => {
    const field = new Konva.Group({ x: 100, y: 300 });
    const markup = renderEditorShape(shape, 600, 800);
    const fieldOrigin = getEditorDragOrigin(field, { positionX: 10, positionY: 20 }, 600, 800);
    const shapeOrigin = getEditorDragOrigin(markup, shape, 600, 800);
    expect(fieldOrigin).toEqual({ x: 60, y: 160 });
    expect(shapeOrigin).toEqual({ x: 120, y: 240 });
    expect(shapeOrigin.y - fieldOrigin.y).toBe(80);
  });
  it('keeps a horizontal line above Konva minimum resize bounds at reduced zoom', () => {
    const root = new Konva.Group({ scaleX: 0.5, scaleY: 0.5 });
    const group = renderEditorShape({ ...shape, type: 'line', height: 0 }, 600, 800);
    const transformer = new Konva.Transformer({
      ignoreStroke: true,
      rotateEnabled: false,
      enabledAnchors: ['middle-left', 'middle-right'],
    });
    root.add(group, transformer);
    transformer.nodes([group]);
    expect(transformer.height()).toBeGreaterThan(1);
    const bounds = group.getClientRect({ skipStroke: true, skipTransform: true });
    expect(bounds.y + bounds.height / 2).toBeCloseTo(0);
  });
  it('keeps the visible height of a thin diagonal line independent of its hit area', () => {
    const group = renderEditorShape({ ...shape, type: 'line', height: 0.1 }, 600, 800);
    group.scale({ x: 2, y: 1 });
    expect(getEditorShapeGeometry(group, 600, 800)).toMatchObject({ width: 80, height: 0.1 });
    group.scaleY(2);
    expect(getEditorShapeGeometry(group, 600, 800)).toMatchObject({ height: 0.2 });
  });
  it('keeps a horizontal line horizontal after a shared transformer resize', () => {
    const group = renderEditorShape({ ...shape, type: 'line', height: 0 }, 600, 800);
    group.scale({ x: 1.5, y: 1 });
    expect(getEditorShapeGeometry(group, 600, 800)).toMatchObject({ width: 60, height: 0 });
  });
});
