export const MAX_CREDENTIAL_EMAIL_LENGTH = 254;
export const MAX_CREDENTIAL_PASSWORD_LENGTH = 1024;

export function normalizeCredentialEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_CREDENTIAL_EMAIL_LENGTH) {
    return null;
  }

  const separator = email.indexOf("@");
  if (
    separator < 1 ||
    separator !== email.lastIndexOf("@") ||
    separator > 64 ||
    separator === email.length - 1 ||
    /\s|[\u0000-\u001f\u007f]/u.test(email)
  ) {
    return null;
  }

  return email;
}

export function isBoundedCredentialPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CREDENTIAL_PASSWORD_LENGTH
  );
}
