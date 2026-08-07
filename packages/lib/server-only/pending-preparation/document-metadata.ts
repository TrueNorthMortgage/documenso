import type { PlaceholderInfo } from '../pdf/auto-place-fields';

export type PendingPreparationDocumentMetadata = {
  name?: string;
  placeholders?: PlaceholderInfo[];
};

export const getPendingPreparationDocumentMetadata = (fileMetadata: unknown): PendingPreparationDocumentMetadata => {
  if (!fileMetadata || typeof fileMetadata !== 'object') {
    return {};
  }

  const metadata = fileMetadata as {
    name?: unknown;
    placeholders?: unknown;
  };

  return {
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    placeholders: Array.isArray(metadata.placeholders) ? (metadata.placeholders as PlaceholderInfo[]) : undefined,
  };
};
