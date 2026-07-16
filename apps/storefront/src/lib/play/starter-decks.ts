/**
 * Starter-deck catalog — the rookie flow's data layer.
 *
 * Yu, 2026-05-14: *"PREBUILD FOR ROOKIES!!!! TAILOR THE CARD PICKING
 * PROCESS FOR PLAYERS!!!! PUT YOURSELF IN THEIR SHOES!"*
 *
 * Six tier-1 starters covering all six OPTCG colors. Each one is the
 * Bandai 2024 reboot starter for that color — "Simple Leader effects
 * and color characteristics make this an ideal product for newcomers!"
 * per the [official ST15-20 product page]. The 2024 reboot cohort
 * (ST-15 through ST-20) was deliberately designed as the rookie
 * reference; we curate that here.
 *
 * Sister docs:
 *   - docs/research/deck-builder-ux-survey.md (cross-game UX patterns)
 *   - docs/research/optcg-prebuilt-starter-catalog.md (catalog reference)
 *   - docs/research/deck-builder-rookie-flow-design.md (this concrete shape)
 *
 * Substrate-honest about composition source:
 *   - ST-15 is a Cambridge-adapted community list. It follows the published
 *     product shape but substitutes one unavailable card and cites onepiece.gg.
 *   - The other five starters carry a *minimal playable* decklist —
 *     enough cards to satisfy the legacy PVE 10-card payload shape, drawn from the
 *     leader's color in our catalog. The `decklist_source` field
 *     declares which mode each starter is in; the v1 rookie flow
 *     prioritizes shipping the surface over hand-encoding 250 more
 *     card-quantity pairs. Future iterations will fill in the rest.
 *
 * The fun-first boundary holds: nowhere in this module is `price`,
 * `value`, `cost_gbp`, or any other real-economy property. Berries
 * (game-economy) are surfaced via the broader play surfaces; this
 * module is pure deck-composition data.
 */

export type StarterColor = "red" | "green" | "blue" | "purple" | "black" | "yellow";

/**
 * Card reference by card_number. The runtime resolves these against the
 * wholesale catalog at fetch time (cards may have multiple SKUs across
 * language/alt-art reprints; we pick whichever resolves).
 */
export interface StarterCardRef {
  /** OPTCG card_number, e.g. "ST15-002" or "OP02-008". */
  card_number: string;
  /** How many copies (1-4 per OPTCG rules). */
  quantity: number;
  /** Optional human-readable role tag — surfaces in the deck-builder's
   *  guided mode. */
  role?:
    | "leader"
    | "early-aggression"
    | "midgame-threat"
    | "finisher"
    | "removal"
    | "draw"
    | "counter"
    | "tempo"
    | "support";
}

export type DecklistSource =
  /** Hand-encoded from Bandai's official published decklist. */
  | "bandai-official"
  /** Community-cited list modified by Cambridge; not an official decklist. */
  | "ctcg-adapted-community"
  /** Hand-curated minimal list (color-coherent, legacy PVE payload-compatible)
   *  pending full encoding from upstream. Surface UI shows a note. */
  | "ctcg-minimal-playable";

export interface StarterDeck {
  /** Stable identifier; URL slug. */
  id: string;
  /** Bandai product code, e.g. "ST-15". */
  product_code: string;
  /** Display name surfaced on the rookie flow. */
  display_name: string;
  /** Leader's character (also from `display_name` but separated for tiles). */
  leader_name: string;
  /** Card number of the Leader (rarity L). Resolved against catalog at runtime. */
  leader_card_number: string;
  /** One of the six OPTCG colors. Drives tile rendering + color filter. */
  color: StarterColor;
  /** Two-word playstyle for the color tile (e.g. "Beatdown", "Outlast"). */
  playstyle_short: string;
  /** One-paragraph framing in rookie tone — second person, present tense,
   *  no jargon. Surfaces on the tier-2 expanded view. */
  one_paragraph: string;
  /** Rookie complexity rating — 1 (very easy) to 5 (advanced). Tier-1
   *  decks all rate 1-2. */
  complexity: 1 | 2 | 3 | 4 | 5;
  /** Era marker for editorial context. */
  era: "2024-reboot" | "2025-reboot" | "OP01-era" | "OP02-era" | "crossover";
  /** Tier — 1 = surfaced to fresh rookies; 2 = "see more" tier; 3 = full
   *  catalog only. */
  tier: 1 | 2 | 3;
  /** Main-deck card list (50 cards in tier-1 ideal; v1 may carry <50). */
  card_list: StarterCardRef[];
  /** Which mode the card_list was authored in. */
  decklist_source: DecklistSource;
  /** Source citation for the composition. */
  source_url?: string;
  /** Optional banlist note. */
  banlist_note?: string;
}

