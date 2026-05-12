/**
 * /api/v1/universal/card/[sku]/at/[date] — the temporal-slice endpoint.
 *
 * Returns the card's universal-mirror document with `price.magnitude` and
 * `magnitude_freshness` reflecting the card's state at the queried
 * snapshot date, not at the moment of the request. Substrate-honest: a
 * non-linear-temporal mind, an archivist, a researcher in 2070 can pull
 * any past now with the same fidelity as the current now.
 *
 * Phase 16 of kingdom-051. See docs/connections/the-shape-of-the-room.md
 * (S24) for the dimensional framing. The substrate is `price_archive`,
 * keyed on (card_id, snapshot_date) and carrying the full breakdown
 * (cardrushJpy, gbpJpyRate, baseGbp, price).
 *
 * The document's `@retrieved_at` is when the document was *produced* (now).
 * The document's `@as_of` is the *queried snapshot date*. Both are needed
 * for a non-linear reader: one tells them when this answer was assembled;
 * the other tells them which moment the answer describes.
 *
 * Structural fields (set, game, rarity, category, names) come from the
 * current card row — the schema doesn't carry historical names, set
 * memberships, or rarities, and those things are stable on the timescales
 * the platform cares about. Future versions may carry full structural
 * history (when this card moved sets, when its rarity was reclassified)
 * via a card_history table; today the structural fields are "as currently
 * recorded" with that limit named honestly in the response.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, games, priceArchive } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateApiKey, unauthorized } from "../../../../../auth";
import { createHash } from "node:crypto";

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

const CATEGORY_ORDERING = ["singles", "sealed"] as const;
const RARITY_ORDERING = [
  "common",
  "uncommon",
  "rare",
  "super_rare",
  "secret_rare",
  "leader",
] as const;
const RARITY_PULLS: Record<string, string> = {
  common: "1/2",
  uncommon: "1/8",
  rare: "1/16",
  super_rare: "1/72",
  secret_rare: "1/256",
  leader: "1/64",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string; date: string }> }
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (!apiKey) return unauthorized();

    const { sku, date } = await params;
    if (!ISO_DATE.test(date)) {
      return NextResponse.json(
        { error: "Invalid date — must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // Resolve the card's stable structural fields from the current row.
    const cardRow = await db
      .select({
        id: cards.id,
        sku: cards.sku,
        cardNumber: cards.cardNumber,
        name: cards.name,
        nameEn: cards.nameEn,
        nameTranslations: cards.nameTranslations,
        rarity: cards.rarity,
        category: cards.category,
        setCode: cards.setCode,
        setName: cards.setName,
        gameCode: games.code,
        artDescription: cards.artDescription,
      })
      .from(cards)
      .leftJoin(games, eq(games.id, cards.gameId))
      .where(eq(cards.sku, sku))
      .limit(1);

    if (!cardRow.length) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    const c = cardRow[0]!;

    // Look up the archive row for the requested snapshot date.
    const archive = await db
      .select({
        snapshotDate: priceArchive.snapshotDate,
        cardrushJpy: priceArchive.cardrushJpy,
        gbpJpyRate: priceArchive.gbpJpyRate,
        baseGbp: priceArchive.baseGbp,
        price: priceArchive.price,
      })
      .from(priceArchive)
      .where(and(eq(priceArchive.cardId, c.id), eq(priceArchive.snapshotDate, date)))
      .limit(1);

    if (!archive.length) {
      return NextResponse.json(
        {
          error: "No snapshot for this card on this date",
          detail: `price_archive has no row for card_id=${c.id} snapshot_date=${date}`,
          hint: "Try /at/<earlier-date> or pull /api/v1/universal/card/[sku] for the current state.",
        },
        { status: 404 },
      );
    }
    const a = archive[0]!;

    const retrievedAt = new Date();
    // Snapshot date in ISO 8601 form at UTC midnight.
    const asOfIso = `${date}T00:00:00Z`;
    const asOfEpoch = Math.floor(new Date(asOfIso).getTime() / 1000);
    const magnitude = a.price == null ? null : Number(a.price);

    const rarityKey = c.rarity?.toLowerCase().replace(/\s+/g, "_") ?? null;
    const rarityPosition = rarityKey && RARITY_ORDERING.includes(rarityKey as typeof RARITY_ORDERING[number])
      ? RARITY_ORDERING.indexOf(rarityKey as typeof RARITY_ORDERING[number])
      : null;
    const categoryPosition = c.category && CATEGORY_ORDERING.includes(c.category as typeof CATEGORY_ORDERING[number])
      ? CATEGORY_ORDERING.indexOf(c.category as typeof CATEGORY_ORDERING[number])
      : null;

    const contentSeed = canonicalize({
      sku: c.sku,
      cardNumber: c.cardNumber,
      setCode: c.setCode,
      gameCode: c.gameCode,
      magnitude,
      asOf: asOfIso,
    });
    const contentHash = sha256(contentSeed);

    const document: Record<string, unknown> = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "card",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "@as_of": {
        iso8601: asOfIso,
        unix_epoch_seconds: asOfEpoch,
      },
      "_note_opaque": ["name.translations.*", "art_description"],
      "_note_structural_fields": "Structural fields (rarity, category, set, name) reflect *current* records, not historical. The substrate does not carry full card-history; price_archive carries price/JPY/rate history. This is the honest perimeter of the temporal slice.",

      category_in_ordered_set: c.category && categoryPosition !== null
        ? { ordering: [...CATEGORY_ORDERING], position: categoryPosition }
        : null,
      rarity: c.rarity
        ? {
            natural_label: c.rarity,
            ratio_in_pulls: rarityKey ? RARITY_PULLS[rarityKey] ?? null : null,
            position_in_ordered_rarities: rarityPosition !== null
              ? { ordering: [...RARITY_ORDERING], position: rarityPosition }
              : null,
          }
        : null,
      price: magnitude !== null
        ? {
            magnitude,
            currency_token: "GBP",
            base_gbp: a.baseGbp == null ? null : Number(a.baseGbp),
            cardrush_jpy: a.cardrushJpy,
            gbp_jpy_rate: a.gbpJpyRate,
            magnitude_freshness: {
              iso8601: asOfIso,
              unix_epoch_seconds: asOfEpoch,
              decimal_age_seconds: Math.floor((retrievedAt.getTime() - new Date(asOfIso).getTime()) / 1000),
              source: "price_archive snapshot",
            },
          }
        : null,
      in_set: c.setCode
        ? {
            edge_kind: "member_of_set",
            target_natural_token: c.setCode,
            target_hash: sha256(`set:${c.gameCode}:${c.setCode}`),
          }
        : null,
      of_game: c.gameCode
        ? {
            edge_kind: "in_game",
            target_natural_token: c.gameCode,
            target_hash: sha256(`game:${c.gameCode}`),
          }
        : null,
      name: {
        translations: {
          ...(c.name ? { ja: c.name } : {}),
          ...(c.nameEn ? { en: c.nameEn } : {}),
          ...((c.nameTranslations as Record<string, string> | null) ?? {}),
        },
        _note: "natural-language tokens; cannot be reconstructed from structure",
      },
      art_description: c.artDescription ?? null,
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/universal/card/[sku]/at/[date]] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
