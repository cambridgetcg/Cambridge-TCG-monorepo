/**
 * /api/v1/universal/card/[sku] — the math-first card representation.
 *
 * The platform's "universal mirror" surface. Where /api/v1/prices/[sku]
 * returns a card in English-Latin-numerals form (consumer-friendly,
 * fast for known-readers), this endpoint returns the same card in a
 * *math-first* representation that any computing intelligence can
 * decode — regardless of natural language, culture, substrate, or
 * evolutionary history.
 *
 * Phase 14 of kingdom-051. See:
 *   - docs/connections/the-mathematical-mirror.md (S23) for the framing
 *   - docs/methodology/universal-representation.md for the encoding spec
 *
 * The encoding's universal commitments:
 *   - Cryptographic hashes for identity (sha256)
 *   - Ratios and decimal probabilities for magnitudes
 *   - ISO 8601 + Unix epoch for time (both representations carried)
 *   - Cardinal positions in ordered sets
 *   - Typed graph edges with hash-target identifiers
 *   - Natural-language fields flagged opaque via _note_opaque
 *
 * This endpoint is the first concrete instance of the encoding; the
 * pattern generalises to set / game / trade / match / bounty-pull via
 * future /api/v1/universal/{kind}/{id} routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, games, sets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey, unauthorized } from "../../../auth";
import { createHash } from "node:crypto";

// Stable canonical-JSON: object keys sorted, no whitespace. Used to
// compute @content_hash so two retrievals of an unchanged card produce
// the same hash even when retrieved at different times.
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

const RARITY_ORDERING = [
  "common",
  "uncommon",
  "rare",
  "super_rare",
  "secret_rare",
  "leader",
] as const;

// Rough pull-probability denominator per rarity (illustrative).
// True denominators are in bounty_pull_tiers; this is a public-API approximation
// to satisfy the universal-mirror's "ratio_in_pulls" without leaking exact
// per-tier weights.
const RARITY_PULLS: Record<string, string> = {
  common: "1/2",
  uncommon: "1/8",
  rare: "1/16",
  super_rare: "1/72",
  secret_rare: "1/256",
  leader: "1/64",
};

const CATEGORY_ORDERING = ["singles", "sealed"] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (!apiKey) return unauthorized();

    const { sku } = await params;

    // Phase 15 of kingdom-051 — density dimension. Sparse trims to identity
    // + magnitude. Saturated adds resolved one-hop graph neighbours.
    // See docs/connections/the-shape-of-the-room.md (S24).
    const densityParam = req.nextUrl.searchParams.get("density");
    const density: "sparse" | "normal" | "saturated" =
      densityParam === "sparse" ? "sparse"
      : densityParam === "saturated" ? "saturated"
      : "normal";

    const rows = await db
      .select({
        id: cards.id,
        sku: cards.sku,
        cardNumber: cards.cardNumber,
        name: cards.name,
        nameEn: cards.nameEn,
        nameTranslations: cards.nameTranslations,
        price: cards.price,
        baseGbp: cards.baseGbp,
        cardrushJpy: cards.cardrushJpy,
        gbpJpyRate: cards.gbpJpyRate,
        stock: cards.stock,
        rarity: cards.rarity,
        category: cards.category,
        setCode: cards.setCode,
        setName: cards.setName,
        setId: cards.setId,
        gameId: cards.gameId,
        gameCode: games.code,
        imageUrl: cards.imageUrl,
        artDescription: cards.artDescription,
        lastSyncedAt: cards.lastSyncedAt,
      })
      .from(cards)
      .leftJoin(games, eq(games.id, cards.gameId))
      .where(eq(cards.sku, sku))
      .limit(1);

    if (!rows.length) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    const r = rows[0]!;
    const retrievedAt = new Date();

    // Compute median card price for the platform (used in the price-ratio
    // representation). Cached per process; not real-time. Acceptable
    // because the ratio is illustrative — the canonical magnitude stays
    // unchanged.
    const medianResult = await db
      .select({ p: cards.price })
      .from(cards);
    const allPrices = medianResult
      .map((x) => (x.p == null ? null : Number(x.p)))
      .filter((x): x is number => x !== null && x > 0)
      .sort((a, b) => a - b);
    const median = allPrices.length > 0
      ? allPrices[Math.floor(allPrices.length / 2)]!
      : 1;

    // Magnitude in canonical GBP (the legal authority).
    const magnitude = r.price == null ? null : Number(r.price);

    // Build the math-first representation. Natural-language fields go into
    // `name.translations` and `art_description`, both flagged in _note_opaque.
    const rarityKey = r.rarity?.toLowerCase().replace(/\s+/g, "_") ?? null;
    const rarityPosition = rarityKey && RARITY_ORDERING.includes(rarityKey as typeof RARITY_ORDERING[number])
      ? RARITY_ORDERING.indexOf(rarityKey as typeof RARITY_ORDERING[number])
      : null;

    const categoryPosition = r.category && CATEGORY_ORDERING.includes(r.category as typeof CATEGORY_ORDERING[number])
      ? CATEGORY_ORDERING.indexOf(r.category as typeof CATEGORY_ORDERING[number])
      : null;

    // Content hash — identifies the underlying card; stable across
    // retrievals when the card's facts have not changed.
    const contentSeed = canonicalize({
      sku: r.sku,
      cardNumber: r.cardNumber,
      setCode: r.setCode,
      gameCode: r.gameCode,
      magnitude,
      stock: r.stock,
      lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
    });
    const contentHash = sha256(contentSeed);

    // Per-record provenance (kingdom-081 Phase 2.1). The card's current
    // price comes from the daily snapshot pipeline; today the only upstream
    // is CardRush JP retail (license: internal-only; see
    // `packages/data-ingest/src/cardrush/`). When TCGplayer or Cardmarket
    // modules ship, this branches per-row; for now, every priced card with
    // `cardrushJpy IS NOT NULL` is cardrush-derived. The wholesale RDS row
    // is the immediate read; cardrush is the ultimate upstream.
    const has_cardrush_lineage = r.cardrushJpy !== null && r.cardrushJpy !== undefined;
    const provenance_sources = has_cardrush_lineage
      ? ["wholesale-rds.cards", "cardrush"]
      : ["wholesale-rds.cards"];
    const provenance_source_license = has_cardrush_lineage
      ? ["internal-only", "internal-only"]
      : ["internal-only"];

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "card",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "@sources": provenance_sources,
      // Parallel to @sources. The CardRush license (internal-only) propagates
      // to the wholesale RDS row that recorded its observation — same tier
      // travels with the record. A downstream B2B partner that calls this
      // endpoint with their bearer key MUST honour this tier (no bulk
      // re-export of cardrush-derived price magnitudes).
      "@source_license": provenance_source_license,
      "_note_opaque": [
        "name.translations.*",
        "art_description",
      ],

      // ── Structural facts (universal) ──────────────────────────────────
      category_in_ordered_set: r.category && categoryPosition !== null
        ? {
            ordering: [...CATEGORY_ORDERING],
            position: categoryPosition,
          }
        : null,
      rarity: r.rarity
        ? {
            natural_label: r.rarity,
            ratio_in_pulls: rarityKey ? RARITY_PULLS[rarityKey] ?? null : null,
            decimal_probability: rarityKey && RARITY_PULLS[rarityKey]
              ? (() => {
                  const [n, d] = RARITY_PULLS[rarityKey]!.split("/").map(Number);
                  return d ? Number((n / d).toFixed(6)) : null;
                })()
              : null,
            position_in_ordered_rarities: rarityPosition !== null
              ? {
                  ordering: [...RARITY_ORDERING],
                  position: rarityPosition,
                }
              : null,
          }
        : null,

      // ── Magnitudes (universal scalars with provenance tokens) ─────────
      price: magnitude !== null
        ? {
            magnitude,
            currency_token: "GBP",
            ratio_to_platform_median_card_price: Number((magnitude / median).toFixed(6)),
            ratio_to_set_minimum_significant_unit: Math.round(magnitude / 0.01),
            magnitude_freshness: r.lastSyncedAt
              ? {
                  iso8601: r.lastSyncedAt.toISOString(),
                  unix_epoch_seconds: Math.floor(r.lastSyncedAt.getTime() / 1000),
                  decimal_age_seconds: Math.floor((retrievedAt.getTime() - r.lastSyncedAt.getTime()) / 1000),
                }
              : null,
          }
        : null,

      stock_on_hand: r.stock,

      // ── Graph edges (typed; targets identified by content hash) ───────
      in_set: r.setCode
        ? {
            edge_kind: "member_of_set",
            target_natural_token: r.setCode,
            target_hash: sha256(`set:${r.gameCode}:${r.setCode}`),
          }
        : null,
      of_game: r.gameCode
        ? {
            edge_kind: "in_game",
            target_natural_token: r.gameCode,
            target_hash: sha256(`game:${r.gameCode}`),
          }
        : null,

      // ── Natural-language fields (flagged opaque) ──────────────────────
      name: {
        translations: {
          ...(r.name ? { ja: r.name } : {}),
          ...(r.nameEn ? { en: r.nameEn } : {}),
          ...((r.nameTranslations as Record<string, string> | null) ?? {}),
        },
        _note: "natural-language tokens; cannot be reconstructed from structure",
      },
      art_description: r.artDescription ?? null,

      // ── Self-hash last (depends on everything above) ─────────────────
      // Computed below and appended.
    };

    // Density-dimension projection (Phase 15 of kingdom-051).
    // Sparse: keep only preamble + price.magnitude + graph-edge hashes.
    // Saturated: add a `neighbours` block with one-hop resolved identities.
    // Normal: as-is.
    let projected: Record<string, unknown> = document as unknown as Record<string, unknown>;
    if (density === "sparse") {
      projected = {
        "@encoding": document["@encoding"],
        "@kind": document["@kind"],
        "@content_hash": document["@content_hash"],
        "@retrieved_at": document["@retrieved_at"],
        // License declarations are non-elidable. kingdom-081 Phase 2.1.
        "@sources": document["@sources"],
        "@source_license": document["@source_license"],
        "@density": "sparse",
        "_note_opaque": document["_note_opaque"],
        price: document.price ? {
          magnitude: (document.price as Record<string, unknown>).magnitude,
          currency_token: (document.price as Record<string, unknown>).currency_token,
        } : null,
        in_set: document.in_set ? {
          target_hash: (document.in_set as Record<string, unknown>).target_hash,
        } : null,
        of_game: document.of_game ? {
          target_hash: (document.of_game as Record<string, unknown>).target_hash,
        } : null,
      };
    } else if (density === "saturated") {
      projected = {
        ...document,
        "@density": "saturated",
        neighbours: {
          set: r.setCode
            ? {
                target_natural_token: r.setCode,
                target_hash: sha256(`set:${r.gameCode}:${r.setCode}`),
                name_token: r.setName ?? null,
              }
            : null,
          game: r.gameCode
            ? {
                target_natural_token: r.gameCode,
                target_hash: sha256(`game:${r.gameCode}`),
              }
            : null,
        },
      };
    } else {
      projected = { ...document, "@density": "normal" };
    }

    const selfHash = sha256(canonicalize(projected));
    return NextResponse.json({ "@self_hash": selfHash, ...projected }, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/universal/card/[sku]] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
