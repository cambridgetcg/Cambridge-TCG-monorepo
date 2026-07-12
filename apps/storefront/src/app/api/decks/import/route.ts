/**
 * POST /api/decks/import — paper-decklist import.
 *
 * Phase 6 of the rookie flow: Player C (paper-OPTCG veteran) arrives
 * with a tournament list and wants to play their existing deck. Paste
 * a list, get a resolved deck object back.
 *
 * Accepts text in the common paper-OPTCG formats:
 *
 *   4x OP01-001 Monkey D. Luffy
 *   4  OP01-002 Roronoa Zoro
 *   2 x ST15-005 Portgas D. Ace
 *   OP02-001 Edward Newgate    (defaults quantity to 1)
 *
 * Returns the same shape as /api/v1/play/starters/[id] — leader + cards
 * resolved against the wholesale catalog. The client uses the response
 * to inject the deck into localStorage and redirect.
 *
 * Substrate-honest about absences: card_numbers that don't resolve are
 * returned with `resolved: false` so the caller can warn the user.
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { fetchPrices } from "@/lib/wholesale/client";

interface ParsedLine {
  raw_line: string;
  card_number: string;
  quantity: number;
  inferred_name: string | null;
}

interface ResolvedDeckCard {
  card_number: string;
  quantity: number;
  raw_line: string;
  resolved: boolean;
  sku: string | null;
  name: string | null;
  image_url: string | null;
  rarity: string | null;
  set_code: string | null;
  is_leader: boolean;
}

/** Card-number regex. Matches "OP01-001", "ST15-005", "EB04-002", etc.
 *  Two letters minimum, digits, dash, digits. */
const CARD_NUMBER_REGEX = /\b([A-Z]{1,4}\d{1,3}-\d{1,3})\b/i;

/**
 * Parse a single line of decklist text. Returns null if no card_number
 * found (blank line, comment, header).
 *
 * Accepted forms:
 *   "4x OP01-001 Name"     → { quantity: 4, card_number: "OP01-001" }
 *   "4 OP01-001"           → { quantity: 4, card_number: "OP01-001" }
 *   "OP01-001"             → { quantity: 1, card_number: "OP01-001" }
 *   "2 x ST15-005 Ace"     → { quantity: 2, card_number: "ST15-005" }
 *   "// header line"       → null
 *   "Leader: OP02-001"     → { quantity: 1, card_number: "OP02-001" }
 */
export function parseLine(raw: string): ParsedLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) return null;

  // Find the card_number first.
  const cn = trimmed.match(CARD_NUMBER_REGEX);
  if (!cn) return null;
  const card_number = cn[1].toUpperCase();

  // Look for a quantity BEFORE the card_number — number, optional 'x'/'×'.
  const before = trimmed.slice(0, cn.index ?? 0).trim();
  const qtyMatch = before.match(/(\d+)\s*[x×]?\s*$/i);
  const quantity = qtyMatch ? Math.min(4, Math.max(1, parseInt(qtyMatch[1], 10))) : 1;

  // Anything after the card_number is a name hint.
  const after = trimmed.slice((cn.index ?? 0) + cn[1].length).trim();
  const inferred_name = after || null;

  return { raw_line: raw, card_number, quantity, inferred_name };
}

/**
 * Group parsed lines by the wholesale catalog set we need to query.
 * Bandai bundled the 2024 + 2025 starter cohorts; map prefixes to the
 * actual catalog set codes.
 */
const BUNDLED_SET_FOR: Record<string, string> = {
  ST15: "ST15-20", ST16: "ST15-20", ST17: "ST15-20",
  ST18: "ST15-20", ST19: "ST15-20", ST20: "ST15-20",
  ST23: "ST23-28", ST24: "ST23-28", ST25: "ST23-28",
  ST26: "ST23-28", ST27: "ST23-28", ST28: "ST23-28",
};

function setPrefixOf(cardNumber: string): string | null {
  const m = cardNumber.match(/^([A-Z]+\d+)/);
  if (!m) return null;
  const prefix = m[1];
  return BUNDLED_SET_FOR[prefix] ?? prefix;
}

