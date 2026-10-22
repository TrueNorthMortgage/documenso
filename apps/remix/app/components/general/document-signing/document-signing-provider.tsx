import { isBase64Image, type SignatureFontFamily } from '@documenso/lib/constants/signatures';
import { createInitialsSession } from '@documenso/lib/utils/initials-session';
import { createContext, useContext, useState } from 'react';
import { SignFieldInitialsDialog } from '~/components/dialogs/sign-field-initials-dialog';

export type DocumentSigningContextValue = {
  isUpdatingIdentity: boolean;
  setIsUpdatingIdentity: (_value: boolean) => void;
  initialsByRecipient: Record<number, string>;
  setInitials: (_recipientId: number, _initials: string) => void;
  requestInitials: (_recipientId: number, _fullName: string) => Promise<string | null>;

  fullName: string;
  setFullName: (_value: string) => void;
  email: string;
  setEmail: (_value: string) => void;
  signature: string | null;
  setSignature: (_value: string | null) => void;
  signatureFont: SignatureFontFamily | null;
  setSignatureFont: (_value: SignatureFontFamily | null) => void;
};

const DocumentSigningContext = createContext<DocumentSigningContextValue | null>(null);

export const useDocumentSigningContext = () => {
  return useContext(DocumentSigningContext);
};

export const useRequiredDocumentSigningContext = () => {
  const context = useDocumentSigningContext();

  if (!context) {
    throw new Error('Signing context is required');
  }

  return context;
};

export interface DocumentSigningProviderProps {
  fullName?: string | null;
  email?: string | null;
  signature?: string | null;
  signatureFont?: SignatureFontFamily | null;
  typedSignatureEnabled?: boolean;
  uploadSignatureEnabled?: boolean;
  drawSignatureEnabled?: boolean;
  children: React.ReactNode;
}

export const DocumentSigningProvider = ({
  fullName: initialFullName,
  email: initialEmail,
  signature: initialSignature,
  signatureFont: initialSignatureFont = null,
  typedSignatureEnabled = true,
  uploadSignatureEnabled = true,
  drawSignatureEnabled = true,
  children,
}: DocumentSigningProviderProps) => {
  const [isUpdatingIdentity, setIsUpdatingIdentity] = useState(false);
  const [initialsByRecipient, setInitialsByRecipient] = useState<Record<number, string>>({});
  const [initialsSession] = useState(() =>
    createInitialsSession(
      (initials) => SignFieldInitialsDialog.call({ initials }),
      (recipientId, initials) => setInitialsByRecipient((previous) => ({ ...previous, [recipientId]: initials })),
    ),
  );

  const [fullName, setFullName] = useState(initialFullName || '');
  const [email, setEmail] = useState(initialEmail || '');
  const [signatureFont, setSignatureFont] = useState<SignatureFontFamily | null>(initialSignatureFont);

  // Ensure the user signature doesn't show up if it's not allowed.
  const [signature, setSignature] = useState(
    (() => {
      const sig = initialSignature || '';
      const isBase64 = isBase64Image(sig);

      if (isBase64 && (uploadSignatureEnabled || drawSignatureEnabled)) {
        return sig;
      }

      if (!isBase64 && typedSignatureEnabled) {
        return sig;
      }

      return null;
    })(),
  );

  return (
    <DocumentSigningContext.Provider
      value={{
        isUpdatingIdentity,
        setIsUpdatingIdentity,
        initialsByRecipient,
        requestInitials: initialsSession.requestInitials,
        setInitials: initialsSession.setInitials,
        fullName,
        setFullName,
        email,
        setEmail,
        signature,
        setSignature,
        signatureFont,
        setSignatureFont,
      }}
    >
      {children}
    </DocumentSigningContext.Provider>
  );
};

DocumentSigningProvider.displayName = 'DocumentSigningProvider';
