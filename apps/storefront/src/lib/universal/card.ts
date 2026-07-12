/**
 * Universal card representation — the math-mirror computation site.
 *
 * Returns a card in language-free form: cryptographic hashes for identity,
 * ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges
 * with content-hash targets. The encoding spec is at /methodology/universal-
 * representation; the doctrine is at docs/connections/the-mathematical-mirror.md
 * (S23); the participation surface is at /data + docs/connections/the-open-
 * substrate.md.
 *
 * This module is the **single computation site** every storefront universal-rep
 * endpoint reuses: /api/v1/universal/card/[sku], /api/v1/federation/identify/[hash]
 * (resolves a content_hash by recomputing across the catalog), future temporal-
 * slice endpoints. The wholesale-side sister (apps/wholesale/.../universal/card)
 * has its own implementation reading wholesale's `cards` table; this is the
 * storefront-side, reading storefront's `card_set_cards` + `card_sets` + the
 * latest row of `card_price_history`.
 *
 * Substrate-honest perimeter:
 *   - Natural-language fields (card_name, art_description) are flagged
 *     `_note_opaque` so a decoder knows not to ground meaning on them.
 *   - The ratio_to_platform_median_card_price is a runtime aggregate; cached
 *     per-process implicitly via the 60-second response cache.
 *   - The variant field (alt-art, foil) carries through as a structural fact;
 *     the natural label is opaque.
 *
 * Three density projections (sparse / normal / saturated) mirror sister's
 * Shape-of-the-Room work (S24) — same dimension surfaced through the same
 * `density` query param.
 */

import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { buildLinks } from "@/lib/universal/links";
import { resolveCardName } from "@/lib/cards/name";
import { getEnCardData } from "@/lib/cards/en-card-data";

export type Density = "sparse" | "normal" | "saturated";

export interface UniversalCardRow {
  set_code: string;
  card_number: string;
  sku: string;
  card_name: string;
  /** Dedicated English translation, added by drizzle/0098_card_name_translations.sql.
   *  NULL when the migration hasn't applied yet or when the row predates backfill. */
  name_en: string | null;
  /** Sparse JSONB of lang → translated name, added by drizzle/0098.
   *  NULL when not yet populated. The resolver gracefully falls back. */
  name_translations: Record<string, string | null> | null;
  rarity: string | null;
  image_url: string | null;
  variant: string;
  game: string;
  set_name: string;
  released_at: Date | null;
  total_cards: number;
  cover_image_url: string | null;
  spot_gbp: string | null;
  // The pg driver returns timestamps as strings on some paths — never call
  // Date methods on this without new Date() first (it 500'd in prod).
  captured_on: Date | string | null;
}

export interface UniversalCardResult {
  /** The math-mirror document. Includes @self_hash. */
  document: Record<string, unknown>;
  /** The content_hash without the document wrapper, for federation lookup. */
  contentHash: string;
}

/** Stable canonical-JSON: object keys sorted, no whitespace. Two retrievals
 *  of an unchanged card produce the same hash regardless of order. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

function sha256(input: string): string {
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

/** Standardized rarity ordering across the storefront catalog. */
const RARITY_ORDERING = [
  "common",
  "uncommon",
  "rare",
  "super_rare",
  "secret_rare",
  "leader",
] as const;

/** Illustrative pull-probability ratios. The true denominators live in
 *  bounty_pull_tiers; this is a public-API approximation so a decoder gets
 *  a magnitude without leaking exact per-tier weights. */
const RARITY_PULLS: Record<string, string> = {
  common: "1/2",
  uncommon: "1/8",
  rare: "1/16",
  super_rare: "1/72",
  secret_rare: "1/256",
  leader: "1/64",
};

/** Median spot price across the storefront catalog. Used as the denominator
 *  of `ratio_to_platform_median_card_price` so the magnitude is decodeable
 *  without knowing GBP. Cached in-process; the 60-second response cache on
 *  the calling endpoint amortizes the compute. */
let cachedMedian: { value: number; expiresAt: number } | null = null;
async function platformMedianPrice(): Promise<number> {
  const now = Date.now();
  if (cachedMedian && cachedMedian.expiresAt > now) return cachedMedian.value;
  const r = await query(
    `SELECT spot_gbp FROM card_price_history
      WHERE captured_on = (SELECT MAX(captured_on) FROM card_price_history)
        AND spot_gbp > 0`,
  );
  const prices = r.rows
    .map((row) => Number(row.spot_gbp))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const median = prices.length > 0
    ? prices[Math.floor(prices.length / 2)] ?? 1
    : 1;
  cachedMedian = { value: median, expiresAt: now + 5 * 60 * 1000 };
  return median;
}

