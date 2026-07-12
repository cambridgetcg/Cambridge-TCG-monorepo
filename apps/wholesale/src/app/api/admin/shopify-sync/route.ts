/**
 * POST /api/admin/shopify-sync
 *
 * Trigger a Shopify sync manually from the admin panel.
 * Auth: admin session required.
 *
 * Body:
 *   { mode: 'full'|'prices'|'stock'|'create-missing', skus?: string[], dryRun?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runShopifySync, type SyncOptions } from "@/lib/shopify-sync";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "@/lib/source-publication-policy";

export const maxDuration = 300; // 5-minute Vercel function timeout

export async function POST(req: NextRequest) {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    return NextResponse.json(
      { ok: false, publication_status: "blocked", reason: LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON },
      { status: 503 },
    );
  }
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mode, skus, dryRun } = body as {
    mode?: string;
    skus?: string[];
    dryRun?: boolean;
  };

  const validModes = ["full", "prices", "stock", "create-missing"] as const;
  if (!mode || !validModes.includes(mode as (typeof validModes)[number])) {
    return NextResponse.json(
      {
        error: `Invalid mode. Must be one of: ${validModes.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const options: SyncOptions = {
    mode: mode as SyncOptions["mode"],
    skus: Array.isArray(skus) && skus.length > 0 ? skus : undefined,
    dryRun: dryRun === true,
  };

  const startTs = new Date().toISOString();
  console.log(`[POST /api/admin/shopify-sync] Starting: mode=${mode} dryRun=${options.dryRun} at ${startTs}`);

  try {
    const result = await runShopifySync(options);
    const endTs = new Date().toISOString();

    return NextResponse.json({ ok: true, startTs, endTs, mode, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/shopify-sync] Failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
