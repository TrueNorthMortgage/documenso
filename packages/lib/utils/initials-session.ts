import { extractInitials } from './recipient-formatter';

/** Keep confirmed initials scoped to each recipient in one signing session. */
export const createInitialsSession = (
  prompt: (initials: string) => Promise<string | null>,
  onChange: (recipientId: number, initials: string) => void = () => {},
) => {
  const confirmations = new Map<number, Promise<string | null>>();

  const setInitials = (recipientId: number, initials: string) => {
    confirmations.set(recipientId, Promise.resolve(initials));
    onChange(recipientId, initials);
  };

  const requestInitials = (recipientId: number, fullName: string): Promise<string | null> => {
    const existing = confirmations.get(recipientId);

    if (existing) {
      return existing;
    }

    const confirmation = prompt(extractInitials(fullName, Number.POSITIVE_INFINITY) ?? '')
      .then((initials) => {
        if (!initials) {
          confirmations.delete(recipientId);
        } else {
          onChange(recipientId, initials);
        }

        return initials;
      })
      .catch((error) => {
        confirmations.delete(recipientId);
        throw error;
      });

    confirmations.set(recipientId, confirmation);

    return confirmation;
  };

  return { requestInitials, setInitials };
};
