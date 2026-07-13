/**
 * Verify the one supported cron credential.
 *
 * Vercel sends CRON_SECRET as an exact Authorization bearer token. Marker
 * headers and development bypasses are not credentials and are not accepted.
 */
export function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;

  return Boolean(
    cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`,
  );
}
