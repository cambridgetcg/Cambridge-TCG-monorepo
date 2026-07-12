/**
 * POST /api/admin/snapshot
 *
 * Manual trigger for admin users — runs the daily price snapshot immediately.
 *
 * Body (optional):
 *   { gameIds?: number[], date?: string }
 *
 * Returns the SnapshotResult summary JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runDailySnapshot, type SnapshotOptions } from "@/lib/price-snapshot";
import { redactInternalError } from "@/lib/public-errors";

export const maxDuration = 300; // 5 min Vercel function timeout

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const options: SnapshotOptions = {};

  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object") {
      const { gameIds, date } = body as { gameIds?: unknown; date?: unknown };
      if (Array.isArray(gameIds)) {
        options.gameIds = gameIds.filter((id): id is number => typeof id === "number");
      }
      if (typeof date === "string") {
        options.date = date;
      }
    }
  } catch {
    // empty body is fine — use defaults
  }

  const startTs = new Date().toISOString();
  console.log(`[admin/snapshot] Manual trigger by ${session.user.email} at ${startTs}`, options);

  try {
    const result = await runDailySnapshot(options);

    const endTs = new Date().toISOString();
    console.log(`[admin/snapshot] Completed at ${endTs}`, result);

    return NextResponse.json({ ok: true, startTs, endTs, ...result });
  } catch (err) {
    const error = redactInternalError("admin/snapshot", err);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
