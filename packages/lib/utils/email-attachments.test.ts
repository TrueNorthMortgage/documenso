import { describe, expect, it } from 'vitest';

import { getPostmarkSafeEmailAttachments } from './email-attachments';

describe('getPostmarkSafeEmailAttachments', () => {
  const emailContent = {
    html: '<p>Your document is ready.</p>',
    text: 'Your document is ready.',
  };

  it('includes PDF attachments when the encoded email fits within Postmark’s message limit', () => {
    const attachments = [
      {
        filename: 'completed-document.pdf',
        content: Buffer.alloc(1024),
        contentType: 'application/pdf',
      },
    ];

    expect(getPostmarkSafeEmailAttachments({ attachments, ...emailContent })).toBe(attachments);
  });

  it('omits all PDF attachments when their Base64-encoded size exceeds Postmark’s message limit', () => {
    const attachments = [
      {
        filename: 'completed-document.pdf',
        content: Buffer.alloc(8 * 1024 * 1024),
        contentType: 'application/pdf',
      },
    ];

    expect(getPostmarkSafeEmailAttachments({ attachments, ...emailContent })).toEqual([]);
  });
});
