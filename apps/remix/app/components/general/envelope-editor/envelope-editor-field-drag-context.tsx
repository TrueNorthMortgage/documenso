import type { TLocalField } from '@documenso/lib/client-only/hooks/use-editor-fields';
import type React from 'react';
import { createContext, useContext, useMemo, useRef, useState } from 'react';

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
  fieldClipboard: React.MutableRefObject<TLocalField[]>;
  invalidPlacement: InvalidFieldPlacement | null;
  setActivePlacement: (placement: InvalidFieldPlacement | null) => void;
  setInvalidPlacement: (placement: InvalidFieldPlacement | null) => void;
};

const EnvelopeEditorFieldDragContext = createContext<EnvelopeEditorFieldDragContextValue | null>(null);

export const EnvelopeEditorFieldDragProvider = ({ children }: { children: React.ReactNode }) => {
  const [activePlacement, setActivePlacement] = useState<InvalidFieldPlacement | null>(null);
  const [invalidPlacement, setInvalidPlacement] = useState<InvalidFieldPlacement | null>(null);
  const fieldClipboard = useRef<TLocalField[]>([]);

  const value = useMemo(
    () => ({
      activePlacement,
      fieldClipboard,
      invalidPlacement,
      setActivePlacement,
      setInvalidPlacement,
    }),
    [activePlacement, fieldClipboard, invalidPlacement],
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
