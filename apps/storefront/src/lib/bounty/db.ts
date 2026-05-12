// Bounty Board DB helpers — vault, pull tokens, pulls, eligibility.
// All queries go through `src/lib/db` so the SSL + pooling is shared.

import { query } from "@/lib/db";

// ── Types ──

export type PullTier = "common" | "uncommon" | "rare" | "super_rare" | "legendary";

export interface BountyPullTier {
  tier: PullTier;
  display_name: string;
  target_ev_pence: number;
  weekly_global_cap: number | null;
  rarity_weights: Record<string, number>;
  enabled: boolean;
}

export interface VaultItem {
  id: string;
  user_id: string;
  sku: string;
  card_name: string;
  card_number: string | null;
  set_code: string | null;
  rarity: string | null;
  image_url: string | null;
  spot_price_gbp: string;
  source: string;
  source_reference_id: string | null;
  bounty_pull_id: string | null;
  status: "reserved" | "redeemed" | "sold_back" | "traded" | "gifted" | "expired";
  acquired_at: string;
  expires_at: string;
  p2p_hold_until: string;
  redemption_order_id: number | null;
  fulfilled_at: string | null;
  sold_back_credit: string | null;
  sold_back_at: string | null;
  traded_to_user_id: string | null;
  traded_at: string | null;
  notes: string | null;
}

export interface BountyEligibility {
  user_id: string;
  phone_verified: boolean;
  phone_number: string | null;
  first_order_paid: boolean;
  eligible: boolean;
  reasons: string[];
}

// ── Pull tokens ──

export async function getPullTokens(userId: string): Promise<Record<PullTier, number>> {
  const result = await query(
    `SELECT tier, count FROM bounty_pull_tokens WHERE user_id=$1`,
    [userId],
  );
  const base: Record<PullTier, number> = {
    common: 0, uncommon: 0, rare: 0, super_rare: 0, legendary: 0,
  };
  for (const row of result.rows) {
    if (row.tier in base) base[row.tier as PullTier] = row.count;
  }
  return base;
}

export type PullTokenSource =
  | "pve_milestone"
  | "pve_daily"
  | "merge_mint"
  | "refund_no_stock"
  | "manual_admin"
  | "promo";

export interface GrantPullTokenAudit {
  source: PullTokenSource;
  sourceReferenceId?: string | null;
  description?: string | null;
}

export async function grantPullToken(
  userId: string,
  tier: PullTier,
  count: number,
  audit: GrantPullTokenAudit,
): Promise<void> {
  await query(
    `INSERT INTO bounty_pull_tokens (user_id, tier, count, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, tier) DO UPDATE SET
       count = bounty_pull_tokens.count + EXCLUDED.count,
       updated_at = NOW()`,
    [userId, tier, count],
  );
  // Best-effort audit. Pre-migration deployments may not have the table
  // — the .catch keeps grants flowing even if logging fails.
  await query(
    `INSERT INTO bounty_token_grants (user_id, tier, count, source, source_reference_id, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [userId, tier, count, audit.source, audit.sourceReferenceId ?? null, audit.description ?? null],
  ).catch((err) => {
    console.error(
      `[bounty/grant] audit insert failed for user=${userId} tier=${tier} source=${audit.source}:`,
      err,
    );
  });
}

// Atomically decrements a pull token if present. Returns true if the caller
// now "holds" the token and may proceed to resolve the pull.
export async function consumePullToken(userId: string, tier: PullTier): Promise<boolean> {
  const result = await query(
    `UPDATE bounty_pull_tokens
     SET count = count - 1, updated_at = NOW()
     WHERE user_id = $1 AND tier = $2 AND count > 0
     RETURNING count`,
    [userId, tier],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function getTierConfig(tier: PullTier): Promise<BountyPullTier | null> {
  const result = await query(
    `SELECT tier, display_name, target_ev_pence, weekly_global_cap, rarity_weights, enabled
     FROM bounty_pull_tiers WHERE tier = $1`,
    [tier],
  );
  return result.rows[0] ?? null;
}

export async function countGlobalPullsThisWeek(tier: PullTier): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS n FROM bounty_pulls
     WHERE tier = $1 AND resolved_at >= NOW() - INTERVAL '7 days'`, // audit:cadence-platform — global rate-limit window, not a user deadline.
    [tier],
  );
  return result.rows[0]?.n ?? 0;
}

// ── Vault ──

