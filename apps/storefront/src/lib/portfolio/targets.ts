// Portfolio targets CRUD + sweep.
//
// Targets are investor-intent overlays on a portfolio holding:
//   - target_buy   = "I'd add at this price"
//   - target_sell  = "I'd take profit here"
//   - target_stop  = "I'd cut here on regime change"
//
// The sweep checks current market levels against active targets and
// fires a single hit notification per target (then marks it 'hit'
// so it stops being watched). Designed to mirror the existing alert
// sweep — bounded MAX_FIRES_PER_RUN, idempotent re-runs.

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { formatPrice } from "@/lib/format";
import { logTargetTransition } from "./target-lifecycle-log";

export type TargetStatus = "active" | "paused" | "hit" | "cancelled";
export type TargetHitKind = "buy" | "sell" | "stop";

export interface PortfolioTarget {
  id: string;
  user_id: string;
  sku: string;
  condition: string;
  target_buy_price: string | null;
  target_sell_price: string | null;
  target_stop_price: string | null;
  thesis: string | null;
  status: TargetStatus;
  hit_kind: TargetHitKind | null;
  hit_price: string | null;
  hit_at: string | null;
  created_at: string;
  updated_at: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

const MAX_PER_USER = 200;

// ── Create ──

export async function createTarget(input: {
  userId: string;
  sku: string;
  condition?: string;
  targetBuyPrice?: number | null;
  targetSellPrice?: number | null;
  targetStopPrice?: number | null;
  thesis?: string;
}): Promise<Result<PortfolioTarget>> {
  const sku = (input.sku ?? "").trim();
  if (!sku) return { ok: false, reason: "sku required.", status: 400 };

  const buy = input.targetBuyPrice ?? null;
  const sell = input.targetSellPrice ?? null;
  const stop = input.targetStopPrice ?? null;
  if (buy === null && sell === null && stop === null) {
    return { ok: false, reason: "At least one of buy/sell/stop must be set.", status: 400 };
  }
  // Mirror the DB CHECK so we fail fast with a useful message.
  if (stop !== null && buy !== null && stop >= buy) {
    return { ok: false, reason: "stop must be below buy.", status: 400 };
  }
  if (buy !== null && sell !== null && buy > sell) {
    return { ok: false, reason: "buy must be ≤ sell.", status: 400 };
  }

  const cap = await query(
    `SELECT COUNT(*)::int AS n FROM portfolio_targets
      WHERE user_id = $1 AND status = 'active'`,
    [input.userId],
  );
  if (cap.rows[0].n >= MAX_PER_USER) {
    return {
      ok: false,
      reason: `Limit of ${MAX_PER_USER} active targets reached. Cancel old ones to make room.`,
      status: 429,
    };
  }

  const r = await query(
    `INSERT INTO portfolio_targets
       (user_id, sku, condition,
        target_buy_price, target_sell_price, target_stop_price, thesis)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [input.userId, sku, input.condition ?? "NM",
     buy?.toFixed(2) ?? null,
     sell?.toFixed(2) ?? null,
     stop?.toFixed(2) ?? null,
     input.thesis?.trim() || null],
  );
  const target = r.rows[0] as PortfolioTarget;

  void logTargetTransition({
    targetId: target.id,
    action: "created",
    actorId: input.userId,
    actorLabel: "investor",
    reason: `Target created on ${sku}`,
    metadata: {
      buy: buy?.toFixed(2) ?? null,
      sell: sell?.toFixed(2) ?? null,
      stop: stop?.toFixed(2) ?? null,
      has_thesis: !!input.thesis?.trim(),
    },
  });

  return { ok: true, value: target };
}

// ── Pause / resume / cancel ──

async function transition(
  targetId: string, userId: string,
  predicate: (t: PortfolioTarget) => string | null,
  newStatus: TargetStatus,
  action: "paused" | "resumed" | "cancelled",
): Promise<Result<PortfolioTarget>> {
  const r = await query(`SELECT * FROM portfolio_targets WHERE id = $1`, [targetId]);
  if (r.rows.length === 0) return { ok: false, reason: "Target not found.", status: 404 };
  const target = r.rows[0] as PortfolioTarget;
  if (target.user_id !== userId) {
    return { ok: false, reason: "Not your target.", status: 403 };
  }
  const denial = predicate(target);
  if (denial) return { ok: false, reason: denial, status: 409 };

  const u = await query(
    `UPDATE portfolio_targets SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [targetId, newStatus],
  );

  void logTargetTransition({
    targetId, action,
    actorId: userId,
    actorLabel: "investor",
    reason: `Target ${action}`,
    metadata: { previous_status: target.status },
  });

  return { ok: true, value: u.rows[0] as PortfolioTarget };
}

export const pauseTarget = (id: string, userId: string) =>
  transition(id, userId,
    (t) => t.status === "active" ? null : `Target is ${t.status} — can't pause.`,
    "paused", "paused");

export const resumeTarget = (id: string, userId: string) =>
  transition(id, userId,
    (t) => t.status === "paused" ? null : `Target is ${t.status} — can't resume.`,
    "active", "resumed");

export const cancelTarget = (id: string, userId: string) =>
  transition(id, userId,
    (t) => t.status === "active" || t.status === "paused"
            ? null : `Target is ${t.status} — can't cancel.`,
    "cancelled", "cancelled");

// ── Read ──

export async function listTargets(userId: string, opts: { activeOnly?: boolean } = {}): Promise<PortfolioTarget[]> {
  const where = opts.activeOnly ? `AND status IN ('active', 'paused')` : "";
  const r = await query(
    `SELECT * FROM portfolio_targets
      WHERE user_id = $1 ${where}
      ORDER BY status = 'active' DESC, created_at DESC`,
    [userId],
  );
  return r.rows as PortfolioTarget[];
}

// ── Sweep ──
//
// Resolves current best bid/ask per active-target SKU in one CTE,
// then per-target evaluates: buy fires when best_ask ≤ target_buy
// (you can BUY at your level), sell fires when best_bid ≥ target_sell
// (you can SELL at your level), stop fires when best_bid ≤ target_stop
// (forced exit signal).

const MAX_FIRES_PER_RUN = 100;

export interface TargetSweepResult {
  scanned: number;
  fired: number;
  throttled: boolean;
}

export async function runPortfolioTargetSweep(): Promise<TargetSweepResult> {
  const result: TargetSweepResult = { scanned: 0, fired: 0, throttled: false };

  const candidates = await query(
    `WITH live AS (
       SELECT t.id, t.user_id, t.sku, t.thesis,
              t.target_buy_price::numeric AS target_buy,
              t.target_sell_price::numeric AS target_sell,
              t.target_stop_price::numeric AS target_stop,
              (SELECT MIN(price)::numeric FROM market_orders
                WHERE sku = t.sku AND side = 'ask'
                  AND status IN ('open','partially_filled')
              ) AS best_ask,
              (SELECT MAX(price)::numeric FROM market_orders
                WHERE sku = t.sku AND side = 'bid'
                  AND status IN ('open','partially_filled')
              ) AS best_bid,
              (SELECT card_name FROM portfolio_cards
                WHERE user_id = t.user_id AND sku = t.sku LIMIT 1) AS card_name
         FROM portfolio_targets t
        WHERE t.status = 'active'
     )
     SELECT * FROM live
      WHERE (target_buy  IS NOT NULL AND best_ask IS NOT NULL AND best_ask <= target_buy)
         OR (target_sell IS NOT NULL AND best_bid IS NOT NULL AND best_bid >= target_sell)
         OR (target_stop IS NOT NULL AND best_bid IS NOT NULL AND best_bid <= target_stop)
      ORDER BY id
      LIMIT $1`,
    [MAX_FIRES_PER_RUN + 1],
  );

  if (candidates.rows.length > MAX_FIRES_PER_RUN) {
    result.throttled = true;
    candidates.rows.length = MAX_FIRES_PER_RUN;
  }
  result.scanned = candidates.rows.length;

  for (const c of candidates.rows) {
    const bestAsk = c.best_ask ? parseFloat(c.best_ask) : null;
    const bestBid = c.best_bid ? parseFloat(c.best_bid) : null;
    const targetBuy = c.target_buy ? parseFloat(c.target_buy) : null;
    const targetSell = c.target_sell ? parseFloat(c.target_sell) : null;
    const targetStop = c.target_stop ? parseFloat(c.target_stop) : null;

    // Priority order if multiple levels hit at once: stop > sell > buy.
    // Stop is loss-control and most urgent; sell is profit-take; buy
    // is opportunistic. Realistically only one will trip per sweep
    // tick but defensible default.
    let hitKind: TargetHitKind | null = null;
    let hitPrice: number | null = null;
    if (targetStop !== null && bestBid !== null && bestBid <= targetStop) {
      hitKind = "stop"; hitPrice = bestBid;
    } else if (targetSell !== null && bestBid !== null && bestBid >= targetSell) {
      hitKind = "sell"; hitPrice = bestBid;
    } else if (targetBuy !== null && bestAsk !== null && bestAsk <= targetBuy) {
      hitKind = "buy"; hitPrice = bestAsk;
    }
    if (hitKind === null || hitPrice === null) continue;

    // Atomic flip — the WHERE status='active' guard prevents two
    // concurrent sweep runs from double-firing the same target.
    const flipped = await query(
      `UPDATE portfolio_targets
          SET status = 'hit',
              hit_kind = $2,
              hit_price = $3,
              hit_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = 'active'
        RETURNING id`,
      [c.id, hitKind, hitPrice.toFixed(2)],
    );
    if (flipped.rows.length === 0) continue;

    const label = c.card_name || c.sku;
    const verb = hitKind === "buy" ? "Buy entry" : hitKind === "sell" ? "Sell target" : "Stop level";
    await notify({
      userId: c.user_id,
      kind: `portfolio.target_${hitKind}`,
      title: `${verb} hit on ${label}: ${formatPrice(hitPrice)}`,
      body: c.thesis
        ? `Your thesis: ${String(c.thesis).slice(0, 160)}`
        : "Review the position and decide whether to act.",
      linkUrl: "/account/portfolio",
      referenceType: "portfolio_target",
      referenceId: c.id,
    }).catch((err) => console.error("[targets/sweep] notify failed:", err));

    void logTargetTransition({
      targetId: c.id,
      action: "hit",
      actorLabel: "system:target-sweep",
      reason: `${verb} hit at ${formatPrice(hitPrice)}`,
      metadata: { hit_kind: hitKind, hit_price: hitPrice.toFixed(2), best_ask: bestAsk, best_bid: bestBid },
    });

    result.fired++;
  }

  return result;
}