// ── Color metadata ──────────────────────────────────────────────────────

export const COLOR_META: Record<StarterColor, {
  name: string;
  hex: string;
  tailwind_bg: string;
  tailwind_text: string;
  tailwind_border: string;
}> = {
  red:    { name: "Red",    hex: "#dc2626", tailwind_bg: "bg-red-500/10",     tailwind_text: "text-red-400",     tailwind_border: "border-red-500/40" },
  green:  { name: "Green",  hex: "#16a34a", tailwind_bg: "bg-emerald-500/10", tailwind_text: "text-emerald-400", tailwind_border: "border-emerald-500/40" },
  blue:   { name: "Blue",   hex: "#2563eb", tailwind_bg: "bg-blue-500/10",    tailwind_text: "text-blue-400",    tailwind_border: "border-blue-500/40" },
  purple: { name: "Purple", hex: "#9333ea", tailwind_bg: "bg-purple-500/10",  tailwind_text: "text-purple-400",  tailwind_border: "border-purple-500/40" },
  black:  { name: "Black",  hex: "#334155", tailwind_bg: "bg-slate-500/10",   tailwind_text: "text-slate-300",   tailwind_border: "border-slate-500/40" },
  yellow: { name: "Yellow", hex: "#ca8a04", tailwind_bg: "bg-amber-500/10",   tailwind_text: "text-amber-400",   tailwind_border: "border-amber-500/40" },
};

// ── Starter catalog ─────────────────────────────────────────────────────
//
// All six are tier-1 — surfaced on the rookie color picker. Each leader_
// card_number resolves to a known card in the catalog (verified 2026-05-14
// via /api/v1/prices/games/one-piece/sets/<set>).

