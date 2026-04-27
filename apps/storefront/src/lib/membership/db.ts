import { query } from "@/lib/db";
import type { Tier, PointsEntry, CreditEntry, MemberProfile, TierPerks } from "./types";
import { DEFAULT_PERKS } from "./types";
import { postActivity, awardAchievement } from "@/lib/social/db";

// ══════════════════════════════════════════════════════════════
// TIERS
// ══════════════════════════════════════════════════════════════

export async function getAllTiers(includeHidden = false): Promise<Tier[]> {
  const where = includeHidden ? "WHERE is_active = true" : "WHERE is_active = true AND (is_hidden = false OR is_hidden IS NULL)";
  const result = await query(`SELECT * FROM tiers ${where} ORDER BY sort_order ASC`);
  return result.rows as Tier[];
}

export async function getTier(tierId: string): Promise<Tier | null> {
  const result = await query(`SELECT * FROM tiers WHERE id = $1`, [tierId]);
  return result.rows[0] as Tier ?? null;
}

export async function getUserPerks(userId: string): Promise<TierPerks> {
  const result = await query(
    `SELECT t.* FROM users u LEFT JOIN tiers t ON u.tier_id = t.id WHERE u.id = $1`,
    [userId]
  );
  const tier = result.rows[0];
  if (!tier || !tier.id) return DEFAULT_PERKS;

  return {
    cashback_percent: parseFloat(tier.cashback_percent),
    points_multiplier: parseFloat(tier.points_multiplier),
    tradein_bonus_percent: parseFloat(tier.tradein_bonus_percent),
    p2p_commission_rate: parseFloat(tier.p2p_commission_rate),
    auction_commission_rate: parseFloat(tier.auction_commission_rate),
    auction_priority_approval: tier.auction_priority_approval,
    store_discount_percent: parseFloat(tier.store_discount_percent || "0"),
  };
}

// ══════════════════════════════════════════════════════════════
// TIER CALCULATION (spending-based, ported from RewardsPro)
// ══════════════════════════════════════════════════════════════