/** Fetch the row for a SKU, joining card_sets + the latest card_price_history.
 *  `name_en` + `name_translations` columns are SELECTed via to_jsonb so the
 *  query degrades gracefully when migration 0098 hasn't applied yet — the
 *  COALESCE returns null instead of erroring on missing columns. */
async function fetchCardRow(sku: string): Promise<UniversalCardRow | null> {
  const r = await query(
    `SELECT
       csc.set_code, csc.card_number, csc.sku, csc.card_name, csc.rarity,
       csc.image_url, csc.variant,
       (to_jsonb(csc.*) ->> 'name_en') AS name_en,
       (to_jsonb(csc.*) -> 'name_translations') AS name_translations,
       cs.game, cs.set_name, cs.released_at, cs.total_cards, cs.cover_image_url,
       (SELECT spot_gbp FROM card_price_history
          WHERE sku = csc.sku ORDER BY captured_on DESC LIMIT 1)   AS spot_gbp,
       (SELECT captured_on FROM card_price_history
          WHERE sku = csc.sku ORDER BY captured_on DESC LIMIT 1)   AS captured_on
     FROM card_set_cards csc
     JOIN card_sets cs ON cs.set_code = csc.set_code
     WHERE csc.sku = $1
     LIMIT 1`,
    [sku],
  );
  return (r.rows[0] as UniversalCardRow | undefined) ?? null;
}

/**
 * Compute the math-mirror representation for a single card.
 * Returns null when the SKU is not in the catalog.
 *
 * `preferredLangs` is an optional ordered list of ISO 639-1 (or
 * extended) language tags the caller prefers for the card name. The
 * resolver picks the best match from `name_translations` + `name_en` +
 * `card_name`; provenance of the choice is emitted in the response.
 * Pass [] (the default) to get the platform-default name with
 * `resolved_from: "default"`.
 *
 * See `apps/storefront/src/lib/cards/name.ts` for resolution semantics.
 */
