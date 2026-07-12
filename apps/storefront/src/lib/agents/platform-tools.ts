/**
 * Read-only platform tools exposed through the MCP gate.
 *
 * Wave-7 of the agent surface. These tools let an agent read public,
 * non-money-touching state from the platform: card catalog, market
 * leaderboards, agent ladder. They are explicitly *read* tools — no
 * writes here, no money flow, no operator-bounded scope (an agent
 * reading the leaderboard learns the same thing any unauthenticated
 * visitor does).
 *
 * Substrate-honesty note: every result here is "live" — these queries
 * hit the database at request time. If the MCP gate ever caches
 * platform reads, the cache provenance should surface on the result.
 *
 * See docs/connections/the-agent-surface.md.
 */

import { query } from "@/lib/db";
import { ToolError } from "./play-tools";

// ── catalog.search ───────────────────────────────────────────────────

export async function catalogSearch(_actor: unknown, params: { q?: string; limit?: number }) {
  const q = (params.q ?? "").trim();
  if (q.length < 2) throw new ToolError("query must be at least 2 characters");
  const limit = Math.min(Math.max(1, params.limit ?? 20), 100);

  // Serve from the LOCAL catalog (card_set_cards) — the same table the
  // /market surfaces read. The previous implementation queried a `cards`
  // table that doesn't exist in dev (and relied on the wholesale layer,
  // which 401s locally), so every search silently returned
  // {results:[], unavailable:true} even for cards plainly in the catalog
  // ("Luffy"). This works whenever the storefront DB does; on the rare
  // failure it degrades HONESTLY — a named reason + a fallback pointer,
  // never a bare empty result an agent would misread as "no such card".
  try {
    const r = await query(
      `SELECT c.sku, c.card_name AS name, c.card_number, c.image_url,
              c.rarity, s.set_name, s.game
         FROM card_set_cards c
         JOIN card_sets s ON s.set_code = c.set_code
        WHERE c.card_name ILIKE $1 OR c.sku ILIKE $1 OR c.card_number ILIKE $1
        ORDER BY c.card_name ASC
        LIMIT $2`,
      [`%${q}%`, limit],
    );
    return {
      query: q,
      source: "card_set_cards (local catalog, live)",
      results: r.rows.map((row: Record<string, unknown>) => ({
        sku: row.sku,
        name: row.name,
        card_number: row.card_number,
        image_url: null,
        rarity: row.rarity,
        set_name: row.set_name,
        game: row.game,
      })),
    };
  } catch (err) {
    console.error("[agents] catalog.search failed:", err);
    // Honest degradation: distinguish "source down" from "no matches" so
    // an agent doesn't conclude the catalog is empty.
    return {
      query: q,
      results: [],
      unavailable: true,
      reason:
        "The local card catalog (card_set_cards) is temporarily unreachable — this is a source outage, not an empty catalog.",
      fallback: "Retry shortly, or GET /api/v1/search/cards?q=<query>.",
    };
  }
}

// ── leaderboards.read ────────────────────────────────────────────────

export async function leaderboardsRead(_actor: unknown, params: { kind?: string; limit?: number }) {
  const kind = (params.kind ?? "agents").toLowerCase();
  const limit = Math.min(Math.max(1, params.limit ?? 20), 100);

  if (kind === "agents") {
    const r = await query(
      `SELECT public_handle, display_name, model_tag,
              rating, rating_deviation, matches_played, matches_won
         FROM agents
        WHERE status = 'active' AND matches_played > 0
        ORDER BY rating DESC, rating_deviation ASC
        LIMIT $1`,
      [limit],
    );
    return {
      kind: "agents",
      rows: r.rows.map((row: Record<string, unknown>) => ({
        public_handle: row.public_handle,
        display_name: row.display_name,
        model_tag: row.model_tag,
        rating: Number(row.rating),
        rating_deviation: Number(row.rating_deviation),
        matches_played: row.matches_played,
        matches_won: row.matches_won,
      })),
    };
  }

  throw new ToolError(`unknown leaderboard kind: ${kind} (try "agents")`);
}

// ── prices.recent ────────────────────────────────────────────────────

export async function pricesRecent(
  _actor: unknown,
  params: { sku?: string; days?: number },
) {
  const sku = (params.sku ?? "").trim();
  if (!sku) throw new ToolError("sku required");
  const days = Math.min(Math.max(1, params.days ?? 7), 90);

  try {
    const r = await query(
      `SELECT observed_at, retail_gbp
         FROM card_price_observations
        WHERE sku = $1 AND observed_at > NOW() - ($2::int || ' days')::interval
        ORDER BY observed_at ASC`,
      [sku, days],
    );
    return {
      sku,
      days,
      observations: r.rows.map((row: Record<string, unknown>) => ({
        at: row.observed_at,
        retail_gbp: row.retail_gbp != null ? Number(row.retail_gbp) : null,
      })),
    };
  } catch (err) {
    console.error("[agents] prices.recent failed:", err);
    return { sku, days, observations: [], unavailable: true };
  }
}
