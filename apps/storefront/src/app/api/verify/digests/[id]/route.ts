import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Return a single digest's full contents — root + all leaves — so a
// client-side verifier can reconstruct any leaf's inclusion path
// without extra network round trips.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const digestId = parseInt(id, 10);
  if (!Number.isFinite(digestId)) {
    return NextResponse.json({ error: "Invalid digest id." }, { status: 400 });
  }

  const r = await query(
    `SELECT id, root, leaf_count, leaves, window_from, window_to, created_at
       FROM fairness_digests
      WHERE id = $1`,
    [digestId],
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Digest not found." }, { status: 404 });
  }

  return NextResponse.json(r.rows[0], {
    headers: {
      "Cache-Control": "public, max-age=3600, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
