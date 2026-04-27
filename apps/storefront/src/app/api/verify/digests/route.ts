import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public Merkle digest feed. Returns the most recent N fairness_digests
// roots + metadata so auditors can snapshot the root timeline and
// compare later.
//
// NOT included in the response: the `leaves` JSON. That's queryable per
// digest via /api/verify/digests/[id] — keeping this feed small so
// a pager/scraper can walk years of history without bloat.

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, isNaN(limitRaw) ? DEFAULT_LIMIT : limitRaw));
  const before = url.searchParams.get("before"); // ISO timestamp for pagination

  const params: unknown[] = [limit];
  let where = "";
  if (before) {
    params.push(before);
    where = `WHERE created_at < $${params.length}`;
  }

  const r = await query(
    `SELECT id, root, leaf_count, window_from, window_to, created_at
       FROM fairness_digests
       ${where}
      ORDER BY created_at DESC
      LIMIT $1`,
    params,
  );

  return NextResponse.json(
    {
      digests: r.rows,
      count: r.rows.length,
      next_before: r.rows.length === limit ? r.rows[r.rows.length - 1].created_at : null,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
