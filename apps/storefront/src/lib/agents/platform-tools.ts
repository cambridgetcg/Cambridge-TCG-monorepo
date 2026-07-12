/**
 * Read-only platform tools exposed through the MCP gate.
 *
 * Wave-7 of the agent surface. Only data with an affirmative publication
 * basis may cross this gate. A bearer token authenticates an agent; it is
 * not a source licence. Catalog search and imported price history therefore
 * return static paused boundaries without touching the database.
 *
 * Substrate-honesty note: affirmative tools may query live first-party
 * state. Paused source-rights tools are static and explicitly report
 * queried:false. Any future cache must surface its provenance.
 *
 * See docs/connections/the-agent-surface.md.
 */

import { query } from "@/lib/db";
import { ToolError } from "./play-tools";

// ── catalog.search ───────────────────────────────────────────────────

export async function catalogSearch(_actor: unknown, params: { q?: string; limit?: number }) {
  void params;
  return {
    error: {
      code: "CATALOG_SEARCH_PAUSED",
      message:
        "Agent authentication is not source permission. Catalog search is paused pending affirmative public membership and display-field rights.",
    },
    queried: false,
    accepted: false,
    catalog_membership_asserted: false,
    results: [],
    results_complete: false,
  };
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
  void params;
  return {
    error: {
      code: "IMPORTED_PRICE_HISTORY_PAUSED",
      message:
        "Agent authentication is not source permission. Imported observation history is paused pending an approved redistribution agreement.",
    },
    queried: false,
    accepted: false,
    catalog_membership_asserted: false,
    observations: [],
    observations_complete: false,
    alternative: "/api/v1/sold-comps",
  };
}
