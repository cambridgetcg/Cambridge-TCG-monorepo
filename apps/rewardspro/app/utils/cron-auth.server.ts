/**
 * Shared cron authentication utility
 *
 * Vercel Cron sends requests with:
 * 1. Authorization: Bearer <CRON_SECRET> (when CRON_SECRET env var is set)
 * 2. x-vercel-cron: 1 (internal header for Vercel-initiated cron requests)
 *
 * This utility checks both mechanisms, matching the proven pattern
 * from api.cron.exchange-rates.tsx.
 */

export function verifyCronAuth(request: Request): boolean {
  // Primary: Bearer token from CRON_SECRET env var
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Fallback: Vercel's internal cron header
  // Vercel strips this header from non-cron external requests
  const vercelCron = request.headers.get('x-vercel-cron');
  if (vercelCron === '1') {
    return true;
  }

  // Development bypass (requires explicit opt-in)
  if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_CRON_BYPASS === 'true') {
    return true;
  }

  return false;
}
