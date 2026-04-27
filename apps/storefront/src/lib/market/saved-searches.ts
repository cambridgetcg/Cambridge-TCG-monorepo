// Saved searches / criteria-based stock alerts.
//
// The cron sweep (runSavedSearchSweep) iterates active searches in
// FIFO order of last_scanned_at, builds a SQL predicate from each
// search's JSONB query, runs it against new asks (orders.created_at
// > search.last_scanned_at), inserts new matches into
// saved_search_matches (UNIQUE-dedup), and fires search.match
// notifications. last_scanned_at advances atomically per-search so
// a partial failure can't drop matches.
//
// Discriminated-union returns mirror the offers/returns libs.

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { formatPrice } from "@/lib/format";
import { logSavedSearchTransition } from "./saved-search-lifecycle-log";

export type SavedSearchStatus = "active" | "paused" | "expired" | "archived";

export interface SavedSearchQuery {
  text?: string;            // substring match on card_name | sku
  set_codes?: string[];     // OR'd
  conditions?: string[];    // OR'd over orders.condition
  max_price?: number;
  min_price?: number;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  query: SavedSearchQuery;
  status: SavedSearchStatus;
  last_scanned_at: string | null;
  last_match_at: string | null;
  match_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface SavedSearchMatch {
  id: string;
  search_id: string;
  order_id: string;
  matched_at: string;
  matched_price: string;
  // Joined for the recent-matches gallery
  card_name?: string | null;
  sku?: string;
  current_status?: string;
  seller_username?: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_PER_USER = 25;     // Soft cap so the sweep doesn't blow up
const MAX_TEXT_LEN = 80;

// ── Validate the JSONB query shape ──
//
// Returns the cleaned query or an error string. Strict here means a
// junk-query insert is rejected before it can poison the sweep.
function validateQuery(input: unknown): { ok: true; value: SavedSearchQuery } | { ok: false; reason: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "Query must be an object." };
  }
  const q = input as Record<string, unknown>;
  const out: SavedSearchQuery = {};

  if (q.text !== undefined) {
    if (typeof q.text !== "string" || q.text.trim().length === 0) {
      return { ok: false, reason: "text must be a non-empty string." };
    }
    if (q.text.length > MAX_TEXT_LEN) {
      return { ok: false, reason: `text must be ≤ ${MAX_TEXT_LEN} chars.` };
    }
    out.text = q.text.trim();
  }

  if (q.set_codes !== undefined) {
    if (!Array.isArray(q.set_codes) || q.set_codes.some((s) => typeof s !== "string")) {
      return { ok: false, reason: "set_codes must be string[]." };
    }
    out.set_codes = (q.set_codes as string[]).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);
  }

  if (q.conditions !== undefined) {
    if (!Array.isArray(q.conditions) || q.conditions.some((s) => typeof s !== "string")) {
      return { ok: false, reason: "conditions must be string[]." };
    }
    out.conditions = (q.conditions as string[]).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 8);
  }

  for (const k of ["max_price", "min_price"] as const) {
    if (q[k] !== undefined) {
      const n = q[k];
      if (typeof n !== "number" || !isFinite(n) || n < 0) {
        return { ok: false, reason: `${k} must be a non-negative number.` };
      }
      out[k] = n;
    }
  }
  if (out.max_price !== undefined && out.min_price !== undefined && out.min_price > out.max_price) {
    return { ok: false, reason: "min_price must be ≤ max_price." };
  }

  // At least one criterion required — empty query would match everything.
  const hasAny =
    out.text !== undefined ||
    (out.set_codes && out.set_codes.length > 0) ||
    (out.conditions && out.conditions.length > 0) ||
    out.max_price !== undefined ||
    out.min_price !== undefined;
  if (!hasAny) {
    return { ok: false, reason: "Search must include at least one criterion." };
  }
  return { ok: true, value: out };
}

// ── Build the SQL predicate for a search query ──
//
// Returns ($-numbered fragment, params) the caller composes into a
// larger SELECT. Pure builder — no DB access.
function buildPredicate(q: SavedSearchQuery, startIdx: number): { fragment: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = startIdx;

  if (q.text) {
    parts.push(`(o.card_name ILIKE $${i} OR o.sku ILIKE $${i})`);
    params.push(`%${q.text}%`);
    i++;
  }
  if (q.set_codes && q.set_codes.length > 0) {
    parts.push(`o.set_code = ANY($${i}::text[])`);
    params.push(q.set_codes);
    i++;
  }
  if (q.conditions && q.conditions.length > 0) {
    parts.push(`o.condition = ANY($${i}::text[])`);
    params.push(q.conditions);
    i++;
  }
  if (q.max_price !== undefined) {
    parts.push(`o.price <= $${i}`);
    params.push(q.max_price);
    i++;
  }
  if (q.min_price !== undefined) {
    parts.push(`o.price >= $${i}`);
    params.push(q.min_price);
    i++;
  }
  return { fragment: parts.join(" AND "), params };
}

// ── Create / update a search ──

