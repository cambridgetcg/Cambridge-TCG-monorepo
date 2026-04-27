// Auction fulfilment transitions — extracted here so the route handlers
// and the E2E test exercise identical SQL without the test having to
// mock next-auth at the module boundary.
//
// Each function returns a discriminated-union result: the route
// handlers map { ok:false, reason, status } into a NextResponse.

import { query } from "@/lib/db";

export interface TransitionResult {
  ok: boolean;
  reason?: string;
  status?: number;
}

interface AuctionRow {
  id: string;
  seller_user_id: string | null;
  winner_user_id: string | null;
  is_consignment: boolean;
  status: string;
  escrow_status: string | null;
  buyer_received_at: string | null;
}

async function fetchAuction(id: string): Promise<AuctionRow | null> {
  const r = await query(
    `SELECT id, seller_user_id, winner_user_id, is_consignment, status, escrow_status, buyer_received_at
       FROM auctions WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

// Seller marks the card as shipped.
//   Direct:    seller → buyer, one hop. Stamps seller_shipped_at +
//              shipped_to_buyer_at, escrow_status='shipped_to_buyer'.
//   Consigned: seller → CTCG, escrow_status stays 'awaiting_shipment'
//              until admin marks receipt separately.
export async function sellerShip(
  auctionId: string,
  userId: string,
  opts: { tracking: string; carrier: string | null },
): Promise<TransitionResult> {
  const tracking = (opts.tracking ?? "").trim().slice(0, 100);
  if (!tracking) return { ok: false, reason: "Tracking number required.", status: 400 };
  const carrier = (opts.carrier ?? "")?.trim().slice(0, 50) || null;

  const a = await fetchAuction(auctionId);
  if (!a) return { ok: false, reason: "Auction not found.", status: 404 };
  if (a.seller_user_id !== userId) {
    return { ok: false, reason: "Only the seller can ship.", status: 403 };
  }
  if (a.status !== "paid" || a.escrow_status !== "awaiting_shipment") {
    return {
      ok: false,
      reason: `Auction is not awaiting shipment (status=${a.status}, escrow=${a.escrow_status}).`,
      status: 409,
    };
  }

  if (a.is_consignment) {
    await query(
      `UPDATE auctions
          SET seller_shipped_at = COALESCE(seller_shipped_at, NOW()),
              tracking_to_ctcg = $2,
              carrier_to_ctcg  = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [auctionId, tracking, carrier],
    );
  } else {
    await query(
      `UPDATE auctions
          SET seller_shipped_at = COALESCE(seller_shipped_at, NOW()),
              shipped_to_buyer_at = COALESCE(shipped_to_buyer_at, NOW()),
              tracking_to_buyer = $2,
              carrier_to_buyer  = $3,
              escrow_status = 'shipped_to_buyer',
              updated_at = NOW()
        WHERE id = $1`,
      [auctionId, tracking, carrier],
    );
  }

  // Lifecycle log — fire-and-forget. Direct path collapses two
  // hops into one event, so we emit both rows for journey clarity.
  void import("./lifecycle-log").then(({ logAuctionTransition }) => {
    logAuctionTransition({
      auctionId,
      action: "seller_shipped",
      actorId: userId,
      reason: a.is_consignment ? "Seller shipped to CTCG" : "Seller shipped direct to buyer",
      metadata: { tracking, carrier, consignment: a.is_consignment },
    });
    if (!a.is_consignment) {
      logAuctionTransition({
        auctionId,
        action: "shipped_to_buyer",
        actorId: userId,
        reason: "Direct shipment — in transit to buyer",
        metadata: { tracking, carrier },
      });
    }
  });

  return { ok: true };
}

