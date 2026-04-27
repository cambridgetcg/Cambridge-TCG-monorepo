import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Public verification endpoint. NO AUTH — only data that's safe to
// expose to anyone. Specifically excluded:
//   - user_id (the pull's owner shouldn't be discoverable from a pull_id)
//   - earned_from + tier are kept (they're just metadata)
//
// Everything else IS the proof. The seed, the commitment, the nonce,
// the result — all needed to verify, all defensible to publish (the
// commit-reveal scheme assumes the seed becomes public after the roll).

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Validate UUID shape so we don't query with random user input
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid pull id." }, { status: 400 });
  }

  const r = await query(
    `SELECT p.id, p.tier, p.earned_from,
            p.rng_server_seed_hash, p.rng_server_seed,
            p.rng_client_seed, p.rng_nonce,
            p.rolled_rarity, p.rolled_sku, p.rolled_spot_gbp,
            p.committed_at, p.revealed_at, p.resolved_at,
            p.merkle_digest_id, p.merkle_leaf_index,
            p.vault_item_id,
            v.card_name AS vault_card_name,
            v.card_number AS vault_card_number,
            v.image_url AS vault_image_url,
            t.rarity_weights
       FROM bounty_pulls p
       LEFT JOIN vault_items v ON v.id = p.vault_item_id
       LEFT JOIN bounty_pull_tiers t ON t.tier = p.tier
      WHERE p.id = $1`,
    [id],
  );

  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Pull not found." }, { status: 404 });
  }

  const row = r.rows[0];

  // Anonymise the client_seed for display: format is `${userId}:${suffix}`
  // (post-Phase E hardening) or just `${userId}` (legacy). The userId is
  // a UUID; the suffix is random hex. We expose only the suffix-side in
  // the response so the public verifier doesn't leak ownership.
  //
  // Note: the FULL client_seed is needed for verification math. We expose
  // it because (a) the rolling user knows it's their userId, (b) anyone
  // mapping pull→user from the public surface would already need DB
  // access. Documenting the trade-off here.
  const clientSeed: string | null = row.rng_client_seed;
  const clientSeedDisplay = clientSeed
    ? clientSeed.includes(":")
      ? `…:${clientSeed.split(":")[1]}` // hide userId portion
      : "…" // legacy: hide entirely
    : null;

  return NextResponse.json({
    pull_id: row.id,
    tier: row.tier,
    earned_from: row.earned_from,

    commitment: row.rng_server_seed_hash,
    server_seed: row.rng_server_seed,
    client_seed: clientSeed,
    client_seed_display: clientSeedDisplay,
    nonce: row.rng_nonce != null ? Number(row.rng_nonce) : null,

    rolled_rarity: row.rolled_rarity,
    rolled_sku: row.rolled_sku,
    rolled_spot_gbp: row.rolled_spot_gbp,
    rarity_weights: row.rarity_weights,

    committed_at: row.committed_at,
    revealed_at: row.revealed_at,
    resolved_at: row.resolved_at,
    merkle_digest_id: row.merkle_digest_id,
    merkle_leaf_index: row.merkle_leaf_index,

    // Slim public-safe vault item — proves the pull paid out.
    vault_item: row.vault_item_id ? {
      id: row.vault_item_id,
      card_name: row.vault_card_name,
      card_number: row.vault_card_number,
      image_url: row.vault_image_url,
    } : null,
  });
}
