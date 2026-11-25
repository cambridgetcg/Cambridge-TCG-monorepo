/**
 * What a stored listing's title says about the printing it lists.
 *
 * Catalogue rows are shop listings, and a plain SKU
 * (<game>-<set>-<number>-<lang>, no variant) names the base printing. A row
 * may stand for a plain SKU only when its title holds the card's name, a base
 * rarity and nothing else: no condition or grade (〔状態A-〕, 〔PSA10鑑定済〕), no
 * パラレル, no (…) group of any kind. A title that holds more is never guessed
 * at. An import of July 2026 stored several hundred such listings under plain
 * SKUs; they stay stored and are no longer answered under them.
 *
 * One Piece is the one game whose titles were reviewed (the 2026-10-28
 * captures, docs/methodology/source-intake.md), so only there is a title
 * called plain. Elsewhere a known mark still refuses, and no mark proves
 * nothing. The patterns read the same in JavaScript and in Postgres;
 * db-source.ts uses them in both, so there is one rule.
 */
import { CARD_NAME_MARKERS, GAMES, skuIdentity, type SkuIdentity } from "@cambridge-tcg/sku";

export interface StoredListing {
  sku: string;
  /** The stored title, never the English name shown over it. */
  name: string | null;
  rarity: string | null;
}

const NEVER_IN_A_NAME = ["パラレル", ...CARD_NAME_MARKERS.cardrush_language].join("|");
/** `name【rarity】`: the base rarities cardrush-title/2 reads as plain, and no
 * bracket in the name. Stricter than it in three ways: an (illust:…) credit is
 * not plain, because the shop lists a credited art beside the uncredited base
 * card (OP01-006, OP01-025); nor is ☆, the shop's ☆SALE☆ tag on cards it also
 * lists without one; nor any other kind of bracket. The shop importer had
 * already taken 【】, 〔〕 and パラレル out of its names, so for its rows the
 * rarity column and the set a row is filed under do the protecting. */
export const PLAIN_TITLE = `^(?!.*(?:${NEVER_IN_A_NAME}))[^()（）\\[\\]［］【】{}｛｝〔〕〈〉《》「」『』＜＞☆]+【(?:C|UC|R|SR|SEC|L)】$`;
/** Marks that need no reviewed grammar: a leading 〔…〕, パラレル, a starred rarity. */
export const MARKED_TITLE = "^〔|パラレル|【[^】]*☆";
/** A canonical SKU with no variant segment. */
export const PLAIN_SKU = "^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-[a-z]{2}$";
/** A One Piece SKU in any stored spelling; read case-insensitively. */
export const ONE_PIECE_SKU = `^(?:${[...new Set(["op", ...(GAMES.op.legacyPrefixes ?? [])].map((prefix) => prefix.toLowerCase()))].join("|")})-`;

const plainTitle = new RegExp(PLAIN_TITLE, "s");
const markedTitle = new RegExp(MARKED_TITLE);
const plainSku = new RegExp(PLAIN_SKU, "i");
const onePieceSku = new RegExp(ONE_PIECE_SKU, "i");

/** One title for both stored shapes: the shop importer moved 【rarity】 into
 * its own column, the July import left it in the name. */
export function listingTitle({ name, rarity }: Pick<StoredListing, "name" | "rarity">): string {
  const stored = (name ?? "").replace(/^ +| +$/g, "");
  return stored.includes("【") || !rarity ? stored : `${stored}【${rarity}】`;
}

/** True when the title names the plain printing and nothing else. */
export function isPlainListing(row: StoredListing): boolean {
  return onePieceSku.test(row.sku) && plainTitle.test(listingTitle(row));
}

/** False for a row stored under a plain SKU that its title does not fit. */
export function mayStandForSku(row: StoredListing): boolean {
  if (!plainSku.test(row.sku)) return true;
  return onePieceSku.test(row.sku) ? isPlainListing(row) : !markedTitle.test(listingTitle(row));
}

/** Whether a catalogue row answers a requested SKU: the same SKU, however it
 * is spelled, or a plain SKU's plain listing. */
export function answersFor(requested: SkuIdentity, row: { sku: string; plain_listing?: boolean }): boolean {
  const found = skuIdentity(row.sku);
  if (!found) return false;
  return found.canonical_sku === requested.canonical_sku
    || (requested.variant === null && row.plain_listing === true && found.game === requested.game
      && found.set === requested.set && found.number === requested.number && found.lang === requested.lang);
}

// The same two questions in SQL, over a `cards` row (c is "" or an alias with its dot).
const titleSql = (c: string) =>
  `(CASE WHEN coalesce(${c}name, '') LIKE '%【%' OR coalesce(${c}rarity, '') = '' THEN btrim(coalesce(${c}name, '')) ELSE btrim(coalesce(${c}name, '')) || '【' || ${c}rarity || '】' END)`;

export const plainListingSql = (c = "") => `(${c}sku ~* '${ONE_PIECE_SKU}' AND ${titleSql(c)} ~ '${PLAIN_TITLE}')`;

export const mayStandSql = (c = "") =>
  `(${c}sku !~* '${PLAIN_SKU}' OR CASE WHEN ${c}sku ~* '${ONE_PIECE_SKU}' THEN ${titleSql(c)} ~ '${PLAIN_TITLE}' ELSE ${titleSql(c)} !~ '${MARKED_TITLE}' END)`;