// Winning bidder confirms they received the card.
export async function buyerConfirmReceived(
  auctionId: string,
  userId: string,
): Promise<TransitionResult> {
  const a = await fetchAuction(auctionId);
  if (!a) return { ok: false, reason: "Auction not found.", status: 404 };
  if (a.winner_user_id !== userId) {
    return { ok: false, reason: "Only the winner can confirm receipt.", status: 403 };
  }
  if (a.buyer_received_at) {
    return { ok: false, reason: "Already confirmed.", status: 409 };
  }
  if (a.status !== "paid" || a.escrow_status !== "shipped_to_buyer") {
    return {
      ok: false,
      reason: `Not in a receivable state (status=${a.status}, escrow=${a.escrow_status}).`,
      status: 409,
    };
  }

  await query(
    `UPDATE auctions
        SET buyer_received_at = NOW(),
            escrow_status = 'completed',
            updated_at = NOW()
      WHERE id = $1`,
    [auctionId],
  );

  // Lifecycle log + trust recompute. Both buyer (paid + confirmed)
  // and seller (delivered) get fresh score reflecting the success.
  // Fire-and-forget — completion already happened; downstream is
  // observability + reputation.
  void import("./lifecycle-log").then(({ logAuctionTransition }) => {
    logAuctionTransition({
      auctionId,
      action: "buyer_confirmed",
      actorId: userId,
      reason: "Buyer confirmed receipt — escrow completed",
    });
    logAuctionTransition({
      auctionId,
      action: "completed",
      actorLabel: "system:auction-fulfilment",
      reason: "All parties satisfied",
    });
  });
  void import("@/lib/escrow/trust-engine").then(async ({ calculateTrustScore }) => {
    await calculateTrustScore(userId).catch(() => { /* ignore */ });
    if (a.seller_user_id) {
      await calculateTrustScore(a.seller_user_id).catch(() => { /* ignore */ });
    }
  });

  // Investor portfolio side-effect: auction is the cleanest "the
  // buyer now owns this card" event in the auction lifecycle. Pull
  // the auction snapshot for SKU + price; auto-acquire for the
  // buyer, realize for the seller (if seller-listed; CTCG-owned
  // auctions have null seller_user_id and skip realize).
  void import("@/lib/portfolio/realize").then(async ({ recordAcquisition, closePosition }) => {
    const auctionRow = await query(
      `SELECT a.id, a.title, a.current_price, a.seller_payout, a.seller_user_id,
              a.set_code, ai.url AS image_url
         FROM auctions a
         LEFT JOIN auction_images ai ON ai.auction_id = a.id AND ai.display_order = 0
        WHERE a.id = $1`,
      [auctionId],
    ).catch(() => ({ rows: [] as Record<string, string | null>[] }));
    const ar = auctionRow.rows[0];
    if (!ar) return;
    const winningPrice = ar.current_price ? parseFloat(ar.current_price) : 0;
    const sellerPayout = ar.seller_payout ? parseFloat(ar.seller_payout) : winningPrice;
    const fees = winningPrice - sellerPayout;
    // Auctions don't carry a SKU column on the row, only a title.
    // Use the auction id as the SKU stand-in so the position is
    // queryable; investors with multiple copies of the same physical
    // card from different auctions get distinct portfolio rows
    // (acceptable — graded singles are typically unique anyway).
    const sku = `auction:${auctionId}`;
    await recordAcquisition({
      userId,
      sku,
      cardName: ar.title ?? undefined,
      setCode: ar.set_code ?? undefined,
      imageUrl: ar.image_url ?? undefined,
      quantity: 1,
      pricePaidGbp: winningPrice,
      acquisitionSource: "auction",
      acquisitionReferenceId: auctionId,
    }).catch((err) => console.error("[portfolio/auto-acquire/auction] failed:", err));
    if (ar.seller_user_id) {
      await closePosition({
        userId: ar.seller_user_id,
        sku,
        quantity: 1,
        proceedsGbp: winningPrice,
        feesGbp: fees,
        exitKind: "auction",
        exitReferenceId: auctionId,
        notes: `Sold via auction · gross £${winningPrice.toFixed(2)} · fees £${fees.toFixed(2)} · net £${sellerPayout.toFixed(2)}`,
      }).catch((err) => console.error("[portfolio/realize/auction] failed:", err));
    }
  });

  return { ok: true };
}

// Admin drives the CTCG leg for consigned auctions.
//   action='receive'  — CTCG acknowledges arrival from seller
//   action='dispatch' — CTCG ships to buyer (requires tracking)
export async function adminFulfil(
  auctionId: string,
  opts: {
    action: "receive" | "dispatch";
    tracking?: string;
    carrier?: string | null;
  },
): Promise<TransitionResult> {
  const a = await fetchAuction(auctionId);
  if (!a) return { ok: false, reason: "Auction not found.", status: 404 };
  if (!a.is_consignment) {
    return { ok: false, reason: "This endpoint is for consigned auctions only.", status: 400 };
  }
  if (a.status !== "paid") {
    return { ok: false, reason: `Auction status is ${a.status}, not paid.`, status: 409 };
  }

  if (opts.action === "receive") {
    if (a.escrow_status !== "awaiting_shipment") {
      return {
        ok: false,
        reason: `Expected escrow=awaiting_shipment (got ${a.escrow_status}).`,
        status: 409,
      };
    }
    await query(
      `UPDATE auctions
          SET received_by_ctcg_at = COALESCE(received_by_ctcg_at, NOW()),
              escrow_status = 'received_by_ctcg',
              updated_at = NOW()
        WHERE id = $1`,
      [auctionId],
    );
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId,
        action: "received_by_ctcg",
        actorLabel: "admin:auction-fulfilment",
        reason: "CTCG acknowledged receipt from seller",
      }),
    );
    return { ok: true };
  }

  if (opts.action === "dispatch") {
    if (a.escrow_status !== "received_by_ctcg") {
      return {
        ok: false,
        reason: `Expected escrow=received_by_ctcg (got ${a.escrow_status}).`,
        status: 409,
      };
    }
    const tracking = (opts.tracking ?? "").trim().slice(0, 100);
    if (!tracking) {
      return { ok: false, reason: "Tracking number required to dispatch.", status: 400 };
    }
    const carrier = (opts.carrier ?? "")?.trim().slice(0, 50) || null;
    await query(
      `UPDATE auctions
          SET shipped_to_buyer_at = COALESCE(shipped_to_buyer_at, NOW()),
              tracking_to_buyer = $2,
              carrier_to_buyer = $3,
              escrow_status = 'shipped_to_buyer',
              updated_at = NOW()
        WHERE id = $1`,
      [auctionId, tracking, carrier],
    );
    void import("./lifecycle-log").then(({ logAuctionTransition }) =>
      logAuctionTransition({
        auctionId,
        action: "shipped_to_buyer",
        actorLabel: "admin:auction-fulfilment",
        reason: "CTCG dispatched to buyer",
        metadata: { tracking, carrier },
      }),
    );
    return { ok: true };
  }

  return { ok: false, reason: "Unknown action. Use 'receive' or 'dispatch'.", status: 400 };
}
