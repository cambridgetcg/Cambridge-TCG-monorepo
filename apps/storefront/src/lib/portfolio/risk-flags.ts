// Investor risk-flags aggregator.
//
// Pure read-side. Consumes (in this order):
//   - Reprint announcements affecting holdings
//   - Liquidity score (thin / stale positions)
//   - Concentration metrics (HHI, top-SKU/set %)
//   - Position aging (held > 365 days, candidate for review)
//   - Targets that just hit (status='hit' and recent)
//
// Returns a flat list of RiskFlag rows ordered by severity. The
// /account/portfolio/risk page renders them as a punch list with
// links to the relevant action surface.
//
// Designed so each source is independent — a failure in one source
// doesn't break the dashboard. Promise.allSettled at the top level.

import { query } from "@/lib/db";
import { liquidityForSkus, concentration, type ValuedRow } from "./risk";
import { reprintsForHolder } from "./reprints";

export type RiskSeverity = "info" | "warn" | "alert";

export interface RiskFlag {
  /** Stable kind id for client rendering. */
  kind:
    | "reprint"
    | "liquidity_thin"
    | "liquidity_stale"
    | "concentration_hhi"
    | "concentration_sku"
    | "concentration_set"
    | "position_aging"
    | "target_hit";
  severity: RiskSeverity;
  /** Short human label. */
  title: string;
  /** Longer explanation. */
  detail: string;
  /** Deep-link the user can click to act. */
  link: string;
  /** Optional sortable signal — bigger = more urgent within severity. */
  weight: number;
  /** Subject scope, useful for grouping in the UI. */
  scope?: { sku?: string; set_code?: string };
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { alert: 3, warn: 2, info: 1 };

export interface PortfolioRiskReport {
  flags: RiskFlag[];
  /** Convenience aggregate: max severity present. */
  worst: RiskSeverity | null;
  /** Count by severity for the summary header. */
  counts: { alert: number; warn: number; info: number };
}

interface HoldingRow {
  sku: string;
  set_code: string | null;
  card_name: string | null;
  quantity: number;
  acquisition_price: string | null;
  acquired_at: string | null;
  updated_at: string;
}

export async function getPortfolioRiskFlags(userId: string): Promise<PortfolioRiskReport> {
  // Pull holdings once. Empty portfolio → empty report (no flags to
  // surface; UI can show an empty state).
  const holdingsRes = await query(
    `SELECT sku, set_code, card_name, quantity, acquisition_price,
            acquired_at, updated_at
       FROM portfolio_cards
      WHERE user_id = $1 AND quantity > 0`,
    [userId],
  );
  const holdings = holdingsRes.rows as HoldingRow[];

  if (holdings.length === 0) {
    return { flags: [], worst: null, counts: { alert: 0, warn: 0, info: 0 } };
  }

  // Run independent sources in parallel; degrade gracefully on any
  // single failure.
  const [reprintsRes, liquidityRes, recentTargetsRes] = await Promise.allSettled([
    reprintsForHolder(userId),
    liquidityForSkus(holdings.map((h) => h.sku)),
    query(
      `SELECT id, sku, hit_kind, hit_price, hit_at,
              (SELECT card_name FROM portfolio_cards
                WHERE user_id = pt.user_id AND sku = pt.sku LIMIT 1) AS card_name
         FROM portfolio_targets pt
        WHERE user_id = $1
          AND status = 'hit'
          AND hit_at >= NOW() - INTERVAL '14 days'
        ORDER BY hit_at DESC LIMIT 25`,
      [userId],
    ),
  ]);

  const flags: RiskFlag[] = [];

  // ── Reprint warnings (highest priority) ──
  if (reprintsRes.status === "fulfilled") {
    for (const r of reprintsRes.value) {
      const a = r.announcement;
      const severity: RiskSeverity = a.severity === "high" ? "alert"
        : a.severity === "medium" ? "warn" : "info";
      const dateStr = a.expected_release_date ? ` (expected ${a.expected_release_date})` : "";
      flags.push({
        kind: "reprint",
        severity,
        title: `Reprint risk: ${a.title}${dateStr}`,
        detail: `Affects ${r.affected_skus.length} of your holdings: ${r.affected_skus.slice(0, 3).join(", ")}${r.affected_skus.length > 3 ? `, +${r.affected_skus.length - 3} more` : ""}.`
          + (a.source_url ? ` Source: ${a.source_url}` : ""),
        link: "/account/portfolio/risk",
        weight: a.expected_release_date
          ? Math.max(0, 365 - daysUntil(a.expected_release_date))
          : 100,
        scope: { sku: r.affected_skus[0] },
      });
    }
  }

  // ── Per-holding liquidity flags ──
  if (liquidityRes.status === "fulfilled") {
    const liq = liquidityRes.value;
    for (const h of holdings) {
      const score = liq.get(h.sku);
      if (!score) continue;
      if (score.flag === "stale") {
        flags.push({
          kind: "liquidity_stale",
          severity: "warn",
          title: `Stale market: ${h.card_name || h.sku}`,
          detail: `No trades in ${score.days_since_last_trade?.toFixed(0) ?? "many"} days. Exit may take time. Consider listing across multiple surfaces.`,
          link: `/market/${encodeURIComponent(h.sku)}`,
          weight: score.days_since_last_trade ?? 90,
          scope: { sku: h.sku },
        });
      } else if (score.flag === "thin") {
        flags.push({
          kind: "liquidity_thin",
          severity: "info",
          title: `Thin liquidity: ${h.card_name || h.sku}`,
          detail: `Liquidity score ${score.score}/100 (bid depth ${score.bid_depth}, ${score.trades_30d_count} trades in 30d). Position may be hard to exit at quoted price.`,
          link: `/market/${encodeURIComponent(h.sku)}`,
          weight: 100 - score.score,
          scope: { sku: h.sku },
        });
      }
    }
  }

  // ── Concentration warnings ──
  // Build the valued rows quickly with current spot prices fallback —
  // we don't need precise valuation here, just relative weights.
  const valued: ValuedRow[] = holdings.map((h) => ({
    sku: h.sku,
    set_code: h.set_code,
    current_value: h.acquisition_price
      ? parseFloat(h.acquisition_price) * h.quantity
      : 1,  // last-resort weight so the SKU still figures in shares
  }));
  const conc = concentration(valued);
  if (conc.bucket === "concentrated") {
    flags.push({
      kind: "concentration_hhi",
      severity: "warn",
      title: `Portfolio is highly concentrated (HHI ${conc.hhi})`,
      detail: `${conc.positions_to_50pct} position${conc.positions_to_50pct === 1 ? "" : "s"} cover 50% of value. A single negative event could move the whole book.`,
      link: "/account/portfolio",
      weight: conc.hhi,
    });
  } else if (conc.bucket === "moderate") {
    flags.push({
      kind: "concentration_hhi",
      severity: "info",
      title: `Moderate concentration (HHI ${conc.hhi})`,
      detail: `${conc.positions_to_50pct} position${conc.positions_to_50pct === 1 ? "" : "s"} cover 50% of value. Watch for set-rotation events.`,
      link: "/account/portfolio",
      weight: conc.hhi,
    });
  }
  if (conc.top_sku && conc.top_sku_pct >= 25) {
    flags.push({
      kind: "concentration_sku",
      severity: conc.top_sku_pct >= 40 ? "alert" : "warn",
      title: `Single-card concentration: ${conc.top_sku} = ${conc.top_sku_pct}%`,
      detail: "One SKU holding more than a quarter of book value. Consider partial trim if liquidity allows.",
      link: `/market/${encodeURIComponent(conc.top_sku)}`,
      weight: conc.top_sku_pct,
      scope: { sku: conc.top_sku },
    });
  }
  if (conc.top_set && conc.top_set_pct >= 50) {
    flags.push({
      kind: "concentration_set",
      severity: "warn",
      title: `Set concentration: ${conc.top_set} = ${conc.top_set_pct}%`,
      detail: "Most of your value sits in one set — vulnerable to single-event reprints or rotations.",
      link: "/account/portfolio",
      weight: conc.top_set_pct,
      scope: { set_code: conc.top_set },
    });
  }

  // ── Position aging ──
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  for (const h of holdings) {
    if (!h.acquired_at) continue;
    const acquired = new Date(h.acquired_at).getTime();
    if (acquired < oneYearAgo) {
      const days = Math.floor((Date.now() - acquired) / (24 * 60 * 60 * 1000));
      flags.push({
        kind: "position_aging",
        severity: "info",
        title: `Long hold: ${h.card_name || h.sku} (${days}d)`,
        detail: "Held over a year. Worth reviewing whether the original thesis still holds.",
        link: "/account/portfolio",
        weight: days,
        scope: { sku: h.sku },
      });
    }
  }

  // ── Recent target hits ──
  if (recentTargetsRes.status === "fulfilled") {
    for (const t of recentTargetsRes.value.rows) {
      const verb = t.hit_kind === "buy" ? "Buy entry"
        : t.hit_kind === "sell" ? "Sell target" : "Stop level";
      const sevForKind: RiskSeverity = t.hit_kind === "stop" ? "alert" : "warn";
      flags.push({
        kind: "target_hit",
        severity: sevForKind,
        title: `${verb} hit on ${t.card_name || t.sku} at £${t.hit_price}`,
        detail: "Consider whether to act now or update the target.",
        link: "/account/portfolio",
        weight: 100,
        scope: { sku: t.sku },
      });
    }
  }

  // Sort: severity desc, then weight desc within severity.
  flags.sort((a, b) => {
    const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (s !== 0) return s;
    return b.weight - a.weight;
  });

  const counts = { alert: 0, warn: 0, info: 0 };
  for (const f of flags) counts[f.severity]++;
  const worst = flags[0]?.severity ?? null;

  return { flags, worst, counts };
}

function daysUntil(isoDate: string): number {
  const t = new Date(isoDate).getTime();
  return Math.floor((t - Date.now()) / (24 * 60 * 60 * 1000));
}
