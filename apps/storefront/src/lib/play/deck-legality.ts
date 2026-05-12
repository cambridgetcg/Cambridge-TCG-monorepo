/**
 * Deck-legality validator — pure-function, no I/O.
 *
 * Implements the OPTCG deck-construction rules per the official Comprehensive
 * Rules v1.2.0 (cross-checked against TCG Protectors 2026 summary and the
 * official Q&A). Returns a structured result with typed violations rather
 * than throwing or asserting — callers decide how to surface findings.
 *
 * Used by:
 *   - POST /api/v1/play/deck/validate (the public endpoint exposing this)
 *   - future L4+ engine at room-creation time (deck check before match start)
 *   - tournament deck-registration when L7 tournament substrate ships
 *
 * Pure function: same inputs always yield same outputs. No database access,
 * no network, no clock — the validator is a property of the data alone.
 *
 * kingdom-069 (S36, mine). See docs/research/optcg-mechanics-and-engine-design.md
 * for the source rules.
 */

/** Inputs to deck validation. */
export interface DeckDeclaration {
  /** The Leader card by id (e.g., "OP01-001"). */
  leader_id: string;
  /** Main deck — 50 cards by id, repetition allowed up to 4 copies. */
  main_deck_card_ids: string[];
  /** The legal format the deck is being validated for. */
  format: "standard" | "legacy" | "limited_sealed";
}

/** A single card's relevant metadata for legality checks. */
export interface CardMetadata {
  card_id: string;
  /** Leader / Character / Event / Stage. */
  category: "leader" | "character" | "event" | "stage";
  /** One or more colors the card belongs to. */
  colors: Array<"red" | "green" | "blue" | "purple" | "black" | "yellow">;
  /** The set this card was first printed in (e.g., "OP01", "OP05"). Drives block rotation. */
  set_code: string;
  /** Counter value for non-Leader cards; null on Leaders. */
  counter?: number | null;
  /** Cost in DON. Leaders don't have a cost. */
  cost?: number | null;
  /** Leader's Life value. Only present for category === "leader". */
  life?: number | null;
}

/** A single violation of a deck-construction rule. */
export interface DeckViolation {
  /** Stable machine-readable code; suitable for error logs and i18n. */
  code:
    | "leader_card_not_found"
    | "leader_is_not_a_leader"
    | "leader_in_main_deck"
    | "main_deck_wrong_size"
    | "card_id_unknown"
    | "card_not_main_deck_eligible"
    | "card_copy_limit_exceeded"
    | "card_color_mismatch_with_leader"
    | "card_set_not_legal_in_format";
  /** Human-readable description. */
  message: string;
  /** Affected card_id, if applicable. */
  card_id?: string;
  /** Numeric detail (e.g., observed count for copy-limit). */
  detail?: number | string;
}

/** Structured result. */
export interface DeckLegalityResult {
  legal: boolean;
  violations: DeckViolation[];
  /** Helpful counts surfaced regardless of legality. */
  summary: {
    main_deck_count: number;
    distinct_card_count: number;
    leader_id: string;
    leader_colors: string[];
    format: string;
  };
}

/** Block-rotation rules effective 2026-04-01. */
const BLOCK_ROTATION_OUT_OF_STANDARD: Record<string, true> = {
  OP01: true,
  OP02: true,
  OP03: true,
  OP04: true,
};

/** Predicate: is a card_id from a Standard-rotated-out set? */
function isRotatedOutOfStandard(set_code: string): boolean {
  return BLOCK_ROTATION_OUT_OF_STANDARD[set_code] === true;
}

/** The hard deck-construction constants. */
export const DECK_RULES = {
  main_deck_count: 50,
  max_copies_per_card_id: 4,
  required_color_intersection_with_leader: 1,
} as const;

/**
 * Validate a deck declaration against OPTCG rules.
 *
 * Returns ALL violations found, not just the first — callers can render the
 * full failure surface. `legal` is true if and only if violations.length === 0.
 *
 * The validator does not check tournament-specific format restrictions
 * beyond block rotation (e.g., sideboard rules, banlists). Those are tournament-
 * specific and live elsewhere when L7 tournament substrate ships.
 */
