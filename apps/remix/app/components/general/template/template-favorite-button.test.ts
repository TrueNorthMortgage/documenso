import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FavoriteVariables = { envelopeId: string; data: { isFavorite: boolean } };
type FavoriteContext = { previousIsFavorite: boolean };
type MutationOptions = {
  meta: { doNotInvalidateQueryOnMutation: boolean };
  onMutate: (variables: FavoriteVariables) => FavoriteContext;
  onSuccess: () => Promise<void>;
  onError: (error: Error, variables: FavoriteVariables, context: FavoriteContext) => void;
};

const mocks = vi.hoisted(() => ({
  queryClient: undefined as unknown as QueryClient,
  useMutation: vi.fn<(options: MutationOptions) => { mutate: () => void; isPending: boolean }>(),
  onFavoriteChange: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@documenso/trpc/react', () => ({
  getQueryKey: (route: { path: string }) => [['template', route.path]],
  trpc: {
    template: {
      findTemplates: { path: 'findTemplates' },
      findOrganisationTemplates: { path: 'findOrganisationTemplates' },
      updateFavorite: { useMutation: mocks.useMutation },
    },
  },
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => mocks.queryClient,
}));
vi.mock('@documenso/ui/primitives/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@documenso/ui/primitives/button', () => ({ Button: 'button' }));
vi.mock('@lingui/core/macro', () => ({ t: (strings: TemplateStringsArray) => strings.join('') }));

import { TemplateFavoriteButton } from './template-favorite-button';

const keys = [
  [['template', 'findTemplates'], { input: { page: 1 }, type: 'query' }],
  [['template', 'findTemplates'], { input: { page: 2 }, type: 'query' }],
  [['template', 'findOrganisationTemplates'], { input: { page: 1 }, type: 'query' }],
];
const variables = { envelopeId: 'target', data: { isFavorite: true } };
const fixture = {
  data: [
    { envelopeId: 'other', isFavorite: false },
    { envelopeId: 'target', isFavorite: false },
  ],
  count: 30,
  currentPage: 1,
  perPage: 10,
  totalPages: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.useMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
  for (const key of keys) {
    mocks.queryClient.setQueryData(key, fixture);
  }
});

const renderButton = () =>
  renderToStaticMarkup(
    createElement(TemplateFavoriteButton, {
      envelopeId: 'target',
      isFavorite: false,
      onFavoriteChange: mocks.onFavoriteChange,
    }),
  );
const mutation = () => mocks.useMutation.mock.calls[0][0];

describe('template favorite clicks', () => {
  it('marks cached rows across all loaded lists without reordering or changing pagination', () => {
    renderButton();
    mutation().onMutate(variables);
    for (const key of keys) {
      expect(mocks.queryClient.getQueryData(key)).toEqual({
        ...fixture,
        data: [
          { envelopeId: 'other', isFavorite: false },
          { envelopeId: 'target', isFavorite: true },
        ],
      });
    }
    expect(mocks.onFavoriteChange).toHaveBeenCalledWith(true);
  });

  it('skips the global refresh and marks lists stale without fetching active lists', async () => {
    renderButton();
    const fetch = vi.fn().mockResolvedValue(fixture);
    const observer = new QueryObserver(mocks.queryClient, { queryKey: keys[0], queryFn: fetch, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(mutation().meta.doNotInvalidateQueryOnMutation).toBe(true);
      mutation().onMutate(variables);
      await mutation().onSuccess();
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.queryClient.getQueryState(keys[0])?.isInvalidated).toBe(true);
      expect(mocks.queryClient.getQueryData(keys[0])).toMatchObject({
        data: [{ envelopeId: 'other' }, { envelopeId: 'target', isFavorite: true }],
      });
    } finally {
      unsubscribe();
    }
  });

  it('restores the star in cached lists and the popup when saving fails', () => {
    renderButton();
    const context = mutation().onMutate(variables);
    mutation().onError(new Error('Failed'), variables, context);
    for (const key of keys) {
      expect(mocks.queryClient.getQueryData(key)).toEqual(fixture);
    }
    expect(mocks.onFavoriteChange).toHaveBeenLastCalledWith(false);
    expect(mocks.toast).toHaveBeenCalled();
  });

  it('renders a separate non-submit button with accessible favorite state', () => {
    expect(renderButton()).toContain('type="button"');
    expect(renderButton()).toContain('aria-pressed="false"');
    expect(renderButton()).toContain('aria-label="Add to favorites"');
  });
});
