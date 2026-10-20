import type { Page } from '@playwright/test';

// Use the browser session so permission checks exercise the same identity as the UI.
export const postTrpc = (page: Page, teamId: number, route: string, input: unknown) =>
  page.request.post(`/api/trpc/${route}`, {
    headers: { 'x-team-id': String(teamId) },
    data: { json: input },
  });