export async function listVault(userId: string, status?: VaultItem["status"]): Promise<VaultItem[]> {
  if (status) {
    const r = await query(
      `SELECT * FROM vault_items WHERE user_id=$1 AND status=$2 ORDER BY acquired_at DESC`,
      [userId, status],
    );
    return r.rows;
  }
  const r = await query(
    `SELECT * FROM vault_items WHERE user_id=$1 ORDER BY acquired_at DESC`,
    [userId],
  );
  return r.rows;
}

export async function getVaultItem(id: string, userId: string): Promise<VaultItem | null> {
  const r = await query(
    `SELECT * FROM vault_items WHERE id=$1 AND user_id=$2`,
    [id, userId],
  );
  return r.rows[0] ?? null;
}

// Count of reserved vault items for a SKU — this is the implicit "reservation"
// against live wholesale stock. Subtract this from wholesale.stock to get
// actual availability for new pulls.
export async function countReservedForSku(sku: string): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM vault_items WHERE sku=$1 AND status='reserved'`,
    [sku],
  );
  return r.rows[0]?.n ?? 0;
}

export interface CreateVaultItemArgs {
  userId: string;
  sku: string;
  cardName: string;
  cardNumber: string | null;
  setCode: string | null;
  rarity: string | null;
  imageUrl: string | null;
  spotPriceGbp: number;
  source: string;
  sourceReferenceId?: string | null;
  bountyPullId?: string | null;
}

export async function createVaultItem(a: CreateVaultItemArgs): Promise<VaultItem> {
  const r = await query(
    `INSERT INTO vault_items
     (user_id, sku, card_name, card_number, set_code, rarity, image_url,
      spot_price_gbp, source, source_reference_id, bounty_pull_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      a.userId, a.sku, a.cardName, a.cardNumber, a.setCode, a.rarity, a.imageUrl,
      a.spotPriceGbp.toFixed(2), a.source, a.sourceReferenceId ?? null,
      a.bountyPullId ?? null,
    ],
  );
  const item = r.rows[0] as VaultItem;

  return await scheduleVaultExpiringEmail(a.userId, item) as VaultItem;
}

/**
 * Race-safe variant: takes a per-SKU advisory lock, re-counts active
 * reservations vs the live wholesale stock count, and only INSERTs if
 * there's still room. Returns null when the slot was claimed by a
 * concurrent resolve since we read stock — caller should fall back to
 * the next candidate or no_stock refund.
 *
 * The advisory lock + recount + insert run as a single SQL statement so
 * Postgres holds the lock for the full CTE evaluation. Two parallel
 * resolvers picking the same SKU serialize: the second sees the first's
 * INSERT in its snapshot and bails when reserved >= live_stock.
 */
export async function createVaultItemIfStockAvailable(
  a: CreateVaultItemArgs,
  liveStock: number,
): Promise<VaultItem | null> {
  const r = await query(
    `WITH lock AS (
       SELECT pg_advisory_xact_lock(hashtext('vault_sku:' || $2::text))
     ),
     reserved AS (
       SELECT COUNT(*)::int AS n
         FROM vault_items
        WHERE sku = $2 AND status = 'reserved'
     )
     INSERT INTO vault_items
       (user_id, sku, card_name, card_number, set_code, rarity, image_url,
        spot_price_gbp, source, source_reference_id, bounty_pull_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
       FROM lock, reserved
      WHERE reserved.n < $12
     RETURNING *`,
    [
      a.userId, a.sku, a.cardName, a.cardNumber, a.setCode, a.rarity, a.imageUrl,
      a.spotPriceGbp.toFixed(2), a.source, a.sourceReferenceId ?? null,
      a.bountyPullId ?? null,
      liveStock,
    ],
  );
  if (r.rowCount === 0) return null;
  const item = r.rows[0] as VaultItem;
  return await scheduleVaultExpiringEmail(a.userId, item) as VaultItem;
}

async function scheduleVaultExpiringEmail(userId: string, item: VaultItem): Promise<VaultItem> {
  // Queue the 7-day expiry warning. Fire-and-forget — if the scheduler is
  // down, the item is still created; we just lose the reminder.
  try {
    const { scheduleEmail } = await import("@/lib/email/queue");
    const warningTime = new Date(new Date(item.expires_at).getTime() - 7 * 86400000);
    await scheduleEmail({
      userId,
      event: "vault_expiring_soon",
      data: { vaultItemId: item.id },
      scheduledFor: warningTime,
      idempotencyKey: `vault_expiring_soon:${item.id}`,
    });
  } catch (err) {
    console.warn(`[bounty] failed to schedule expiry warning for vault_item ${item.id}:`, err);
  }

  return item;
}