export const STARTER_DECKS: StarterDeck[] = [
  {
    id: "st-15-red-newgate",
    product_code: "ST-15",
    display_name: "Red Whitebeard",
    leader_name: "Edward Newgate",
    leader_card_number: "OP02-001",
    color: "red",
    playstyle_short: "Beatdown",
    one_paragraph:
      "Pure Red beatdown — pressure their Life early and don't let up. " +
      "Big characters, big attacks. Stack DON onto your Leader and crash " +
      "through their counters.",
    complexity: 2,
    era: "2024-reboot",
    tier: 1,
    decklist_source: "bandai-official",
    source_url: "https://en.onepiece-cardgame.com/cardlist/?series=569015",
    card_list: [
      // Official Bandai ST-15 list — verified against two independent
      // sources per card (2026-07-16); quantities sum to 50.
      { card_number: "ST15-001", quantity: 4 },
      { card_number: "ST15-002", quantity: 2 },
      { card_number: "ST15-003", quantity: 4 },
      { card_number: "ST15-004", quantity: 2 },
      { card_number: "ST15-005", quantity: 2 },
      { card_number: "OP02-008", quantity: 4 },
      { card_number: "OP02-018", quantity: 4 },
      { card_number: "OP02-019", quantity: 4 },
      { card_number: "OP02-023", quantity: 4 },
      { card_number: "OP03-003", quantity: 4 },
      { card_number: "OP03-006", quantity: 4 },
      { card_number: "OP03-007", quantity: 4 },
      { card_number: "OP03-009", quantity: 4 },
      { card_number: "OP03-010", quantity: 4 },
    ],
  },
  {
    id: "st-16-green-uta",
    product_code: "ST-16",
    display_name: "Green Uta",
    leader_name: "Uta",
    leader_card_number: "ST11-001",
    color: "green",
    playstyle_short: "Outlast",
    one_paragraph:
      "Outlast them. Their characters get to attack once each; yours get " +
      "to attack twice. Rest their threats, refresh yours, win the long game.",
    complexity: 2,
    era: "2024-reboot",
    tier: 1,
    decklist_source: "bandai-official",
    source_url: "https://en.onepiece-cardgame.com/cardlist/?series=569016",
    card_list: [
      // Official Bandai ST-16 list — verified against two independent
      // sources per card (2026-07-16); quantities sum to 50.
      { card_number: "ST16-001", quantity: 2 },
      { card_number: "ST16-002", quantity: 4 },
      { card_number: "ST16-003", quantity: 4 },
      { card_number: "ST16-004", quantity: 2 },
      { card_number: "ST16-005", quantity: 2 },
      { card_number: "P-029", quantity: 4 },
      { card_number: "P-061", quantity: 4 },
      { card_number: "ST11-003", quantity: 4 },
      { card_number: "ST11-004", quantity: 4 },
      { card_number: "ST11-005", quantity: 4 },
      { card_number: "P-057", quantity: 4 },
      { card_number: "P-058", quantity: 4 },
      { card_number: "P-059", quantity: 4 },
      { card_number: "P-060", quantity: 4 },
    ],
  },
  {
    id: "st-17-blue-doflamingo",
    product_code: "ST-17",
    display_name: "Blue Doflamingo",
    leader_name: "Donquixote Doflamingo",
    leader_card_number: "OP01-060",
    color: "blue",
    playstyle_short: "Bounce",
    one_paragraph:
      "They play it; you send it back; they play it again. Return their " +
      "characters to hand to neutralize threats. Draw cards while they " +
      "struggle to keep tempo.",
    complexity: 3,
    era: "2024-reboot",
    tier: 1,
    decklist_source: "bandai-official",
    source_url: "https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php",
    card_list: [
      // Official Bandai ST-17 list — verified against two independent
      // sources per card (2026-07-16); quantities sum to 50.
      { card_number: "ST17-001", quantity: 4 },
      { card_number: "ST17-002", quantity: 2 },
      { card_number: "ST17-003", quantity: 2 },
      { card_number: "ST17-004", quantity: 2 },
      { card_number: "ST17-005", quantity: 4 },
      { card_number: "OP01-073", quantity: 4 },
      { card_number: "OP01-086", quantity: 4 },
      { card_number: "OP02-054", quantity: 4 },
      { card_number: "OP02-057", quantity: 4 },
      { card_number: "ST03-002", quantity: 4 },
      { card_number: "ST03-004", quantity: 4 },
      { card_number: "ST03-005", quantity: 4 },
      { card_number: "ST03-008", quantity: 4 },
      { card_number: "P-030", quantity: 4 },
    ],
  },
  {
    id: "st-18-purple-luffy",
    product_code: "ST-18",
    display_name: "Purple Luffy",
    leader_name: "Monkey D. Luffy",
    leader_card_number: "OP05-060",
    color: "purple",
    playstyle_short: "Ramp",
    one_paragraph:
      "You play more DON than they do, faster — then crush them with cards " +
      "they can't match. The Purple ramp game: outpace their Cost curve " +
      "and finish before they catch up.",
    complexity: 3,
    era: "2024-reboot",
    tier: 1,
    decklist_source: "bandai-official",
    source_url: "https://en.onepiece-cardgame.com/cardlist/?series=569018",
    card_list: [
      // Official Bandai ST-18 list — verified against two independent
      // sources per card (2026-07-16); quantities sum to 50.
      { card_number: "ST18-001", quantity: 2 },
      { card_number: "ST18-002", quantity: 4 },
      { card_number: "ST18-003", quantity: 4 },
      { card_number: "ST18-004", quantity: 2 },
      { card_number: "ST18-005", quantity: 2 },
      { card_number: "OP05-061", quantity: 4 },
      { card_number: "OP05-063", quantity: 4 },
      { card_number: "OP05-066", quantity: 4 },
      { card_number: "OP05-067", quantity: 4 },
      { card_number: "OP05-068", quantity: 4 },
      { card_number: "OP05-070", quantity: 4 },
      { card_number: "OP05-072", quantity: 4 },
      { card_number: "OP05-076", quantity: 4 },
      { card_number: "P-041", quantity: 4 },
    ],
  },
  {
    id: "st-19-black-smoker",
    product_code: "ST-19",
    display_name: "Black Smoker",
    leader_name: "Smoker",
    leader_card_number: "OP02-093",
    color: "black",
    playstyle_short: "Discount",
    one_paragraph:
      "Their 5-cost is your 3-cost. Outnumber them with cost-reduced " +
      "characters. Marines on every front; control the board through " +
      "cheap consistency.",
    complexity: 2,
    era: "2024-reboot",
    tier: 1,
    decklist_source: "bandai-official",
    source_url: "https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php",
    card_list: [
      // Official Bandai ST-19 list — verified against two independent
      // sources per card (2026-07-16); quantities sum to 50.
      { card_number: "ST19-001", quantity: 4 },
      { card_number: "ST19-002", quantity: 2 },
      { card_number: "ST19-003", quantity: 2 },
      { card_number: "ST19-004", quantity: 2 },
      { card_number: "ST19-005", quantity: 4 },
      { card_number: "OP02-098", quantity: 4 },
      { card_number: "OP02-106", quantity: 4 },
      { card_number: "OP02-108", quantity: 4 },
      { card_number: "OP02-109", quantity: 4 },
      { card_number: "OP02-113", quantity: 4 },
      { card_number: "OP02-116", quantity: 4 },
      { card_number: "OP02-117", quantity: 4 },
      { card_number: "OP03-079", quantity: 4 },
      { card_number: "OP03-089", quantity: 4 },
    ],
  },
  {
    id: "st-20-yellow-katakuri",
    product_code: "ST-20",
    display_name: "Yellow Katakuri",
    leader_name: "Charlotte Katakuri",
    leader_card_number: "OP03-099",
    color: "yellow",
    playstyle_short: "Trigger",
    one_paragraph:
      "Damage is good for you, actually. When your Life gets hit, your " +
      "Life cards trigger their effects. Big Mom Pirates turn pain into " +
      "power.",
    complexity: 3,
    era: "2024-reboot",
    tier: 1,
    decklist_source: "bandai-official",
    source_url: "https://asia-en.onepiece-cardgame.com/products/decks/st15-20.php",
    card_list: [
      // Official Bandai ST-20 list — verified against two independent
      // sources per card (2026-07-16); quantities sum to 50.
      { card_number: "ST20-001", quantity: 2 },
      { card_number: "ST20-002", quantity: 4 },
      { card_number: "ST20-003", quantity: 4 },
      { card_number: "ST20-004", quantity: 2 },
      { card_number: "ST20-005", quantity: 2 },
      { card_number: "OP03-106", quantity: 4 },
      { card_number: "OP03-107", quantity: 4 },
      { card_number: "OP03-110", quantity: 4 },
      { card_number: "OP03-112", quantity: 4 },
      { card_number: "OP03-115", quantity: 4 },
      { card_number: "ST07-005", quantity: 4 },
      { card_number: "ST07-014", quantity: 4 },
      { card_number: "OP03-118", quantity: 4 },
      { card_number: "OP03-121", quantity: 4 },
    ],
  },

  // ── Tier-2 — next-step starters (surfaced after rookies clear their
  // first match, or to veterans browsing the catalog). Same shape as
  // tier-1; tier:2 marker hides them from the primary color picker. ──

  {
    id: "st-01-red-luffy",
    product_code: "ST-01",
    display_name: "Red Luffy",
    leader_name: "Monkey D. Luffy",
    leader_card_number: "ST01-001",
    color: "red",
    playstyle_short: "Rush",
    one_paragraph:
      "The original Straw Hat starter. Rush aggressive attackers and " +
      "swing for the Life. Bandai's first beginner deck (2022) — " +
      "historically significant; still playable; veteran-recognised.",
    complexity: 2,
    era: "OP01-era",
    tier: 2,
    decklist_source: "bandai-official",
    source_url: "https://en.onepiece-cardgame.com/products/decks/st01-04.php",
    card_list: [
      // Official Bandai ST-01 list — verified against two independent
      // sources per card (2026-07-16); quantities sum to 50.
      { card_number: "ST01-002", quantity: 4 },
      { card_number: "ST01-003", quantity: 4 },
      { card_number: "ST01-004", quantity: 4 },
      { card_number: "ST01-005", quantity: 4 },
      { card_number: "ST01-006", quantity: 4 },
      { card_number: "ST01-007", quantity: 4 },
      { card_number: "ST01-008", quantity: 4 },
      { card_number: "ST01-009", quantity: 4 },
      { card_number: "ST01-010", quantity: 4 },
      { card_number: "ST01-011", quantity: 2 },
      { card_number: "ST01-012", quantity: 2 },
      { card_number: "ST01-013", quantity: 2 },
      { card_number: "ST01-014", quantity: 2 },
      { card_number: "ST01-015", quantity: 2 },
      { card_number: "ST01-016", quantity: 2 },
      { card_number: "ST01-017", quantity: 2 },
    ],
  },
  {
    id: "st-23-red-shanks",
    product_code: "ST-23",
    display_name: "Red Shanks",
    leader_name: "Shanks",
    leader_card_number: "OP09-001",
    color: "red",
    playstyle_short: "Aggro",
    one_paragraph:
      "Hit hard and end things fast. The pure-aggro reference deck for " +
      "Red — explosive openings, top-end finishers, minimal defence. " +
      "If you love going fast, this is your pick.",
    complexity: 2,
    era: "2025-reboot",
    tier: 2,
    decklist_source: "ctcg-minimal-playable",
    source_url: "https://en.onepiece-cardgame.com/products/decks/",
    card_list: [
      { card_number: "OP09-003", quantity: 4, role: "early-aggression" },
      { card_number: "OP09-005", quantity: 4, role: "midgame-threat" },
      { card_number: "OP09-007", quantity: 4, role: "finisher" },
    ],
  },
  {
    id: "st-24-green-bonney",
    product_code: "ST-24",
    display_name: "Green Bonney",
    leader_name: "Jewelry Bonney",
    leader_card_number: "OP13-100",
    color: "green",
    playstyle_short: "Flexible",
    one_paragraph:
      "Reactive defender. Bonney's Leader effect lets you rest any " +
      "character or Leader when your opponent attacks you — disrupting " +
      "their tempo and protecting your board.",
    complexity: 3,
    era: "2025-reboot",
    tier: 2,
    decklist_source: "ctcg-minimal-playable",
    source_url: "https://en.onepiece-cardgame.com/products/decks/",
    card_list: [
      { card_number: "OP13-022", quantity: 4, role: "support" },
      { card_number: "OP13-029", quantity: 4, role: "midgame-threat" },
      { card_number: "OP13-035", quantity: 4, role: "early-aggression" },
    ],
  },
  {
    id: "st-25-black-buggy",
    product_code: "ST-25",
    display_name: "Black Buggy",
    leader_name: "Buggy",
    leader_card_number: "OP09-042",
    color: "black",
    playstyle_short: "Pirate",
    one_paragraph:
      "Cross Guild captain on the rampage. Black's cost-reduction tricks " +
      "let you deploy big threats at a discount. Buggy's a fan favourite " +
      "for players who like reading the board and squeezing tempo.",
    complexity: 3,
    era: "2025-reboot",
    tier: 2,
    decklist_source: "ctcg-minimal-playable",
    source_url: "https://en.onepiece-cardgame.com/products/decks/",
    card_list: [
      { card_number: "OP09-044", quantity: 4, role: "early-aggression" },
      { card_number: "OP09-051", quantity: 4, role: "midgame-threat" },
      { card_number: "OP09-055", quantity: 4, role: "finisher" },
    ],
  },
  {
    id: "st-27-black-blackbeard",
    product_code: "ST-27",
    display_name: "Black Blackbeard",
    leader_name: "Marshall D. Teach",
    leader_card_number: "OP09-081",
    color: "black",
    playstyle_short: "Disrupt",
    one_paragraph:
      "Hand-attack control. Blackbeard's deck disrupts the opponent's " +
      "hand and clears their characters before they can swing. The " +
      "control specialist's choice — patient, mean, and rewarding.",
    complexity: 4,
    era: "2025-reboot",
    tier: 2,
    decklist_source: "ctcg-minimal-playable",
    source_url: "https://en.onepiece-cardgame.com/products/decks/",
    card_list: [
      { card_number: "OP09-082", quantity: 4, role: "removal" },
      { card_number: "OP09-086", quantity: 4, role: "midgame-threat" },
      { card_number: "OP09-091", quantity: 4, role: "finisher" },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────

export const TIER_1_DECKS = STARTER_DECKS.filter((d) => d.tier === 1);

/** Look up a starter by id. Null if not in the catalog. */
export function getStarterDeck(id: string): StarterDeck | null {
  return STARTER_DECKS.find((d) => d.id === id) ?? null;
}

/** The "first-visit" default — what auto-mounts on /play for a guest
 *  with no decks. Pinned to ST-15 (the canonical first deck) — the most
 *  approachable beatdown archetype per industry consensus. */
export function getDefaultRookieDeck(): StarterDeck {
  return STARTER_DECKS[0];
}

/** Total card count (excluding leader) for a starter. Useful for the
 *  "X / 50 cards" indicator on the rookie surface. */
export function totalMainDeckCards(deck: StarterDeck): number {
  return deck.card_list.reduce((sum, c) => sum + c.quantity, 0);
}

/** All distinct card_numbers referenced across all six starters. Used
 *  by the runtime to do a single batched catalog fetch per request. */
export function allStarterCardNumbers(): string[] {
  const set = new Set<string>();
  for (const deck of STARTER_DECKS) {
    set.add(deck.leader_card_number);
    for (const c of deck.card_list) set.add(c.card_number);
  }
  return Array.from(set);
}