export async function buildUniversalCard(
  sku: string,
  density: Density = "normal",
  preferredLangs: string[] = [],
): Promise<UniversalCardResult | null> {
  const row = await fetchCardRow(sku);
  if (!row) return null;

  // Official EN rules text + best clear EN image (card_texts /
  // card_images, migration 0116) — joined via the EN card key derived
  // from this row's sku (join-key decision: @/lib/cards/en-card-data.ts).
  // Degrades to nulls pre-migration / pre-ingest.
  const en = await getEnCardData(row.sku);

  const retrievedAt = new Date();
  const median = await platformMedianPrice();
  const magnitude = row.spot_gbp == null ? null : Number(row.spot_gbp);

  const rarityKey = row.rarity?.toLowerCase().replace(/\s+/g, "_") ?? null;
  const rarityPosition = rarityKey && RARITY_ORDERING.includes(rarityKey as typeof RARITY_ORDERING[number])
    ? RARITY_ORDERING.indexOf(rarityKey as typeof RARITY_ORDERING[number])
    : null;

  const ratioInPulls = rarityKey ? RARITY_PULLS[rarityKey] ?? null : null;
  const decimalProbability = ratioInPulls
    ? (() => {
        const [n, d] = ratioInPulls.split("/").map(Number);
        return d ? Number((n / d).toFixed(6)) : null;
      })()
    : null;

  // Content hash — identifies the underlying card. Stable across retrievals
  // when the card's facts haven't changed. NOT a function of the retrieval
  // time or the platform median (which fluctuate).
  const contentSeed = canonicalize({
    sku: row.sku,
    card_number: row.card_number,
    set_code: row.set_code,
    game: row.game,
    variant: row.variant,
    magnitude_gbp: magnitude,
    captured_on: row.captured_on
      ? new Date(row.captured_on).toISOString().slice(0, 10)
      : null,
  });
  const contentHash = sha256(contentSeed);

  const _links = buildLinks({
    kind: "card",
    id: row.sku,
    parent_id: row.set_code,
    content_hash: contentHash,
  });

  // Source + license declarations run parallel (data-pantry convention:
  // source_license[i] declares sources[i]; values from SourceMeta.license
  // tiers). The EN entries appear only when EN data actually rides this
  // response — Bandai's rules text + official samples are `proprietary`
  // (redistribute: false; attribution required; /legal/card-images).
  // Storage provenance is not ownership (codeberg source-rights-truth,
  // 2026-07-12): the mirror does not retain field-level upstream rights
  // lineage yet, so the aggregate stays NOASSERTION and every store-read
  // is declared proprietary. EN rows append their own entries when present.
  const sources: string[] = [
    "storefront-rds.card_set_cards",
    "storefront-rds.card_sets",
    "storefront-rds.card_price_history",
  ];
  const sourceLicense: string[] = ["proprietary", "proprietary", "proprietary"];
  if (en.effect_text) {
    sources.push("storefront-rds.card_texts (bandai-en)");
    sourceLicense.push("proprietary");
  }
  if (en.en_image) {
    sources.push("storefront-rds.card_images (bandai-en)");
    sourceLicense.push("proprietary");
  }

  const noteOpaque = [
    "name",
    "art_description",
    "rarity.natural_label",
    "variant.natural_label",
    // Effect text is publisher prose — a decoder must not ground
    // meaning on it. Flagged even pre-ingest so the perimeter is stable.
    "effect_text.text",
  ];

  const fullDocument: Record<string, unknown> = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "card",
    "@content_hash": contentHash,
    "@retrieved_at": {
      iso8601: retrievedAt.toISOString(),
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
    // Storage provenance is not ownership. This document mixes names,
    // rarity, image references, set fields, and derived price observations;
    // the mirror does not retain field-level upstream rights lineage yet.
    "@sources": sources,
    "@source_license": sourceLicense,
    rights: {
      aggregate: "NOASSERTION",
      cambridge_original_structure: "CC0-1.0",
      field_level_lineage_available: false,
    },
    "_note_opaque": noteOpaque,
    _links,

    // ── Structural facts (universal) ──────────────────────────────────
    rarity: row.rarity
      ? {
          natural_label: row.rarity,
          ratio_in_pulls: ratioInPulls,
          decimal_probability: decimalProbability,
          position_in_ordered_rarities: rarityPosition !== null
            ? {
                ordering: [...RARITY_ORDERING],
                position: rarityPosition,
              }
            : null,
        }
      : null,

    variant: row.variant
      ? {
          natural_label: row.variant,
          is_default: row.variant === "",
        }
      : null,

    // ── Magnitudes (universal scalars with provenance tokens) ─────────
    price: magnitude !== null
      ? {
          magnitude,
          currency_token: "GBP",
          ratio_to_platform_median_card_price: median > 0
            ? Number((magnitude / median).toFixed(6))
            : null,
          ratio_to_minimum_currency_unit: Math.round(magnitude / 0.01),
          magnitude_freshness: row.captured_on
            ? {
                iso8601: new Date(row.captured_on).toISOString(),
                unix_epoch_seconds: Math.floor(new Date(row.captured_on).getTime() / 1000),
                decimal_age_seconds: Math.floor(
                  (retrievedAt.getTime() - new Date(row.captured_on).getTime()) / 1000,
                ),
              }
            : null,
        }
      : null,

    // ── Graph edges (typed; targets identified by content hash) ───────
    in_set: row.set_code
      ? {
          edge_kind: "member_of_set",
          target_natural_token: row.set_code,
          target_hash: sha256(`set:${row.game}:${row.set_code}`),
        }
      : null,
    of_game: row.game
      ? {
          edge_kind: "in_game",
          target_natural_token: row.game,
          target_hash: sha256(`game:${row.game}`),
        }
      : null,

    // ── Natural-language fields (flagged opaque) ──────────────────────
    name: row.card_name
      ? (() => {
          const resolution = resolveCardName(
            {
              card_name: row.card_name,
              name_en: row.name_en,
              name_translations: row.name_translations,
            },
            preferredLangs,
          );
          return {
            natural_token: resolution.resolved,
            resolved_lang: resolution.resolved_lang,
            resolved_from: resolution.resolved_from,
            available_languages: resolution.available_languages,
            // Full fallback chain only emitted at saturated density.
            ...(density === "saturated"
              ? { fallback_chain: resolution.fallback_chain }
              : {}),
            _note: "natural-language; cannot be reconstructed from structure",
          };
        })()
      : null,
    // JP catalogue scan — unchanged; the EN surfaces below are additive.
    image_url: row.image_url,

    // ── Official EN card data (card_texts / card_images, 0116) ────────
    // Provenance rides every field: attribution is NOT NULL by schema,
    // retrieved_at says when we fetched, source_url names the publisher
    // page. Null when the card has no EN data yet — a normal state.
    effect_text: en.effect_text
      ? {
          text: en.effect_text.text,
          attribution: en.effect_text.attribution,
          source_url: en.effect_text.source_url,
          retrieved_at: en.effect_text.retrieved_at,
        }
      : null,
    en_image: en.en_image
      ? {
          url: en.en_image.url,
          attribution: en.en_image.attribution,
          kind: en.en_image.kind,
        }
      : null,
  };

  // Density-dimension projection (sister's Shape-of-the-Room work, S24).
  let projected: Record<string, unknown>;
  if (density === "sparse") {
    const price = fullDocument.price as Record<string, unknown> | null;
    const inSet = fullDocument.in_set as Record<string, unknown> | null;
    const ofGame = fullDocument.of_game as Record<string, unknown> | null;
    projected = {
      "@encoding": fullDocument["@encoding"],
      "@kind": fullDocument["@kind"],
      "@content_hash": fullDocument["@content_hash"],
      "@retrieved_at": fullDocument["@retrieved_at"],
      // License declarations are non-elidable — even sparse density carries
      // them, so a downstream that trims to minimum still knows the upstream
      // redistribution tier. kingdom-081 Phase 2.1.
      "@sources": fullDocument["@sources"],
      "@source_license": fullDocument["@source_license"],
      "@density": "sparse",
      "_note_opaque": fullDocument["_note_opaque"],
      price: price ? { magnitude: price.magnitude, currency_token: price.currency_token } : null,
      in_set: inSet ? { target_hash: inSet.target_hash } : null,
      of_game: ofGame ? { target_hash: ofGame.target_hash } : null,
    };
  } else if (density === "saturated") {
    projected = {
      ...fullDocument,
      "@density": "saturated",
      neighbours: {
        set: row.set_code
          ? {
              target_natural_token: row.set_code,
              target_hash: sha256(`set:${row.game}:${row.set_code}`),
              set_name: row.set_name,
              total_cards: row.total_cards,
              released_at: row.released_at?.toISOString().slice(0, 10) ?? null,
              cover_image_url: row.cover_image_url,
            }
          : null,
        game: row.game
          ? {
              target_natural_token: row.game,
              target_hash: sha256(`game:${row.game}`),
            }
          : null,
      },
    };
  } else {
    projected = { ...fullDocument, "@density": "normal" };
  }

  // Self-hash includes the density projection and the retrieval timestamp,
  // so different retrievals produce different self-hashes; content-hash
  // remains stable.
  const selfHash = sha256(canonicalize(projected));
  const document = { "@self_hash": selfHash, ...projected };

  return { document, contentHash };
}

