import type React from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

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
  invalidPlacement: InvalidFieldPlacement | null;
  setActivePlacement: (placement: InvalidFieldPlacement | null) => void;
  setInvalidPlacement: (placement: InvalidFieldPlacement | null) => void;
};

const EnvelopeEditorFieldDragContext = createContext<EnvelopeEditorFieldDragContextValue | null>(null);

export const EnvelopeEditorFieldDragProvider = ({ children }: { children: React.ReactNode }) => {
  const [activePlacement, setActivePlacement] = useState<InvalidFieldPlacement | null>(null);
  const [invalidPlacement, setInvalidPlacement] = useState<InvalidFieldPlacement | null>(null);

  const value = useMemo(
    () => ({
      activePlacement,
      invalidPlacement,
      setActivePlacement,
      setInvalidPlacement,
    }),
    [activePlacement, invalidPlacement],
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
