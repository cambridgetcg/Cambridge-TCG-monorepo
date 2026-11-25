import { NextResponse } from "next/server";
import { skuIdentity } from "@cambridge-tcg/sku";
import type { CardAbsence } from "@/lib/wholesale/client";
import type { CardMiss } from "./card";

const WHY: Record<CardAbsence["reason"], string> = {
  unknown_sku: "No catalogue row is stored under this SKU in any spelling.",
  no_listing: "The catalogue has no listing of this card number in this language.",
  none_plain: "The catalogue has listings of this card number, but none filed under this set whose title shows it is the plain printing: each carries a condition, a grade, a variant mark or a rarity that is not a base one, is filed elsewhere, or has a title that could not be read. None is put in its place.",
  several_plain: "More than one listing of this card number reads as the plain printing, so none is picked.",
  marked_listing: "The listing stored under this SKU is marked as a condition, a grade or a variant, so it does not answer for the plain printing.",
  titles_not_reviewed: "This SKU names a plain printing, and listing titles of this game have not been reviewed, so no listing can be named as the plain one.",
};

/** The answer when a SKU has no card: 404 with the reason and where to look
 * next, or 503 when the catalogue could not be read. */
export function cardMissing(sku: string, miss: CardMiss): NextResponse {
  const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
  if (miss.unavailable) {
    return NextResponse.json(
      { error: { code: "source_unavailable", message: "The card catalogue could not be read. This is an outage, not a missing card; try again later." } },
      { status: 503, headers },
    );
  }
  const asked = skuIdentity(sku);
  const reason = miss.absence?.reason ?? "unknown_sku";
  return NextResponse.json(
    {
      error: {
        code: "card_not_found",
        message: `No card is answered for "${sku}". ${WHY[reason]}${asked ? "" : " A SKU looks like op-op01-001-ja."}`,
        details: {
          sku,
          reason,
          listings: (miss.absence?.listings ?? []).map((listing) => ({ sku: listing, url: `/api/v1/universal/card/${encodeURIComponent(listing)}` })),
          search: asked ? `/api/v1/search/cards?game=${asked.game}&q=${encodeURIComponent(`${asked.set}-${asked.number}`.toUpperCase())}` : "/api/v1/search/cards?game=op&q=OP01-001",
        },
      },
    },
    { status: 404, headers },
  );
}
