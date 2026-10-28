import { AppError } from '@documenso/lib/errors/app-error';
import { getQueryKey, trpc } from '@documenso/trpc/react';
import type { TFindTemplatesResponse } from '@documenso/trpc/server/template-router/schema';
import { Button } from '@documenso/ui/primitives/button';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { t } from '@lingui/core/macro';
import { useQueryClient } from '@tanstack/react-query';
import { StarIcon } from 'lucide-react';

export const TemplateFavoriteButton = ({
  envelopeId,
  isFavorite,
  onFavoriteChange,
}: {
  envelopeId: string;
  isFavorite: boolean;
  onFavoriteChange?: (isFavorite: boolean) => void;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKeys = [getQueryKey(trpc.template.findTemplates), getQueryKey(trpc.template.findOrganisationTemplates)];

  const updateFavorite = (nextIsFavorite: boolean) => {
    for (const queryKey of queryKeys) {
      queryClient.setQueriesData<TFindTemplatesResponse>({ queryKey }, (previous) =>
        previous
          ? {
              ...previous,
              data: previous.data.map((template) =>
                template.envelopeId === envelopeId ? { ...template, isFavorite: nextIsFavorite } : template,
              ),
            }
          : previous,
      );
    }
    onFavoriteChange?.(nextIsFavorite);
  };

  const { mutate, isPending } = trpc.template.updateFavorite.useMutation({
    // Favorite clicks keep the current rows and order; reloads use the new ranking.
    meta: { doNotInvalidateQueryOnMutation: true },
    onMutate: ({ data }) => {
      const previousIsFavorite = isFavorite;
      updateFavorite(data.isFavorite);
      return { previousIsFavorite };
    },
    onSuccess: async () => {
      await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: 'none' })));
    },
    onError: (err, variables, context) => {
      updateFavorite(context?.previousIsFavorite ?? !variables.data.isFavorite);
      const error = AppError.parseError(err);
      toast({
        title: t`Unable to update favorite`,
        description: error.userMessage ?? t`Please try again.`,
        variant: 'destructive',
      });
    },
  });

  const label = isFavorite ? t`Remove from favorites` : t`Add to favorites`;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 shrink-0 p-0"
      aria-label={label}
      title={label}
      aria-pressed={isFavorite}
      disabled={isPending}
      onClick={(event) => {
        event.stopPropagation();
        mutate({ envelopeId, data: { isFavorite: !isFavorite } });
      }}
    >
      <StarIcon className={isFavorite ? 'h-4 w-4 fill-yellow-500 text-yellow-500' : 'h-4 w-4'} />
    </Button>
  );
};
