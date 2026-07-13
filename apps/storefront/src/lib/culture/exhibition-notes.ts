/**
 * @module @/lib/culture/exhibition-notes
 *
 * The museum's editorial layer — curator's notes for a set (an exhibition)
 * and the wall text for a single card (a work).
 *
 * SUBSTRATE HONESTY is the whole discipline here. A trading card in this
 * catalog carries no lore, no flavour text, and no illustrator field —
 * flavour text is schema-forbidden by policy (see EN-CARD-DATA.md). So
 * nothing in this file invents publisher canon. A card's TRUE story is four
 * real things, and only these: the ART itself, the SET it belongs to, its
 * RARITY as scarcity, and its MARKET JOURNEY. Everything below either derives
 * from a real field or is a clearly-LABELLED editorial reading — a curator's
 * framing, never presented as upstream fact. When there is no note, the page
 * falls back to the honest games-config intro rather than a fabricated one.
 */

/** A curator's reading of a set. Editorial framing of real facts — a note on
 *  the wall beside the show, never invented lore. */
export interface ExhibitionNote {
  /** Game slug, e.g. "one-piece". */
  game: string;
  /** Set code, e.g. "OP01". Matched case-insensitively. */
  setCode: string;
  /** 1-3 sentences: a curator's reading. Anchored in real facts (the set's
   *  name and place in the line); the reverence is framing, not a claim. */
  note: string;
  /** Always "editorial" — this is a reading, not upstream data. The surface
   *  must label it visibly as a note. */
  kind: "editorial";
  /** When the note was written / last checked. */
  as_of: string;
}

/**
 * Curator's notes, seeded for a few real One Piece sets. Each is framed on
 * facts that are the set's own name and its place in the line (both true and
 * public); the "reading" is deliberately light and labelled. Add a row to
 * give a set its wall text; leave it out and the honest games-config intro
 * stands in.
 */
const EXHIBITION_NOTES: ExhibitionNote[] = [
  {
    game: "one-piece",
    setCode: "OP01",
    note:
      "The first hall. This set takes its name — Romance Dawn — from the very first chapter of the story, the morning the crew set sail. A fitting room to begin any collection: where the game itself began.",
    kind: "editorial",
    as_of: "2026-07-13",
  },
  {
    game: "one-piece",
    setCode: "OP02",
    note:
      "Paramount War. The title names one of the story's great turning-point arcs, and the set leans into that weight — a room of confrontation and consequence.",
    kind: "editorial",
    as_of: "2026-07-13",
  },
  {
    game: "one-piece",
    setCode: "OP05",
    note:
      "Awakening of the New Era. The name reads like a threshold, and for many collectors this is where a second chapter of the collection opens — a good room to stand in for a while.",
    kind: "editorial",
    as_of: "2026-07-13",
  },
  {
    game: "one-piece",
    setCode: "EB01",
    note:
      "Memorial Collection — an Extra Booster that looks back rather than forward, gathering pieces the line wanted to keep. A small retrospective wing inside the larger show.",
    kind: "editorial",
    as_of: "2026-07-13",
  },
];

/** Return the curator's note for a set, or null when none is written (the
 *  page then falls back to the honest games-config set intro). */
export function getExhibitionNote(
  game: string | null | undefined,
  setCode: string | null | undefined,
): ExhibitionNote | null {
  const g = (game ?? "").toLowerCase();
  const s = (setCode ?? "").toUpperCase();
  if (!g || !s) return null;
  return (
    EXHIBITION_NOTES.find(
      (n) => n.game === g && n.setCode.toUpperCase() === s,
    ) ?? null
  );
}

/* ── Rarity, in plain words ──────────────────────────────────────────────
 * A card's rarity IS scarcity, and scarcity is a true kind of provenance.
 * These lines are true for every card of that rarity — no per-card
 * invention. Keyed by the raw rarity codes the catalog carries (SR, SEC,
 * L …); falls back gracefully to the raw string for codes not mapped. */

interface RarityWords {
  /** The rarity spelled out. */
  label: string;
  /** One plain-words scarcity line, true for the whole rarity. */
  scarcity: string;
}

const RARITY_WALL: Record<string, RarityWords> = {
  C: { label: "Common", scarcity: "a common print — the ones a set is built on" },
  UC: { label: "Uncommon", scarcity: "an uncommon print" },
  R: { label: "Rare", scarcity: "a rare print" },
  RR: { label: "Double Rare", scarcity: "one of the rarer prints in a set" },
  SR: { label: "Super Rare", scarcity: "a Super Rare — among the rarer prints a pack can hold" },
  SSR: { label: "Special Super Rare", scarcity: "among the scarcest prints a set has" },
  SEC: { label: "Secret Rare", scarcity: "a Secret Rare — among the scarcest a set has" },
  SCR: { label: "Secret Rare", scarcity: "a Secret Rare — among the scarcest a set has" },
  L: { label: "Leader", scarcity: "a Leader — the card a whole deck is built around" },
  SP: { label: "Special", scarcity: "a special print" },
  P: { label: "Promo", scarcity: "a promotional print, given outside the packs" },
};

/** Look up the plain-words rarity, or null when the code is unmapped/absent. */
export function rarityWords(rarity: string | null | undefined): RarityWords | null {
  if (!rarity) return null;
  const key = rarity.trim().toUpperCase();
  return RARITY_WALL[key] ?? { label: rarity.trim(), scarcity: "" };
}

/* ── The card's wall text (derived, labelled) ────────────────────────────
 * One reverent line composed ONLY from real fields: rarity (plain words) +
 * the set it belongs to + release year (when known). No invented facts; the
 * reverence is editorial framing, and the surface labels it as a reading. */

export function deriveCardWallText(
  card: {
    name?: string | null;
    name_en?: string | null;
    set_name?: string | null;
    rarity?: string | null;
  },
  opts?: { releaseYear?: number | null },
): string {
  const r = rarityWords(card.rarity);
  const setBit = card.set_name ? ` from ${card.set_name}` : "";
  const yearBit = opts?.releaseYear ? ` (${opts.releaseYear})` : "";

  let lead: string;
  if (r && r.label) lead = `${r.label}${setBit}${yearBit}.`;
  else if (card.set_name) lead = `From ${card.set_name}${yearBit}.`;
  else lead = "";

  const scarcity = r?.scarcity
    ? `${r.scarcity.charAt(0).toUpperCase()}${r.scarcity.slice(1)}.`
    : "";

  return [lead, scarcity].filter(Boolean).join(" ").trim();
}
