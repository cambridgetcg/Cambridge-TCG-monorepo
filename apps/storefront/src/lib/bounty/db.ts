// Bounty vault DB helpers — vault items, eligibility, sell-back, expiry. The
// Bounty Board is retired: nothing here creates a pull, a token or a vault item.
// All queries go through `src/lib/db` so the SSL + pooling is shared.

import { query } from "@/lib/db";
import { LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED } from "@/lib/public-wholesale-fields";

// ── Types ──

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
  phone_verification_available: boolean;
  first_order_paid: boolean;
  eligible: boolean;
  reasons: string[];
}

export const BOUNTY_PHONE_VERIFICATION_MESSAGE =
  "Phone verification is unavailable while real code verification is being built. Pulls and redemptions remain closed.";

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
    `SELECT first_order_paid FROM user_bounty_eligibility WHERE user_id = $1`,
    [userId],
  );

  const existing = row.rows[0];
  // The former endpoint accepted a phone number without proving control of
  // it. Those rows are submissions, not verification evidence, so none of
  // them may satisfy this gate. A future provider-backed flow must record and
  // validate evidence before this value can become true.
  const phoneVerified = false;

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
  if (!phoneVerified) reasons.push("phone_verification_unavailable");
  if (!firstOrderPaid) reasons.push("no_paid_order");

  return {
    user_id: userId,
    phone_verified: phoneVerified,
    phone_verification_available: false,
    first_order_paid: firstOrderPaid,
    eligible: reasons.length === 0,
    reasons,
  };
}

// ── Sell-back + redemption ──

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
  if (!LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED) {
    return { error: "Sell-back pricing is paused pending source-rights review." };
  }
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

// ── Expiry ──

// Auto-expire reserved vault items past expires_at. Each expired item is
// converted to store credit at SELL_BACK_RATE (user still gets value, just
// doesn't get the physical card). Safe to run frequently since the query is
// indexed and usually returns 0 rows.
//
// Nothing calls it since 2026-11-24: behind the constant below it could only
// return zeros, so the minute cron stopped calling it. Opening that constant
// means calling it again.
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
  if (!LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED) {
    return { expiredCount: 0, creditTotalGbp: 0, errors: 0, emailsFailed: 0, reverted: 0 };
  }
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