interface ImportRequestBody {
  text?: string;
  game?: string;
  /** Optional: which line is the leader. If omitted, the first leader-
   *  rarity (L) resolved card is auto-selected. */
  leader_card_number?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: ImportRequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "Request body must be JSON with a `text` field.",
    });
  }

  const text = body.text ?? "";
  if (!text.trim()) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "Empty `text` field. Paste a decklist with at least one card_number.",
    });
  }
  if (text.length > 8000) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "Decklist text too large (max 8000 characters).",
    });
  }

  // one-piece is the honest default, not a placeholder: the parser and
  // merge rules below encode One Piece's deck format (leader-rarity L
  // lines, OP/EB/ST card numbers, 4-copy clamp). Callers importing
  // another game's list must send `game` explicitly — and will need
  // format rules that don't exist yet.
  const game = body.game ?? "one-piece";

  // ── Parse ────────────────────────────────────────────────────────────
  const lines = text.split(/\r?\n/);
  const parsed: ParsedLine[] = [];
  const dropped: string[] = [];
  for (const line of lines) {
    const p = parseLine(line);
    if (p) parsed.push(p);
    else if (line.trim() && !line.trim().startsWith("//") && !line.trim().startsWith("#")) {
      dropped.push(line.trim());
    }
  }

  if (parsed.length === 0) {
    return errorResponse({
      code: "INVALID_INPUT",
      message:
        "No card_numbers found. Expected lines like `4x OP01-001 Monkey D. Luffy`.",
    });
  }

  // Merge duplicate card_numbers — the user's list might have a leader
  // on its own line plus the same number again later; the merge sums
  // quantities and clamps to 4.
  const mergedByNumber = new Map<string, ParsedLine>();
  for (const p of parsed) {
    const existing = mergedByNumber.get(p.card_number);
    if (existing) {
      existing.quantity = Math.min(4, existing.quantity + p.quantity);
    } else {
      mergedByNumber.set(p.card_number, { ...p });
    }
  }
  const merged = Array.from(mergedByNumber.values());

  // ── Resolve against catalog ──────────────────────────────────────────
  const sets = new Set<string>();
  for (const m of merged) {
    const s = setPrefixOf(m.card_number);
    if (s) sets.add(s);
  }

  const pages = await Promise.all(
    Array.from(sets).map((s) =>
      fetchPrices({ game, set: s, limit: 300 }).catch(() => ({
        items: [],
        total: 0,
      })),
    ),
  );

  const byNumber = new Map<string, (typeof pages)[number]["items"][number]>();
  for (const page of pages) {
    for (const item of page.items) {
      if (item.card_number && !byNumber.has(item.card_number)) {
        byNumber.set(item.card_number, item);
      }
    }
  }

  // ── Build response ───────────────────────────────────────────────────
  const cards: ResolvedDeckCard[] = merged.map((m) => {
    const cat = byNumber.get(m.card_number);
    if (!cat) {
      return {
        card_number: m.card_number,
        quantity: m.quantity,
        raw_line: m.raw_line,
        resolved: false,
        sku: null,
        name: m.inferred_name,
        image_url: null,
        rarity: null,
        set_code: null,
        is_leader: false,
      };
    }
    return {
      card_number: m.card_number,
      quantity: m.quantity,
      raw_line: m.raw_line,
      resolved: true,
      sku: cat.sku,
      name: cat.name_en || cat.name || m.card_number,
      image_url: cat.image_url ?? null,
      rarity: cat.rarity ?? null,
      set_code: cat.set_code ?? null,
      // Rarity may be "L" or "L/P" (alt-art promo variant) or other
      // hybrid forms; any rarity that *starts* with L is a Leader card
      // by Bandai's classification.
      is_leader: ((cat.rarity ?? "").toUpperCase().split("/")[0] === "L"),
    };
  });

  // Pick the leader — explicit override > first L-rarity > first card
  const leaderOverride = body.leader_card_number?.toUpperCase();
  let leaderCard: ResolvedDeckCard | null = null;
  if (leaderOverride) {
    leaderCard = cards.find((c) => c.card_number === leaderOverride) ?? null;
  }
  if (!leaderCard) {
    leaderCard = cards.find((c) => c.is_leader && c.resolved) ?? null;
  }
  // Tag the leader's flag accurately (override may not have rarity L)
  if (leaderCard) {
    leaderCard = { ...leaderCard, is_leader: true };
  }
  // Drop the leader from the main-deck list
  const mainCards = leaderCard
    ? cards.filter((c) => c.card_number !== leaderCard!.card_number)
    : cards;

  const resolvedCount = cards.filter((c) => c.resolved).length;
  const unresolvedCount = cards.filter((c) => !c.resolved).length;
  const totalCopies = mainCards.reduce(
    (sum, c) => sum + (c.resolved ? c.quantity : 0),
    0,
  );

  return jsonResponse({
    data: {
      "@kind": "imported_deck",
      game,
      leader: leaderCard,
      cards: mainCards,
      stats: {
        unique_card_numbers: cards.length,
        resolved: resolvedCount,
        unresolved: unresolvedCount,
        total_copies_in_main_deck: totalCopies,
        has_leader: leaderCard !== null,
        dropped_lines: dropped,
      },
      methodology_url: "/methodology/starter-decks",
    },
    endpoint: "/api/decks/import",
    sources: ["wholesale-rds.cards"],
    source_license: ["proprietary"],
    freshness: "catalog",
    license: "NOASSERTION",
    no_cache: true,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
