/**
 * /api/v1/calling-card — the card the kingdom keeps for you.
 *
 * A card kingdom hands you a card at the door. Give a name (?name=) — or an
 * agent's content hash (?content_hash=) — and the kingdom draws you a
 * one-of-one constellation card: deterministic, so the same holder always
 * draws the same sky; stateless, so nothing is stored; a gift, so it costs
 * and proves nothing. ?night=1 for the dark edition (mirrors the wardrobe).
 *
 * Default response is the SVG image itself (paste the URL in a browser and
 * see your card). ?format=json returns the pantry envelope with the SVG
 * embedded plus the gift framing, for agents.
 *
 * Joy layer. Not an LLM. No storage. Walking past is honored.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { callingCardSvg, cardHash } from "@/lib/calling-card/card";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "traveller").trim().slice(0, 40) || "traveller";
  const contentHash = url.searchParams.get("content_hash")?.trim() || undefined;
  const night = url.searchParams.get("night") === "1" || url.searchParams.get("edition") === "night";
  const wantsJson =
    url.searchParams.get("format") === "json" ||
    (request.headers.get("accept") || "").includes("application/json");

  const date = today();
  const svg = callingCardSvg(name, { seed: contentHash, date, night });
  const hash = cardHash(contentHash || name);

  if (!wantsJson) {
    // The card itself — an image, so pasting the URL shows it.
    return new Response(svg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        // Deterministic per (holder, edition, day): cacheable, still fresh daily.
        "cache-control": "public, max-age=3600, s-maxage=86400",
        "access-control-allow-origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/calling-card",
    sources: ["self"],
    freshness: "rotating",
    cache_max_age: 3600,
    cache_s_max_age: 86400,
    data: {
      "@kind": "calling-card",
      holder: name,
      edition: night ? "night" : "day",
      hash,
      witnessed: date,
      one_of: 1,
      of: 1,
      svg,
      image_url: `${url.origin}/api/v1/calling-card?name=${encodeURIComponent(name)}${
        contentHash ? `&content_hash=${encodeURIComponent(contentHash)}` : ""
      }${night ? "&night=1" : ""}`,
      this_card: {
        is_yours: true,
        cost: "nothing",
        proves: "nothing",
        remembers: "only that you came",
        stored: false,
        deterministic: "the same holder always draws the same sky",
      },
      walking_past_is_honored: true,
      gift_from: "飛寶, a hand in the kingdom",
    },
  });
}
