// Resolve a Bounty Pull end-to-end.
// 1. Consume a pull token
// 2. Commit-reveal RNG to pick a rarity per tier weights
// 3. Fetch live wholesale catalog, filter by rolled rarity + in-stock,
//    subtract implicit vault reservations, pick one via RNG
// 4. Persist bounty_pulls + vault_items atomically-enough (individual queries;
//    the token consumption is the only row-level race protection we need —
//    everything after is derived)
//
// Returns a minimal result object suitable for the API response.

import { fetchPrices } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import {
  commitBountyPull,
  consumePullToken,
  countReservedForSku,
  createVaultItemIfStockAvailable,
  getTierConfig,
  grantPullToken,
  revealBountyPull,
  getEligibility,
  countGlobalPullsThisWeek,
  type PullTier,
  type VaultItem,
} from "./db";
import {
  sha256,
  generateServerSeed,
  generateClientSeedSuffix,
  generateNonce,
  rollFloat,
  pickWeighted,
} from "./rng";

export interface PullResolution {
  pull_id: string;
  vault_item: VaultItem;
  rolled_rarity: string;
  rarity_weights: Record<string, number>;
  rng_commitment: string;
  rng_server_seed: string;
  rng_client_seed: string;
  rng_nonce: number;
}

export type PullError =
  | { error: "no_token"; message: string }
  | { error: "tier_disabled"; message: string }
  | { error: "tier_capped"; message: string }
  | { error: "not_eligible"; message: string; reasons: string[] }
  | { error: "no_stock"; message: string }
  | { error: "internal"; message: string };