export async function createSearch(input: {
  userId: string;
  name: string;
  query: unknown;
}): Promise<Result<SavedSearch>> {
  const trimmedName = input.name?.trim();
  if (!trimmedName || trimmedName.length > 80) {
    return { ok: false, reason: "Name must be 1-80 characters.", status: 400 };
  }
  const v = validateQuery(input.query);
  if (!v.ok) return { ok: false, reason: v.reason, status: 400 };

  // Per-user soft cap. Active + paused searches count; archived
  // doesn't (user closed it). Expired counts (clutter).
  const count = await query(
    `SELECT COUNT(*)::int AS n FROM saved_searches
      WHERE user_id = $1 AND status IN ('active', 'paused', 'expired')`,
    [input.userId],
  );
  if (count.rows[0].n >= MAX_PER_USER) {
    return {
      ok: false,
      reason: `Limit of ${MAX_PER_USER} saved searches reached. Archive an old one to make room.`,
      status: 429,
    };
  }

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const r = await query(
    `INSERT INTO saved_searches (user_id, name, query, expires_at)
     VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
    [input.userId, trimmedName, JSON.stringify(v.value), expiresAt],
  );
  const search = r.rows[0] as SavedSearch;

  void logSavedSearchTransition({
    searchId: search.id,
    action: "created",
    actorId: input.userId,
    actorLabel: "user",
    reason: `Created search "${trimmedName}"`,
    metadata: { expires_at: expiresAt, query: v.value as Record<string, unknown> },
  });

  return { ok: true, value: search };
}

// ── Pause / resume / archive / extend ──

async function transition(
  searchId: string, userId: string,
  predicate: (s: SavedSearch) => string | null,
  setSql: string,
  action: "paused" | "resumed" | "archived" | "extended",
  params: unknown[] = [],
  metadata?: Record<string, unknown>,
): Promise<Result<SavedSearch>> {
  const r = await query(`SELECT * FROM saved_searches WHERE id = $1`, [searchId]);
  if (r.rows.length === 0) return { ok: false, reason: "Search not found.", status: 404 };
  const s = r.rows[0] as SavedSearch;
  if (s.user_id !== userId) return { ok: false, reason: "Not your search.", status: 403 };
  const denial = predicate(s);
  if (denial) return { ok: false, reason: denial, status: 409 };

  const u = await query(
    `UPDATE saved_searches SET ${setSql}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [searchId, ...params],
  );
  const updated = u.rows[0] as SavedSearch;

  void logSavedSearchTransition({
    searchId,
    action,
    actorId: userId,
    actorLabel: "user",
    reason: `Search "${s.name}" ${action}`,
    metadata: { previous_status: s.status, ...(metadata ?? {}) },
  });

  return { ok: true, value: updated };
}

export async function pauseSearch(searchId: string, userId: string) {
  return transition(searchId, userId,
    (s) => s.status === "active" ? null : `Search is ${s.status} — can't pause.`,
    `status = 'paused'`, "paused");
}

export async function resumeSearch(searchId: string, userId: string) {
  return transition(searchId, userId,
    (s) => s.status === "paused" ? null : `Search is ${s.status} — can't resume.`,
    `status = 'active'`, "resumed");
}

export async function archiveSearch(searchId: string, userId: string) {
  return transition(searchId, userId,
    (s) => s.status !== "archived" ? null : "Already archived.",
    `status = 'archived'`, "archived");
}

// Bumps expires_at by another 90 days. Active or paused searches only;
// archived is terminal. Expired can be extended (resurrects to active).
export async function extendSearch(searchId: string, userId: string) {
  const newExpiry = new Date(Date.now() + TTL_MS).toISOString();
  return transition(searchId, userId,
    (s) => s.status === "archived" ? "Archived searches can't be extended." : null,
    `expires_at = $2, status = CASE WHEN status = 'expired' THEN 'active' ELSE status END`,
    "extended",
    [newExpiry],
    { new_expires_at: newExpiry });
}

// ── List queries ──

export async function listSearches(userId: string): Promise<SavedSearch[]> {
  const r = await query(
    `SELECT * FROM saved_searches
      WHERE user_id = $1 AND status != 'archived'
      ORDER BY status = 'active' DESC, created_at DESC`,
    [userId],
  );
  return r.rows as SavedSearch[];
}

export async function getSearch(searchId: string, userId: string): Promise<SavedSearch | null> {
  const r = await query(
    `SELECT * FROM saved_searches WHERE id = $1 AND user_id = $2`,
    [searchId, userId],
  );
  return (r.rows[0] as SavedSearch) ?? null;
}

export async function listMatchesForSearch(
  searchId: string, userId: string, limit = 20,
): Promise<SavedSearchMatch[]> {
  // Verify ownership before returning matches.
  const own = await query(
    `SELECT 1 FROM saved_searches WHERE id = $1 AND user_id = $2`,
    [searchId, userId],
  );
  if (own.rows.length === 0) return [];
  const r = await query(
    `SELECT m.*, o.card_name, o.sku, o.status AS current_status,
            u.username AS seller_username
       FROM saved_search_matches m
       JOIN market_orders o ON o.id = m.order_id
       LEFT JOIN users u ON u.id = o.user_id
      WHERE m.search_id = $1
      ORDER BY m.matched_at DESC LIMIT $2`,
    [searchId, Math.min(limit, 100)],
  );
  return r.rows as SavedSearchMatch[];
}

