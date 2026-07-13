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
 * storefront-side, reading storefront's `card_set_cards` + `card_sets`.
 * Legacy price history remains stored but is not read for public documents.
 *
 * Substrate-honest perimeter:
 *   - Natural-language fields (card_name, art_description) are flagged
 *     `_note_opaque` so a decoder knows not to ground meaning on them.
 *   - The ratio_to_platform_median_card_price is null until an aggregate
 *     publication rule covers the catalog-wide denominator.
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
  variant: string;
  game: string;
  set_name: string;
  released_at: Date | null;
  total_cards: number;
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

/** Fetch the row for a SKU, joining card_sets without legacy media or prices.
 *  `name_en` + `name_translations` columns are SELECTed via to_jsonb so the
 *  query degrades gracefully when migration 0098 hasn't applied yet — the
 *  COALESCE returns null instead of erroring on missing columns. */
async function fetchCardRow(sku: string): Promise<UniversalCardRow | null> {
  const r = await query(
    `SELECT
       csc.set_code, csc.card_number, csc.sku, csc.card_name, csc.rarity,
       csc.variant,
       (to_jsonb(csc.*) ->> 'name_en') AS name_en,
       (to_jsonb(csc.*) -> 'name_translations') AS name_translations,
       cs.game, cs.set_name, cs.released_at, cs.total_cards
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

  const retrievedAt = new Date();
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

  // Content hash identifies the underlying card. It is stable across
  // retrievals and independent of retrieval time and stored catalog prices.
  const contentSeed = canonicalize({
    sku: row.sku,
    card_number: row.card_number,
    set_code: row.set_code,
    game: row.game,
    variant: row.variant,
    magnitude_gbp: null,
    captured_on: null,
  });
  const contentHash = sha256(contentSeed);

  const _links = buildLinks({
    kind: "card",
    id: row.sku,
    parent_id: row.set_code,
    content_hash: contentHash,
  });

  // Official EN publisher image: self-hosted on a Cambridge host and always
  // carrying its copyright line, published under the field-level rule in
  // @/lib/cards/en-card-data (query enforces s3_key + takedown-clear +
  // official-sample). `en.en_image` is null when no cleared image exists — the
  // image then stays withheld exactly as before. Price stays withheld
  // unconditionally (this rule covers images only). The served url is already
  // the self-hosted CDN url; the publisher source_url is never surfaced here.
  const en = await getEnCardData(row.sku);

  const fullDocument: Record<string, unknown> = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "card",
    "@content_hash": contentHash,
    "@content_hash_contract": {
      basis: ["sku", "card_number", "set_code", "game", "variant"],
      price_input: null,
      capture_date_input: null,
      changed_on: "2026-07-12",
    },
    "@retrieved_at": {
      iso8601: retrievedAt.toISOString(),
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
    // Storage provenance is not ownership. This document mixes names,
    // rarity, and set fields;
    // the mirror does not retain field-level upstream rights lineage yet.
    "@sources": [
      "storefront-rds.card_set_cards",
      "storefront-rds.card_sets",
    ],
    "@source_license": ["proprietary", "proprietary"],
    rights: {
      aggregate: "NOASSERTION",
      cambridge_original_structure: "CC0-1.0",
      field_level_lineage_available: false,
    },
    "_note_opaque": [
      "name",
      "art_description",
      "rarity.natural_label",
      "variant.natural_label",
    ],
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
    price: null,

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
    image_url: en.en_image?.url ?? null,
    // Copyright line for image_url above. Emitted as a sibling so it travels
    // co-located with the image through every density projection — a rendered
    // image must never appear without its attribution. This is null exactly
    // when image_url is null, so the two are never separated.
    image_attribution: en.en_image?.attribution ?? null,

    // ── Official EN card details (published under the same recorded rule as the
    // image; see @/lib/cards/en-card-data). Structured game facts are published
    // as FACTS cited to the source; the effect text is published WITH its
    // copyright line. Both are siblings of image_url and, like it, flow through
    // the normal/saturated projections and are elided at sparse. ─────────────
    // The structured game facts (cost/power/colour/counter/attribute/type). null
    // when the publisher facts are absent; render only the non-null members.
    attributes: en.attributes ?? null,
    // The attributed rules text. The `attribution` (copyright line) is carried
    // INSIDE this object, so it can never be separated from the text it covers:
    // the whole object is present-or-null as a unit (null exactly when there is
    // no effect text), preserving the co-location invariant through every
    // density projection — text never travels without its copyright line.
    effect: en.effect_text
      ? {
          text: en.effect_text.text,
          card_type: en.effect_text.card_type,
          attribution: en.effect_text.attribution,
          source_url: en.effect_text.source_url,
          retrieved_at: en.effect_text.retrieved_at,
        }
      : null,
    publication_boundary: {
      price: "withheld_pending_field_level_source_rights",
      image: en.en_image
        ? "cleared_official_sample_self_hosted_attributed"
        : "withheld_pending_field_level_source_rights",
      text: en.effect_text
        ? "cleared_official_text_attributed"
        : "withheld_pending_field_level_source_rights",
    },
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
      "@content_hash_contract": fullDocument["@content_hash_contract"],
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
      // image_url + image_attribution — and likewise `attributes` + `effect` —
      // are intentionally elided at sparse density (they are heavy; sparse is
      // the minimal projection). Each is only ever dropped as a unit (the effect
      // carries its attribution inside itself), so the co-location invariant —
      // no image without its copyright line, no effect text without its
      // attribution — holds. `normal`/`saturated` spread fullDocument below,
      // carrying every field through unchanged.
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
              cover_image_url: null,
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
 * what it doesn't promise: hashes describe the current structural identity
 * fields. Federation callers who want strict identity should use the SKU
 * directly; this endpoint is for "I have a hash, what is it?" reconciliation
 * across systems.
 *
 * Implementation: walks the catalog computing content_hashes until match.
 * Returns null if no match. The walk is bounded by LIMIT (paginated callers
 * who need to scan a large catalog should pass a `since_sku` cursor — added
 * as a future enhancement, currently scans top 5000).
 */
export async function resolveContentHash(
  contentHash: string,
): Promise<{ sku: string; matched: boolean } | null> {
  // We don't recompute the full document, only the structural content seed.
  const r = await query(
    `SELECT
       csc.set_code, csc.card_number, csc.sku, csc.variant,
       cs.game
     FROM card_set_cards csc
     JOIN card_sets cs ON cs.set_code = csc.set_code
     ORDER BY csc.set_code, csc.card_number
     LIMIT 5000`,
  );

  for (const row of r.rows) {
    const seed = canonicalize({
      sku: row.sku,
      card_number: row.card_number,
      set_code: row.set_code,
      game: row.game,
      variant: row.variant,
      magnitude_gbp: null,
      captured_on: null,
    });
    if (sha256(seed) === contentHash) {
      return { sku: row.sku as string, matched: true };
    }
  }
  return null;
}
