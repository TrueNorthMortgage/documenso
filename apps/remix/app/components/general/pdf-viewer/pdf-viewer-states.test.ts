import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PdfViewerPageImage } from './pdf-viewer-page-image';
import { PdfViewerErrorState } from './pdf-viewer-states';

vi.mock('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: string }) => children,
}));

describe('PDF viewer recovery messages', () => {
  const imageProps = { alt: '' as const };

  it('announces a document load failure and explains how to recover', () => {
    const html = renderToStaticMarkup(createElement(PdfViewerErrorState));

    expect(html).toContain('role="alert"');
    expect(html).toContain('We couldn’t display this document.');
    expect(html).toContain('reopen the link in an updated browser or on another device');
  });

  it('announces a page failure without showing the warning during normal loading', () => {
    const error = renderToStaticMarkup(createElement(PdfViewerPageImage, { imageLoadingState: 'error', imageProps }));
    const loading = renderToStaticMarkup(
      createElement(PdfViewerPageImage, { imageLoadingState: 'loading', imageProps }),
    );

    expect(error).toContain('role="alert"');
    expect(error).toContain('We couldn’t display this page.');
    expect(error).toContain('reopen the link in an updated browser or on another device');
    expect(loading).not.toContain('role="alert"');
  });
});
