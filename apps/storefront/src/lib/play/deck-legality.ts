/**
 * Deck-legality validator — pure-function, no I/O.
 *
 * Implements the OPTCG deck-construction rules per the official
 * Comprehensive Rules v1.2.0 (2026-01-16) and the official banned/restricted
 * page — see docs/research/optcg-rules-alignment.md for the full citation
 * trail. Returns a structured result with typed violations rather than
 * throwing or asserting — callers decide how to surface findings.
 *
 * Note on rotation (corrected 2026-07-22): an earlier revision carried a
 * Standard block rotation for OP01-OP04; it was removed on 2026-07-17 as
 * unsourced because CR v1.2.0 (2026-01-16) says nothing about rotation.
 * Research on 2026-07-22 confirmed rotation IS real — Bandai's first block
 * rotation took effect 2026-04-01 as an organized-play regulation (Standard
 * = Block 2+ pool; the Extra format keeps the full pool; see the official
 * events pages, "Standard regulation as of April 1, 2026"). This validator
 * still deliberately does NOT enforce set-rotation: which tables should
 * demand Standard (vs. casual/Extra play, where our starters like ST-01
 * remain fine) is a product decision awaiting the operator — recorded in
 * the play-module ledger. The `format` field remains accepted.
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

import {
  BANLIST_EFFECTIVE,
  BANNED_CARD_NUMBERS,
  BANNED_PAIRS,
} from "./banlist";

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
    | "card_banned"
    | "banned_pair_present";
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
 * Checks the official banned/restricted list (banlist.ts) alongside the
 * construction rules — banned cards "cannot be included in any deck", so
 * this is a construction rule, not a tournament nicety.
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

  // ── 1b. Banlist (official banned/restricted page, effective ${''}) ────
  // Banned cards cannot be included in ANY deck — leader slot included.
  if (BANNED_CARD_NUMBERS.has(declaration.leader_id)) {
    violations.push({
      code: "card_banned",
      message: `Leader "${declaration.leader_id}" is on the official banned list (effective ${BANLIST_EFFECTIVE}).`,
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

    // 3b2. Official banlist.
    if (BANNED_CARD_NUMBERS.has(cardId)) {
      violations.push({
        code: "card_banned",
        message: `Card "${cardId}" is on the official banned list (effective ${BANLIST_EFFECTIVE}).`,
        card_id: cardId,
      });
    }

    // 3c. Color match with leader (every main-deck card must share ≥1 color
    //     with the leader). Skip when the leader was unresolved above, and
    //     skip per-card when the card's colors are UNKNOWN (empty array) —
    //     unknown is not colorless; callers surface which cards were
    //     skipped in their substrate-honest perimeter.
    if (
      leader &&
      leader.category === "leader" &&
      leaderColorSet.size > 0 &&
      meta.colors.length > 0
    ) {
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
  }

  // ── 4. Banned pairs — two cards that cannot share a deck. ────────────
  const present = new Set<string>([declaration.leader_id, ...counts.keys()]);
  for (const [a, b] of BANNED_PAIRS) {
    if (present.has(a) && present.has(b)) {
      violations.push({
        code: "banned_pair_present",
        message: `Cards "${a}" and "${b}" cannot be used together in the same deck (official banned pair, effective ${BANLIST_EFFECTIVE}).`,
        detail: `${a}+${b}`,
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
