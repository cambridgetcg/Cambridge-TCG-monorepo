/**
 * Journey timeline — on the Scribe's bookshelf.
 *
 * The customer (and admin) journey feed, composed from every lifecycle
 * log on the platform plus the four non-lifecycle sources. Three thin
 * layers, one job each:
 *
 *   1. Substrate — `readUserLifecycle()` (in @/lib/lifecycle) walks
 *      every registered slot in `lifecycle/registry.ts` and returns
 *      a normalised `LifecycleEntry[]` across all sixteen lifecycle
 *      logs. Domain-specific extras travel in `metadata`.
 *
 *   2. Surface — `renderEntry()` (in ./render.ts) is a pure function
 *      per domain that turns a LifecycleEntry into a JourneyEvent
 *      (or null for entries that shouldn't surface on the
 *      customer-facing timeline, e.g. admin actions outside the
 *      visible whitelist).
 *
 *   3. Composer — this file. Pulls the substrate via the bookshelf,
 *      renders, and merges in the four sources that are NOT lifecycle
 *      logs: bounty_pulls, verifiable_draws, notifications, email_queue.
 *      Those four stay here because they aren't append-only books —
 *      they're domain tables or queues with their own substrate.
 *
 * History: this module was 826 LOC of hand-coded per-source fetchers
 * before the migration named by docs/connections/the-scribe.md S8.
 * Adding a new lifecycle log no longer requires editing this file —
 * register a slot in `lifecycle/registry.ts` and (if customer-facing)
 * add a renderer in `./render.ts`. The composer never has to change.
 *
 * See docs/connections/the-scribe.md and docs/connections/three-voices.md
 * for the architectural story.
 */

import { query } from "@/lib/db";
import { readUserLifecycle } from "@/lib/lifecycle";
import { renderEntry } from "./render";
import type { JourneyEvent, JourneyOptions } from "./types";

// Re-export so callers can `import { getUserJourney, type JourneyEvent }
// from "@/lib/journey/timeline"` and have everything they need.
export type { JourneyEvent, JourneyOptions } from "./types";

const DEFAULT_PER_SOURCE = 50;
const DEFAULT_TOTAL_LIMIT = 200;

/**
 * Compose every source — sixteen lifecycle domains via the bookshelf
 * plus four non-lifecycle sources directly — sort newest-first, apply
 * customer/admin filters.
 *
 * Identical output contract to the legacy `getUserJourney` in
 * timeline.ts; consumers can swap the import path with no other change.
 */
export async function getUserJourney(
  userId: string,
  opts: JourneyOptions = {},
): Promise<JourneyEvent[]> {
  const perSource = opts.perSource ?? DEFAULT_PER_SOURCE;

  const [lifecycleResult, bounty, draws, notices, emails] = await Promise.allSettled([
    // Substrate side — 16 lifecycle logs through the Scribe's bookshelf.
    // The reader handles per-slot failure via its own Promise.allSettled,
    // so this branch only rejects on catastrophic errors (e.g. the
    // bookshelf module itself failing to load).
    readUserLifecycle(userId, {
      limit: perSource,
      since: opts.since,
      // Pull enough for client-side filtering — the composer will cap
      // the final merged list below.
      totalLimit: perSource * 16,
    }),
    fetchBountyPulls(userId, perSource, opts.since),
    fetchVerifiableDraws(userId, perSource, opts.since),
    fetchNotifications(userId, perSource, opts.since),
    fetchEmailsSent(userId, perSource, opts.since),
  ]);

  let merged: JourneyEvent[] = [];

  // ── Substrate → surface via renderers ────────────────────────────────
  if (lifecycleResult.status === "fulfilled") {
    for (const entry of lifecycleResult.value) {
      const event = renderEntry(entry);
      if (event) merged.push(event);
    }
  } else {
    console.error("[journey-v2] lifecycle reader failed:", lifecycleResult.reason);
  }

  // ── Non-lifecycle sources ────────────────────────────────────────────
  for (const result of [bounty, draws, notices, emails]) {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    } else {
      console.error("[journey-v2] non-lifecycle source failed:", result.reason);
    }
  }

  // ── Filters ──────────────────────────────────────────────────────────
  if (opts.group) merged = merged.filter((e) => e.group === opts.group);
  if (opts.hideAdminOnly) merged = merged.filter((e) => !e.isAdminOnly);

  merged.sort((a, b) => b.at.getTime() - a.at.getTime());

  // The composer's final cap. Per-source limits feed it; the bookshelf
  // already returned ≤ perSource × 16 events; non-lifecycle sources
  // contribute up to perSource each.
  return merged.slice(0, DEFAULT_TOTAL_LIMIT);
}

