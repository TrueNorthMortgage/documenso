import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import { AppError } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { Input } from '@documenso/ui/primitives/input';
import { SpinnerBox } from '@documenso/ui/primitives/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { StarIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type EnvelopeEmailMessagePickerProps = {
  teamId: number;
  onCancel: () => void;
  onSelect: (message: { subject: string; message: string }) => void;
};

export const EnvelopeEmailMessagePicker = ({ teamId, onCancel, onSelect }: EnvelopeEmailMessagePickerProps) => {
  const { t } = useLingui();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const messages = trpc.team.emailMessage.find.useQuery({ teamId, query }, { refetchOnMount: 'always' });
  const favorite = trpc.team.emailMessage.updateFavorite.useMutation(DO_NOT_INVALIDATE_QUERY_ON_MUTATION);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleFavorite = async (id: string, isFavorite: boolean) => {
    try {
      await favorite.mutateAsync({ teamId, id, data: { isFavorite } });
      setFavoriteOverrides((previous) => ({ ...previous, [id]: isFavorite }));
    } catch (err) {
      const error = AppError.parseError(err);
      toast({
        title: t`Unable to update favorite`,
        description: error.userMessage ?? t`Please try again.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Input
        aria-label={t`Search messages`}
        placeholder={t`Search templates and recent messages`}
        value={search}
        maxLength={255}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
          }
        }}
      />

      {messages.isLoading && <SpinnerBox />}
      {messages.isError && (
        <p className="text-destructive text-sm" role="alert">
          <Trans>Unable to load messages.</Trans>
        </p>
      )}
      {messages.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">
          <Trans>No matching messages.</Trans>
        </p>
      )}

      {messages.data && messages.data.length > 0 && (
        <div className="max-h-56 overflow-y-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Message</Trans>
                </TableHead>
                <TableHead className="w-20">
                  <Trans>Source</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.data.map((item) => {
                const isFavorite = favoriteOverrides[item.id] ?? item.isFavorite;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="py-2" truncate={false}>
                      <div className="flex items-start gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 p-0"
                          aria-pressed={isFavorite}
                          aria-label={isFavorite ? t`Remove from favorites` : t`Add to favorites`}
                          disabled={favorite.isPending}
                          onClick={() => void toggleFavorite(item.id, !isFavorite)}
                        >
                          <StarIcon className={isFavorite ? 'h-4 w-4 fill-yellow-500 text-yellow-500' : 'h-4 w-4'} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto min-w-0 flex-1 justify-start px-2 py-1 text-left"
                          onClick={() => onSelect(item)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{item.name ?? (item.subject || t`No subject`)}</span>
                            {item.message && (
                              <span className="block truncate text-muted-foreground text-xs">{item.message}</span>
                            )}
                          </span>
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      {item.lastSentAt ? (
                        <Trans>Recent</Trans>
                      ) : item.isPersonal ? (
                        <Trans>Saved</Trans>
                      ) : (
                        <Trans>Team</Trans>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </div>
  );
};