/**
 * Resolve a content_hash back to its SKU by scanning the catalog.
 *
 * Federation primitive: another platform that has cached a Cambridge TCG
 * content_hash can call this to find the current SKU. Substrate-honest about
 * what it doesn't promise: the content_hash includes captured_on, so a hash
 * computed yesterday won't match the hash computed today unless the card's
 * price was unchanged. The "stable identity" is (sku + set + game + variant);
 * the "stable + magnitude" is what content_hash captures. Federation callers
 * who want strict identity should use the SKU directly; this endpoint is for
 * "I have a hash, what is it?" reconciliation across systems.
 *
 * Implementation: walks the catalog computing content_hashes until match.
 * Returns null if no match. The walk is bounded by LIMIT (paginated callers
 * who need to scan a large catalog should pass a `since_sku` cursor — added
 * as a future enhancement, currently scans top 5000).
 */
export async function resolveContentHash(
  contentHash: string,
): Promise<{ sku: string; matched: boolean } | null> {
  // Fast path: the contentHash includes captured_on, so a sweep of recent
  // cards is the right scope. We don't recompute the full document — just
  // the contentSeed, which is the only thing that goes into the hash.
  const r = await query(
    `SELECT
       csc.set_code, csc.card_number, csc.sku, csc.variant,
       cs.game,
       (SELECT spot_gbp FROM card_price_history
          WHERE sku = csc.sku ORDER BY captured_on DESC LIMIT 1)   AS spot_gbp,
       (SELECT captured_on FROM card_price_history
          WHERE sku = csc.sku ORDER BY captured_on DESC LIMIT 1)   AS captured_on
     FROM card_set_cards csc
     JOIN card_sets cs ON cs.set_code = csc.set_code
     ORDER BY csc.set_code, csc.card_number
     LIMIT 5000`,
  );

  for (const row of r.rows) {
    const magnitude = row.spot_gbp == null ? null : Number(row.spot_gbp);
    const seed = canonicalize({
      sku: row.sku,
      card_number: row.card_number,
      set_code: row.set_code,
      game: row.game,
      variant: row.variant,
      magnitude_gbp: magnitude,
      captured_on: row.captured_on
        ? new Date(row.captured_on).toISOString().slice(0, 10)
        : null,
    });
    if (sha256(seed) === contentHash) {
      return { sku: row.sku as string, matched: true };
    }
  }
  return null;
}
