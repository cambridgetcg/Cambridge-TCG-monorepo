/**
 * POST /api/cron/cardrush-hires (alias: GET)
 *
 * Temporary cron that drains cardrush-pokemon.jp og:image bytes into
 * s3://jp-pk-photos/hires/{SET}/{SKU}.jpg. One game per invocation; one
 * batch per invocation; auto no-ops when `remaining = 0`. Operator removes
 * the cron entry from vercel.json after 2 consecutive zero-remaining runs.
 *
 * Auth: Authorization: Bearer {CRON_SECRET} OR Vercel Cron header.
 *
 * Query params:
 *   ?dryRun=1              — count would-uploads, skip S3 PUTs
 *   ?maxBatch=N            — cap per-invocation batch (default 100, max 500)
 *   ?triggeredBy=cron|admin
 *
 * Spec: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
 */

import { NextRequest, NextResponse } from "next/server";
import { runHiresUpload } from "@/lib/cardrush-hires-upload";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 800;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxBatchParam = url.searchParams.get("maxBatch");
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron"
    | "admin"
    | null;

  const maxBatch = maxBatchParam
    ? Math.max(1, Math.min(parseInt(maxBatchParam, 10) || 100, 500))
    : undefined;

  try {
    const summary = await runHiresUpload({
      game: "pkm",
      triggeredBy: triggeredByParam ?? "cron",
      dryRun,
      maxBatch,
    });
    return NextResponse.json({ ok: true, summary, dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}

export const GET = POST;
