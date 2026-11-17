import { useEffect, useState } from 'react';

const READ_ACTIVITY_CHANGED_EVENT = 'envelope-activity-read';

export const useEnvelopeActivityReadState = ({ userId, teamId }: { userId: number; teamId: number }) => {
  const [readActivity, setReadActivity] = useState<Record<string, number>>();
  const storageKey = `read-envelope-activity:${userId}:${teamId}`;

  useEffect(() => {
    const refresh = () => {
      try {
        setReadActivity(parseReadActivity(window.localStorage.getItem(storageKey)));
      } catch {
        setReadActivity({});
      }
    };

    refresh();

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        refresh();
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(READ_ACTIVITY_CHANGED_EVENT, refresh);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(READ_ACTIVITY_CHANGED_EVENT, refresh);
    };
  }, [storageKey]);

  const markRead = (id: string) => {
    const nextReadActivity = { ...readActivity, [id]: Date.now() };

    try {
      const storedActivity = parseReadActivity(window.localStorage.getItem(storageKey));
      const mergedActivity = { ...storedActivity, ...nextReadActivity };

      window.localStorage.setItem(storageKey, JSON.stringify(mergedActivity));
      window.dispatchEvent(new Event(READ_ACTIVITY_CHANGED_EVENT));
      setReadActivity(mergedActivity);
    } catch {
      setReadActivity(nextReadActivity);
    }
  };

  return { readActivity, markRead };
};

const parseReadActivity = (value: string | null): Record<string, number> => {
  try {
    const storedActivity: unknown = JSON.parse(value ?? '{}');

    if (!storedActivity || typeof storedActivity !== 'object' || Array.isArray(storedActivity)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(storedActivity).filter(([, readAt]) => typeof readAt === 'number' && Number.isFinite(readAt)),
    );
  } catch {
    return {};
  }
};
