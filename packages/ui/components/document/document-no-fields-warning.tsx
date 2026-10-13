import { Trans } from '@lingui/react/macro';

import { Alert, AlertDescription, AlertTitle } from '../../primitives/alert';

export const DocumentNoFieldsWarning = ({ documents }: { documents: { id: string; title: string }[] }) => {
  if (documents.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning" className="my-4">
      <AlertTitle>
        <Trans>Send without fields?</Trans>
      </AlertTitle>
      <AlertDescription>
        <p>
          {documents.length === 1 ? (
            <Trans>No fields have been added to this document.</Trans>
          ) : (
            <Trans>No fields have been added to the documents listed below.</Trans>
          )}
        </p>
        <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5">
          {documents.map((document) => (
            <li key={document.id} className="break-words">
              {document.title}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};
