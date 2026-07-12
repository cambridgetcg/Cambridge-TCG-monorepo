import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public hash-chain feed over fairness_digests. These are batches of revealed
// bounty_pulls and verifiable_draws collected by the digest job, not a complete
// ledger of every random outcome. Returns prev_hash,
// root, and chain_hash per digest so an external auditor can
// recompute the chain forward and verify the latest chain_hash still
// matches what they cached days/weeks ago.
//
// Why this is stronger than the raw digest feed: if any single leaf
// gets rewritten post-hoc, that digest's root changes, which changes
// its chain_hash, which invalidates every subsequent chain_hash. A
// cached-tip-vs-recomputed-tip comparison catches it only when the prior tip
// was retained outside our control.

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, isNaN(limitRaw) ? DEFAULT_LIMIT : limitRaw));
  const fromId = url.searchParams.get("from_id"); // walk forward from a cached tip

  const params: unknown[] = [limit];
  let where = "";
  if (fromId) {
    const parsed = parseInt(fromId, 10);
    if (Number.isFinite(parsed)) {
      params.push(parsed);
      where = `WHERE id > $${params.length}`;
    }
  }

  const r = await query(
    `SELECT id, root, prev_hash, chain_hash, leaf_count, window_from, window_to, created_at
       FROM fairness_digests
       ${where}
      ORDER BY id ASC
      LIMIT $1`,
    params,
  );

  // Tip is the most recent chain_hash — the single value an auditor
  // caches to detect any historical rewrite.
  const tipRes = await query(
    `SELECT chain_hash, id FROM fairness_digests
      WHERE chain_hash IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
  );
  const tip = tipRes.rows[0] ?? null;

  return NextResponse.json(
    {
      digests: r.rows,
      tip,
      count: r.rows.length,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
