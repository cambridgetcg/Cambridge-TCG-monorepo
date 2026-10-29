/**
 * Card names and official translations: CTCG-NAMES-v1 (draft).
 *
 *   card key:  <game>-<set>-<number>
 *
 * A card key is a CTCG-SKU-v1 SKU without its language and variant
 * segments. A name belongs to (card key, language), and a printing's name
 * is its card key's name in the printing's language. Variant, parallel,
 * reprint, rarity, condition, grade, illustrator credit and art-style
 * markers are never part of a name. A record may carry one printing's sku
 * only where the publisher prints a different name on that printing.
 *
 * Every record says how it is known (official, vendor, community or
 * machine) and where it came from. The vendor rules below take markers off
 * a shop's or marketplace's title, or refuse with a reason; they never
 * guess. A name never establishes a SKU mapping.
 *
 * See `docs/methodology/card-names.md` for the public spec.
 */

import { GAME_CODES, isGameCode } from "./games";
import { normalizeLanguageCode } from "./normalize";
import { parseSku } from "./parse";

export const CARD_NAME_SPEC_VERSION = "ctcg.card-name/1";

/** In rank order. An official record outranks every other for its card key
 * and language; agreement between sources never changes a status. */
export const CARD_NAME_STATUSES = ["official", "vendor", "community", "machine"] as const;
export type CardNameStatus = (typeof CARD_NAME_STATUSES)[number];

/** Versioned extraction rules. A changed rule ships under a new id. */
export const CARD_NAME_RULES = {
  cardrush: "cardrush-title/names-1",
  tcgplayer: "tcgplayer-product/names-1",
  cardmarket: "cardmarket-product/names-1",
} as const;

export interface CardName {
  spec_version: typeof CARD_NAME_SPEC_VERSION;
  /** `<game>-<set>-<number>`. */
  card_key: string;
  /** CTCG-SKU-v1 language code: lowercase ISO 639-1. */
  lang: string;
  /** ISO 15924, e.g. "Latn" for a romanisation. Absent: the language's usual script. */
  script?: string;
  /** Text form: NFC, trimmed, whitespace runs collapsed to one space. */
  text: string;
  /** Match key. For matching only; never displayed. */
  key: string;
  status: CardNameStatus;
  /** Source registry id, e.g. "bandai-en", "cardrush", "tcgplayer". */
  source: string;
  source_url?: string;
  /** RFC 3339. */
  observed_at: string;
  /** Extraction rule id and version, or "verbatim". */
  rule: string;
  /** A credit taken from the source's markers; never part of the name. */
  illustrator?: string;
  /** A printing's canonical SKU: the name holds for that printing only. */
  sku?: string;
}

export type CardNameInput = Omit<CardName, "spec_version" | "key">;

export class CardNameError extends Error {
  constructor(message: string, public readonly field: keyof CardName) {
    super(message);
    this.name = "CardNameError";
  }
}

const SEGMENT = /^[a-z0-9]+$/;
const SCRIPT = /^[A-Z][a-z]{3}$/;
const SOURCE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RULE = /^(?:verbatim|[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:[.-][a-z0-9]+)*)$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
// ・ (U+30FB), ･ (U+FF65) and · (U+00B7): sources print names with and without them.
const KEY_DROPPED = /[\s・･·]/g;

/** The card key of a canonical SKU. Normalize legacy forms first with
 * `normalizeSku()`; this does not. Unlike `strippedOracleId()`, the
 * variant is dropped too: a parallel shares its base print's name. */
export function cardKey(sku: string): string | null {
  const parts = parseSku(sku);
  return parts ? `${parts.game}-${parts.set}-${parts.number}` : null;
}

export function isCardKey(value: string): boolean {
  const parts = value.split("-");
  return parts.length === 3 && isGameCode(parts[0]!) && SEGMENT.test(parts[1]!) && SEGMENT.test(parts[2]!);
}

/** Text form: Unicode NFC, trimmed, each whitespace run (ECMAScript `\s`,
 * which includes U+3000) collapsed to one U+0020. Nothing else changes:
 * punctuation, letter case and character width stay as printed. */
export function cardNameText(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Match key: NFKC, then locale-independent lowercase, then no whitespace
 * and no middle dots. モンキー・Ｄ・ルフィ and モンキー・D・ルフィ share one. */
export function cardNameKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(KEY_DROPPED, "");
}

/** Two texts name the same thing exactly when their keys are equal. */
export function sameCardName(a: string, b: string): boolean {
  const key = cardNameKey(a);
  return key !== "" && key === cardNameKey(b);
}

/** Build one record. Text and illustrator are put in text form and the key
 * is computed; every other field is checked, never repaired. Throws
 * `CardNameError` naming the field. */
