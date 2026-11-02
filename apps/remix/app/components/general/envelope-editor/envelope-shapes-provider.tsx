import { useCurrentEnvelopeEditor } from '@documenso/lib/client-only/providers/envelope-editor-provider';
import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import { AppError } from '@documenso/lib/errors/app-error';
import { canEditEnvelopeShapes, parseEnvelopeShapes, type TEnvelopeShape } from '@documenso/lib/types/envelope-shape';
import { trpc } from '@documenso/trpc/react';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { useLingui } from '@lingui/react/macro';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useEnvelopeEditorFieldDrag } from './envelope-editor-field-drag-context';

type ShapeSelection = { itemId: string; id: string } | null;
type ShapeTool = TEnvelopeShape['type'] | null;
type ShapeEditor = {
  savesOnSubmit: boolean;
  isEditable: boolean;
  isSaving: boolean;
  tool: ShapeTool;
  setTool: (tool: ShapeTool) => void;
  selection: ShapeSelection;
  select: (selection: ShapeSelection) => void;
  syncSelection: (selection: ShapeSelection) => void;
  getShapes: (itemId: string) => TEnvelopeShape[];
  preview: (itemId: string, shapes: TEnvelopeShape[]) => void;
  save: (itemId: string, shapes: TEnvelopeShape[], previousShapes?: TEnvelopeShape[]) => Promise<void>;
  textToEdit: string | null;
  setTextToEdit: (id: string | null) => void;
};
const EnvelopeShapesContext = createContext<ShapeEditor | null>(null);
export const useEnvelopeShapesEditor = () => useContext(EnvelopeShapesContext);

export const EnvelopeShapesProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useLingui();
  const { toast } = useToast();
  const { envelope, setLocalEnvelope, registerExternalFlush, isEmbedded } = useCurrentEnvelopeEditor();
  const { setPendingSelectionFieldFormIds } = useEnvelopeEditorFieldDrag();
  const [, setRevision] = useState(0);
  const localShapes = useRef<Record<string, TEnvelopeShape[]>>({});
  const confirmedShapes = useRef<Record<string, TEnvelopeShape[]>>({});
  const [tool, setTool] = useState<ShapeTool>(null);
  const [selection, syncSelection] = useState<ShapeSelection>(null);
  const [textToEdit, setTextToEdit] = useState<string | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const generation = useRef(0);
  const envelopeRef = useRef(envelope);
  envelopeRef.current = envelope;
  const inFlight = useRef<Promise<void>>(Promise.resolve());
  const { mutateAsync } = trpc.envelope.item.setShapes.useMutation(DO_NOT_INVALIDATE_QUERY_ON_MUTATION);
  const isEditable = canEditEnvelopeShapes(envelope);
  useEffect(() => {
    registerExternalFlush('shapes', async () => await inFlight.current);
  }, [registerExternalFlush]);
  const keyFor = (itemId: string) =>
    `${itemId}:${envelope.envelopeItems.find((item) => item.id === itemId)?.documentDataId}`;
  const getShapes = (itemId: string) =>
    (localShapes.current[keyFor(itemId)] ??= parseEnvelopeShapes(
      envelope.envelopeItems.find((item) => item.id === itemId)?.shapes,
    ));
  const preview = (itemId: string, shapes: TEnvelopeShape[]) => {
    localShapes.current[keyFor(itemId)] = shapes;
    setRevision((revision) => revision + 1);
  };
  const select: ShapeEditor['select'] = (next) => {
    setPendingSelectionFieldFormIds(next ? [next.id] : []);
    syncSelection(next);
  };
  const save: ShapeEditor['save'] = (itemId, shapes, previousShapes = getShapes(itemId)) => {
    if (!isEditable) {
      return Promise.resolve();
    }
    const key = keyFor(itemId);
    confirmedShapes.current[key] ??= parseEnvelopeShapes(
      envelope.envelopeItems.find((item) => item.id === itemId)?.shapes,
    );
    preview(itemId, shapes);
    const queuedGeneration = generation.current;
    setPendingSaves((count) => count + 1);
    const operation = inFlight.current.then(async () => {
      try {
        if (queuedGeneration !== generation.current) {
          return;
        }
        const result = isEmbedded
          ? { shapes }
          : await mutateAsync({ envelopeId: envelope.id, envelopeItemId: itemId, data: { shapes, previousShapes } });
        confirmedShapes.current[key] = result.shapes;
        const envelopeItems = envelopeRef.current.envelopeItems.map((item) =>
          item.id === itemId ? { ...item, shapes: result.shapes } : item,
        );
        envelopeRef.current = { ...envelopeRef.current, envelopeItems };
        setLocalEnvelope({ envelopeItems });
      } catch (err) {
        generation.current += 1;
        localShapes.current = { ...confirmedShapes.current };
        setRevision((revision) => revision + 1);
        const error = AppError.parseError(err);
        toast({
          title: t`Unable to save shapes`,
          description: error.userMessage ?? t`Please try again. Your shape change was not saved.`,
          variant: 'destructive',
        });
      } finally {
        setPendingSaves((count) => count - 1);
      }
    });
    inFlight.current = operation;
    return operation;
  };
  return (
    <EnvelopeShapesContext.Provider
      value={{
        savesOnSubmit: isEmbedded,
        isEditable,
        isSaving: pendingSaves > 0,
        tool,
        setTool,
        selection,
        select,
        syncSelection,
        getShapes,
        preview,
        save,
        textToEdit,
        setTextToEdit,
      }}
    >
      {children}
    </EnvelopeShapesContext.Provider>
  );
};
