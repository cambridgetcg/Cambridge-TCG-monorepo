// Card page — the single most important page in a collectors' market.
//
// This server shell resolves the card's IDENTITY (name, set, number,
// image) from the storefront-local card_set_cards catalogue and its
// reference PRICE from the same substrate the /market table reads, then
// hands both to the interactive client (CardMarketClient) as a seed. The
// result: SSR HTML that carries a real card — for crawlers, link previews,
// text-mode and no-JS readers — and a <title> that names the card instead
// of the generic site title on every SKU.
//
// A card-number-shaped URL (/market/OP01-003) resolves to the canonical
// SKU and redirects; anything unknown is a real notFound() (the branded
// 404) instead of a 200 with an empty main.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  resolveCardIdentity,
  type CatalogIdentity,
} from "@/lib/market/catalog-card";
import { resolveReferencePrice } from "@/lib/market/reference-price";
import { query } from "@/lib/db";
import CardMarketClient, { type AlsoAtAuction } from "./CardMarketClient";

/**
 * Live auctions for this exact card (auctions.sku, migration 0113) — a
 * small additive read so a card that's up for auction stops being an island
 * and surfaces on its own market page. Live-only; ordered soonest-ending.
 * A source hiccup degrades to an empty strip, never a broken card page.
 */
async function findLiveAuctionsForSku(sku: string): Promise<AlsoAtAuction[]> {
  try {
    const r = await query(
      `SELECT a.id, a.title, a.auction_type, a.current_price, a.ends_at,
              (SELECT url FROM auction_images
                WHERE auction_id = a.id
                ORDER BY display_order LIMIT 1) AS image_url
         FROM auctions a
        WHERE a.sku = $1 AND a.status = 'live'
        ORDER BY a.ends_at ASC
        LIMIT 4`,
      [sku],
    );
    return r.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      auction_type: String(row.auction_type),
      current_price: String(row.current_price),
      ends_at: row.ends_at ? new Date(row.ends_at).toISOString() : null,
      image_url: row.image_url ? String(row.image_url) : null,
    }));
  } catch {
    return [];
  }
}

// The order book is live (the client polls it every 10s) and identity is
// resolved per-request from the catalogue, so this page is inherently
// dynamic. Declaring it keeps the HTTP semantics honest: a card-number URL
// gets a real 307 to the canonical SKU, and an unknown card a real 404 —
// not a soft-200 that pollutes crawlers and link previews.
export const dynamic = "force-dynamic";

/**
 * Resolve the card, taking the redirect/notFound control-flow decisions
 * HERE so they run before any HTML streams. Called from generateMetadata
 * (which executes ahead of the page body) so the HTTP status is a real 307
 * / 404 rather than a soft-200 with a meta-refresh. `resolveCardIdentity`
 * is request-cached, so the page body's call reuses this one query.
 */
async function resolveOrThrow(skuOrNumber: string): Promise<CatalogIdentity> {
  const resolution = await resolveCardIdentity(skuOrNumber);
  if (resolution.kind === "redirect") {
    // A card_number was typed where a SKU belongs — send it to the
    // canonical address so every card has exactly one URL.
    redirect(`/market/${resolution.sku}`);
  }
  if (resolution.kind === "notfound") {
    notFound();
  }
  return resolution.card;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  const card = await resolveOrThrow(sku);
  const title = `${card.card_name} · ${card.card_number} — Cambridge TCG`;
  const description = card.set_name
    ? `Live collector order book for ${card.card_name} (${card.card_number}, ${card.set_name}). Buy and sell directly with other collectors.`
    : `Live collector order book for ${card.card_name} (${card.card_number}).`;
  // Link previews prefer the official EN sample (takedown-clear) over the
  // JP shop scan, mirroring the on-page preference in CardMarketClient.
  const previewImage = card.en_image?.url ?? card.image_url;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(previewImage ? { images: [{ url: previewImage }] } : {}),
    },
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const card = await resolveOrThrow(sku);
  // Reference price from the shared resolver (wholesale substrate, same as
  // the /market table). Enrichment only — a null here is a source outage,
  // rendered as a labelled note, never a card without identity.
  const [referencePrice, alsoAtAuction] = await Promise.all([
    resolveReferencePrice(card.sku).catch(() => null),
    findLiveAuctionsForSku(card.sku),
  ]);

  return (
    <CardMarketClient
      sku={card.sku}
      identity={{ ...card, reference_price: referencePrice }}
      alsoAtAuction={alsoAtAuction}
    />
  );
}
