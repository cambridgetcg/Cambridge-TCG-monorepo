/**
 * Narrow agent writes — wave-8 of the agent surface.
 *
 * Writes are explicitly whitelisted per the four covenants (bounded
 * scope). Each tool here writes on behalf of the agent's operator-user
 * and writes nothing the operator couldn't write themselves. Money-
 * adjacent surfaces remain excluded.
 *
 * Substrate honesty: every row created here is tagged with the agent
 * id where the schema supports it; for user_decks (no agent column
 * yet), the deck name is prefixed `agent:<handle> · <name>` so a human
 * scanning their deck list can tell which decks an agent saved on
 * their behalf.
 */

import { query } from "@/lib/db";
import { ToolError } from "./play-tools";
import type { AgentActor } from "./auth";

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
      saved_for_user_id: actor.operatorUserId,
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
