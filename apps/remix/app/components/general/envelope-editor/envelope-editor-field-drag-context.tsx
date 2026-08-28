import type { TLocalField } from '@documenso/lib/client-only/hooks/use-editor-fields';
import { removeFieldPlacement, upsertFieldPlacement } from '@documenso/lib/utils/field-placements';
import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type InvalidFieldPlacement = {
  envelopeItemId: string;
  fieldFormId: string;
  height: number;
  invalidPreviewDataUrl?: string;
  offsetX: number;
  offsetY: number;
  previewDataUrl?: string;
  width: number;
  x: number;
  y: number;
};

type EnvelopeEditorFieldDragContextValue = {
  activePlacement: InvalidFieldPlacement | null;
  activeGroupPlacements: InvalidFieldPlacement[];
  fieldClipboard: React.MutableRefObject<TLocalField[]>;
  invalidPlacements: InvalidFieldPlacement[];
  pendingSelectionFieldFormIds: string[];
  selectedInvalidFieldFormIds: string[];
  clearInvalidPlacement: (fieldFormId: string) => void;
  clearPendingSelection: () => void;
  setActiveGroupPlacements: (placements: InvalidFieldPlacement[]) => void;
  setPendingSelectionFieldFormIds: (fieldFormIds: string[]) => void;
  setSelectedInvalidFieldFormIds: (fieldFormIds: string[]) => void;
  setActivePlacement: (placement: InvalidFieldPlacement | null) => void;
  setInvalidPlacement: (placement: InvalidFieldPlacement) => void;
};

const EnvelopeEditorFieldDragContext = createContext<EnvelopeEditorFieldDragContextValue | null>(null);

export const EnvelopeEditorFieldDragProvider = ({ children }: { children: React.ReactNode }) => {
  const [activePlacement, setActivePlacement] = useState<InvalidFieldPlacement | null>(null);
  const [activeGroupPlacements, setActiveGroupPlacements] = useState<InvalidFieldPlacement[]>([]);
  const [invalidPlacements, setInvalidPlacements] = useState<InvalidFieldPlacement[]>([]);
  const [pendingSelectionFieldFormIds, setPendingSelectionFieldFormIds] = useState<string[]>([]);
  const [selectedInvalidFieldFormIds, setSelectedInvalidFieldFormIds] = useState<string[]>([]);
  const fieldClipboard = useRef<TLocalField[]>([]);

  const setInvalidPlacement = useCallback((placement: InvalidFieldPlacement) => {
    setInvalidPlacements((currentPlacements) => upsertFieldPlacement(currentPlacements, placement));
  }, []);

  const clearInvalidPlacement = useCallback((fieldFormId: string) => {
    setInvalidPlacements((currentPlacements) => removeFieldPlacement(currentPlacements, fieldFormId));
  }, []);

  const clearPendingSelection = useCallback(() => {
    setPendingSelectionFieldFormIds([]);
  }, []);

  const value = useMemo(
    () => ({
      activePlacement,
      activeGroupPlacements,
      fieldClipboard,
      invalidPlacements,
      pendingSelectionFieldFormIds,
      selectedInvalidFieldFormIds,
      clearInvalidPlacement,
      clearPendingSelection,
      setActiveGroupPlacements,
      setPendingSelectionFieldFormIds,
      setSelectedInvalidFieldFormIds,
      setActivePlacement,
      setInvalidPlacement,
    }),
    [
      activeGroupPlacements,
      activePlacement,
      clearInvalidPlacement,
      clearPendingSelection,
      fieldClipboard,
      invalidPlacements,
      pendingSelectionFieldFormIds,
      selectedInvalidFieldFormIds,
      setActiveGroupPlacements,
      setPendingSelectionFieldFormIds,
      setSelectedInvalidFieldFormIds,
      setActivePlacement,
      setInvalidPlacement,
    ],
  );

  return <EnvelopeEditorFieldDragContext.Provider value={value}>{children}</EnvelopeEditorFieldDragContext.Provider>;
};

export const useEnvelopeEditorFieldDrag = () => {
  const context = useContext(EnvelopeEditorFieldDragContext);

  if (!context) {
    throw new Error('useEnvelopeEditorFieldDrag must be used within an EnvelopeEditorFieldDragProvider');
  }

  return context;
};
