import { createContext } from 'react';

export type ConditionalFieldHighlightContextValue = {
  highlightedFieldIds: ReadonlySet<number>;
  selectionFieldIds: ReadonlySet<number>;
  fieldNames: ReadonlyMap<number, string>;
};

export const ConditionalFieldHighlightContext = createContext<ConditionalFieldHighlightContextValue>({
  highlightedFieldIds: new Set(),
  selectionFieldIds: new Set(),
  fieldNames: new Map(),
});