export function cardName(input: CardNameInput): CardName {
  const fail = (field: keyof CardName, message: string): never => { throw new CardNameError(message, field); };
  if (!isCardKey(input.card_key)) fail("card_key", `Card key must be <game>-<set>-<number> with a registered game: ${input.card_key}`);
  // A legacy alias such as jp parses as two letters but is not the language code.
  if (!/^[a-z]{2}$/.test(input.lang) || normalizeLanguageCode(input.lang) !== input.lang) fail("lang", `Lang must be a lowercase ISO 639-1 code: ${input.lang}`);
  if (input.script !== undefined && !SCRIPT.test(input.script)) fail("script", `Script must be an ISO 15924 code such as Latn: ${input.script}`);
  const text = cardNameText(input.text);
  const key = cardNameKey(text);
  if (!key) fail("text", "Text is empty after normalization");
  if (!(CARD_NAME_STATUSES as readonly string[]).includes(input.status)) fail("status", `Unknown status: ${input.status}`);
  if (!SOURCE.test(input.source)) fail("source", `Source must be a registry id such as bandai-en: ${input.source}`);
  if (input.source_url !== undefined) {
    let url: URL | null = null;
    try { url = new URL(input.source_url); } catch { url = null; }
    if (!url || url.protocol !== "https:" || url.username || url.password) fail("source_url", `Source URL must be https without credentials: ${input.source_url}`);
  }
  if (!RFC3339.test(input.observed_at) || !Number.isFinite(Date.parse(input.observed_at))) fail("observed_at", `observed_at must be an RFC 3339 timestamp: ${input.observed_at}`);
  if (!RULE.test(input.rule)) fail("rule", `Rule must be "verbatim" or <rule>/<version>: ${input.rule}`);
  const illustrator = input.illustrator === undefined ? undefined : cardNameText(input.illustrator);
  if (illustrator === "") fail("illustrator", "Illustrator is empty after normalization");
  if (input.sku !== undefined) {
    const parts = parseSku(input.sku);
    if (!parts || cardKey(input.sku) !== input.card_key || parts.lang !== input.lang) fail("sku", `sku must be a canonical SKU of this card key and language: ${input.sku}`);
  }
  return {
    spec_version: CARD_NAME_SPEC_VERSION,
    card_key: input.card_key,
    lang: input.lang,
    ...(input.script !== undefined ? { script: input.script } : {}),
    text,
    key,
    status: input.status,
    source: input.source,
    ...(input.source_url !== undefined ? { source_url: input.source_url } : {}),
    observed_at: input.observed_at,
    rule: input.rule,
    ...(illustrator !== undefined ? { illustrator } : {}),
    ...(input.sku !== undefined ? { sku: input.sku } : {}),
  };
}

export interface CardNameQuery {
  card_key: string;
  lang: string;
  /** Absent asks for the language's usual script. */
  script?: string;
  /** The printing being named, so its overrides apply. */
  sku?: string;
}

export type CardNameChoice =
  | { state: "named"; status: CardNameStatus; name: CardName }
  | { state: "conflict"; status: CardNameStatus; candidates: CardName[] }
  | { state: "missing" };

/** Choose the name to show. The highest status present wins; within it a
 * printing's override beats the card key's name. Records of that status
 * that disagree are a conflict, not a choice. Records that agree may differ
 * in form, such as character width; the most recently observed is shown.
 * No record is a missing name, never a guess. */
export function chooseCardName(records: readonly CardName[], query: CardNameQuery): CardNameChoice {
  const pool = records.filter((record) => record.card_key === query.card_key && record.lang === query.lang
    && record.script === query.script && (record.sku === undefined || record.sku === query.sku));
  const status = CARD_NAME_STATUSES.find((candidate) => pool.some((record) => record.status === candidate));
  if (!status) return { state: "missing" };
  const ranked = pool.filter((record) => record.status === status);
  const overrides = ranked.filter((record) => record.sku !== undefined);
  const candidates = overrides.length ? overrides : ranked;
  if (new Set(candidates.map((record) => record.key)).size > 1) return { state: "conflict", status, candidates };
  const name = candidates.reduce((latest, record) => Date.parse(record.observed_at) > Date.parse(latest.observed_at) ? record : latest);
  return { state: "named", status, name };
}

/** A printing's name: its card key's name in the printing's language. */
export function printingName(records: readonly CardName[], sku: string): CardNameChoice {
  const parts = parseSku(sku);
  return parts ? chooseCardName(records, { card_key: cardKey(sku)!, lang: parts.lang, sku }) : { state: "missing" };
}

// ── Vendor extraction rules ─────────────────────────────────────────────

