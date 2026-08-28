import { Button } from '@documenso/ui/primitives/button';
import { Input } from '@documenso/ui/primitives/input';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

type LocalPdfFixtureStatus = {
  fileName: string;
  pageCount: number;
  source: 'generated' | 'uploaded';
};

const getErrorMessage = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;

  return body?.error || `Request failed with status ${response.status}`;
};

const ensureSuccessfulResponse = async (response: Response) => {
  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }
};

export const LocalPdfFixtureMenu = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pageCount, setPageCount] = useState('1');
  const [status, setStatus] = useState<LocalPdfFixtureStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const loadStatus = async () => {
      const response = await fetch('/api/files/local-pdf-fixture', { cache: 'no-store' });

      if (!response.ok) {
        setError(await getErrorMessage(response));

        return;
      }

      const fixtureStatus = (await response.json()) as LocalPdfFixtureStatus;

      setStatus(fixtureStatus);
      setPageCount(fixtureStatus.pageCount.toString());
    };

    void loadStatus().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load fixture status');
    });
  }, []);

  const generateFixture = async () => {
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/files/local-pdf-fixture/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageCount: Number(pageCount) }),
      });

      await ensureSuccessfulResponse(response);
      window.location.reload();
    } catch (generateError: unknown) {
      setError(generateError instanceof Error ? generateError.message : 'Unable to generate PDF fixture');
      setIsBusy(false);
    }
  };

  const uploadFixture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/files/local-pdf-fixture/upload', {
        method: 'POST',
        body: formData,
      });

      await ensureSuccessfulResponse(response);
      window.location.reload();
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload PDF fixture');
      setIsBusy(false);
    } finally {
      event.target.value = '';
    }
  };

  const resetFixture = async () => {
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/files/local-pdf-fixture', { method: 'DELETE' });

      await ensureSuccessfulResponse(response);
      window.location.reload();
    } catch (resetError: unknown) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset PDF fixture');
      setIsBusy(false);
    }
  };

  return (
    <div className="pointer-events-auto fixed top-2 left-1/2 z-[2000] -translate-x-1/2 text-xs">
      <div className="rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur">
        <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen((value) => !value)}>
          Local PDF fixtures {status ? `(${status.pageCount} pages)` : ''}
        </Button>

        {isOpen && (
          <div className="mt-1 w-80 space-y-3 rounded-md border bg-background p-3">
            <div>
              <p className="font-medium">Local PDF fixture</p>
              <p className="text-muted-foreground">
                {status?.source === 'uploaded' ? `Using ${status.fileName}` : 'Using generated PDF'}
              </p>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex-1 space-y-1">
                <span className="text-muted-foreground">Generated pages</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={pageCount}
                  onChange={(event) => setPageCount(event.target.value)}
                  disabled={isBusy}
                />
              </label>
              <Button type="button" size="sm" onClick={() => void generateFixture()} disabled={isBusy}>
                Generate
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                Upload PDF
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => void uploadFixture(event)}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => void resetFixture()} disabled={isBusy}>
                Reset to 1 page
              </Button>
            </div>

            {error && <p className="text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};
