/**
 * Raw shapes for the bandai-en source — official English card data
 * scraped from Bandai's EN cardlist sites.
 *
 * One parsed `<dl class="modalCol">` block → one `BandaiEnCard`. The
 * shape mirrors the DOM verbatim (verified live 2026-07-11 against
 * en.onepiece-cardgame.com/cardlist/?series=569101): field values stay
 * strings; "-" placeholders become null at parse time; nothing is
 * interpreted until `normalize()`.
 */

/**
 * The five Bandai games the shared EN-cardlist skeleton covers.
 * Subset of `GameCode` from `@cambridge-tcg/sku` — kept literal so the
 * per-game config record is exhaustively checked.
 */
export type BandaiEnGameKey = "op" | "dbf" | "dmw" | "una" | "bsr";

/**
 * The two DOM families the Bandai EN cardlist sites use (both verified
 * live):
 *
 * - `"modal-page"` — one series page carries every card's full data as
 *   `<dl class="modalCol">` blocks (One Piece, verified 2026-07-11).
 * - `"list-detail"` — the series page is a thumbnail grid of
 *   `<li class="cardItem">` links; each card's data lives on its own
 *   server-rendered `detail.php?card_no=…` page (DBS Fusion World,
 *   verified 2026-07-13).
 */
export type BandaiEnDomKind = "modal-page" | "list-detail";

/**
 * Per-game configuration for the shared fetch/parse skeleton. One
 * scraper covers all five Bandai EN sites (identical
 * `.../card/{CARD_NO}.png|webp` convention, `_p1` suffixes for
 * parallels — docs/EN-CARD-DATA.md §2).
 */
export interface BandaiEnGameConfig {
  /** Registered game code (doubles as the config key). */
  game: BandaiEnGameKey;
  /** Human label for events/logs. */
  label: string;
  /** Site root — documentation + URL resolution base. */
  base_url: string;
  /**
   * Which DOM family this site serves. For stubs this is the *presumed*
   * family (see `notes`); the first implementation run verifies it.
   */
  dom: BandaiEnDomKind;
  /** Series page URL for a given series id (empty id = discovery page). */
  series_url: (series_id: string) => string;
  /**
   * Card detail page URL — `"list-detail"` sites only. `p` is the
   * parallel query value exactly as the list page carries it ("_p1"),
   * or null for the base print.
   */
  detail_url?: (card_no: string, p: string | null) => string;
  /**
   * Copyright/attribution line stamped into every card's `extra` —
   * policy requirement (docs/EN-CARD-DATA.md §7: attribution always,
   * schema-enforced downstream). Franchise line + Bandai.
   */
  attribution: string;
  /** Whether read() actually fetches this game yet. */
  implemented: boolean;
  /**
   * Substrate-honest status note. For stubs: what is verified, what
   * isn't, and what the first implementation run must check.
   */
  notes: string;
}

/**
 * One card block from a Bandai EN cardlist page, DOM-faithful.
 *
 * Parallel prints render as *separate* blocks with an `_p1`/`_p2`
 * id suffix and their own image; all rules fields repeat verbatim.
 */
export interface BandaiEnCard {
  /** Which game's cardlist this block came from. */
  game: BandaiEnGameKey;
  /** Block id verbatim, e.g. "OP01-001" or "OP01-001_p1". */
  card_id: string;
  /** Card number without the parallel suffix, e.g. "OP01-001". */
  card_number: string;
  /** Parallel suffix ("p1", "p2", ...) or null for the base print. */
  parallel: string | null;
  /** Display name from `.cardName`. */
  name: string;
  /** Rarity code from the info row (L / C / UC / R / SR / SEC / ...). */
  rarity: string | null;
  /** Card category from the info row (LEADER / CHARACTER / EVENT / STAGE). */
  category: string | null;
  /** Absolute image URL (official sample, e.g. .../card/OP01-001_p1.png). */
  image_url: string | null;
  /** Whether the cost box was labelled "Cost" or "Life" (leaders). */
  cost_kind: "cost" | "life" | null;
  /** Cost / Life value as printed. */
  cost: string | null;
  /** Attribute name (Slash / Strike / Special / ...), from the `<i>` label. */
  attribute: string | null;
  /** Power as printed, or null when the DOM shows "-". */
  power: string | null;
  /** Counter as printed, or null when the DOM shows "-". */
  counter: string | null;
  /** Color (Red / Green / ... — may be multi, e.g. "Red/Green"). */
  color: string | null;
  /** Block icon value. */
  block_icon: string | null;
  /** The "Type" row — trait line, e.g. "Supernovas/Straw Hat Crew". */
  type_feature: string | null;
  /** Effect (rules) text. Never flavor — see parse.ts policy comment. */
  effect_text: string | null;
  /** [Trigger] rules text when present (functional, part of oracle text). */
  trigger_text: string | null;
  /** The "Card Set(s)" row, e.g. "-ROMANCE DAWN- [OP01]". */
  card_sets_text: string | null;
  /** The series page this block was parsed from. */
  source_url: string;
  /** ISO moment the page was fetched (stamped by read(); keeps normalize pure). */
  retrieved_at: string;

  // ── "list-detail" DOM extras (dbf; absent on "modal-page" games) ────
  // Fusion World leaders are double-faced: the detail page renders
  // is-front/is-back values and _f/_b images. Optional so the op shape
  // is untouched; only games whose DOM carries the row set them.

  /** Back-face image URL (leaders; `…_b[_pN].webp`). */
  back_image_url?: string | null;
  /** Back-face power (leaders print different front/back power). */
  power_back?: string | null;
  /** Back-face Special Traits (leaders). */
  traits_back?: string | null;
  /** Back-face Skills — rules text, part of oracle text (leaders). */
  effect_back_text?: string | null;
  /** The "Specified cost" row (color-cost icons, e.g. "R"). */
  specified_cost?: string | null;
  /** The "Combo power" row. */
  combo_power?: string | null;
}

/**
 * One `<li class="cardItem">` from a "list-detail" series page — a
 * reference to a card's detail page, not the card itself. `read()`
 * follows each ref with a (rate-limited) detail fetch.
 */
export interface BandaiEnCardRef {
  /** Card number verbatim from the detail link, e.g. "FB10-001". */
  card_no: string;
  /** Parallel query value exactly as linked ("_p1") or null (base print). */
  p: string | null;
  /** The lazy-loaded thumbnail's data-src, page-relative, or null. */
  image_src: string | null;
  /** The thumbnail alt text, e.g. "FB10-001 Son Goku". */
  alt: string;
}

/** One `<option>` from the series `<select>` on the cardlist page. */
export interface BandaiEnSeriesOption {
  /** Series id, e.g. "569101" (OP-01). */
  id: string;
  /** Cleaned label, e.g. "BOOSTER PACK -ROMANCE DAWN- [OP-01]". */
  label: string;
}