export type CardNameRefusalReason =
  | "empty_title"
  | "not_a_card_title"
  | "unrecognised_marker"
  | "conflicting_illustrators"
  | "unexpected_bracket"
  | "empty_name";

export interface CardNameExtraction {
  rule: string;
  text: string;
  illustrator?: string;
  /** Removed markers, without brackets, in the order the rule removes them. */
  markers: string[];
}

export interface CardNameRefusal {
  rule: string;
  reason: CardNameRefusalReason;
  /** The token or text the rule could not place. */
  detail?: string;
}

/** The markers each vendor rule knows; any other token refuses. A rule's
 * list changes only with its version. */
export const CARD_NAME_MARKERS = {
  /** The language markers the CardRush collector reads (LANGUAGE_MARKERS in
   * packages/data-ingest/src/cardrush/member-prices.ts). Copied, not
   * imported: this package depends on no other. */
  cardrush_language: ["英語版", "韓国語版", "中国語版", "簡体字版", "繁体字版"],
  /** Tokens of CardRush's trailing (…) group besides illust:<credit> and the
   * language markers. パラレル, 漫画絵 and 和柄 are in the 2026-10-28
   * captures; the classifier (cardrush/classify.ts) also names アルト,
   * オルタネート, 漫画 and マンガ; storefront search knows 漫画背景. */
  cardrush: ["パラレル", "漫画絵", "和柄", "漫画背景", "漫画", "マンガ", "アルト", "オルタネート"],
  /** The variant markers the TCGplayer collector's rule names
   * (tcgplayer/member-prices.ts) and its 2026-10-28 captures show. */
  tcgplayer: ["Parallel", "Alternate Art", "Box Topper", "Manga"],
} as const;

const CARDRUSH_LANGUAGE_BRACKETS = new RegExp(`[(【](${CARD_NAME_MARKERS.cardrush_language.join("|")})[)】]`, "g");
const CARDRUSH_GROUP_MARKERS: readonly string[] = [...CARD_NAME_MARKERS.cardrush, ...CARD_NAME_MARKERS.cardrush_language];
const TCGPLAYER_MARKERS: readonly string[] = CARD_NAME_MARKERS.tcgplayer;
const BRACKETS = /[()（）[\]［］【】{}〔〕]/;

/** cardrush-title/names-1, for a decoded CardRush product title:
 *
 *   〔condition〕* name (markers)? 【rarity】 {SET-NUM([RELEASE])?}
 *
 * Leading 〔…〕 groups (conditions and grades) and bracketed language
 * markers come off, the name ends at the first 【 or {, and one trailing
 * half-width (…) group comes off only when every slash-separated token is
 * a known marker or illust:<credit>. */
