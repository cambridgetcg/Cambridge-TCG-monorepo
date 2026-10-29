/**
 * Card names and official translations: CTCG-NAMES-v1 (draft).
 *
 *   card key:  <game>-<set>-<number>
 *
 * A card key is a CTCG-SKU-v1 SKU without its language and variant
 * segments. A name belongs to (card key, language), and a printing's name
 * is its card key's name in the printing's language. A record's language
 * is the language its text is written in, never the printing's or the
 * source row's. Variant, parallel, reprint, rarity, condition, grade,
 * illustrator credit and art-style markers are never part of a name. A
 * record may carry one printing's sku only where the publisher prints a
 * different name on that printing.
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
  /** The language the text is written in, as a CTCG-SKU-v1 language code
   * (lowercase ISO 639-1); never the printing's or the source row's. */
  lang: string;
  /** The script the text is written in, ISO 15924, e.g. "Latn" for a
   * romanisation. Absent: the language's usual script. */
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
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;
// An https URL in RFC 3986 characters, with a DNS host and no credentials.
// Spaces and non-ASCII must already be percent-encoded: nothing is repaired.
const PCHAR = "(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-Fa-f]{2})";
const SOURCE_URL = new RegExp(`^https://[A-Za-z0-9.-]+(?::[0-9]+)?(?:/${PCHAR}*)*(?:\\?(?:${PCHAR}|[/?])*)?(?:#(?:${PCHAR}|[/?])*)?$`);
// ・ (U+30FB), ･ (U+FF65) and · (U+00B7): sources print names with and without them.
const KEY_DROPPED = /[\s・･·]/g;

/** RFC 3339 on a real calendar day and clock time. Date.parse alone rolls
 * 02-30 over to March and reads 24:00; leap seconds are refused too. */
function isTimestamp(value: string): boolean {
  const match = RFC3339.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match.slice(1).map((part) => Number(part ?? 0));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59;
}

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

/** Match key: NFKC, then no whitespace and no middle dots, then
 * locale-independent lowercase. モンキー・Ｄ・ルフィ and モンキー・D・ルフィ
 * share one. Removing before lowercasing keeps a Greek final sigma (ς) from
 * depending on spacing. */
export function cardNameKey(text: string): string {
  return text.normalize("NFKC").replace(KEY_DROPPED, "").toLowerCase();
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
    let parses = true;
    try { new URL(input.source_url); } catch { parses = false; }
    if (!parses || !SOURCE_URL.test(input.source_url)) fail("source_url", `Source URL must be https with a DNS host and no credentials, percent-encoded: ${input.source_url}`);
  }
  if (!isTimestamp(input.observed_at)) fail("observed_at", `observed_at must be an RFC 3339 timestamp on a real date and time: ${input.observed_at}`);
  if (!RULE.test(input.rule)) fail("rule", `Rule must be "verbatim" or <rule>/<version>: ${input.rule}`);
  // An official name is the rights holder's text as printed; a vendor rule's output is a vendor name.
  if (input.status === "official" && input.rule !== "verbatim") fail("rule", `An official name's rule is verbatim: ${input.rule}`);
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

/** Unicode code point order. `<` compares UTF-16 code units, which sorts
 * characters beyond U+FFFF before U+E000–U+FFFF. */
function byCodePoint(a: string, b: string): number {
  const left = [...a], right = [...b];
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = left[index]!.codePointAt(0)! - right[index]!.codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}

/** Choose the name to show. The highest status present wins; within it a
 * printing's override beats the card key's name. Records of that status
 * that disagree are a conflict, not a choice. Records that agree may differ
 * in form, such as character width; the most recently observed is shown,
 * and between equal instants the first by source, then text, in code point
 * order. No record is a missing name, never a guess. */
export function chooseCardName(records: readonly CardName[], query: CardNameQuery): CardNameChoice {
  const pool = records.filter((record) => record.card_key === query.card_key && record.lang === query.lang
    && record.script === query.script && (record.sku === undefined || record.sku === query.sku));
  const status = CARD_NAME_STATUSES.find((candidate) => pool.some((record) => record.status === candidate));
  if (!status) return { state: "missing" };
  const ranked = pool.filter((record) => record.status === status);
  const overrides = ranked.filter((record) => record.sku !== undefined);
  const candidates = overrides.length ? overrides : ranked;
  if (new Set(candidates.map((record) => record.key)).size > 1) return { state: "conflict", status, candidates };
  const name = candidates.reduce((shown, record) => (Date.parse(record.observed_at) - Date.parse(shown.observed_at)
    || byCodePoint(shown.source, record.source) || byCodePoint(shown.text, record.text)) > 0 ? record : shown);
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
  | "marker_in_name"
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
// The collector reads a language marker, and the classifier パラレル,
// anywhere in a title, so neither may be left standing in a name.
const CARDRUSH_READ_ANYWHERE: readonly string[] = [...CARD_NAME_MARKERS.cardrush_language, "パラレル"];
const TCGPLAYER_MARKERS: readonly string[] = CARD_NAME_MARKERS.tcgplayer;
const BRACKETS = /[()（）[\]［］【】{}〔〕]/;

/** cardrush-title/names-1, for a decoded CardRush product title:
 *
 *   〔condition〕* name (markers)? 【rarity】 {SET-NUM([RELEASE])?}
 *
 * Leading 〔…〕 groups (conditions and grades) and bracketed language
 * markers come off, the name ends at the first 【 or {, and one trailing
 * half-width (…) group comes off only when every slash-separated token is
 * a known marker or illust:<credit>. A language marker names the printing,
 * not the language of the text left behind. */
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
  const stray = CARDRUSH_READ_ANYWHERE.find((token) => name.includes(token));
  if (stray) return { rule, reason: "marker_in_name", detail: stray };
  const text = cardNameText(name);
  if (!cardNameKey(text)) return { rule, reason: "empty_name" };
  return { rule, text, ...(illustrator !== undefined ? { illustrator } : {}), markers };
}

