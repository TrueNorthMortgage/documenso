import type { Recipient } from '@prisma/client';

export const extractInitials = (text: string, maxInitials = 2) =>
  text
    .split(' ')
    .map((name: string) => name.slice(0, 1).toUpperCase())
    .slice(0, maxInitials)
    .join('');

export const recipientAbbreviation = (recipient: Pick<Recipient, 'name' | 'email'>) => {
  return extractInitials(recipient.name) || recipient.email.slice(0, 1).toUpperCase();
};
