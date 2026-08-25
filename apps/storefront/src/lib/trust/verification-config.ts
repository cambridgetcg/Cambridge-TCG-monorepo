/**
 * New identity-verification collection is deliberately opt-in.
 *
 * The legacy flow shared an object bucket with public marketplace media and
 * had no repository-owned lifecycle for abandoned presigned uploads. The new
 * flow uses a dedicated private bucket, but collection remains paused unless
 * that bucket is explicitly configured and its production gate was reviewed.
 * Existing participants retain read/delete or support-assisted access.
 */
export const IDENTITY_VERIFICATION_REVIEWED_MODE =
  "reviewed-private-storage" as const;

export function isIdentityVerificationCollectionAvailable(
  env: {
    IDENTITY_VERIFICATION_MODE?: string;
    VERIFICATION_S3_BUCKET?: string;
  } = process.env as {
    IDENTITY_VERIFICATION_MODE?: string;
    VERIFICATION_S3_BUCKET?: string;
  },
): boolean {
  return (
    env.IDENTITY_VERIFICATION_MODE?.trim() ===
      IDENTITY_VERIFICATION_REVIEWED_MODE &&
    Boolean(env.VERIFICATION_S3_BUCKET?.trim())
  );
}

export const IDENTITY_VERIFICATION_PAUSE_REASON =
  "New identity-verification submissions and document uploads are paused while private storage and abandoned-upload cleanup are reviewed.";
