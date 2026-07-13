/**
 * Dormant agent deck writes — retained for review behind a closed gate.
 *
 * No current key can invoke deck.save. The implementation remains here so
 * exact entry validation and complete agent attribution can be finished and
 * reviewed before the gate is reopened. Money-adjacent surfaces remain
 * excluded.
 *
 * The dormant implementation prefixes a deck name with the agent handle,
 * because user_decks has no agent column. That is not yet complete
 * attribution and is one reason the write remains paused.
 */

import { query } from "@/lib/db";
import { ToolError } from "./play-tools";
import type { AgentActor } from "./auth";

export const AGENT_DECK_WRITES_ENABLED = false as const;

// ── deck.save ─────────────────────────────────────────────────────────

interface DeckEntry {
  sku: string;
  quantity: number;
  card?: Record<string, unknown>;
}

export async function deckSave(
  actor: AgentActor,
  params: { name?: string; entries?: DeckEntry[]; leader_sku?: string; notes?: string },
) {
  if (!AGENT_DECK_WRITES_ENABLED) {
    throw new ToolError(
      "Agent deck writes are paused for every key until exact entry validation and complete agent attribution ship together.",
      503,
    );
  }
  const name = (params.name ?? "").trim();
  if (!name) throw new ToolError("name required");
  if (name.length > 80) throw new ToolError("name too long (max 80)");
  if (!Array.isArray(params.entries)) throw new ToolError("entries required");
  if (params.entries.length === 0) throw new ToolError("deck must have at least one card");

  // Substrate-honest naming: the deck list belongs to the operator-user.
  // Prefix the name with the agent handle so the operator can see who
  // saved it when scanning their /account/decks page.
  const decoratedName = `agent:${actor.agentPublicHandle} · ${name}`.slice(0, 120);
  // Slug: lowercased decoratedName + 6 random chars, capped at 100.
  const base = decoratedName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 93);
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${base}-${suffix}`;

  const entries = params.entries.map((e) => ({
    sku: String(e.sku),
    quantity: Math.max(1, Math.min(4, Number(e.quantity) || 1)),
    card: e.card ?? null,
  }));

  try {
    const r = await query(
      `INSERT INTO user_decks (user_id, slug, name, leader_sku, entries, notes, tags)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, ARRAY['agent']::text[])
       ON CONFLICT (user_id, name) DO UPDATE
            SET entries = EXCLUDED.entries,
                leader_sku = EXCLUDED.leader_sku,
                notes = EXCLUDED.notes,
                updated_at = NOW()
         RETURNING id, slug, name, created_at, updated_at`,
      [
        actor.operatorUserId,
        slug,
        decoratedName,
        params.leader_sku ?? null,
        JSON.stringify(entries),
        params.notes ?? null,
      ],
    );
    const row = r.rows[0];
    return {
      ok: true,
      deck_id: row.id,
      slug: row.slug,
      name: row.name,
      entries_count: entries.length,
      operator_bound: actor.registeredVia === "operator",
    };
  } catch (err) {
    console.error("[agents] deck.save failed:", err);
    throw new ToolError("failed to save deck");
  }
}

// ── deck.list_mine ───────────────────────────────────────────────────
// Read the agent's saved decks (rows where the deck name carries the
// agent's handle prefix). Read tool, but lives here next to its writer.

export async function deckListMine(actor: AgentActor, _params: Record<string, unknown>) {
  const prefix = `agent:${actor.agentPublicHandle} · `;
  const r = await query(
    `SELECT id, slug, name, leader_sku, jsonb_array_length(entries) AS entry_count,
            created_at, updated_at
       FROM user_decks
      WHERE user_id = $1 AND name LIKE $2
      ORDER BY updated_at DESC
      LIMIT 50`,
    [actor.operatorUserId, `${prefix}%`],
  );
  return {
    decks: r.rows.map((row: Record<string, unknown>) => ({
      deck_id: row.id,
      slug: row.slug,
      name: String(row.name).slice(prefix.length),
      leader_sku: row.leader_sku,
      entry_count: row.entry_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  };
}
