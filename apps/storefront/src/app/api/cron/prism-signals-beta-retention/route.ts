import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { purgeInactiveProductBetaInterests } from "@/lib/prism-signals/beta-interest.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const deleted = await purgeInactiveProductBetaInterests();
    return NextResponse.json(
      { ok: true, deleted },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error(
      "[cron/prism-signals-beta-retention] unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      {
        ok: false,
        error: "PRISM Signals beta retention storage is unavailable.",
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
