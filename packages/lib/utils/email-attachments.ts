const POSTMARK_MAX_MESSAGE_SIZE_BYTES = 10_000_000;
const EMAIL_MESSAGE_SIZE_RESERVE_BYTES = 128 * 1024;

type EmailAttachment = {
  content: Buffer;
};

export const getPostmarkSafeEmailAttachments = <T extends EmailAttachment>({
  attachments,
  html,
  text,
}: {
  attachments: T[];
  html: string;
  text: string;
}) => {
  const emailContentSize = Buffer.byteLength(html) + Buffer.byteLength(text);
  const encodedAttachmentSize = attachments.reduce((totalSize, attachment) => {
    const base64Size = Math.ceil(attachment.content.length / 3) * 4;
    const base64LineBreakSize = Math.ceil(base64Size / 76) * 2;

    return totalSize + base64Size + base64LineBreakSize;
  }, 0);

  const estimatedMessageSize = emailContentSize + encodedAttachmentSize + EMAIL_MESSAGE_SIZE_RESERVE_BYTES;

  return estimatedMessageSize > POSTMARK_MAX_MESSAGE_SIZE_BYTES ? [] : attachments;
};
