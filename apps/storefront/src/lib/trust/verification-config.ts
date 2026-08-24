/**
 * New identity-verification collection is deliberately opt-in.
 *
 * The legacy flow shares an object bucket with public marketplace media and
 * has no repository-owned lifecycle for abandoned presigned uploads. Existing
 * participants must retain read/delete access, but new collection stays paused
 * until the private-prefix policy and orphan cleanup are independently checked.
 */
export const IDENTITY_VERIFICATION_REVIEWED_MODE =
  "reviewed-private-storage" as const;

export function isIdentityVerificationCollectionAvailable(
  env: { IDENTITY_VERIFICATION_MODE?: string } = process.env as {
    IDENTITY_VERIFICATION_MODE?: string;
  },
): boolean {
  return env.IDENTITY_VERIFICATION_MODE?.trim() ===
    IDENTITY_VERIFICATION_REVIEWED_MODE;
}

export const IDENTITY_VERIFICATION_PAUSE_REASON =
  "New identity-verification submissions and document uploads are paused while private storage and abandoned-upload cleanup are reviewed.";