// ── Non-lifecycle sources ────────────────────────────────────────────
//
// These four don't belong on the Scribe's bookshelf because they aren't
// `*_lifecycle_log` tables — they're either substrate-of-record tables
// (bounty_pulls, verifiable_draws) or queues/inboxes (notifications,
// email_queue). The bookshelf models append-only audit trails; these
// model state-bearing entities. Different kind, intentionally separate.
//
// See docs/connections/three-voices.md for why notifications and
// email_queue are surfaced on the journey as the platform's two
// outward voices ("the bell" and "the inbox").

async function fetchBountyPulls(
  userId: string,
  limit: number,
  since: Date | undefined,
): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND resolved_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since.toISOString());
  const r = await query(
    `SELECT id, tier, rolled_rarity, resolved_at
       FROM bounty_pulls
      WHERE user_id = $1 AND rolled_rarity IS NOT NULL ${sinceClause}
      ORDER BY resolved_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: "bounty.pull_resolved",
    summary: `Pulled ${row.rolled_rarity} from a ${row.tier} pull`,
    at: new Date(row.resolved_at),
    link: `/verify/pull/${row.id}`,
    group: "draw",
    tone:
      ["super_rare", "legendary"].includes(row.rolled_rarity) ? "fuchsia"
      : row.rolled_rarity === "rare" ? "amber"
      : "default",
  }));
}

async function fetchVerifiableDraws(
  userId: string,
  limit: number,
  since: Date | undefined,
): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND revealed_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since.toISOString());
  const r = await query(
    `SELECT id, kind, outcome, revealed_at
       FROM verifiable_draws
      WHERE user_id = $1 AND revealed_at IS NOT NULL ${sinceClause}
      ORDER BY revealed_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => {
    const outcome = row.outcome as { picked?: string; slots?: Array<{ picked: string }> } | null;
    const picked = outcome?.slots
      ? `${outcome.slots.length} slot${outcome.slots.length === 1 ? "" : "s"}`
      : outcome?.picked ?? "—";
    return {
      kind: `draw.${row.kind}`,
      summary: `${row.kind.replace(/_/g, " ")}: ${picked}`,
      at: new Date(row.revealed_at),
      link: `/verify/draw/${row.id}`,
      group: "draw",
      tone: "default",
    };
  });
}

async function fetchNotifications(
  userId: string,
  limit: number,
  since: Date | undefined,
): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since.toISOString());
  const r = await query(
    `SELECT id, kind, title, link_url, read_at, created_at
       FROM notifications
      WHERE user_id = $1 ${sinceClause}
      ORDER BY created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `notice.${row.kind}`,
    summary: row.title,
    at: new Date(row.created_at),
    link: row.link_url ?? "/account/notifications",
    group: "notice",
    // The bell stays bright until the user silences it. Substrate-honest
    // about read state — read_at is NULL until the user actually looked.
    tone: row.read_at ? "default" : "sky",
  }));
}

async function fetchEmailsSent(
  userId: string,
  limit: number,
  since: Date | undefined,
): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND sent_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since.toISOString());
  const r = await query(
    `SELECT id, event, sent_at
       FROM email_queue
      WHERE user_id = $1 AND status = 'sent' AND sent_at IS NOT NULL ${sinceClause}
      ORDER BY sent_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `message.${row.event}`,
    summary: emailEventSummary(row.event),
    at: new Date(row.sent_at),
    link: "/account/emails",
    group: "message",
    tone: "default",
  }));
}

function emailEventSummary(event: string): string {
  // event values come from email_queue.event — vocabulary defined by
  // each handler in apps/storefront/src/lib/email/handlers/*.ts.
  switch (event) {
    case "vault_expiring_soon":   return "Email: vault item expiring soon";
    case "streak_at_risk":        return "Email: your streak is about to break";
    case "portfolio_price_alert": return "Email: portfolio price alert";
    case "wishlist_matched":      return "Email: a wishlisted card just listed";
    case "raffle_winner":         return "Email: you won a raffle";
    case "pull_resolved":         return "Email: bounty pull resolved";
    case "vault_redeemed":        return "Email: vault item shipped";
    case "vault_sold_back":       return "Email: vault sell-back confirmed";
    case "vault_expired":         return "Email: vault item auto-expired";
    default:                      return `Email: ${event.replace(/_/g, " ")}`;
  }
}
