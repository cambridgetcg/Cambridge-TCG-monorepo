import { NextResponse } from "next/server";

/**
 * Gate cron endpoints. Returns a NextResponse on rejection, or null on
 * pass. Every invocation requires one signal:
 *
 *   `Authorization: Bearer $CRON_SECRET`.
 *
 * Vercel Cron sends this header automatically when CRON_SECRET is configured.
 * A client-controlled `x-vercel-cron` header and URL query secrets are never
 * accepted. Fails CLOSED: if CRON_SECRET is unset, the route rejects with 503
 * (not 401) so the operator
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
 * The cron-auth audit (`pnpm audit:cron-auth`) fails if any file under
 * apps/*\/src/app/api/cron/**\/route.ts doesn't import this helper.
 */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