// One trailing piece: " - 069/073", or a (…) group.
const TCGPLAYER_TAIL = /(?: - [A-Za-z0-9]+\/[A-Za-z0-9]+| ?\(([^()]*)\))$/;

/** tcgplayer-product/names-1, for a price-guide productName. Trailing
 * " - NNN/NNN" numbers and (…) groups come off from the end: a group that
 * is a card number such as (001), or a known variant marker. In the
 * captured price guides the text is English, also on the Pokemon Japan line. */
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
      markers.push(token);
    }
    name = name.slice(0, tail.index);
  }
  if (BRACKETS.test(name)) return { rule, reason: "unexpected_bracket", detail: name };
  const text = cardNameText(name);
  if (!cardNameKey(text)) return { rule, reason: "empty_name" };
  return { rule, text, markers };
}

/** cardmarket-product/names-1, for a product-list name. One trailing
 * collector number such as (OP01-001) or (P-001) comes off and the rest is
 * kept verbatim. The rule knows no variant markers, so a bracket left in
 * the rest, such as (Pre-Release) or (Parallel), refuses. */
export function cardmarketName(name: string): CardNameExtraction | CardNameRefusal {
  const rule = CARD_NAME_RULES.cardmarket;
  const full = cardNameText(name);
  if (!full) return { rule, reason: "empty_title" };
  const rest = full.replace(/ ?\([A-Z]+[0-9]*-[0-9]+[A-Z]?\)$/, "");
  if (BRACKETS.test(rest)) return { rule, reason: "unexpected_bracket", detail: rest };
  const text = cardNameText(rest);
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
    lang: { type: "string", pattern: "^[a-z]{2}$", description: "The language the text is written in, never the printing's or the source row's: a CTCG-SKU-v1 language code, lowercase ISO 639-1. Two-letter syntax only; ISO membership is not checked." },
    script: { type: "string", pattern: "^[A-Z][a-z]{3}$", description: "The script the text is written in, as an ISO 15924 code, such as Latn for a romanisation. Absent means the language's usual script." },
    text: { type: "string", pattern: "^\\S+(?: \\S+)*$", description: "NFC, trimmed, whitespace runs collapsed to one U+0020; otherwise exactly as the source prints it." },
    key: { type: "string", pattern: "^[^\\s\\u30FB\\uFF65\\u00B7]+$", description: "Match key: NFKC, then whitespace and middle dots removed, then lowercase. For matching only; never displayed." },
    status: { type: "string", enum: CARD_NAME_STATUSES, description: "Rank order: official, vendor, community, machine." },
    source: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", description: "Source registry id, such as bandai-en, cardrush, tcgplayer or cardmarket." },
    source_url: { type: "string", format: "uri", pattern: SOURCE_URL.source, description: "The https page the name was read from, with a DNS host and no credentials, percent-encoded as RFC 3986 requires." },
    observed_at: { type: "string", format: "date-time", description: "RFC 3339 time the source was read." },
    rule: { type: "string", pattern: "^(?:verbatim|[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:[.-][a-z0-9]+)*)$", description: "Extraction rule id and version, such as cardrush-title/names-1, or verbatim. An official name's rule is verbatim." },
    illustrator: { type: "string", pattern: "^\\S+(?: \\S+)*$", description: "A credit taken from the source's markers; never part of the name." },
    sku: { type: "string", pattern: `^(${GAME_CODES.join("|")})-[a-z0-9]+-[a-z0-9]+-[a-z]{2}(?:-[a-z0-9]+)*$`, description: "A printing's canonical SKU, present only when the publisher prints a different name on that printing." },
  },
  if: { properties: { status: { const: "official" } }, required: ["status"] },
  then: { properties: { rule: { const: "verbatim" } } },
} as const;
