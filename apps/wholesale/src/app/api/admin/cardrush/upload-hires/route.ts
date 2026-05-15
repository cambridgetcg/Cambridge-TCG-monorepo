/**
 * POST /api/admin/cardrush/upload-hires
 *
 * Admin-triggered counterpart to the cardrush-hires cron. Same runner;
 * accepts game / maxBatch / dryRun in the body so the operator can do
 * manual prods, dry-runs against pkm, or kick the op/dbs drains later.
 *
 * Body: { game?: "pkm" | "op" | "dbs"; maxBatch?: number; dryRun?: boolean }
 * Default game = "pkm".
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  runHiresUpload,
  type HiresUploadOptions,
} from "@/lib/cardrush-hires-upload";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<HiresUploadOptions> = {};
  try {
    body = (await request.json()) as Partial<HiresUploadOptions>;
  } catch {
    // Empty body is fine — all fields default.
  }

  const game = body.game ?? "pkm";
  if (game !== "pkm" && game !== "op" && game !== "dbs") {
    return NextResponse.json(
      { error: `Invalid game: ${game}` },
      { status: 400 },
    );
  }

  const maxBatch = body.maxBatch
    ? Math.max(1, Math.min(body.maxBatch, 500))
    : undefined;

  try {
    const summary = await runHiresUpload({
      game,
      triggeredBy: "admin",
      dryRun: body.dryRun === true,
      maxBatch,
    });
    return NextResponse.json({ ok: true, summary, dryRun: summary.dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}
