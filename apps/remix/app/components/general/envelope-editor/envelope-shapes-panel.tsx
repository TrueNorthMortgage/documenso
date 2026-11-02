import { useCurrentEnvelopeRender } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { ENVELOPE_TEXT_FONT_FAMILIES, type TEnvelopeShape } from '@documenso/lib/types/envelope-shape';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { Textarea } from '@documenso/ui/primitives/textarea';
import { Trans } from '@lingui/react/macro';
import { CircleIcon, MinusIcon, SquareIcon, TypeIcon } from 'lucide-react';

import { useEnvelopeShapesEditor } from './envelope-shapes-provider';

export const EnvelopeShapesPanel = () => {
  const editor = useEnvelopeShapesEditor();
  const { currentEnvelopeItem } = useCurrentEnvelopeRender();

  if (!editor?.isEditable || !currentEnvelopeItem) {
    return null;
  }

  const itemId = currentEnvelopeItem.id;
  const shapes = editor.getShapes(itemId);
  const selected =
    editor.selection?.itemId === itemId ? shapes.find((shape) => shape.id === editor.selection?.id) : undefined;
  const update = (changes: Partial<TEnvelopeShape>) => {
    const latestShapes = editor.getShapes(itemId);
    const latestSelected = latestShapes.find((shape) => shape.id === selected?.id);
    if (
      latestSelected &&
      Object.entries(changes).some(([key, value]) => latestSelected[key as keyof TEnvelopeShape] !== value)
    ) {
      void editor.save(
        itemId,
        latestShapes.map((shape) => (shape.id === latestSelected.id ? { ...shape, ...changes } : shape)),
      );
    }
  };

  return (
    <section className="border-border border-t px-4 pt-4" data-testid="envelope-shapes-panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          <Trans>Add Content</Trans>
        </h3>
      </div>
      <fieldset className="space-y-3">
        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
          <Button
            type="button"
            variant={editor.tool === 'line' ? 'secondary' : 'outline'}
            className="h-12 gap-x-1.5 rounded-lg px-4 font-normal font-noto text-muted-foreground"
            aria-pressed={editor.tool === 'line'}
            onClick={() => editor.setTool(editor.tool === 'line' ? null : 'line')}
          >
            <MinusIcon className="h-4 w-4 shrink-0" />
            <Trans>Line</Trans>
          </Button>
          <Button
            type="button"
            variant={editor.tool === 'rectangle' ? 'secondary' : 'outline'}
            className="h-12 gap-x-1.5 rounded-lg px-4 font-normal font-noto text-muted-foreground"
            aria-pressed={editor.tool === 'rectangle'}
            onClick={() => editor.setTool(editor.tool === 'rectangle' ? null : 'rectangle')}
          >
            <SquareIcon className="h-4 w-4 shrink-0" />
            <Trans>Rectangle</Trans>
          </Button>
          <Button
            type="button"
            variant={editor.tool === 'ellipse' ? 'secondary' : 'outline'}
            className="h-12 gap-x-1.5 rounded-lg px-4 font-normal font-noto text-muted-foreground"
            aria-pressed={editor.tool === 'ellipse'}
            onClick={() => editor.setTool(editor.tool === 'ellipse' ? null : 'ellipse')}
          >
            <CircleIcon className="h-4 w-4 shrink-0" />
            <Trans>Circle</Trans>
          </Button>
          <Button
            type="button"
            variant={editor.tool === 'text' ? 'secondary' : 'outline'}
            className="h-12 gap-x-1.5 rounded-lg px-4 font-normal font-noto text-muted-foreground"
            aria-pressed={editor.tool === 'text'}
            onClick={() => editor.setTool(editor.tool === 'text' ? null : 'text')}
          >
            <TypeIcon className="h-4 w-4 shrink-0" />
            <Trans>Text</Trans>
          </Button>
        </div>
        {selected && <ShapeProperties selected={selected} update={update} />}
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {editor.isSaving ? (
            <Trans>Saving content…</Trans>
          ) : editor.savesOnSubmit ? (
            <Trans>Content saves when you finish editing</Trans>
          ) : (
            <Trans>Content saves automatically</Trans>
          )}
          {editor.tool && (
            <>
              {' '}
              <Trans>Click the selected tool again to cancel.</Trans>
            </>
          )}
        </p>
      </fieldset>
    </section>
  );
};

