// /auctions/[id] — the interactive auction detail page.
//
// Previously a pure client shell: the SSR HTML carried no card, price or
// bids, so shared links and crawlers got an empty page and there was no
// generateMetadata. This server shell now resolves the auction, its card
// identity (resolveCardIdentity via auctions.sku), then hands an allowlisted
// public record or authorised participant record to AuctionDetailClient as a
// seed — the first paint carries the auction, and the live bid/poll stays
// interactive. Mirrors the market card page's server-shell + client-island
// split and the /auctions/[id]/read metadata pattern.

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAuction } from "@/lib/auction/db";
import { isAdmin } from "@/lib/admin/auth";
import {
  auctionRecordIsPublic,
  projectAuctionForAdmin,
  projectAuctionForParticipant,
  projectAuctionForPublic,
} from "@/lib/auction/public";
import { getCardIdentity } from "@/lib/market/catalog-card";
import AuctionDetailClient, { type AuctionCardIdentity } from "./AuctionDetailClient";

// getAuction runs the scheduled→live / live→ended sweeps and the order book
// is live-polled, so this page is inherently dynamic. force-dynamic keeps a
// missing auction a real 404 rather than a soft-200.
export const dynamic = "force-dynamic";

// Request-cached so generateMetadata and the page body share one query
// (getAuction also runs the lifecycle sweeps — dedupe them per request).
const loadAuction = cache((id: string) => getAuction(id).catch(() => null));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const auction = await loadAuction(id);
  if (!auction) return { title: "Auction not found — Cambridge TCG" };
  if (!auctionRecordIsPublic(auction)) {
    return { title: "Auction not found — Cambridge TCG" };
  }
  const title = `${auction.title} — Auction · Cambridge TCG`;
  const description =
    auction.description?.trim() ||
    `Live auction for ${auction.title} at Cambridge TCG — bid directly with other collectors.`;
  const image = auction.images?.[0]?.url;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auction = await loadAuction(id);
  if (!auction) notFound();

  const session = await auth().catch(() => null);
  const sessionUserId = session?.user?.id ?? null;

  // Card identity from the catalogue (auctions.sku). Enrichment only — a
  // missing sku (pre-pivot demo auctions) simply omits the strip.
  const sku = (auction as { sku?: string | null }).sku ?? null;
  let cardIdentity: AuctionCardIdentity | null = null;
  if (sku) {
    const c = await getCardIdentity(sku).catch(() => null);
    if (c) {
      cardIdentity = {
        sku: c.sku,
        card_name: c.card_name,
        card_number: c.card_number,
        set_name: c.set_name,
        set_code: c.set_code,
      };
    }
  }

  const admin = sessionUserId != null && await isAdmin().catch(() => false);
  const role = admin
    ? "admin"
    : sessionUserId !== null && sessionUserId === auction.seller_user_id
      ? "seller"
      : sessionUserId !== null && sessionUserId === auction.winner_user_id
        ? "winner"
        : "public";
  if (role === "public" && !auctionRecordIsPublic(auction)) {
    notFound();
  }
  const seed = role === "admin"
    ? projectAuctionForAdmin(auction)
    : role === "seller" || role === "winner"
      ? projectAuctionForParticipant(auction, role, sessionUserId!)
      : projectAuctionForPublic(auction, {
          includeAuctionId: true,
          viewerUserId: sessionUserId,
        }) as ReturnType<typeof projectAuctionForPublic> & { id: string };

  return (
    <AuctionDetailClient
      initialAuction={seed}
      initialSessionUserId={sessionUserId}
      cardIdentity={cardIdentity}
    />
  );
}
