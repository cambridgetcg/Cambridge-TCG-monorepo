/**
 * Cardmarket normalizer — one MKM product (with its inline price guide) →
 * one canonical price observation. Substrate-honest: every field that can't be
 * mapped quarantines with a named reason rather than guessing.
 */

import type { NormalizeResult } from "../types";
import type { CanonicalPrice } from "../canonical";
import { type CardmarketProduct, gameForCardmarketId, isoLangForCardmarketId } from "./types";

/** The raw row a Cardmarket read() yields. Carries the fetch time, since the
 *  normalizer (per the protocol) sees only the raw, not the provenance. */
export interface CardmarketRaw {
  product: CardmarketProduct;
  /** ISO 8601 — stamped by read() at fetch time. */
  retrieved_at: string;
}

/** TREND is the headline; fall back AVG → SELL → LOW. Major-unit EUR. */
export function headlineEur(pg: CardmarketProduct["priceGuide"]): number | undefined {
  if (!pg) return undefined;
  return pg.TREND ?? pg.AVG ?? pg.SELL ?? pg.LOW;
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * SEAM: MKM expansion → Cambridge set code. MKM expansion abbreviations are not
 * Cambridge set codes; until an operator-curated crosswalk exists, we slug the
 * MKM expansion abbreviation as a best-effort set segment. The resulting SKU's
 * set is provisional. Returns undefined when there is no expansion info at all.
 */
export function mapCardmarketSet(p: CardmarketProduct): string | undefined {
  const abbr = p.expansion?.abbreviation ?? p.expansion?.enName ?? p.expansionName;
  if (!abbr) return undefined;
  const s = slug(abbr);
  return s.length > 0 ? s : undefined;
}

/**
 * SKU number segment. Pokémon-style fraction numbers collapse to the
 * numerator ("057/198" → "057", "TG12/TG30" → "tg12") — the same
 * convention as the TCGplayer mapper — then slug to the SKU grammar's
 * [a-z0-9]+ segment. Returns undefined when nothing survives (symbol-only
 * promo numbers like "★"), so the caller quarantines instead of emitting
 * an unparseable SKU.
 */
export function mapCardNumber(num: string): string | undefined {
  const trimmed = num.trim();
  const fraction = /^([0-9a-z]+)\/[0-9a-z]+$/i.exec(trimmed);
  const s = slug(fraction ? fraction[1] : trimmed);
  return s.length > 0 ? s : undefined;
}

export function normalizeCardmarket(raw: CardmarketRaw): NormalizeResult<CanonicalPrice> {
  const p = raw.product;

  const game = gameForCardmarketId(p.idGame);
  if (!game) {
    return {
      ok: false,
      reason:
        `mapping.unknown-game — MKM idGame ${p.idGame ?? "?"} (${p.gameName ?? p.enName ?? "?"}) ` +
        `not in CARDMARKET_GAME; add it in packages/data-ingest/src/cardmarket/types.ts`,
    };
  }

  const lang =
    isoLangForCardmarketId(p.idLanguage) ?? isoLangForCardmarketId(p.localization?.[0]?.idLanguage);
  if (!lang) {
    return {
      ok: false,
      reason: `mapping.unknown-language — MKM product ${p.idProduct} has no resolvable idLanguage`,
    };
  }

  const set = mapCardmarketSet(p);
  if (!set) {
    return {
      ok: false,
      reason:
        `mapping.no-set-match — MKM product ${p.idProduct} ("${p.enName ?? ""}") ` +
        `has no expansion to derive a set segment`,
    };
  }

  if (!p.number) {
    return {
      ok: false,
      reason: `mapping.no-card-number — MKM product ${p.idProduct} ("${p.enName ?? ""}") has no collector number`,
    };
  }

  const number = mapCardNumber(String(p.number));
  if (!number) {
    return {
      ok: false,
      reason:
        `mapping.empty-card-number — MKM product ${p.idProduct} ("${p.enName ?? ""}") ` +
        `collector number "${p.number}" has no alphanumeric content to form a SKU segment`,
    };
  }

  const amount = headlineEur(p.priceGuide);
  if (amount == null) {
    return {
      ok: false,
      reason: `pricing.no-price-guide — MKM product ${p.idProduct} carries no priceGuide TREND/AVG/SELL/LOW`,
    };
  }

  const record: CanonicalPrice = {
    sku: `${game}-${set}-${number}-${lang}`,
    currency: "EUR",
    amount: amount.toFixed(2),
    sale_type: "retail",
    // MKM's price guide is a daily snapshot — observed == retrieved.
    observed_at: raw.retrieved_at,
    retrieved_at: raw.retrieved_at,
    upstream_id: String(p.idProduct),
  };
  return { ok: true, record };
}
