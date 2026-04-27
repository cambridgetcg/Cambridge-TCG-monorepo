// Server-side deck persistence — one module that the API routes + any
// internal caller (e.g. the admin deck browser, future "decks using this
// leader" features) can share.
//
// Deck storage shape:
//   - leader_sku is a string, not an object — the full card snapshot lives
//     inside entries[] keyed by sku for the leader too. This keeps the JSON
//     payload small and the row searchable by leader.
//   - entries JSONB is the full { sku, quantity, card } array; storing the
//     card snapshot means the deck renders even if the wholesale catalog
//     drops a SKU next year.
//
// Slug generation: name → kebab-case + random 6-char suffix. Per-user
// uniqueness enforced at the DB layer; we retry on conflict.

import { query } from "@/lib/db";
import crypto from "crypto";

export interface DeckCardSnapshot {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
  tradein_credit: number | null;
}

export interface DeckEntry {
  sku: string;
  quantity: number;
  card: DeckCardSnapshot;
}

export interface UserDeck {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  leader_sku: string | null;
  entries: DeckEntry[];
  notes: string | null;
  tags: string[];
  is_public: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

// ── helpers ──────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "deck";
}

function shortId(): string {
  return crypto.randomBytes(3).toString("hex"); // 6 hex chars
}

async function uniqueSlugForUser(userId: string, base: string): Promise<string> {
  // Retry up to 5 times with fresh suffixes; conflicts are extremely rare.
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${shortId()}`;
    const exists = await query(
      `SELECT 1 FROM user_decks WHERE user_id = $1 AND slug = $2 LIMIT 1`,
      [userId, candidate],
    );
    if (exists.rowCount === 0) return candidate;
  }
  // Final fallback — timestamp suffix is guaranteed unique-per-second.
  return `${base}-${Date.now().toString(36)}`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────

export async function listUserDecks(userId: string): Promise<UserDeck[]> {
  const r = await query(
    `SELECT * FROM user_decks WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows as UserDeck[];
}

export async function getUserDeck(userId: string, idOrSlug: string): Promise<UserDeck | null> {
  // Accept both UUID id and slug for convenience.
  const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const col = byId ? "id" : "slug";
  const r = await query(
    `SELECT * FROM user_decks WHERE user_id = $1 AND ${col} = $2`,
    [userId, idOrSlug],
  );
  return (r.rows[0] as UserDeck) ?? null;
}

export async function getPublicDeckBySlug(slug: string): Promise<UserDeck | null> {
  const r = await query(
    `SELECT * FROM user_decks WHERE slug = $1 AND is_public = true LIMIT 1`,
    [slug],
  );
  return (r.rows[0] as UserDeck) ?? null;
}

export interface SaveDeckArgs {
  userId: string;
  /** If provided, update the matching deck. Otherwise create. */
  existingId?: string;
  name: string;
  leaderSku: string | null;
  entries: DeckEntry[];
  notes?: string | null;
  tags?: string[];
  isPublic?: boolean;
}

export async function saveDeck(args: SaveDeckArgs): Promise<UserDeck> {
  if (args.existingId) {
    const r = await query(
      `UPDATE user_decks SET
         name = $2,
         leader_sku = $3,
         entries = $4::jsonb,
         notes = $5,
         tags = $6,
         is_public = COALESCE($7, is_public),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $8
       RETURNING *`,
      [
        args.existingId,
        args.name,
        args.leaderSku,
        JSON.stringify(args.entries),
        args.notes ?? null,
        args.tags ?? [],
        args.isPublic ?? null,
        args.userId,
      ],
    );
    if (r.rowCount === 0) {
      throw new Error("Deck not found or not owned by user.");
    }
    return r.rows[0] as UserDeck;
  }

  // Fresh insert. If the user already has a deck with this name, prefer
  // update-by-name to mirror the legacy localStorage behaviour (save
  // overwrites by name).
  const existingByName = await query(
    `SELECT id FROM user_decks WHERE user_id = $1 AND name = $2 LIMIT 1`,
    [args.userId, args.name],
  );
  if (existingByName.rowCount && existingByName.rowCount > 0) {
    return saveDeck({ ...args, existingId: existingByName.rows[0].id });
  }

  const slug = await uniqueSlugForUser(args.userId, slugify(args.name));
  const r = await query(
    `INSERT INTO user_decks
       (user_id, slug, name, leader_sku, entries, notes, tags, is_public)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     RETURNING *`,
    [
      args.userId,
      slug,
      args.name,
      args.leaderSku,
      JSON.stringify(args.entries),
      args.notes ?? null,
      args.tags ?? [],
      args.isPublic ?? false,
    ],
  );
  return r.rows[0] as UserDeck;
}

export async function deleteDeck(userId: string, idOrSlug: string): Promise<boolean> {
  const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const col = byId ? "id" : "slug";
  const r = await query(
    `DELETE FROM user_decks WHERE user_id = $1 AND ${col} = $2`,
    [userId, idOrSlug],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function incrementViewCount(slug: string): Promise<void> {
  await query(
    `UPDATE user_decks SET view_count = view_count + 1 WHERE slug = $1 AND is_public = true`,
    [slug],
  );
}

export async function listPublicDecks(limit: number = 30): Promise<Array<UserDeck & { user_name: string | null }>> {
  const r = await query(
    `SELECT d.*, u.name AS user_name
     FROM user_decks d JOIN users u ON u.id = d.user_id
     WHERE d.is_public = true
     ORDER BY d.updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return r.rows as Array<UserDeck & { user_name: string | null }>;
}