export async function recalculateTier(userId: string): Promise<{ tier: Tier | null; changed: boolean }> {
  const tiers = await getAllTiers(true); // include hidden (OG) for resolution
  const user = await query(
    `SELECT annual_spend, tier_id, paid_tier_id, subscription_status, subscription_expires_at, tier_source FROM users WHERE id = $1`,
    [userId]
  );
  if (user.rows.length === 0) return { tier: null, changed: false };

  const currentTierId = user.rows[0].tier_id;

  // Priority 0: Manual tier assignment (OG, special grants) — never overridden
  if (user.rows[0].tier_source === "manual") {
    const manualTier = tiers.find(t => t.id === currentTierId) || null;
    if (manualTier) return { tier: manualTier, changed: false };
  }

  // Priority 1: Active paid tier (Platinum) — always wins over spending-based
  const paidTierId = user.rows[0].paid_tier_id;
  const subStatus = user.rows[0].subscription_status;
  const subExpires = user.rows[0].subscription_expires_at;
  const hasPaidTier = paidTierId && subStatus === "active" &&
    (!subExpires || new Date(subExpires) > new Date());

  if (hasPaidTier) {
    const paidTier = tiers.find(t => t.id === paidTierId) || null;
    if (paidTier) {
      const changed = paidTierId !== currentTierId;
      if (changed) {
        await query(
          `UPDATE users SET tier_id=$1, tier_source='subscription', tier_calculated_at=NOW(), updated_at=NOW() WHERE id=$2`,
          [paidTierId, userId]
        );

        // Social: activity feed + tier achievement
        postActivity(userId, "tier_upgraded", `Reached ${paidTier.name} tier!`).catch(() => {});
        const paidTierNameLower = paidTier.name.toLowerCase();
        if (paidTierNameLower.includes("silver")) awardAchievement(userId, "silver_member").catch(() => {});
        if (paidTierNameLower.includes("gold")) awardAchievement(userId, "gold_member").catch(() => {});
      }
      return { tier: paidTier, changed };
    }
  }

  // Priority 2: Spending-based tier
  const annualSpend = parseFloat(user.rows[0].annual_spend || "0");

  // Find highest qualifying FREE tier (sorted ascending by min_annual_spend)
  let qualifiedTier: Tier | null = null;
  for (const tier of tiers) {
    if (!tier.is_paid && annualSpend >= parseFloat(tier.min_annual_spend)) {
      qualifiedTier = tier;
    }
  }

  // Default to lowest tier (Bronze) if none qualified
  if (!qualifiedTier) {
    qualifiedTier = tiers.find(t => !t.is_paid) || tiers[0] || null;
  }

  const newTierId = qualifiedTier?.id ?? null;
  const changed = newTierId !== currentTierId;

  if (changed) {
    await query(
      `UPDATE users SET tier_id = $1, tier_calculated_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [newTierId, userId]
    );

    // Social: activity feed + tier achievement
    if (qualifiedTier) {
      postActivity(userId, "tier_upgraded", `Reached ${qualifiedTier.name} tier!`).catch(() => {});
      const tierNameLower = qualifiedTier.name.toLowerCase();
      if (tierNameLower.includes("silver")) awardAchievement(userId, "silver_member").catch(() => {});
      if (tierNameLower.includes("gold")) awardAchievement(userId, "gold_member").catch(() => {});
    }
  }

  return { tier: qualifiedTier, changed };
}

// ══════════════════════════════════════════════════════════════
// MEMBER PROFILE
// ══════════════════════════════════════════════════════════════

export async function getMemberProfile(userId: string): Promise<MemberProfile> {
  // Recalculate tier first
  await recalculateTier(userId);

  const userResult = await query(
    `SELECT u.*, t.id as t_id, t.name as t_name, t.description as t_desc, t.icon as t_icon,
       t.color as t_color, t.sort_order as t_sort, t.min_annual_spend as t_min,
       t.cashback_percent as t_cashback, t.points_multiplier as t_mult,
       t.tradein_bonus_percent as t_tradein, t.p2p_commission_rate as t_p2p,
       t.auction_commission_rate as t_auction, t.auction_priority_approval as t_priority,
       t.store_discount_percent as t_discount, t.is_paid as t_paid,
       t.monthly_price as t_monthly, t.annual_price as t_annual,
       t.benefits as t_benefits, t.is_hidden as t_hidden
     FROM users u LEFT JOIN tiers t ON u.tier_id = t.id WHERE u.id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return {
      tier: null, next_tier: null, points_balance: 0, lifetime_points: 0,
      store_credit_balance: 0, annual_spend: 0, total_spend: 0,
      progress_to_next: 0, amount_to_next: 0, tier_source: "none",
      perks: DEFAULT_PERKS,
    };
  }

  const u = userResult.rows[0];
  const tier: Tier | null = u.t_id ? {
    id: u.t_id, name: u.t_name, description: u.t_desc, icon: u.t_icon,
    color: u.t_color, sort_order: u.t_sort, min_annual_spend: u.t_min,
    cashback_percent: u.t_cashback, points_multiplier: u.t_mult,
    tradein_bonus_percent: u.t_tradein, p2p_commission_rate: u.t_p2p,
    auction_commission_rate: u.t_auction, auction_priority_approval: u.t_priority,
    store_discount_percent: u.t_discount || "0", is_paid: u.t_paid || false,
    monthly_price: u.t_monthly || null, annual_price: u.t_annual || null,
    benefits: u.t_benefits || [], is_active: true, is_hidden: u.t_hidden || false,
  } : null;

  // Find next tier
  const allTiers = await getAllTiers();
  const currentSort = tier?.sort_order ?? -1;
  const nextTier = allTiers.find(t => t.sort_order > currentSort) ?? null;

  const annualSpend = parseFloat(u.annual_spend || "0");
  const nextMin = nextTier ? parseFloat(nextTier.min_annual_spend) : 0;
  const currentMin = tier ? parseFloat(tier.min_annual_spend) : 0;
  const range = nextTier ? nextMin - currentMin : 1;
  const progress = nextTier ? Math.min(100, Math.round(((annualSpend - currentMin) / range) * 100)) : 100;
  const amountToNext = nextTier ? Math.max(0, nextMin - annualSpend) : 0;

  return {
    tier,
    next_tier: nextTier,
    points_balance: u.points_balance || 0,
    lifetime_points: u.lifetime_points || 0,
    store_credit_balance: parseFloat(u.store_credit_balance || "0"),
    annual_spend: annualSpend,
    total_spend: parseFloat(u.total_spend || "0"),
    progress_to_next: progress,
    amount_to_next: amountToNext,
    tier_source: u.tier_source || "spending",
    perks: tier ? {
      cashback_percent: parseFloat(tier.cashback_percent),
      points_multiplier: parseFloat(tier.points_multiplier),
      tradein_bonus_percent: parseFloat(tier.tradein_bonus_percent),
      p2p_commission_rate: parseFloat(tier.p2p_commission_rate),
      auction_commission_rate: parseFloat(tier.auction_commission_rate),
      auction_priority_approval: tier.auction_priority_approval,
      store_discount_percent: parseFloat(tier.store_discount_percent || "0"),
    } : DEFAULT_PERKS,
  };
}

// ══════════════════════════════════════════════════════════════
// POINTS
// ══════════════════════════════════════════════════════════════

export async function earnPoints(userId: string, amount: number, type: string, description: string, referenceId?: string, referenceType?: string): Promise<PointsEntry> {
  const user = await query(`SELECT points_balance FROM users WHERE id = $1`, [userId]);
  const currentBalance = user.rows[0]?.points_balance || 0;
  const newBalance = currentBalance + amount;

  const result = await query(
    `INSERT INTO points_ledger (user_id, amount, balance, type, description, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, amount, newBalance, type, description, referenceId || null, referenceType || null]
  );

  await query(
    `UPDATE users SET points_balance = $1, lifetime_points = lifetime_points + $2, updated_at = NOW() WHERE id = $3`,
    [newBalance, amount, userId]
  );

  return result.rows[0] as PointsEntry;
}

export async function spendPoints(userId: string, amount: number, type: string, description: string, referenceId?: string): Promise<{ success: boolean; entry?: PointsEntry; error?: string }> {
  const user = await query(`SELECT points_balance FROM users WHERE id = $1`, [userId]);
  const currentBalance = user.rows[0]?.points_balance || 0;

  if (currentBalance < amount) {
    return { success: false, error: `Insufficient Berries. You have ${currentBalance}, need ${amount}.` };
  }

  const newBalance = currentBalance - amount;
  const result = await query(
    `INSERT INTO points_ledger (user_id, amount, balance, type, description, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, -amount, newBalance, type, description, referenceId || null]
  );

  await query(`UPDATE users SET points_balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, userId]);
  return { success: true, entry: result.rows[0] as PointsEntry };
}

export async function getPointsHistory(userId: string, limit: number = 20): Promise<PointsEntry[]> {
  const result = await query(
    `SELECT * FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows as PointsEntry[];
}

// ── Berries aliases ──
// The DB columns and canonical function names stay on `points` until a proper
// rename migration lands. New code should import these Berries-named aliases
// so the codebase naturally migrates over time.
export const earnBerries = earnPoints;
export const spendBerries = spendPoints;
export const getBerriesHistory = getPointsHistory;

// ══════════════════════════════════════════════════════════════
// STORE CREDIT
// ══════════════════════════════════════════════════════════════

export async function addCredit(userId: string, amount: number, type: string, description: string, referenceId?: string): Promise<CreditEntry> {
  const user = await query(`SELECT store_credit_balance FROM users WHERE id = $1`, [userId]);
  const currentBalance = parseFloat(user.rows[0]?.store_credit_balance || "0");
  const newBalance = currentBalance + amount;

  const result = await query(
    `INSERT INTO store_credit_ledger (user_id, amount, balance, type, description, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, amount.toFixed(2), newBalance.toFixed(2), type, description, referenceId || null]
  );

  await query(`UPDATE users SET store_credit_balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance.toFixed(2), userId]);
  return result.rows[0] as CreditEntry;
}

export async function getCreditHistory(userId: string, limit: number = 20): Promise<CreditEntry[]> {
  const result = await query(
    `SELECT * FROM store_credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows as CreditEntry[];
}

// ══════════════════════════════════════════════════════════════
// ORDER PROCESSING (earn points + cashback on purchase)
// ══════════════════════════════════════════════════════════════

export async function processOrderRewards(userId: string, orderTotal: number, orderId: string): Promise<{
  pointsEarned: number;
  cashbackAmount: number;
}> {
  const perks = await getUserPerks(userId);

  // Get points config
  const configResult = await query(`SELECT * FROM points_config LIMIT 1`);
  const config = configResult.rows[0];
  const pointsPerPound = config?.points_per_pound || 10;

  // Calculate points: £ spent × points_per_pound × tier_multiplier
  const basePoints = Math.floor(orderTotal * pointsPerPound);
  const pointsEarned = Math.floor(basePoints * perks.points_multiplier);

  if (pointsEarned > 0) {
    await earnPoints(userId, pointsEarned, "order_earned",
      `Earned ${pointsEarned} Berries on order (${perks.points_multiplier}x multiplier)`,
      orderId, "order"
    );
  }

  // Calculate cashback: orderTotal × cashback_percent
  const cashbackAmount = Math.round(orderTotal * (perks.cashback_percent / 100) * 100) / 100;
  if (cashbackAmount > 0) {
    await addCredit(userId, cashbackAmount, "cashback",
      `${perks.cashback_percent}% cashback on £${orderTotal.toFixed(2)} order`,
      orderId
    );
  }

  // Update spending totals
  await query(
    `UPDATE users SET annual_spend = annual_spend + $1, total_spend = total_spend + $1, updated_at = NOW() WHERE id = $2`,
    [orderTotal.toFixed(2), userId]
  );

  // Recalculate tier (might upgrade)
  await recalculateTier(userId);

  return { pointsEarned, cashbackAmount };
}

// ══════════════════════════════════════════════════════════════
// MIGRATION IMPORT
// ══════════════════════════════════════════════════════════════

export async function importMember(data: {
  email: string;
  tierName: string;
  pointsBalance: number;
  lifetimePoints: number;
  storeCreditBalance: number;
  annualSpend: number;
  totalSpend: number;
}): Promise<{ userId: string; created: boolean }> {
  // Find or create user by email
  let userResult = await query(`SELECT id FROM users WHERE email = $1`, [data.email.toLowerCase()]);
  let created = false;

  if (userResult.rows.length === 0) {
    userResult = await query(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [data.email.toLowerCase()]
    );
    created = true;
  }

  const userId = userResult.rows[0].id;

  // Map tier name
  const tierResult = await query(`SELECT id FROM tiers WHERE LOWER(name) = LOWER($1)`, [data.tierName]);
  const tierId = tierResult.rows[0]?.id ?? null;

  // Update user
  await query(
    `UPDATE users SET tier_id = $1, points_balance = $2, lifetime_points = $3,
     store_credit_balance = $4, annual_spend = $5, total_spend = $6,
     tier_source = 'migration', tier_calculated_at = NOW(), updated_at = NOW()
     WHERE id = $7`,
    [tierId, data.pointsBalance, data.lifetimePoints,
     data.storeCreditBalance.toFixed(2), data.annualSpend.toFixed(2),
     data.totalSpend.toFixed(2), userId]
  );

  // Log migration entries
  if (data.pointsBalance > 0) {
    await earnPoints(userId, data.pointsBalance, "migration", "Migrated from RewardsPro");
  }
  if (data.storeCreditBalance > 0) {
    await addCredit(userId, data.storeCreditBalance, "migration", "Migrated from RewardsPro");
  }

  return { userId, created };
}
