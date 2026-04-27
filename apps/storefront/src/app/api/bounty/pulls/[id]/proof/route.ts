import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// PUBLIC — no auth. Returns the provable-fair data for a single pull.
// The endpoint exists so anyone (not just the owner) can verify a pull's
// randomness. User-identifying fields beyond the already-public
// rng_client_seed (which is just a random UUID) are not exposed.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await query(
    `SELECT
       p.id, p.tier, p.earned_from,
       p.rolled_rarity, p.rolled_sku, p.rolled_spot_gbp,
       p.rng_server_seed_hash, p.rng_server_seed,
       p.rng_client_seed, p.rng_nonce,
       p.resolved_at,
       t.rarity_weights
     FROM bounty_pulls p
     LEFT JOIN bounty_pull_tiers t ON t.tier = p.tier
     WHERE p.id = $1`,
    [id],
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Pull not found." }, { status: 404 });
  }
  const r = result.rows[0];
  return NextResponse.json({
    id: r.id,
    tier: r.tier,
    earned_from: r.earned_from,
    rolled_rarity: r.rolled_rarity,
    rolled_sku: r.rolled_sku,
    rolled_spot_gbp: r.rolled_spot_gbp,
    commitment: r.rng_server_seed_hash,
    server_seed: r.rng_server_seed,
    client_seed: r.rng_client_seed,
    // rng_nonce is BIGINT; pg returns it as a string by default to avoid JS
    // precision loss. Our values fit in a regular JS number (millisecond
    // timestamps), so coerce here for the in-browser verification path.
    nonce: r.rng_nonce != null ? Number(r.rng_nonce) : null,
    rarity_weights: r.rarity_weights,
    resolved_at: r.resolved_at,
  });
}
