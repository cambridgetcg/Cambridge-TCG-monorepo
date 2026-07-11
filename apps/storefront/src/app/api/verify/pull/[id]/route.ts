import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { projectClientSeed } from "@/lib/privacy/proof-seed";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// Public verification endpoint. user_id is never returned. Legacy client
// seeds embed that id and are therefore owner-only; new opaque seeds are
// public. Anonymous legacy proofs still expose commitment, revealed server
// seed, nonce, outcome, timestamps, and digest placement, but exact outcome
// replay is partial until the owner signs in.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Validate UUID shape so we don't query with random user input
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { error: "Invalid pull id." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const r = await query(
    `SELECT p.id, p.user_id, p.tier, p.earned_from,
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
    return NextResponse.json(
      { error: "Pull not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const row = r.rows[0];

  const session = await auth();
  const isOwner = !!session?.user?.id && session.user.id === row.user_id;
  const clientSeed = projectClientSeed(row.rng_client_seed, isOwner);

  return NextResponse.json({
    pull_id: row.id,
    tier: row.tier,
    earned_from: row.earned_from,

    commitment: row.rng_server_seed_hash,
    server_seed: row.revealed_at || row.resolved_at ? row.rng_server_seed : null,
    client_seed: clientSeed.clientSeed,
    client_seed_display: clientSeed.display,
    outcome_replay_available: clientSeed.outcomeReplayAvailable,
    client_seed_withheld: clientSeed.withheld,
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

    // Slim public-safe result card. The internal vault row id stays private.
    vault_item: row.vault_item_id ? {
      card_name: row.vault_card_name,
      card_number: row.vault_card_number,
      image_url: row.vault_image_url,
    } : null,
  }, { headers: PRIVATE_NO_STORE });
}
