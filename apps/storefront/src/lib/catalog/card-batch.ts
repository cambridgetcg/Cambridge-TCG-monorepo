/**
 * Resolve a small, caller-chosen bundle of card SKUs in one catalog read.
 *
 * This is the bridge between singleton card routes and the full catalog
 * export. A deck, binder import, bot command, or comparison view usually
 * already knows which cards it wants; making it perform one request per card
 * creates avoidable work. The bundle stays bounded and returns only the same
 * storefront-mirror identity projection. Price observations and image URLs
 * stay out: their live table compatibility and field-level source rights are
 * not strong enough for a new multi-card surface yet.
 *
 * Absence is deliberately narrow: `not_in_storefront_mirror` does not claim
 * that a publisher, upstream source, or the wholesale catalog lacks the card.
 */

import { query } from "@/lib/db";
import { normalizeSku } from "@cambridge-tcg/sku";
import { skuSpellings } from "./sku-spellings";
import type { CompatQueryResult } from "@cambridge-tcg/db/compat";

export const CARD_BATCH_MAX_SKUS = 100;
export const CARD_BATCH_MAX_SKU_LENGTH = 160;

type Query = (
  sql: string,
  params?: unknown[],
) => Promise<CompatQueryResult>;

export class CardBatchInputError extends Error {
  readonly field: string;

  constructor(message: string, field = "skus") {
    super(message);
    this.name = "CardBatchInputError";
    this.field = field;
  }
}

export class CardBatchUnavailableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The storefront card mirror could not be read.");
    this.name = "CardBatchUnavailableError";
    this.cause = cause;
  }
}

export interface CardBatchCard {
  sku: string;
  canonical_sku: string;
  card_number: string;
  name: string;
  name_en: string | null;
  name_translations: Record<string, string> | null;
  set: {
    code: string;
    name: string;
  };
  game: string;
  variant: string | null;
  rarity: string | null;
}

export type CardBatchResult =
  | {
      requested_sku: string;
      status: "found";
      matched_by: "stored_sku" | "canonical_alias";
      card: CardBatchCard;
      links: {
        html: string;
        universal: string;
        everything: string;
        evidence: string;
      };
    }
  | {
      requested_sku: string;
      status: "invalid_sku";
      reason: string;
    }
  | {
      requested_sku: string;
      canonical_sku: string;
      status: "not_in_storefront_mirror";
      reason: string;
    }
  | {
      requested_sku: string;
      canonical_sku: string;
      status: "ambiguous_mirror_match";
      candidate_skus: string[];
      reason: string;
    };

export interface CardBatchResolution {
  requested_count: number;
  unique_requested_count: number;
  found_count: number;
  not_in_mirror_count: number;
  invalid_count: number;
  ambiguous_count: number;
  mirror_queried: boolean;
  results: CardBatchResult[];
}

interface CardBatchRow {
  sku: string;
  card_number: string;
  card_name: string;
  name_en: string | null;
  name_translations: unknown;
  rarity: string | null;
  variant: string;
  set_code: string;
  set_name: string;
  game: string;
}

interface PreparedSku {
  requested: string;
  canonical: string | null;
  candidates: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function prepareSku(requested: string): PreparedSku {
  const canonical = normalizeSku(requested);
  return { requested, canonical, candidates: canonical ? skuSpellings(requested) : [] };
}

function translations(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function foundResult(
  requested: string,
  canonical: string,
  row: CardBatchRow,
): Extract<CardBatchResult, { status: "found" }> {
  const encoded = encodeURIComponent(row.sku);
  return {
    requested_sku: requested,
    status: "found",
    matched_by:
      row.sku.toLowerCase() === requested.toLowerCase()
        ? "stored_sku"
        : "canonical_alias",
    card: {
      sku: row.sku,
      canonical_sku: normalizeSku(row.sku) ?? canonical,
      card_number: row.card_number,
      name: row.card_name,
      name_en: row.name_en,
      name_translations: translations(row.name_translations),
      set: { code: row.set_code, name: row.set_name },
      game: row.game,
      variant: row.variant || null,
      rarity: row.rarity,
    },
    links: {
      html: `/product/${encoded}`,
      universal: `/api/v1/universal/card/${encoded}`,
      everything: `/api/v1/cards/${encoded}/everything`,
      evidence: `/api/v1/cards/${encoded}/evidence`,
    },
  };
}

export function parseCardBatchInput(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CardBatchInputError("The request body must be an object with a skus array.", "body");
  }

  const record = body as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => key !== "skus");
  if (extra.length > 0) {
    throw new CardBatchInputError(
      `Unknown request field${extra.length === 1 ? "" : "s"}: ${extra.join(", ")}.`,
      extra[0],
    );
  }