// ── Eligibility ──

export async function getEligibility(userId: string): Promise<BountyEligibility> {
  // Recompute first_order_paid from customer_orders so admins don't need to
  // flip it manually when a purchase completes.
  const paid = await query(
    `SELECT EXISTS (
       SELECT 1 FROM customer_orders
       WHERE user_id = $1 AND status = 'paid'
     ) AS paid`,
    [userId],
  );
  const firstOrderPaid: boolean = paid.rows[0]?.paid ?? false;

  const row = await query(
    `SELECT * FROM user_bounty_eligibility WHERE user_id = $1`,
    [userId],
  );

  const existing = row.rows[0];
  const phoneVerified: boolean = existing?.phone_verified ?? false;
  const phoneNumber: string | null = existing?.phone_number ?? null;

  // Persist any change to first_order_paid (cheap upsert).
  if (!existing || existing.first_order_paid !== firstOrderPaid) {
    await query(
      `INSERT INTO user_bounty_eligibility (user_id, first_order_paid, first_order_paid_at, updated_at)
       VALUES ($1, $2, CASE WHEN $2 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         first_order_paid = EXCLUDED.first_order_paid,
         first_order_paid_at = COALESCE(user_bounty_eligibility.first_order_paid_at, EXCLUDED.first_order_paid_at),
         updated_at = NOW()`,
      [userId, firstOrderPaid],
    );
  }

  const reasons: string[] = [];
  if (!phoneVerified) reasons.push("phone_not_verified");
  if (!firstOrderPaid) reasons.push("no_paid_order");

  return {
    user_id: userId,
    phone_verified: phoneVerified,
    phone_number: phoneNumber,
    first_order_paid: firstOrderPaid,
    eligible: reasons.length === 0,
    reasons,
  };
}

export async function markPhoneVerified(userId: string, phoneNumber: string): Promise<void> {
  await query(
    `INSERT INTO user_bounty_eligibility (user_id, phone_verified, phone_verified_at, phone_number, updated_at)
     VALUES ($1, true, NOW(), $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       phone_verified = true,
       phone_verified_at = COALESCE(user_bounty_eligibility.phone_verified_at, NOW()),
       phone_number = EXCLUDED.phone_number,
       updated_at = NOW()`,
    [userId, phoneNumber],
  );
}

// ── Sell-back + redemption + pulls ──

export const SELL_BACK_RATE = 0.77;

/**
 * Atomic sell-back: flip status and grant credit together. The status
 * flip is gated by `WHERE status='reserved'` so two concurrent sell-back
 * calls can't both win the race; the credit grant runs inside a try/
 * catch and rolls the status back if it throws. Without the rollback,
 * a credit-grant failure leaves the user with no item AND no credit.
 *
 * The audit log captures the sold_back transition on success, and a
 * compensation_reverted row when we rolled back. logVaultTransition is
 * best-effort; a logging failure must not be surfaced as a sell-back
 * failure.
 */
