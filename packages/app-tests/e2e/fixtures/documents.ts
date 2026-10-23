import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const checkDocumentTabCount = async (page: Page, tabName: string, count: number) => {
  const tab = page.getByRole('tab', { name: tabName });
  const status = tabName.toUpperCase();
  const hasStatus = (url: URL) => (url.searchParams.get('status') || 'ALL') === status;
  if (!hasStatus(new URL(page.url()))) {
    await tab.click();
    await page.waitForURL(hasStatus);
  }
  // Navigation and the controlled tab state can settle at different times.
  await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });

  if (tabName !== 'All') {
    await expect(page.getByRole('tab', { name: tabName })).toContainText(count.toString());
  }

  if (count === 0) {
    await expect(page.getByTestId('empty-document-state')).toBeVisible();
    return;
  }

  await expect(page.getByTestId('data-table-count')).toHaveText(
    `Showing ${count} ${count === 1 ? 'result' : 'results'}.`,
  );
};