const ShapeProperties = ({
  selected,
  update,
}: {
  selected: TEnvelopeShape;
  update: (changes: Partial<TEnvelopeShape>) => void;
}) => (
  <div className="border-border border-t pt-3">
    {selected.type === 'text' && (
      <>
        <label className="mb-3 flex items-center justify-between gap-3 text-sm">
          <Trans>No border</Trans>
          <Checkbox
            checked={!selected.hasBorder}
            onCheckedChange={(checked) => update({ hasBorder: checked !== true })}
          />
        </label>
        <label className="mb-3 block text-sm">
          <Trans>Text</Trans>
          <Textarea
            key={`${selected.id}:${selected.text}`}
            className="mt-2"
            rows={4}
            maxLength={2000}
            defaultValue={selected.text ?? ''}
            onBlur={(event) => update({ text: event.target.value })}
          />
        </label>
        <label className="mb-3 flex items-center justify-between gap-3 text-sm">
          <Trans>Font family</Trans>
          <select
            className="max-w-40 rounded-md border border-input bg-background p-2"
            value={selected.fontFamily ?? 'arial'}
            onChange={(event) => update({ fontFamily: event.target.value as TEnvelopeShape['fontFamily'] })}
          >
            {Object.entries(ENVELOPE_TEXT_FONT_FAMILIES).map(([key, font]) => (
              <option key={key} value={key} style={{ fontFamily: font.cssFamily }}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 flex items-center justify-between gap-3 text-sm">
          <Trans>Font size</Trans>
          <input
            key={`${selected.id}:${selected.fontSize}`}
            type="number"
            min={8}
            max={72}
            step={1}
            className="w-20 rounded-md border border-input bg-background p-2"
            defaultValue={selected.fontSize ?? 14}
            onBlur={(event) => {
              const fontSize = Number(event.target.value);
              if (Number.isInteger(fontSize) && fontSize >= 8 && fontSize <= 72) {
                update({ fontSize });
              } else {
                event.target.value = String(selected.fontSize ?? 14);
              }
            }}
          />
        </label>
        <label className="mb-3 flex items-center justify-between gap-3 text-sm">
          <Trans>Alignment</Trans>
          <select
            className="rounded-md border border-input bg-background p-2"
            value={selected.textAlign ?? 'left'}
            onChange={(event) => update({ textAlign: event.target.value as TEnvelopeShape['textAlign'] })}
          >
            <option value="left">
              <Trans>Left</Trans>
            </option>
            <option value="center">
              <Trans>Center</Trans>
            </option>
            <option value="right">
              <Trans>Right</Trans>
            </option>
            <option value="justify">
              <Trans>Justify</Trans>
            </option>
          </select>
        </label>
      </>
    )}
    <label className="flex items-center justify-between gap-3 text-sm">
      {selected.type === 'text' ? <Trans>Color</Trans> : <Trans>Outline</Trans>}
      <input
        type="color"
        className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
        value={selected.color}
        onInput={(event) => update({ color: event.currentTarget.value })}
        onChange={(event) => update({ color: event.target.value })}
      />
    </label>
    {selected.type !== 'line' && (
      <div className="mt-3 flex items-center gap-2">
        <label className="flex flex-1 items-center justify-between gap-3 text-sm">
          <Trans>Background</Trans>
          <input
            type="color"
            className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
            value={selected.fillColor ?? '#ffffff'}
            onInput={(event) => update({ fillColor: event.currentTarget.value })}
            onChange={(event) => update({ fillColor: event.target.value })}
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant={selected.fillColor ? 'outline' : 'secondary'}
          aria-pressed={!selected.fillColor}
          onClick={() => update({ fillColor: null })}
        >
          <Trans>No fill</Trans>
        </Button>
      </div>
    )}
    {selected.type !== 'text' && (
      <>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <Trans>Thickness</Trans>
          <select
            className="rounded-md border border-input bg-background p-2"
            value={selected.thickness}
            onChange={(event) => update({ thickness: Number(event.target.value) })}
          >
            {[1, 2, 3, 4].map((width) => (
              <option key={width} value={width}>
                {width} px
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <Trans>Border type</Trans>
          <select
            className="rounded-md border border-input bg-background p-2"
            value={selected.borderStyle ?? 'solid'}
            onChange={(event) => update({ borderStyle: event.target.value as TEnvelopeShape['borderStyle'] })}
          >
            <option value="solid">
              <Trans>Solid</Trans>
            </option>
            <option value="dashed">
              <Trans>Dashed</Trans>
            </option>
            <option value="dotted">
              <Trans>Dotted</Trans>
            </option>
          </select>
        </label>
      </>
    )}
  </div>
);