export function cardRushName(title: string): CardNameExtraction | CardNameRefusal {
  const rule = CARD_NAME_RULES.cardrush;
  let rest = cardNameText(title);
  if (!rest) return { rule, reason: "empty_title" };
  const markers: string[] = [];
  let lead: RegExpExecArray | null;
  while ((lead = /^〔([^〔〕]+)〕 ?/.exec(rest))) {
    markers.push(lead[1]!);
    rest = rest.slice(lead[0].length);
  }
  rest = rest.replace(CARDRUSH_LANGUAGE_BRACKETS, (_, marker: string) => { markers.push(marker); return ""; });
  const end = rest.search(/[【{]/);
  if (end < 0) return { rule, reason: "not_a_card_title", detail: rest };
  let name = rest.slice(0, end).trimEnd();
  let illustrator: string | undefined;
  const group = /\(([^()]*)\)$/.exec(name);
  if (group) {
    for (const token of group[1]!.split("/").map((part) => part.trim())) {
      const credit = /^illust:(.*)$/.exec(token);
      if (credit && cardNameText(credit[1]!)) {
        if (illustrator !== undefined) return { rule, reason: "conflicting_illustrators", detail: token };
        illustrator = cardNameText(credit[1]!);
      } else if (CARDRUSH_GROUP_MARKERS.includes(token)) markers.push(token);
      else return { rule, reason: "unrecognised_marker", detail: token };
    }
    name = name.slice(0, group.index);
  }
  if (BRACKETS.test(name)) return { rule, reason: "unexpected_bracket", detail: name };
  const text = cardNameText(name);
  if (!cardNameKey(text)) return { rule, reason: "empty_name" };
  return { rule, text, ...(illustrator !== undefined ? { illustrator } : {}), markers };
}

// One trailing piece: " - 069/073", or a (…) group.
const TCGPLAYER_TAIL = /(?: - [A-Za-z0-9]+\/[A-Za-z0-9]+| ?\(([^()]*)\))$/;

/** tcgplayer-product/names-1, for a price-guide productName. Trailing
 * " - NNN/NNN" numbers and (…) groups come off from the end: a group that
 * is a card number such as (001), or a known variant marker. */
export function tcgplayerName(productName: string): CardNameExtraction | CardNameRefusal {
  const rule = CARD_NAME_RULES.tcgplayer;
  let name = cardNameText(productName);
  if (!name) return { rule, reason: "empty_title" };
  const markers: string[] = [];
  let tail: RegExpExecArray | null;
  while ((tail = TCGPLAYER_TAIL.exec(name))) {
    const token = tail[1]?.trim();
    if (token !== undefined && !/^\d+$/.test(token)) {
      if (!TCGPLAYER_MARKERS.includes(token)) return { rule, reason: "unrecognised_marker", detail: token };
      markers.unshift(token);
    }
    name = name.slice(0, tail.index);
  }
  if (BRACKETS.test(name)) return { rule, reason: "unexpected_bracket", detail: name };
  const text = cardNameText(name);
  if (!cardNameKey(text)) return { rule, reason: "empty_name" };
  return { rule, text, markers };
}

/** cardmarket-product/names-1, for a product-list name. One trailing
 * (SET-NNN) collector number comes off; the rest is kept verbatim. */
export function cardmarketName(name: string): CardNameExtraction | CardNameRefusal {
  const rule = CARD_NAME_RULES.cardmarket;
  const full = cardNameText(name);
  if (!full) return { rule, reason: "empty_title" };
  const text = cardNameText(full.replace(/ ?\([A-Za-z0-9]+-[A-Za-z0-9]+\)$/, ""));
  if (!cardNameKey(text)) return { rule, reason: "empty_name" };
  return { rule, text, markers: [] };
}

/** Wire shape for cardName(). Structural only: NFC, the match key's
 * derivation and agreement between sku and card_key are checked by the
 * package, not this schema. */
export const CARD_NAME_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cambridgetcg.com/spec/v1/CardName.schema.json",
  title: "Card name record (CTCG-NAMES-v1)",
  description: "One name for one card key in one language, with how it is known and where it came from. Status official means the rights holder publishes this text for this language; vendor, community and machine names are never official. A name record establishes no SKU mapping, catalog record, trademark claim or permission to republish a source's text. Text form, match key and sku agreement are checked by cardName() in @cambridge-tcg/sku, not by this structural schema.",
  type: "object",
  additionalProperties: false,
  required: ["spec_version", "card_key", "lang", "text", "key", "status", "source", "observed_at", "rule"],
  properties: {
    spec_version: { const: CARD_NAME_SPEC_VERSION },
    card_key: { type: "string", pattern: `^(${GAME_CODES.join("|")})-[a-z0-9]+-[a-z0-9]+$`, description: "A CTCG-SKU-v1 SKU without its language and variant segments." },
    lang: { type: "string", pattern: "^[a-z]{2}$", description: "CTCG-SKU-v1 language code, lowercase ISO 639-1. Two-letter syntax only; ISO membership is not checked." },
    script: { type: "string", pattern: "^[A-Z][a-z]{3}$", description: "ISO 15924 code, such as Latn for a romanisation. Absent means the language's usual script." },
    text: { type: "string", pattern: "^\\S+(?: \\S+)*$", description: "NFC, trimmed, whitespace runs collapsed to one U+0020; otherwise exactly as the source prints it." },
    key: { type: "string", pattern: "^[^\\s\\u30FB\\uFF65\\u00B7]+$", description: "Match key: NFKC, then lowercase, then whitespace and middle dots removed. For matching only; never displayed." },
    status: { type: "string", enum: CARD_NAME_STATUSES, description: "Rank order: official, vendor, community, machine." },
    source: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", description: "Source registry id, such as bandai-en, cardrush, tcgplayer or cardmarket." },
    source_url: { type: "string", format: "uri", pattern: "^https://" },
    observed_at: { type: "string", format: "date-time", description: "RFC 3339 time the source was read." },
    rule: { type: "string", pattern: "^(?:verbatim|[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:[.-][a-z0-9]+)*)$", description: "Extraction rule id and version, such as cardrush-title/names-1, or verbatim." },
    illustrator: { type: "string", pattern: "^\\S+(?: \\S+)*$", description: "A credit taken from the source's markers; never part of the name." },
    sku: { type: "string", pattern: `^(${GAME_CODES.join("|")})-[a-z0-9]+-[a-z0-9]+-[a-z]{2}(?:-[a-z0-9]+)*$`, description: "A printing's canonical SKU, present only when the publisher prints a different name on that printing." },
  },
} as const;
