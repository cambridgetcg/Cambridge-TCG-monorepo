import { NextResponse } from "next/server";

/**
 * Gate cron endpoints. Returns a NextResponse on rejection, or null on
 * pass. The only accepted signal is `Authorization: Bearer $CRON_SECRET`.
 * Vercel Cron sends that header when CRON_SECRET is configured. Caller-set
 * marker headers are not authentication, and query-string secrets leak into
 * browser, proxy, and hosting logs.
 *
 * Fails CLOSED: if CRON_SECRET is unset, the route rejects with 503 so the operator
 * sees a config error rather than thinking the secret is wrong.
 *
 * Usage in a cron route:
 *
 *   export async function GET(req: Request) {
 *     const denied = requireCronAuth(req);
 *     if (denied) return denied;
 *     // … job body …
 *   }
 *
 * src/app/api/cron/refusal.test.ts calls every route under api/cron without the
 * bearer and fails if one answers anything but 401 or does work first. The
 * cron-auth audit (`pnpm audit:cron-auth`, run by hand) also reads the
 * wholesale app's routes, for this import and a call.
 */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return null;

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
