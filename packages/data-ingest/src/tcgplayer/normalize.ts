/**
 * TCGplayer → Canonical normalizer.
 *
 * Pure: same raw row → same result, no I/O, no clock reads inside the
 * decision. The normalizer EMITS canonical records but does NOT resolve
 * the canonical SKU itself — that requires a DB query against
 * cards.tcgplayer_product_id, which is the writer's job.
 *
 * Output shape per mode:
 *   - kind="catalog"  →  NormalizeResult<CanonicalMapping>
 *   - kind="pricing"  →  NormalizeResult<CanonicalPrice>
 *
 * Discriminated via the input's `raw.kind` field. The writer dispatches
 * on the output record's shape.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN) §5.
 */

import type { NormalizeResult } from "../types.js";
import type { CanonicalPrice, CanonicalMapping } from "../canonical.js";
import type { TcgplayerRaw, TcgplayerCatalogRaw, TcgplayerPricingRaw } from "./types.js";
import { TCGPLAYER_CONDITION_MAP } from "./conditions.js";
import { TCGPLAYER_KNOWN_SUB_TYPES, variantTailForSubType, gameForCategory } from "./categories.js";

/**
 * Two outputs from one source — the normalizer dispatches on raw.kind.
 *
 * Returns a discriminated record (CanonicalPrice for pricing rows,
 * CanonicalMapping for catalog rows) — the writer branches on the
 * presence of `upstream_product_id` (mapping) vs `sku` (price).
 */
export function normalizeTcgplayer(
  raw: TcgplayerRaw,
): NormalizeResult<CanonicalPrice | CanonicalMapping> {
  if (raw.kind === "catalog") return normalizeCatalog(raw);
  return normalizePricing(raw);
}

// ── Catalog mode — emits mapping records ─────────────────────────────

function normalizeCatalog(
  raw: TcgplayerCatalogRaw,
): NormalizeResult<CanonicalMapping> {
  const game = gameForCategory(raw.category.categoryId);
  if (!game) {
    return {
      ok: false,
      reason:
        `tcgplayer category ${raw.category.categoryId} (${raw.category.name}) not in TCGPLAYER_CATEGORIES — ` +
        `add it in packages/data-ingest/src/tcgplayer/categories.ts to map to a Cambridge GameCode`,
    };
  }

  // Extract collector number from extendedData. Most TCGplayer products carry
  // a "Number" field (e.g. "OP01-001", "5/102", "SR-001"). Variations across
  // game families exist; quarantine when missing rather than guessing.
  const numberField = raw.product.extendedData?.find(
    (d) => d.name === "Number" || d.name === "number" || d.name === "Card Number",
  );
  if (!numberField || !numberField.value) {
    return {
      ok: false,
      reason:
        `tcgplayer product ${raw.product.productId} has no extendedData.Number — ` +
        `cannot derive a card_number. Display name: "${raw.product.name}"`,
    };
  }

  // The sub-types we expect to find in the skus list.
  const distinctSubTypes = new Set(raw.skus.map((s) => s.printingName));
  for (const subType of distinctSubTypes) {
    if (!TCGPLAYER_KNOWN_SUB_TYPES.has(subType)) {
      return {
        ok: false,
        reason:
          `tcgplayer product ${raw.product.productId} carries unknown sub_type '${subType}'. ` +
          `Add it to TCGPLAYER_KNOWN_SUB_TYPES and variantTailForSubType() in categories.ts`,
      };
    }
  }

  // Build leaf_ids from the joined skus, mapping each condition string.
  // Quarantine when any condition is unmapped — the operator extends
  // the conditions map before reprocessing.
  const leafIds: CanonicalMapping["leaf_ids"] = [];
  for (const sku of raw.skus) {
    const cambridgeCondition = TCGPLAYER_CONDITION_MAP[sku.condition];
    if (!cambridgeCondition) {
      return {
        ok: false,
        reason:
          `tcgplayer skuId ${sku.skuId} has unmapped condition '${sku.condition}'. ` +
          `Add to TCGPLAYER_CONDITION_MAP in packages/data-ingest/src/tcgplayer/conditions.ts`,
      };
    }
    leafIds.push({
      condition: cambridgeCondition,
      language: languageNameToIso(sku.languageName),
      upstream_sku_id: sku.skuId,
    });
  }

  return {
    ok: true,
    record: {
      source: "tcgplayer",
      upstream_product_id: raw.product.productId,
      upstream_display_name: raw.product.name,
      match_hints: {
        // Set code hint — the writer will lookup against `sets`/`card_sets`
        // and resolve to our internal set_code. We use the group's
        // abbreviation when available, else the full name lowercased.
        set_code_hint: raw.group.abbreviation?.toLowerCase(),
        card_number: normalizeCardNumber(numberField.value),
        // The reader fills in lang per-sku via leaf_ids; the product-level
        // hint defaults to English. JP-language groups override.
        lang: deriveProductDefaultLang(distinctSubTypes, raw.skus),
      },
      leaf_ids: leafIds,
      extra: {
        tcgplayer_category_id: raw.category.categoryId,
        tcgplayer_group_id: raw.group.groupId,
        tcgplayer_group_abbr: raw.group.abbreviation ?? null,
        tcgplayer_group_name: raw.group.name,
        cambridge_game: game,
      },
    },
  };
}

// ── Pricing mode — emits CanonicalPrice records ──────────────────────