export async function sellBackVaultItem(itemId: string, userId: string): Promise<{
  item: VaultItem;
  creditAwarded: number;
} | { error: string }> {
  const { addCredit } = await import("@/lib/membership/db");
  const { logVaultTransition } = await import("./fulfilment-log");

  const item = await getVaultItem(itemId, userId);
  if (!item) return { error: "Vault item not found." };
  if (item.status !== "reserved") return { error: "Item cannot be sold back in its current state." };

  const credit = Number((parseFloat(item.spot_price_gbp) * SELL_BACK_RATE).toFixed(2));

  // Atomic decrement-equivalent: only one caller wins the race.
  const r = await query(
    `UPDATE vault_items
     SET status='sold_back', sold_back_credit=$2, sold_back_at=NOW()
     WHERE id=$1 AND user_id=$3 AND status='reserved'
     RETURNING *`,
    [itemId, credit.toFixed(2), userId],
  );
  if (r.rowCount === 0) return { error: "Item was no longer reserved (race)." };

  const sold = r.rows[0] as VaultItem;

  try {
    await addCredit(
      userId,
      credit,
      "bounty_sellback",
      `Bounty sell-back: ${sold.card_name} (${sold.sku})`,
      sold.id,
    );
  } catch (err) {
    // Compensating revert: roll the item back to reserved so the user
    // can try again. If the revert ALSO fails we leak — log loudly so
    // an admin can intervene from the lifecycle log.
    try {
      await query(
        `UPDATE vault_items
            SET status='reserved', sold_back_credit=NULL, sold_back_at=NULL
          WHERE id=$1 AND status='sold_back'`,
        [itemId],
      );
      void logVaultTransition({
        vaultItemId: itemId,
        action: "compensation_reverted",
        priorStatus: "sold_back",
        notes: `Sell-back credit grant failed; item reverted to reserved. Error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    } catch (revertErr) {
      console.error(
        `[sell-back] CRITICAL: revert failed for item=${itemId} after credit-grant failure`,
        revertErr,
      );
      void logVaultTransition({
        vaultItemId: itemId,
        action: "sold_back_failed",
        priorStatus: "sold_back",
        notes: `Credit grant AND revert both failed — manual intervention required.`,
      });
    }
    return { error: "Credit grant failed — your item is back in the vault. Please try again." };
  }

  void logVaultTransition({
    vaultItemId: itemId,
    action: "sold_back",
    priorStatus: "reserved",
    notes: `Sold back for £${credit.toFixed(2)} store credit (${SELL_BACK_RATE * 100}% of spot)`,
    metadata: { credit_gbp: credit, sku: sold.sku },
  });

  return { item: sold, creditAwarded: credit };
}

export async function recordBountyPull(args: {
  userId: string;
  tier: PullTier;
  earnedFrom: string;
  serverSeedHash: string;
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  rolledRarity: string | null;
  rolledSku: string | null;
  rolledSpotGbp: number | null;
  vaultItemId: string | null;
}): Promise<{ id: string }> {
  const r = await query(
    `INSERT INTO bounty_pulls
     (user_id, tier, earned_from, rng_server_seed_hash, rng_server_seed, rng_client_seed, rng_nonce,
      rolled_rarity, rolled_sku, rolled_spot_gbp, vault_item_id, committed_at, revealed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
     RETURNING id`,
    [
      args.userId, args.tier, args.earnedFrom,
      args.serverSeedHash, args.serverSeed, args.clientSeed, args.nonce,
      args.rolledRarity, args.rolledSku,
      args.rolledSpotGbp != null ? args.rolledSpotGbp.toFixed(2) : null,
      args.vaultItemId,
    ],
  );
  return r.rows[0];
}

/**
 * Phase 1 of commit-reveal: persist the commitment + seed material to the
 * bounty_pulls row BEFORE rolling. rolled_* columns stay null. The roll
 * happens AFTER this returns; the row is patched up via revealBountyPull.
 *
 * This lets a verifier point at committed_at < revealed_at and the
 * sha256(rng_server_seed) === rng_server_seed_hash invariant to prove
 * the server didn't pick a seed AFTER seeing the desired outcome.
 */
export async function commitBountyPull(args: {
  userId: string;
  tier: PullTier;
  earnedFrom: string;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}): Promise<{ id: string }> {
  const r = await query(
    `INSERT INTO bounty_pulls
       (user_id, tier, earned_from,
        rng_server_seed_hash, rng_server_seed, rng_client_seed, rng_nonce,
        committed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     RETURNING id`,
    [
      args.userId, args.tier, args.earnedFrom,
      args.serverSeedHash, args.serverSeed, args.clientSeed, args.nonce,
    ],
  );
  return r.rows[0];
}

/**
 * Phase 2 of commit-reveal: stamp the rolled outcome on the previously
 * committed row. revealed_at is set to NOW() — committed_at is preserved
 * from the commit phase, so revealed_at > committed_at by construction.
 */
export async function revealBountyPull(args: {
  pullId: string;
  rolledRarity: string;
  rolledSku: string | null;
  rolledSpotGbp: number | null;
  vaultItemId: string | null;
}): Promise<void> {
  await query(
    `UPDATE bounty_pulls
        SET rolled_rarity   = $2,
            rolled_sku      = $3,
            rolled_spot_gbp = $4,
            vault_item_id   = COALESCE($5, vault_item_id),
            revealed_at     = NOW()
      WHERE id = $1`,
    [
      args.pullId,
      args.rolledRarity,
      args.rolledSku,
      args.rolledSpotGbp != null ? args.rolledSpotGbp.toFixed(2) : null,
      args.vaultItemId,
    ],
  );
}

export async function linkPullToVaultItem(pullId: string, vaultItemId: string): Promise<void> {
  await query(
    `UPDATE bounty_pulls SET vault_item_id=$2 WHERE id=$1`,
    [pullId, vaultItemId],
  );
}

// ── Expiry ──

// Auto-expire reserved vault items past expires_at. Each expired item is
// converted to store credit at SELL_BACK_RATE (user still gets value, just
// doesn't get the physical card). Intended to be called from the maintenance
// cron; safe to run frequently since the query is indexed and usually
// returns 0 rows.
//
// Each item is processed independently with a compensating revert: if the
// credit grant fails after the status flip succeeded, the item is rolled
// back to 'reserved' so the NEXT sweep tick retries. Without this, a
// transient credit-grant failure would leave items in 'expired' forever
// with no credit awarded.
export async function runBountyExpiry(): Promise<{
  expiredCount: number;
  creditTotalGbp: number;
  errors: number;
  emailsFailed: number;
  reverted: number;
}> {
  // Lazy imports to avoid a cycle (addCredit + email both transitively
  // touch modules that import from here).
  const { addCredit } = await import("@/lib/membership/db");
  const { sendVaultExpiredEmail } = await import("@/lib/email/bounty");
  const { logVaultTransition } = await import("./fulfilment-log");

  const stale = await query(
    `SELECT id, user_id, card_name, card_number, rarity, sku, spot_price_gbp
     FROM vault_items
     WHERE status = 'reserved' AND expires_at <= NOW()
     ORDER BY expires_at ASC
     LIMIT 500`,
  );

  let expiredCount = 0;
  let creditTotalGbp = 0;
  let errors = 0;
  let emailsFailed = 0;
  let reverted = 0;

  for (const row of stale.rows) {
    const spotGbp = parseFloat(row.spot_price_gbp);
    const credit = Number((spotGbp * SELL_BACK_RATE).toFixed(2));
    try {
      // Flip status under a WHERE guard so a concurrent manual sell-back or
      // redemption cannot double-process this item.
      const updated = await query(
        `UPDATE vault_items
         SET status='expired',
             sold_back_credit=$2,
             sold_back_at=NOW(),
             notes = COALESCE(notes || E'\n', '') || '[auto-expired]'
         WHERE id=$1 AND status='reserved'
         RETURNING id`,
        [row.id, credit.toFixed(2)],
      );
      if (updated.rowCount === 0) continue;

      if (credit > 0) {
        try {
          await addCredit(
            row.user_id,
            credit,
            "bounty_expiry",
            `Vault item auto-expired: ${row.card_name} (${row.sku})`,
            row.id,
          );
        } catch (creditErr) {
          // Compensating revert: roll the item back so the next tick
          // retries. If the revert ALSO fails we leak — log loudly and
          // mark the item with an audit row so admin can find it.
          try {
            await query(
              `UPDATE vault_items
                  SET status='reserved', sold_back_credit=NULL, sold_back_at=NULL
                WHERE id=$1 AND status='expired'`,
              [row.id],
            );
            reverted++;
            void logVaultTransition({
              vaultItemId: row.id,
              action: "compensation_reverted",
              priorStatus: "expired",
              notes: `Expiry credit grant failed; reverted for retry. Error: ${creditErr instanceof Error ? creditErr.message : "unknown"}`,
            });
          } catch (revertErr) {
            console.error(
              `[bounty-expiry] CRITICAL: revert failed for ${row.id} after credit failure`,
              revertErr,
            );
            void logVaultTransition({
              vaultItemId: row.id,
              action: "expired_credit_failed",
              priorStatus: "expired",
              notes: `Credit grant AND revert both failed — manual intervention required.`,
              metadata: { credit_gbp: credit },
            });
          }
          errors++;
          continue;
        }
      }

      void logVaultTransition({
        vaultItemId: row.id,
        action: "expired",
        priorStatus: "reserved",
        notes: `Auto-expired; £${credit.toFixed(2)} store credit granted at ${SELL_BACK_RATE * 100}% of spot`,
        metadata: { credit_gbp: credit, sku: row.sku },
      });

      // Notification email — fire-and-forget. If it fails we count it
      // but the expiry itself remains successful.
      const emailResult = await sendVaultExpiredEmail({
        userId: row.user_id,
        cardName: row.card_name,
        sku: row.sku,
        cardNumber: row.card_number,
        rarity: row.rarity,
        spotPriceGbp: spotGbp,
        soldBackCreditGbp: credit,
      });
      if (!emailResult.ok) {
        emailsFailed++;
        console.warn(`[bounty-expiry] email failed for vault_item ${row.id}: ${emailResult.error}`);
      }

      expiredCount++;
      creditTotalGbp += credit;
    } catch (err) {
      errors++;
      console.error(`[bounty-expiry] failed for vault_item ${row.id}:`, err);
    }
  }

  return { expiredCount, creditTotalGbp, errors, emailsFailed, reverted };
}
