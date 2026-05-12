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

  // The storefront's main card source for typeahead is the wholesale
  // catalog reached via the Falcon (S5). For the agent surface we keep
  // it simple and read the local card-cache shape — what the storefront
  // already has cached for non-typeahead reads. Falls back gracefully if
  // a table isn't available in dev.
  try {
    const r = await query(
      `SELECT sku, name, card_number, image_url, rarity
         FROM cards
        WHERE name ILIKE $1 OR sku ILIKE $1 OR card_number ILIKE $1
        ORDER BY name ASC
        LIMIT $2`,
      [`%${q}%`, limit],
    );
    return {
      query: q,
      results: r.rows.map((row: Record<string, unknown>) => ({
        sku: row.sku,
        name: row.name,
        card_number: row.card_number,
        image_url: row.image_url,
        rarity: row.rarity,
      })),
    };
  } catch (err) {
    console.error("[agents] catalog.search failed:", err);
    return { query: q, results: [], unavailable: true };
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
