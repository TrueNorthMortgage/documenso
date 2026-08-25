import type React from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

export type InvalidFieldPlacement = {
  envelopeItemId: string;
  fieldFormId: string;
  height: number;
  width: number;
  x: number;
  y: number;
};

type EnvelopeEditorFieldDragContextValue = {
  invalidPlacement: InvalidFieldPlacement | null;
  setInvalidPlacement: (placement: InvalidFieldPlacement | null) => void;
};

const EnvelopeEditorFieldDragContext = createContext<EnvelopeEditorFieldDragContextValue | null>(null);

export const EnvelopeEditorFieldDragProvider = ({ children }: { children: React.ReactNode }) => {
  const [invalidPlacement, setInvalidPlacement] = useState<InvalidFieldPlacement | null>(null);

  const value = useMemo(
    () => ({
      invalidPlacement,
      setInvalidPlacement,
    }),
    [invalidPlacement],
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
