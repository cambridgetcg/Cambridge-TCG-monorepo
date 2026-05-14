import { NextRequest, NextResponse } from "next/server";

/**
 * Gate cron endpoints. Returns a NextResponse on rejection, or null on
 * pass. Accepts three signals (any one is sufficient):
 *
 *   1. `x-vercel-cron: true` header — Vercel Cron injects this for
 *      scheduled runs declared in vercel.json.
 *   2. `Authorization: Bearer $CRON_SECRET` header.
 *   3. `?secret=$CRON_SECRET` query param.
 *
 * Fails CLOSED: if CRON_SECRET is unset AND the request isn't from
 * Vercel Cron, the route rejects with 503 (not 401) so the operator
 * sees a config error rather than thinking the secret is wrong.
 *
 * Usage in a cron route:
 *
 *   export async function GET(req: NextRequest) {
 *     const denied = requireCronAuth(req);
 *     if (denied) return denied;
 *     // … job body …
 *   }
 *
 * The cron-auth audit (`pnpm audit:cron-auth`) fails if any file under
 * apps/*\/src/app/api/cron/**\/route.ts doesn't import this helper.
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  if (req.headers.get("x-vercel-cron") === "true") return null;

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return null;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
