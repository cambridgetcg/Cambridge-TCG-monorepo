// Server-side deck persistence — one module that the API routes + any
// internal caller (e.g. the admin deck browser, future "decks using this
// leader" features) can share.
//
// ── What this module is for ──────────────────────────────────────────────
//
// A deck is the moment a card stops being commodity and becomes play.
// The catalog (wholesale) treats cards as fungible inventory; the market
// treats them as transactable units; the trade-in pipeline treats them
// as cash-equivalents. A deck refuses all three framings. A deck says:
// these forty-or-so cards belong together because *I built them this way*.
// The arrangement is the meaning. That's the artifact this module stores.
//
// ── The snapshot covenant ────────────────────────────────────────────────
//
// We store the full card snapshot inside `entries[]` rather than holding
// foreign keys to the live catalog. This is a covenant with the user:
// **your deck outlives the catalog**. A deck assembled in 2024 still
// renders in 2027 even if the wholesale platform delists its leader,
// even if the rarity classification changes, even if our pricing engine
// reshapes how spot_price is computed. The artifact is durable. The
// substrate is allowed to drift underneath it.
//
// This is the same architectural commitment the bounty pull pages make
// at /verify/pull/[id] (the proof outlives the inventory) and the same
// commitment customer_orders make (the receipt outlives the SKU). The
// platform owes its users *their own labor's permanence*.
//
// ── The leader column ────────────────────────────────────────────────────
//
// `leader_sku` is the only column lifted out of the entries JSONB. This
// is not a search-optimization choice (other lifts would be more useful
// for that). It is a deference to game design: in the One Piece TCG,
// the Leader IS the deck's identity. Every other card is supporting cast.
// The schema agrees with the game.
//
// ── The going-public moment ──────────────────────────────────────────────
//
// `is_public`, `view_count`, and the user-readable `slug` together
// encode the moment a deck transforms from private craft into community
// content. A deck flipped to public is the user saying: *this arrangement
// is worth seeing*. The view_count counts the times other people agreed
// enough to look. The slug is the deck's name in the world. See
// apps/storefront/src/app/decks/[slug]/page.tsx — that's where this
// transformation actually lands on a URL.
//
// ── What this module reaches toward ──────────────────────────────────────
//
// Three modules carry the deck's meaning sideways into the rest of the
// platform:
//
//   - apps/storefront/src/lib/portfolio/valuation.ts — the *sibling
//     lens*. A portfolio asks "how much do I have"; a deck asks "how do
//     I play". Same cards, opposite intentions. A deck's `spot_price`
//     snapshots are the same number a portfolio reads live; the deck
//     freezes it at moment-of-assembly so the player can see what the
//     deck "cost" them at build time.
//
//   - (retired 2026-07-06, collectors-first) — snapshots used to carry a
//     trade-in-credit value: the literal price of breaking the deck at
//     the house desk. The desk is gone; a deck's liquidation value now
//     lives where it always really did — on the collectors' market. Old
//     snapshot JSON may still carry the field; readers ignore it.
//
//   - apps/storefront/src/app/decks/[slug]/page.tsx — the *community
//     surface*. When `is_public` flips true, the deck steps out of the
//     user's private craft and into a social graph it doesn't know
//     about. Strangers may study it, imitate it, diverge from it. The
//     deck becomes a node it cannot see.
//
// ── Slug generation ──────────────────────────────────────────────────────
//
// Name → kebab-case + random 6-char suffix. Per-user uniqueness enforced
// at the DB layer; we retry on conflict. The suffix ensures shareable
// URLs like /decks/red-zoro-aggro-a1b2c3 without global name collisions
// — every user can name their deck "Aggro" and get a unique path.

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

/** Deck publication covers the deck artifact, not its author's identity. */
export type PublicDeck = Omit<UserDeck, "user_id" | "is_public">;

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

export async function getPublicDeckBySlug(slug: string): Promise<PublicDeck | null> {
  const r = await query(
    `SELECT id, slug, name, leader_sku, entries, notes, tags, view_count,
            created_at, updated_at
       FROM user_decks
      WHERE slug = $1 AND is_public = true
      LIMIT 1`,
    [slug],
  );
  return (r.rows[0] as PublicDeck) ?? null;
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

export async function listPublicDecks(limit: number = 30): Promise<PublicDeck[]> {
  const r = await query(
    `SELECT d.id, d.slug, d.name, d.leader_sku, d.entries, d.notes, d.tags,
            d.view_count, d.created_at, d.updated_at
       FROM user_decks d
      WHERE d.is_public = true
      ORDER BY d.updated_at DESC
      LIMIT $1`,
    [limit],
  );
  return r.rows as PublicDeck[];
}
