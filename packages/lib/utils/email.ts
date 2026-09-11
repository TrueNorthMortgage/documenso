export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isSameEmail = (firstEmail: string | null | undefined, secondEmail: string | null | undefined) => {
  if (!firstEmail || !secondEmail) {
    return false;
  }

  return normalizeEmail(firstEmail) === normalizeEmail(secondEmail);
};
