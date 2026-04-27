// Pricing rules — seller auto-response on incoming offers.
//
// applyRulesToOffer is the hook point: makeOffer calls it after the
// offer row is inserted. If any active rule matches the ask + offer
// price, the rule's action fires by calling back through the
// existing offers.ts lib (declineOffer or counterOffer). No new
// notification kinds — the buyer sees offer.declined or
// offer.countered as if the seller had clicked the button.

import { query } from "@/lib/db";
import { logRuleTransition } from "./pricing-rule-lifecycle-log";

export type RuleType = "auto_decline" | "auto_counter";
export type RuleStatus = "active" | "paused" | "archived";

export interface ListingFilter {
  sku_pattern?: string;     // ILIKE
  set_codes?: string[];     // OR'd
  conditions?: string[];    // OR'd
  min_ask?: number;
  max_ask?: number;
}

export interface PricingRule {
  id: string;
  user_id: string;
  name: string;
  listing_filter: ListingFilter;
  rule_type: RuleType;
  threshold_pct: string;
  counter_pct: string | null;
  response_message: string | null;
  status: RuleStatus;
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

const MAX_PER_USER = 25;

// ── Validate the JSONB filter ──
//
// Same lessons as the saved-searches validateQuery: tighten on insert
// so a junk filter can't poison the apply path.
function validateFilter(input: unknown): { ok: true; value: ListingFilter } | { ok: false; reason: string } {
  if (input === undefined || input === null) {
    return { ok: true, value: {} };
  }
  if (typeof input !== "object") {
    return { ok: false, reason: "listing_filter must be an object." };
  }
  const f = input as Record<string, unknown>;
  const out: ListingFilter = {};

  if (f.sku_pattern !== undefined) {
    if (typeof f.sku_pattern !== "string" || f.sku_pattern.length === 0) {
      return { ok: false, reason: "sku_pattern must be a non-empty string." };
    }
    if (f.sku_pattern.length > 60) {
      return { ok: false, reason: "sku_pattern too long (≤60 chars)." };
    }
    out.sku_pattern = f.sku_pattern;
  }
  if (f.set_codes !== undefined) {
    if (!Array.isArray(f.set_codes) || f.set_codes.some((s) => typeof s !== "string")) {
      return { ok: false, reason: "set_codes must be string[]." };
    }
    out.set_codes = (f.set_codes as string[]).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);
  }
  if (f.conditions !== undefined) {
    if (!Array.isArray(f.conditions) || f.conditions.some((s) => typeof s !== "string")) {
      return { ok: false, reason: "conditions must be string[]." };
    }
    out.conditions = (f.conditions as string[]).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 8);
  }
  for (const k of ["min_ask", "max_ask"] as const) {
    if (f[k] !== undefined) {
      const n = f[k];
      if (typeof n !== "number" || !isFinite(n) || n < 0) {
        return { ok: false, reason: `${k} must be a non-negative number.` };
      }
      out[k] = n;
    }
  }
  if (out.min_ask !== undefined && out.max_ask !== undefined && out.min_ask > out.max_ask) {
    return { ok: false, reason: "min_ask must be ≤ max_ask." };
  }
  return { ok: true, value: out };
}

// ── createRule ──

export async function createRule(input: {
  userId: string;
  name: string;
  listingFilter?: unknown;
  ruleType: RuleType;
  thresholdPct: number;
  counterPct?: number;
  responseMessage?: string;
}): Promise<Result<PricingRule>> {
  const trimmedName = input.name?.trim();
  if (!trimmedName || trimmedName.length > 80) {
    return { ok: false, reason: "Name must be 1-80 characters.", status: 400 };
  }

  if (input.ruleType !== "auto_decline" && input.ruleType !== "auto_counter") {
    return { ok: false, reason: "ruleType must be 'auto_decline' or 'auto_counter'.", status: 400 };
  }

  if (!(input.thresholdPct > 0 && input.thresholdPct <= 100)) {
    return { ok: false, reason: "thresholdPct must be between 0 and 100.", status: 400 };
  }

  if (input.ruleType === "auto_counter") {
    if (input.counterPct === undefined) {
      return { ok: false, reason: "auto_counter requires counterPct.", status: 400 };
    }
    if (!(input.counterPct > 0 && input.counterPct < 100)) {
      return { ok: false, reason: "counterPct must be between 0 and 100 (exclusive of 100).", status: 400 };
    }
    if (input.counterPct <= input.thresholdPct) {
      return {
        ok: false,
        reason: "counterPct must be greater than thresholdPct (otherwise the counter would itself trip the rule).",
        status: 400,
      };
    }
  } else if (input.counterPct !== undefined) {
    return { ok: false, reason: "auto_decline rules can't carry counterPct.", status: 400 };
  }

  const filter = validateFilter(input.listingFilter);
  if (!filter.ok) return { ok: false, reason: filter.reason, status: 400 };

  // Per-user soft cap
  const count = await query(
    `SELECT COUNT(*)::int AS n FROM pricing_rules
      WHERE user_id = $1 AND status != 'archived'`,
    [input.userId],
  );
  if (count.rows[0].n >= MAX_PER_USER) {
    return {
      ok: false,
      reason: `Limit of ${MAX_PER_USER} rules reached. Archive an old one to make room.`,
      status: 429,
    };
  }

  const r = await query(
    `INSERT INTO pricing_rules
       (user_id, name, listing_filter, rule_type, threshold_pct, counter_pct, response_message)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) RETURNING *`,
    [input.userId, trimmedName, JSON.stringify(filter.value),
     input.ruleType, input.thresholdPct.toFixed(2),
     input.counterPct !== undefined ? input.counterPct.toFixed(2) : null,
     input.responseMessage?.trim() || null],
  );
  const rule = r.rows[0] as PricingRule;

  void logRuleTransition({
    ruleId: rule.id,
    action: "created",
    actorId: input.userId,
    actorLabel: "seller",
    reason: `Created ${input.ruleType} rule "${trimmedName}" at ${input.thresholdPct}% threshold`,
    metadata: {
      rule_type: input.ruleType,
      threshold_pct: input.thresholdPct,
      counter_pct: input.counterPct ?? null,
    },
  });

  return { ok: true, value: rule };
}

