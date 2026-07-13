/**
 * Read-only platform tools exposed through the MCP gate.
 *
 * Wave-7 of the agent surface. These are read or publication-status tools.
 * Catalog search, recent prices, and the agent ladder stop at policy status
 * and return zero rows; authentication does not reopen them.
 *
 * Source-rights and participant-publication gates return policy status before
 * any database read. Bearer authentication does not reopen publication.
 *
 * See docs/connections/the-agent-surface.md.
 */

import { ToolError } from "./play-tools";

// ── catalog.search ───────────────────────────────────────────────────

export async function catalogSearch(_actor: unknown, params: { q?: string; limit?: number }) {
  const q = (params.q ?? "").trim();
  if (q.length < 2) throw new ToolError("query must be at least 2 characters");

  // A two-character wildcard tool can enumerate the same fields whose bulk
  // publication is paused. NOASSERTION warns about reuse but does not itself
  // grant Cambridge publication permission, so stop before the database.
  return {
    query: q,
    publication_status: "paused_pending_field_level_rights",
    available: false,
    sources: ["catalog-publication-policy"],
    source_license: ["cc0"],
    license: "NOASSERTION",
    results: [],
    reason:
      "Catalog search is paused until field-level lineage and a non-enumerating publication rule are reviewed.",
  };
}

// ── leaderboards.read ────────────────────────────────────────────────

export async function leaderboardsRead(_actor: unknown, params: { kind?: string; limit?: number }) {
  const kind = (params.kind ?? "agents").toLowerCase();

  if (kind === "agents") {
    // Authentication lets a caller invoke the tool; it is not consent to
    // publish registration data.
    // Stop before the database until the ladder has a versioned publication
    // receipt covering its participant-supplied handles.
    return {
      kind: "agents",
      publication_status: "paused_pending_publication_receipt",
      available: false,
      rows: [],
      reason: "The agent ladder is not published until a versioned participant publication receipt exists.",
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

  // A bearer key controls tool access; it does not grant source acquisition or
  // price-publication rights. Stop before the database so the MCP surface
  // cannot become an authenticated side door around the publication pause.
  return {
    publication_status: "paused_pending_source_rights",
    available: false,
    reason: "Recent price observations are not published while source rights are unresolved.",
  };
}