function normalizePricing(
  raw: TcgplayerPricingRaw,
): NormalizeResult<CanonicalPrice> {
  const condition = TCGPLAYER_CONDITION_MAP[raw.sku.condition];
  if (!condition) {
    return {
      ok: false,
      reason:
        `unmapped tcgplayer condition '${raw.sku.condition}' for skuId ${raw.sku.skuId}; ` +
        `add to TCGPLAYER_CONDITION_MAP in packages/data-ingest/src/tcgplayer/conditions.ts`,
    };
  }

  const subType = raw.sku.printingName;
  if (!TCGPLAYER_KNOWN_SUB_TYPES.has(subType)) {
    return {
      ok: false,
      reason:
        `unknown tcgplayer sub_type '${subType}' for skuId ${raw.sku.skuId}; ` +
        `extend TCGPLAYER_KNOWN_SUB_TYPES in categories.ts`,
    };
  }

  // The headline number choice: marketPrice (what TCGplayer shows
  // publicly). When marketPrice is null, fall back to midPrice — also a
  // substrate-honest mid-of-listings number. All-null lands a row with
  // amount=0.00 + extra.headline_null=true; the writer surfaces this as
  // error_reason='all_pricing_fields_null'.
  const headline =
    raw.pricing.marketPrice ??
    raw.pricing.midPrice ??
    raw.pricing.lowPrice ??
    null;

  const allNull =
    raw.pricing.lowPrice === null &&
    raw.pricing.midPrice === null &&
    raw.pricing.highPrice === null &&
    raw.pricing.marketPrice === null &&
    raw.pricing.directLowPrice === null;

  const observedAt = raw.pricing.updatedAt ?? new Date().toISOString();

  const extra: Record<string, string | number | boolean | null> = {
    tcgplayer_product_id: raw.product_id,
    tcgplayer_sub_type: subType,
    tcgplayer_sku_id: raw.sku.skuId,
    tcgplayer_condition_label: raw.sku.condition,
    tcgplayer_language: raw.sku.languageName,
    low: raw.pricing.lowPrice?.toFixed(2) ?? null,
    mid: raw.pricing.midPrice?.toFixed(2) ?? null,
    high: raw.pricing.highPrice?.toFixed(2) ?? null,
    direct_low: raw.pricing.directLowPrice?.toFixed(2) ?? null,
    market: raw.pricing.marketPrice?.toFixed(2) ?? null,
    headline_null: allNull,
    headline_field:
      raw.pricing.marketPrice !== null
        ? "marketPrice"
        : raw.pricing.midPrice !== null
          ? "midPrice"
          : raw.pricing.lowPrice !== null
            ? "lowPrice"
            : "none",
    currency_source: "USD",
    ingested_field_source: "/pricing/sku",
    card_id_hint: raw.card_id,
    card_sku_hint: raw.card_sku,
  };

  return {
    ok: true,
    record: {
      // The writer translates (product_id, sub_type) → canonical SKU via
      // cards.tcgplayer_product_id + cards.tcgplayer_sub_type. We pass the
      // hint forward in extra.card_sku_hint as a sanity-check.
      sku: raw.card_sku,
      currency: "USD",
      // Amount is the USD figure. Writer converts to GBP via fx_rate_to_gbp.
      amount: headline !== null ? headline.toFixed(2) : "0.00",
      condition,
      sale_type: "retail",
      observed_at: observedAt,
      retrieved_at: new Date().toISOString(),
      upstream_id: String(raw.sku.skuId),
      // CanonicalPrice doesn't declare an extra field in its core type;
      // we stuff it via Object.assign on the writer side. For now the
      // writer reads `extra` off the in-memory canonical via a cast.
      ...({ extra } as Record<string, unknown>),
    } as CanonicalPrice & { extra: Record<string, unknown> },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Normalize TCGplayer's collector_number to lower-case alphanumeric with
 * hyphens preserved (so "OP01-001" → "op01-001", "5/102" → "5-102").
 *
 * The fraction form ("5/102") is a Pokémon convention; we collapse the
 * denominator and store just the numerator. Cambridge's SKU spec uses
 * hyphen-joined alphanumerics.
 */
function normalizeCardNumber(raw: string): string {
  const trimmed = raw.trim();
  // Pokémon fraction form: "5/102" → "5"
  const fractionMatch = /^(\d+)\/\d+$/.exec(trimmed);
  if (fractionMatch) return fractionMatch[1];
  // Lowercase + collapse non-alphanum → hyphen.
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Map TCGplayer's language name to ISO 639-1 lowercase. Most are 1:1;
 * we collapse Chinese variants to "zh".
 */
function languageNameToIso(name: string): string {
  const lower = name.toLowerCase();
  switch (lower) {
    case "english":
      return "en";
    case "japanese":
      return "ja";
    case "german":
      return "de";
    case "french":
      return "fr";
    case "italian":
      return "it";
    case "spanish":
      return "es";
    case "portuguese":
      return "pt";
    case "korean":
      return "ko";
    case "chinese (simplified)":
    case "chinese (traditional)":
    case "chinese":
      return "zh";
    case "russian":
      return "ru";
    default:
      // Best-effort: take first two chars lowercased. Operator audits surface
      // unrecognised entries via the mapping audit.
      return lower.slice(0, 2);
  }
}

/**
 * Derive the product-level default language from the skus' languages.
 * When every sku is the same language, that's the product default;
 * otherwise default to English.
 */
function deriveProductDefaultLang(
  _subTypes: Set<string>,
  skus: TcgplayerCatalogRaw["skus"],
): string {
  if (skus.length === 0) return "en";
  const languages = new Set(skus.map((s) => languageNameToIso(s.languageName)));
  if (languages.size === 1) return languages.values().next().value!;
  return "en";
}