export function checkDeckLegality(
  declaration: DeckDeclaration,
  cardMetadataLookup: Map<string, CardMetadata>,
): DeckLegalityResult {
  const violations: DeckViolation[] = [];

  // ── 1. Leader checks ─────────────────────────────────────────────────
  const leader = cardMetadataLookup.get(declaration.leader_id);
  if (!leader) {
    violations.push({
      code: "leader_card_not_found",
      message: `Leader card_id "${declaration.leader_id}" not found in catalog.`,
      card_id: declaration.leader_id,
    });
    // We can still surface main-deck size violations; continue with empty leader colors.
  } else if (leader.category !== "leader") {
    violations.push({
      code: "leader_is_not_a_leader",
      message: `Card "${declaration.leader_id}" is category "${leader.category}", not "leader".`,
      card_id: declaration.leader_id,
    });
  }

  // ── 2. Main deck size ────────────────────────────────────────────────
  const mainCount = declaration.main_deck_card_ids.length;
  if (mainCount !== DECK_RULES.main_deck_count) {
    violations.push({
      code: "main_deck_wrong_size",
      message: `Main deck must contain exactly ${DECK_RULES.main_deck_count} cards; found ${mainCount}.`,
      detail: mainCount,
    });
  }

  // ── 3. Per-card-id copy counts + per-card checks ─────────────────────
  const counts = new Map<string, number>();
  for (const cardId of declaration.main_deck_card_ids) {
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }

  const leaderColors = leader?.colors ?? [];
  const leaderColorSet = new Set(leaderColors);

  for (const [cardId, count] of counts) {
    const meta = cardMetadataLookup.get(cardId);

    if (!meta) {
      violations.push({
        code: "card_id_unknown",
        message: `Main-deck card_id "${cardId}" not found in catalog.`,
        card_id: cardId,
      });
      continue;
    }

    // 3a. Cards in main deck must be Character / Event / Stage (NOT Leader).
    if (meta.category === "leader") {
      violations.push({
        code: "leader_in_main_deck",
        message: `Leader card "${cardId}" cannot be included in the main deck.`,
        card_id: cardId,
      });
    } else if (
      meta.category !== "character" &&
      meta.category !== "event" &&
      meta.category !== "stage"
    ) {
      violations.push({
        code: "card_not_main_deck_eligible",
        message: `Card "${cardId}" has category "${meta.category}" which is not main-deck-eligible.`,
        card_id: cardId,
      });
    }

    // 3b. Copy-limit (max 4 per card_id). Alt-arts share card_id; the
    //     scraper-emitted card_id is the canonical key for copy-counting.
    if (count > DECK_RULES.max_copies_per_card_id) {
      violations.push({
        code: "card_copy_limit_exceeded",
        message: `Card "${cardId}" has ${count} copies; max is ${DECK_RULES.max_copies_per_card_id}.`,
        card_id: cardId,
        detail: count,
      });
    }

    // 3c. Color match with leader (every main-deck card must share ≥1 color
    //     with the leader). Skip this check if the leader was unresolved
    //     above (we already surfaced that violation).
    if (leader && leader.category === "leader" && leaderColorSet.size > 0) {
      const cardColorSet = new Set(meta.colors);
      const sharesColor = Array.from(cardColorSet).some((c) => leaderColorSet.has(c));
      if (!sharesColor) {
        violations.push({
          code: "card_color_mismatch_with_leader",
          message: `Card "${cardId}" colors [${meta.colors.join(", ")}] do not share any color with Leader [${leaderColors.join(", ")}].`,
          card_id: cardId,
        });
      }
    }

    // 3d. Format / block-rotation legality.
    if (declaration.format === "standard" && isRotatedOutOfStandard(meta.set_code)) {
      violations.push({
        code: "card_set_not_legal_in_format",
        message: `Card "${cardId}" is from set "${meta.set_code}" which rotated out of Standard format on 2026-04-01.`,
        card_id: cardId,
        detail: meta.set_code,
      });
    }
  }

  return {
    legal: violations.length === 0,
    violations,
    summary: {
      main_deck_count: mainCount,
      distinct_card_count: counts.size,
      leader_id: declaration.leader_id,
      leader_colors: leaderColors,
      format: declaration.format,
    },
  };
}
