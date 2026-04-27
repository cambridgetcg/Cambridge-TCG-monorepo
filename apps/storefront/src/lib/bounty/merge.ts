// Pull-token merge — burn N same-tier tokens, receive 1 next-tier token.
//
// Chain: common → uncommon → rare → super_rare.
// super_rare and legendary cannot be auto-merged to because the legendary
// tier has a tight global weekly cap; auto-minting into it would bypass
// the supply control. Admin can grant legendary tokens directly if needed.
//
// The decrement is atomic via a `WHERE count >= COST` predicate against
// the CHECK (count >= 0) constraint. Grant + audit run after, so a
// failure of the grant step would otherwise leave the user paid-but-not-
// minted. We compensate explicitly: if the grant insert throws, we
// re-credit the decremented tokens. If the refund itself fails we log
// loudly — at that point an admin needs the bounty_merges trail to make
// the user whole.

import { query } from "@/lib/db";
import { grantPullToken, type PullTier } from "./db";

export const MERGE_COST = 4;

/** Which tier you get when you merge N same-tier tokens. null = not mergeable. */
export const MERGE_CHAIN: Record<PullTier, PullTier | null> = {
  common: "uncommon",
  uncommon: "rare",
  rare: "super_rare",
  super_rare: null,
  legendary: null,
};

export function canMerge(tier: PullTier): boolean {
  return MERGE_CHAIN[tier] !== null;
}

export type MergeResult =
  | { ok: true; fromTier: PullTier; toTier: PullTier; consumed: number }
  | { ok: false; error: "not_mergeable" | "insufficient_tokens" | "tier_disabled"; message: string };

export async function mergeTokens(userId: string, fromTier: PullTier): Promise<MergeResult> {
  const toTier = MERGE_CHAIN[fromTier];
  if (!toTier) {
    return {
      ok: false,
      error: "not_mergeable",
      message: `${fromTier} tokens cannot be merged further.`,
    };
  }

  // Refuse to mint into a tier that admin has disabled. The user's existing
  // tokens at toTier are preserved; we just don't create new ones against
  // a disabled ladder.
  const cfg = await query(
    `SELECT enabled FROM bounty_pull_tiers WHERE tier = $1`,
    [toTier],
  );
  if (cfg.rows[0]?.enabled === false) {
    return {
      ok: false,
      error: "tier_disabled",
      message: `The ${toTier} tier is currently disabled. Try again later.`,
    };
  }

  // Atomic decrement — succeeds only if the user has ≥ MERGE_COST tokens
  // of the from tier.
  const dec = await query(
    `UPDATE bounty_pull_tokens
     SET count = count - $3, updated_at = NOW()
     WHERE user_id = $1 AND tier = $2 AND count >= $3
     RETURNING count`,
    [userId, fromTier, MERGE_COST],
  );

  if (dec.rowCount === 0) {
    return {
      ok: false,
      error: "insufficient_tokens",
      message: `You need at least ${MERGE_COST} ${fromTier} tokens to merge.`,
    };
  }

  // Grant the new token (upsert) + audit. Wrapped so we can compensate
  // the decrement if the grant fails: re-credit the source tokens so the
  // user isn't left paid-but-not-minted.
  try {
    await grantPullToken(userId, toTier, 1, {
      source: "merge_mint",
      description: `Merged ${MERGE_COST}x ${fromTier} → 1x ${toTier}`,
    });

    // Best-effort merge-lineage audit: if this row insert fails, the user
    // still got their token (logged in bounty_token_grants). We log but
    // don't compensate — refunding here would un-grant a successful mint.
    await query(
      `INSERT INTO bounty_merges (user_id, from_tier, to_tier, tokens_consumed)
       VALUES ($1, $2, $3, $4)`,
      [userId, fromTier, toTier, MERGE_COST],
    ).catch((err) => {
      console.error(
        `[bounty/merge] audit insert failed for user=${userId} ${fromTier}->${toTier}:`,
        err,
      );
    });
  } catch (err) {
    // Grant failed. Refund the source tokens. If THIS fails too, an admin
    // intervention is required — we have a paid-but-not-minted user.
    try {
      await query(
        `INSERT INTO bounty_pull_tokens (user_id, tier, count, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, tier) DO UPDATE SET
           count = bounty_pull_tokens.count + $3,
           updated_at = NOW()`,
        [userId, fromTier, MERGE_COST],
      );
    } catch (refundErr) {
      console.error(
        `[bounty/merge] CRITICAL: refund failed for user=${userId} ${fromTier}x${MERGE_COST}`,
        refundErr,
      );
    }
    throw err;
  }

  return { ok: true, fromTier, toTier, consumed: MERGE_COST };
}

/** How many merges a user has done, total + by-tier. */
export async function getMergeStats(userId: string): Promise<{
  total: number;
  byFromTier: Record<string, number>;
}> {
  const rows = await query(
    `SELECT from_tier, COUNT(*)::int AS n
     FROM bounty_merges WHERE user_id = $1
     GROUP BY from_tier`,
    [userId],
  );
  let total = 0;
  const byFromTier: Record<string, number> = {};
  for (const r of rows.rows) {
    byFromTier[r.from_tier] = r.n;
    total += r.n;
  }
  return { total, byFromTier };
}
