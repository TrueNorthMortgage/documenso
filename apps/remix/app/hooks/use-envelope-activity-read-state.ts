import {
  MAX_ACTIVITY_EVENT_ID_LENGTH,
  MAX_ACTIVITY_READ_BATCH_SIZE,
} from '@documenso/lib/types/latest-envelope-activity';
import { trpc } from '@documenso/trpc/react';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

const READ_ACTIVITY_CHANGED_EVENT = 'envelope-activity-read';

export const useEnvelopeActivityReadState = ({ userId, teamId }: { userId: number; teamId: number }) => {
  const [isReady, setIsReady] = useState(false);
  const { toast } = useToast();
  const { t } = useLingui();
  const utils = trpc.useUtils();
  const { mutateAsync: persistRead } = trpc.envelope.activity.markRead.useMutation({
    meta: { doNotInvalidateQueryOnMutation: true },
  });
  const storageKey = `read-envelope-activity:${userId}:${teamId}`;

  useEffect(() => {
    const refreshActivity = () => {
      void utils.envelope.activity.invalidate();
    };

    // The header and team page use separate query providers.
    window.addEventListener(READ_ACTIVITY_CHANGED_EVENT, refreshActivity);
    window.addEventListener('focus', refreshActivity);

    return () => {
      window.removeEventListener(READ_ACTIVITY_CHANGED_EVENT, refreshActivity);
      window.removeEventListener('focus', refreshActivity);
    };
  }, [utils]);

  useEffect(() => {
    let isCancelled = false;

    const migrateBrowserReads = async () => {
      let storedValue: string | null;

      try {
        storedValue = window.localStorage.getItem(storageKey);
      } catch {
        setIsReady(true);
        return;
      }

      try {
        const eventIds = parseLegacyReadIds(storedValue);

        for (let index = 0; index < eventIds.length; index += MAX_ACTIVITY_READ_BATCH_SIZE) {
          if (isCancelled) {
            return;
          }

          await persistRead({ teamId, eventIds: eventIds.slice(index, index + MAX_ACTIVITY_READ_BATCH_SIZE) });
        }

        // A second tab may still be running the previous client. Retain any newer browser markers.
        if (window.localStorage.getItem(storageKey) === storedValue) {
          window.localStorage.removeItem(storageKey);
        }

        if (eventIds.length > 0) {
          window.dispatchEvent(new Event(READ_ACTIVITY_CHANGED_EVENT));
        }
      } catch {
        // Keep the browser markers so another visit can retry an interrupted import.
        if (!isCancelled) {
          toast({ title: t`Something went wrong.`, description: t`Please try again.`, variant: 'destructive' });
        }
      } finally {
        if (!isCancelled) {
          setIsReady(true);
        }
      }
    };

    void migrateBrowserReads();

    return () => {
      isCancelled = true;
    };
  }, [storageKey, teamId, persistRead, utils, toast, t]);

  const markRead = (id: string) => {
    void persistRead({ teamId, eventIds: [id] })
      .then(() => {
        window.dispatchEvent(new Event(READ_ACTIVITY_CHANGED_EVENT));
      })
      .catch(() => {
        toast({ title: t`Something went wrong.`, description: t`Please try again.`, variant: 'destructive' });
      });
  };

  return { isReady, markRead };
};

const parseLegacyReadIds = (value: string | null): string[] => {
  try {
    const storedActivity: unknown = JSON.parse(value ?? '{}');

    if (!storedActivity || typeof storedActivity !== 'object' || Array.isArray(storedActivity)) {
      return [];
    }

    return Object.entries(storedActivity)
      .filter(
        ([id, readAt]) =>
          id.length > 0 &&
          id.length <= MAX_ACTIVITY_EVENT_ID_LENGTH &&
          typeof readAt === 'number' &&
          Number.isFinite(readAt),
      )
      .map(([id]) => id);
  } catch {
    return [];
  }
};