  if (!Array.isArray(record.skus)) {
    throw new CardBatchInputError("skus must be an array of SKU strings.");
  }
  if (record.skus.length === 0) {
    throw new CardBatchInputError("skus must contain at least one SKU.");
  }
  if (record.skus.length > CARD_BATCH_MAX_SKUS) {
    throw new CardBatchInputError(
      `skus may contain at most ${CARD_BATCH_MAX_SKUS} entries.`,
    );
  }

  return record.skus.map((value, index) => {
    if (typeof value !== "string") {
      throw new CardBatchInputError(`skus[${index}] must be a string.`, `skus[${index}]`);
    }
    const sku = value.trim();
    if (!sku) {
      throw new CardBatchInputError(`skus[${index}] must not be blank.`, `skus[${index}]`);
    }
    if (sku.length > CARD_BATCH_MAX_SKU_LENGTH) {
      throw new CardBatchInputError(
        `skus[${index}] must be at most ${CARD_BATCH_MAX_SKU_LENGTH} characters.`,
        `skus[${index}]`,
      );
    }
    return sku;
  });
}

export async function resolveCardBatch(
  requestedSkus: readonly string[],
  q: Query = query,
): Promise<CardBatchResolution> {
  const prepared = requestedSkus.map(prepareSku);
  const queryCandidates = unique(
    prepared.flatMap((item) => item.candidates),
  );

  let rows: CardBatchRow[] = [];
  if (queryCandidates.length > 0) {
    try {
      const result = await q(
        `SELECT
           csc.sku,
           csc.card_number,
           csc.card_name,
           (to_jsonb(csc.*) ->> 'name_en') AS name_en,
           (to_jsonb(csc.*) -> 'name_translations') AS name_translations,
           csc.rarity,
           csc.variant,
           csc.set_code,
           cs.set_name,
           cs.game
         FROM card_set_cards csc
         JOIN card_sets cs ON cs.set_code = csc.set_code
        WHERE csc.sku = ANY($1::text[])
        ORDER BY csc.sku ASC`,
        [queryCandidates],
      );
      rows = result.rows as unknown as CardBatchRow[];
    } catch (error) {
      throw new CardBatchUnavailableError(error);
    }
  }

  const byLowerSku = new Map<string, CardBatchRow[]>();
  for (const row of rows) {
    const key = row.sku.toLowerCase();
    byLowerSku.set(key, [...(byLowerSku.get(key) ?? []), row]);
  }

  const results: CardBatchResult[] = prepared.map((item) => {
    if (!item.canonical) {
      return {
        requested_sku: item.requested,
        status: "invalid_sku",
        reason:
          "The value is not a canonical Cambridge SKU and could not be normalized from a recognized legacy form.",
      };
    }

    const matches = unique(
      item.candidates.flatMap((candidate) =>
        (byLowerSku.get(candidate.toLowerCase()) ?? []).map((row) => row.sku),
      ),
    ).map((sku) => rows.find((row) => row.sku === sku)!);

    if (matches.length === 0) {
      return {
        requested_sku: item.requested,
        canonical_sku: item.canonical,
        status: "not_in_storefront_mirror",
        reason:
          "No matching row is present in the storefront card mirror. This does not mean the card is absent from its publisher or another catalog.",
      };
    }
    if (matches.length > 1) {
      return {
        requested_sku: item.requested,
        canonical_sku: item.canonical,
        status: "ambiguous_mirror_match",
        candidate_skus: matches.map((row) => row.sku),
        reason:
          "More than one stored SKU normalizes to this request, so the service will not choose one silently.",
      };
    }
    return foundResult(item.requested, item.canonical, matches[0]!);
  });

  return {
    requested_count: requestedSkus.length,
    unique_requested_count: new Set(requestedSkus).size,
    found_count: results.filter((item) => item.status === "found").length,
    not_in_mirror_count: results.filter(
      (item) => item.status === "not_in_storefront_mirror",
    ).length,
    invalid_count: results.filter((item) => item.status === "invalid_sku").length,
    ambiguous_count: results.filter(
      (item) => item.status === "ambiguous_mirror_match",
    ).length,
    mirror_queried: queryCandidates.length > 0,
    results,
  };
}