// ── Pause / resume / archive ──

async function transition(
  ruleId: string, userId: string,
  predicate: (r: PricingRule) => string | null,
  setSql: string,
  action: "paused" | "resumed" | "archived",
): Promise<Result<PricingRule>> {
  const r = await query(`SELECT * FROM pricing_rules WHERE id = $1`, [ruleId]);
  if (r.rows.length === 0) return { ok: false, reason: "Rule not found.", status: 404 };
  const rule = r.rows[0] as PricingRule;
  if (rule.user_id !== userId) return { ok: false, reason: "Not your rule.", status: 403 };
  const denial = predicate(rule);
  if (denial) return { ok: false, reason: denial, status: 409 };

  const u = await query(
    `UPDATE pricing_rules SET ${setSql}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [ruleId],
  );
  const updated = u.rows[0] as PricingRule;

  void logRuleTransition({
    ruleId,
    action,
    actorId: userId,
    actorLabel: "seller",
    reason: `Rule "${rule.name}" ${action}`,
    metadata: { previous_status: rule.status },
  });

  return { ok: true, value: updated };
}

export async function pauseRule(id: string, userId: string) {
  return transition(id, userId,
    (r) => r.status === "active" ? null : `Rule is ${r.status} — can't pause.`,
    `status = 'paused'`, "paused");
}
export async function resumeRule(id: string, userId: string) {
  return transition(id, userId,
    (r) => r.status === "paused" ? null : `Rule is ${r.status} — can't resume.`,
    `status = 'active'`, "resumed");
}
export async function archiveRule(id: string, userId: string) {
  return transition(id, userId,
    (r) => r.status !== "archived" ? null : "Already archived.",
    `status = 'archived'`, "archived");
}

export async function listRules(userId: string): Promise<PricingRule[]> {
  const r = await query(
    `SELECT * FROM pricing_rules
      WHERE user_id = $1 AND status != 'archived'
      ORDER BY status = 'active' DESC, created_at DESC`,
    [userId],
  );
  return r.rows as PricingRule[];
}

export async function getRule(ruleId: string, userId: string): Promise<PricingRule | null> {
  const r = await query(
    `SELECT * FROM pricing_rules WHERE id = $1 AND user_id = $2`,
    [ruleId, userId],
  );
  return (r.rows[0] as PricingRule) ?? null;
}

// ── Filter matching ──
//
// Pure: returns true iff the (ask) row is covered by this rule's
// listing_filter. Empty filter = matches everything.

interface AskRow {
  sku: string;
  set_code: string | null;
  condition: string;
  price: string | number;
}

function askMatchesFilter(ask: AskRow, f: ListingFilter): boolean {
  if (f.sku_pattern) {
    // SQL ILIKE-equivalent in JS: case-insensitive, % → .*, _ → .
    const pattern = "^" + f.sku_pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*").replace(/_/g, ".") + "$";
    if (!new RegExp(pattern, "i").test(ask.sku)) return false;
  }
  if (f.set_codes && f.set_codes.length > 0) {
    if (!ask.set_code || !f.set_codes.includes(ask.set_code.toUpperCase())) return false;
  }
  if (f.conditions && f.conditions.length > 0) {
    if (!f.conditions.includes(ask.condition.toUpperCase())) return false;
  }
  const askPrice = typeof ask.price === "number" ? ask.price : parseFloat(ask.price);
  if (f.min_ask !== undefined && askPrice < f.min_ask) return false;
  if (f.max_ask !== undefined && askPrice > f.max_ask) return false;
  return true;
}

// ── The hook: applyRulesToOffer ──
//
// Called by offers.ts makeOffer right after the offer row exists.
// Walks the seller's active rules; the FIRST rule that matches the
// listing_filter AND finds the offer below threshold acts. Returns
// what happened so the caller can decide whether to fall through
// to the standard "pending" notification.
//
// Single-pass (no precedence ordering — first-match-wins) keeps the
// model legible. Sellers who want layered behaviour archive the
// older rule.

