import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public verification endpoint for any verifiable_draws row. Same
// shape/contract as /api/verify/pull/[id] — returns the public-safe
// slice of the commit-reveal data so the /verify/draw/[id] page can
// re-run the math in the browser.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid draw id." }, { status: 400 });
  }

  const r = await query(
    `SELECT id, kind, subject_id,
            commitment, server_seed, client_seed, nonce,
            weights, num_slots, outcome,
            committed_at, revealed_at,
            merkle_digest_id, merkle_leaf_index
       FROM verifiable_draws
      WHERE id = $1`,
    [id],
  );

  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Draw not found." }, { status: 404 });
  }

  const row = r.rows[0];

  // Anonymise client_seed for public display (same approach as pull verifier)
  const clientSeed: string = row.client_seed;
  const clientSeedDisplay = clientSeed.includes(":")
    ? `…:${clientSeed.split(":")[1]}`
    : "…";

  return NextResponse.json({
    draw_id: row.id,
    kind: row.kind,
    subject_id: row.subject_id,
    commitment: row.commitment,
    server_seed: row.server_seed,
    client_seed: clientSeed,
    client_seed_display: clientSeedDisplay,
    nonce: row.nonce != null ? Number(row.nonce) : null,
    weights: row.weights,
    num_slots: row.num_slots,
    outcome: row.outcome,
    committed_at: row.committed_at,
    revealed_at: row.revealed_at,
    merkle_digest_id: row.merkle_digest_id,
    merkle_leaf_index: row.merkle_leaf_index,
  });
}