export async function resolvePull(
  userId: string,
  tier: PullTier,
  earnedFrom: string,
): Promise<PullResolution | PullError> {
  // 1) Eligibility
  const elig = await getEligibility(userId);
  if (!elig.eligible) {
    return {
      error: "not_eligible",
      message: "Bounty Board requires a verified phone and a prior paid order.",
      reasons: elig.reasons,
    };
  }

  // 2) Tier config + global cap
  const cfg = await getTierConfig(tier);
  if (!cfg) return { error: "internal", message: "Tier not configured." };
  if (!cfg.enabled) {
    return { error: "tier_disabled", message: `${cfg.display_name} is currently disabled.` };
  }
  if (cfg.weekly_global_cap != null) {
    const used = await countGlobalPullsThisWeek(tier);
    if (used >= cfg.weekly_global_cap) {
      return {
        error: "tier_capped",
        message: `${cfg.display_name} has hit its weekly global cap. Try again next week.`,
      };
    }
  }

  // 3) Consume token (race-safe)
  const ok = await consumePullToken(userId, tier);
  if (!ok) {
    return { error: "no_token", message: `You don't have a ${cfg.display_name}.` };
  }

  // 4) RNG: COMMIT first (persist seed + hash to DB before rolling), then
  //    REVEAL by rolling and stamping the result on the same row. The
  //    committed_at < revealed_at ordering is enforced by separate writes
  //    so a verifier can prove the server didn't pick the seed AFTER
  //    seeing the desired outcome.
  const serverSeed = generateServerSeed();
  const commitment = sha256(serverSeed);
  // userId anchors the seed to this account; the random suffix means two
  // pulls by the same user produce different (server,client,nonce) tuples
  // even if their server_seeds and nonces somehow collided.
  const clientSeed = `${userId}:${generateClientSeedSuffix()}`;
  // 48 random bits — collision probability for 1M pulls is ~1e-3.
  // Date.now() (the prior implementation) would collide between two
  // requests served in the same millisecond.
  const nonce = generateNonce();

  const committed = await commitBountyPull({
    userId, tier, earnedFrom,
    serverSeedHash: commitment,
    serverSeed,
    clientSeed, nonce,
  });

  const rarityRoll = rollFloat(serverSeed, clientSeed, nonce);
  const rolledRarity = pickWeighted(cfg.rarity_weights, rarityRoll);

  // 5) Find candidate SKUs — fetch wholesale, filter locally.
  // game=one-piece is CORRECT here, not a residual hardcode: the bounty
  // prize pool is deliberately the shop's own One Piece singles stock,
  // and the tier configs' rarity_weights encode the OP rarity ladder.
  // Widening the pool to another game needs per-game weight configs and
  // a methodology update, not just a different ?game= value.
  const catalog = await fetchPrices({
    game: "one-piece",
    in_stock: true,
    limit: 200,
  });

  const candidates = catalog.items.filter(
    (c) =>
      (c.rarity ?? "").toUpperCase() === rolledRarity.toUpperCase()
      && c.stock > 0
      && c.name != null,
  );

  // Exclude SKUs whose implicit reservation equals/exceeds live stock
  const available: typeof candidates = [];
  for (const c of candidates) {
    const reserved = await countReservedForSku(c.sku);
    if (c.stock - reserved > 0) available.push(c);
  }

  if (available.length === 0) {
    // Refund the token — we failed to fulfil through no fault of the user
    await grantPullToken(userId, tier, 1, {
      source: "refund_no_stock",
      description: `Refund: no ${rolledRarity} stock available`,
    });
    // Reveal the committed pull row with the rolled rarity but no card.
    await revealBountyPull({
      pullId: committed.id,
      rolledRarity,
      rolledSku: null,
      rolledSpotGbp: null,
      vaultItemId: null,
    });
    return {
      error: "no_stock",
      message: `No ${rolledRarity} cards are currently available. Your token was refunded.`,
    };
  }

  // 6) Pick a candidate and race-safely claim it.
  //
  // The available pool was computed from a snapshot of reservations at
  // the top of this function — two parallel resolvers can both see the
  // same last-copy SKU as available. createVaultItemIfStockAvailable
  // takes a per-SKU advisory lock + re-checks reservations vs live
  // stock in one statement, so only one caller wins. Losers retry with
  // the next candidate via another deterministic draw from the seed.
  let vault: VaultItem | null = null;
  let pickedSku: string | null = null;
  let pickedSpot: number | null = null;
  const pool = [...available];
  let attempt = 1;

  while (pool.length > 0 && !vault) {
    const pickRoll = rollFloat(serverSeed, clientSeed, nonce + attempt);
    const idx = Math.floor(pickRoll * pool.length);
    const picked = pool[idx];
    const spot = retailPrice(picked.price_gbp, picked.channel_price);
    try {
      vault = await createVaultItemIfStockAvailable(
        {
          userId,
          sku: picked.sku,
          cardName: picked.name ?? picked.sku,
          cardNumber: picked.card_number,
          setCode: picked.set_code,
          rarity: picked.rarity,
          imageUrl: picked.image_url,
          spotPriceGbp: spot,
          source: earnedFrom,
          bountyPullId: committed.id,
        },
        picked.stock,
      );
    } catch (err) {
      // DB error (not a concurrency miss). Refund and bail — retrying
      // a different SKU would mask real DB instability.
      await refundResolverFailure(userId, tier, "vault_create_failed", err);
      return {
        error: "internal",
        message: "Could not complete the pull. Your token has been refunded.",
      };
    }
    if (vault) {
      pickedSku = picked.sku;
      pickedSpot = spot;
    } else {
      // Concurrency miss — lock-winner took the last copy of this SKU
      // between our stock read and our claim. Drop it and retry.
      pool.splice(idx, 1);
      attempt++;
    }
  }

  if (!vault || !pickedSku || pickedSpot === null) {
    // Every candidate lost its race — treat as no_stock and refund.
    await grantPullToken(userId, tier, 1, {
      source: "refund_no_stock",
      description: `Refund: all ${rolledRarity} candidates taken by concurrent resolves`,
    });
    await revealBountyPull({
      pullId: committed.id,
      rolledRarity,
      rolledSku: null,
      rolledSpotGbp: null,
      vaultItemId: null,
    });
    return {
      error: "no_stock",
      message: `No ${rolledRarity} cards available after contention. Your token was refunded.`,
    };
  }

  // Reveal the committed row with the result + vault link in one UPDATE.
  // If THIS fails, the vault item exists and is the user's proof; we
  // don't refund. Admin can backfill the pull row from the vault item's
  // bounty_pull_id reference.
  const winnerVault = vault;
  await revealBountyPull({
    pullId: committed.id,
    rolledRarity,
    rolledSku: pickedSku,
    rolledSpotGbp: pickedSpot,
    vaultItemId: winnerVault.id,
  }).catch((err) => {
    console.error(
      `[resolver] reveal failed for pull=${committed.id} vault=${winnerVault.id}:`,
      err,
    );
  });

  return {
    pull_id: committed.id,
    vault_item: winnerVault,
    rolled_rarity: rolledRarity,
    rarity_weights: cfg.rarity_weights,
    rng_commitment: commitment,
    rng_server_seed: serverSeed,
    rng_client_seed: clientSeed,
    rng_nonce: nonce,
  };
}

/**
 * Refund the consumed pull token after a resolver-stage failure.
 *
 * Best-effort: if the refund itself throws, we log critically and let
 * the caller see the original error — at that point an admin needs to
 * fix the user up manually using the bounty_token_grants audit trail.
 */
async function refundResolverFailure(
  userId: string,
  tier: PullTier,
  reason: string,
  err: unknown,
): Promise<void> {
  try {
    await grantPullToken(userId, tier, 1, {
      source: "refund_no_stock",
      description: `Refund: resolver failure (${reason}): ${err instanceof Error ? err.message : "unknown"}`,
    });
  } catch (refundErr) {
    console.error(
      `[resolver] CRITICAL: refund failed for user=${userId} tier=${tier} after ${reason}`,
      refundErr,
    );
  }
}