// ── The sweep ──
//
// Cron entry. Iterates active searches NULLS-FIRST so brand-new
// searches get a first scan immediately rather than waiting their
// turn behind older ones. For each search:
//   1. Compute the cutoff (last_scanned_at OR created_at)
//   2. Build the predicate from query
//   3. Find ANY ask placed since cutoff that matches the predicate
//      AND is still 'open' (don't notify on already-filled asks)
//      AND is not the user's own ask (no buying yourself)
//   4. INSERT matches with ON CONFLICT DO NOTHING (UNIQUE dedup)
//   5. For genuinely new rows (RETURNING), fire notify()
//   6. Advance last_scanned_at + last_match_at + match_count
//
// MAX_PER_RUN throttles each cron tick so a backlog doesn't burn
// budget. The sweep is idempotent on re-run thanks to UNIQUE dedup.

const MAX_PER_RUN = 200;

export async function runSavedSearchSweep(): Promise<{
  scanned: number;
  matched: number;
  notified: number;
}> {
  // First — TTL expiry. Mark expired any active row past expires_at.
  // RETURNING so we can write a lifecycle row per expired search.
  const expired = await query(
    `UPDATE saved_searches
        SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND expires_at < NOW()
      RETURNING id, name`,
  );
  for (const row of expired.rows) {
    void logSavedSearchTransition({
      searchId: row.id,
      action: "expired",
      actorLabel: "system:search-sweep",
      reason: `Search "${row.name}" reached its 90-day TTL`,
    });
  }

  let scanned = 0;
  let matched = 0;
  let notified = 0;

  const candidates = await query(
    `SELECT id, user_id, query, last_scanned_at, created_at, name, match_count
       FROM saved_searches
      WHERE status = 'active'
      ORDER BY last_scanned_at NULLS FIRST
      LIMIT $1`,
    [MAX_PER_RUN],
  );

  for (const s of candidates.rows) {
    scanned++;
    const cutoff = s.last_scanned_at ?? s.created_at;
    const sweepStartedAt = new Date().toISOString();
    const q = s.query as SavedSearchQuery;

    const pred = buildPredicate(q, 4);  // we use $1=user_id, $2=cutoff, $3=search_id below
    if (!pred.fragment) {
      // Empty predicate (shouldn't happen — validateQuery requires a
      // criterion) — skip but advance cursor so we don't loop on it.
      await query(
        `UPDATE saved_searches SET last_scanned_at = $2, updated_at = NOW() WHERE id = $1`,
        [s.id, sweepStartedAt]);
      continue;
    }

    const found = await query(
      `INSERT INTO saved_search_matches (search_id, order_id, matched_price)
       SELECT $3::uuid, o.id, o.price
         FROM market_orders o
        WHERE o.side = 'ask'
          AND o.status IN ('open', 'partially_filled')
          AND o.user_id != $1
          AND o.created_at > $2
          AND ${pred.fragment}
        LIMIT 25
       ON CONFLICT (search_id, order_id) DO NOTHING
       RETURNING id, order_id, matched_price`,
      [s.user_id, cutoff, s.id, ...pred.params],
    );

    matched += found.rows.length;

    // Fire one notification per genuinely new match. Card-name is
    // looked up alongside in case the seller's listing didn't have
    // one (rare — most listings do via the wholesale enrichment).
    for (const row of found.rows) {
      const meta = await query(
        `SELECT card_name, sku FROM market_orders WHERE id = $1`,
        [row.order_id],
      );
      const label = meta.rows[0]?.card_name || meta.rows[0]?.sku || "match";
      await notify({
        userId: s.user_id,
        kind: "search.match",
        title: `New match on "${s.name}": ${label}`,
        body: `Asking ${formatPrice(parseFloat(row.matched_price))}. View it from your saved search.`,
        linkUrl: "/account/searches",
        referenceType: "saved_search_match",
        referenceId: `${s.id}:${row.order_id}`,
      });
      void logSavedSearchTransition({
        searchId: s.id,
        action: "matched_notified",
        actorLabel: "system:search-sweep",
        reason: `Notified ${label} match`,
        metadata: {
          order_id: row.order_id,
          matched_price: row.matched_price,
          label,
        },
      });
      notified++;
    }

    // Advance the cursor + counters atomically. last_match_at /
    // match_count only update if we actually matched something.
    await query(
      `UPDATE saved_searches
          SET last_scanned_at = $2,
              last_match_at = CASE WHEN $3::int > 0 THEN NOW() ELSE last_match_at END,
              match_count = match_count + $3::int,
              updated_at = NOW()
        WHERE id = $1`,
      [s.id, sweepStartedAt, found.rows.length],
    );
  }

  return { scanned, matched, notified };
}