export interface RuleApplicationResult {
  triggered: boolean;
  action: "declined" | "countered" | null;
  ruleId?: string;
  ruleName?: string;
}

export async function applyRulesToOffer(input: {
  offerId: string;
  sellerId: string;
  askId: string;
  offerPrice: number;
}): Promise<RuleApplicationResult> {
  // Fetch the seller's active rules + the ask metadata in one shot.
  const [rulesRes, askRes] = await Promise.all([
    query(
      `SELECT * FROM pricing_rules
        WHERE user_id = $1 AND status = 'active'
        ORDER BY created_at ASC`,
      [input.sellerId],
    ),
    query(
      `SELECT sku, set_code, condition, price FROM market_orders WHERE id = $1`,
      [input.askId],
    ),
  ]);

  if (rulesRes.rows.length === 0 || askRes.rows.length === 0) {
    return { triggered: false, action: null };
  }

  const ask = askRes.rows[0] as AskRow;
  const askPrice = parseFloat(ask.price as string);

  for (const rule of rulesRes.rows as PricingRule[]) {
    if (!askMatchesFilter(ask, rule.listing_filter || {})) continue;

    const threshold = askPrice * (parseFloat(rule.threshold_pct) / 100);
    if (input.offerPrice >= threshold) continue;

    const offerPctOfAsk = Math.round((input.offerPrice / askPrice) * 100);

    // Below threshold — rule fires.
    if (rule.rule_type === "auto_decline") {
      const { declineOffer } = await import("./offers");
      const reason = rule.response_message
        ?? `Auto-declined by rule "${rule.name}" — offers below ${rule.threshold_pct}% of ask are not accepted.`;
      await declineOffer(input.offerId, input.sellerId, reason);
      await query(
        `UPDATE pricing_rules
            SET trigger_count = trigger_count + 1,
                last_triggered_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [rule.id],
      );
      void logRuleTransition({
        ruleId: rule.id,
        action: "fired",
        actorLabel: "system:rule-engine",
        reason: `Auto-declined offer at ${offerPctOfAsk}% of ask`,
        metadata: {
          decision: "declined",
          offer_id: input.offerId,
          ask_id: input.askId,
          offer_price: input.offerPrice.toFixed(2),
          ask_price: askPrice.toFixed(2),
          offer_pct_of_ask: offerPctOfAsk,
          threshold_pct: rule.threshold_pct,
        },
      });
      return { triggered: true, action: "declined", ruleId: rule.id, ruleName: rule.name };
    }

    // auto_counter
    if (rule.rule_type === "auto_counter" && rule.counter_pct) {
      const counterPrice = Math.round(askPrice * (parseFloat(rule.counter_pct) / 100) * 100) / 100;
      // Counter must be strictly between offer and ask — the lib's
      // counterOffer enforces this. counter_pct < 100 is guaranteed
      // by the column CHECK.
      if (counterPrice <= input.offerPrice) {
        // Edge: rounding pulled counter ≤ offer. Fall back to decline
        // so the buyer at least gets a clean response.
        const { declineOffer } = await import("./offers");
        await declineOffer(input.offerId, input.sellerId,
          rule.response_message ?? `Auto-declined by rule "${rule.name}".`);
        await query(
          `UPDATE pricing_rules
              SET trigger_count = trigger_count + 1,
                  last_triggered_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [rule.id],
        );
        void logRuleTransition({
          ruleId: rule.id,
          action: "fired",
          actorLabel: "system:rule-engine",
          reason: `Counter rounded to ≤ offer; fell back to decline`,
          metadata: {
            decision: "declined",
            fallback_from: "counter",
            offer_id: input.offerId,
            ask_id: input.askId,
            offer_price: input.offerPrice.toFixed(2),
            ask_price: askPrice.toFixed(2),
            offer_pct_of_ask: offerPctOfAsk,
          },
        });
        return { triggered: true, action: "declined", ruleId: rule.id, ruleName: rule.name };
      }

      const { counterOffer } = await import("./offers");
      const counterMessage = rule.response_message
        ?? `Auto-countered by rule "${rule.name}" at ${rule.counter_pct}% of ask.`;
      await counterOffer({
        offerId: input.offerId,
        sellerId: input.sellerId,
        counterPrice,
        counterMessage,
      });
      await query(
        `UPDATE pricing_rules
            SET trigger_count = trigger_count + 1,
                last_triggered_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [rule.id],
      );
      void logRuleTransition({
        ruleId: rule.id,
        action: "fired",
        actorLabel: "system:rule-engine",
        reason: `Auto-countered at ${rule.counter_pct}% of ask`,
        metadata: {
          decision: "countered",
          offer_id: input.offerId,
          ask_id: input.askId,
          offer_price: input.offerPrice.toFixed(2),
          counter_price: counterPrice.toFixed(2),
          ask_price: askPrice.toFixed(2),
          offer_pct_of_ask: offerPctOfAsk,
          counter_pct: rule.counter_pct,
        },
      });
      return { triggered: true, action: "countered", ruleId: rule.id, ruleName: rule.name };
    }
  }

  return { triggered: false, action: null };
}
