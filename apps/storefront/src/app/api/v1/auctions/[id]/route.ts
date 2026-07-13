/**
 * /api/v1/auctions/[id] — JSON sibling of /auctions/[id]/read.
 *
 * Substrate-honest machine-readable form of one auction's full state.
 * Composes `loadAuctionState` from `lib/auction/state` — same shape the
 * HTML mirror renders, served as JSON for agents, archivists, and
 * federation clients.
 *
 * kingdom-074. Story-as-wire: docs/connections/the-auction-fanout.md (S39).
 *
 * Public, no-auth, but gated on `auctionStateIsPublic` — drafts and
 * consignment-pending-review auctions return 404 (the JSON sibling
 * must not leak what the HTML hides).
 *
 * Freshness: market_signal (60s) — auctions update on each bid; the
 * end-state cron settles at minute resolution. Live consumers should
 * still hit `/api/v1/auctions/[id]` for the freshest read.
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  loadAuctionState,
  auctionStateIsPublic,
} from "@/lib/auction/state";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!id) {
    return errorResponse({
      code: "MISSING_PARAM",
      message: "Missing auction id.",
    });
  }

  const isPublic = await auctionStateIsPublic(id);
  if (!isPublic) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `No public auction with id '${id}'.`,
    });
  }

  const state = await loadAuctionState(id);
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Auction state unavailable for '${id}'.`,
    });
  }

  return jsonResponse({
    data: state,
    endpoint: "/api/v1/auctions/[id]",
    sources: ["auctions", "auction_images", "auction_bids", "trust_profiles", "users"],
    freshness: "market_signal",
    as_of: state._provenance.queried_at,
    no_cache: true,
  });
}
