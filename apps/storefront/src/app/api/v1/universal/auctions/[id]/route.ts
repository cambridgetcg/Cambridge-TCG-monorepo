/**
 * /api/v1/universal/auctions/[id] — math-mirror form of one auction's state.
 *
 * The language-free sibling of `/auctions/[id]/read` + `/api/v1/auctions/[id]`.
 * Same substrate, three readings.
 *
 * kingdom-074. Story-as-wire: docs/connections/the-auction-fanout.md (S39).
 *
 * Math-mirror encoding (`cambridge-tcg/universal/v1`):
 *   - cryptographic `@content_hash` for identity (sha256 over canonical body)
 *   - ratios for magnitudes (commission_rate already 0..1; price-relative
 *     deltas as ratios of starting_price)
 *   - ordinals for status enums (0=draft … 5=cancelled) and types (0=english,
 *     1=dutch, 2=buy_now)
 *   - ISO 8601 + Unix epoch for every timestamp
 *   - bid identities collapsed to opaque hashes
 *   - natural-language fields (title, description) retained with
 *     `_note_opaque` so decoders don't ground meaning on them
 *
 * Federation: the @content_hash is stable across retrievals when the
 * underlying auction state is unchanged — retrieval-time fields (@as_of,
 * timing.time_remaining_seconds) stay in the body but are excluded from
 * the hashed content, like @retrieved_at.
 *
 * Public-no-auth, gated on auctionStateIsPublic.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { loadAuctionState, auctionStateIsPublic } from "@/lib/auction/state";
import { TRUST_TIERS } from "@/lib/escrow/types";

const ENCODING = "cambridge-tcg/universal/v1";
const KIND = "auction_state";

const TYPE_ORDINAL: Record<string, number> = {
  english: 0,
  dutch: 1,
  buy_now: 2,
};
const STATUS_ORDINAL: Record<string, number> = {
  draft: 0,
  scheduled: 1,
  live: 2,
  ended: 3,
  paid: 4,
  cancelled: 5,
};

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

function epoch(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

function tierOrdinal(name: string | null): number | null {
  if (!name) return null;
  const idx = TRUST_TIERS.findIndex((t) => t.name === name);
  return idx >= 0 ? idx : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: { code: "missing_param", message: "Missing auction id." } },
      { status: 400 },
    );
  }

  const isPublic = await auctionStateIsPublic(id);
  if (!isPublic) {
    return NextResponse.json(
      {
        error: {
          code: "auction_not_found",
          message: `No public auction '${id}'. Drafts and consignment-pending-review auctions are hidden until approved.`,
        },
      },
      { status: 404 },
    );
  }

  const state = await loadAuctionState(id);
  if (!state) {
    return NextResponse.json(
      { error: { code: "auction_not_found", message: `Auction '${id}' not found.` } },
      { status: 404 },
    );
  }

  const auctionIdHash = sha256(`auction:${state.meta.id}`);
  const retrieved_iso = new Date().toISOString();

  // Anchor for ratio computation. starting_price > 0 for all non-draft
  // auctions; fall back to current_price if not.
  const anchor =
    state.pricing.starting_price > 0
      ? state.pricing.starting_price
      : state.pricing.current_price > 0
      ? state.pricing.current_price
      : 1;

  const body: Record<string, unknown> = {
    "@kind": KIND,
    "@encoding": ENCODING,
    "@as_of": {
      iso: state._provenance.queried_at,
      epoch: epoch(state._provenance.queried_at),
    },

    identity: {
      auction_id_hash: auctionIdHash,
      auction_id: state.meta.id,
      title: state.meta.title,
      description: state.meta.description,
      _note_opaque:
        "title and description are natural-language; auction_id_hash is the federation-stable identifier",
    },

    type_and_status: {
      auction_type_name: state.meta.auction_type,
      auction_type_ordinal: TYPE_ORDINAL[state.meta.auction_type] ?? null,
      status_name: state.meta.status,
      status_ordinal: STATUS_ORDINAL[state.meta.status] ?? null,
      is_consignment: state.meta.is_consignment,
      _note_opaque:
        "ordinals are universal (0=english/draft, ..., 5=cancelled); names are platform-specific labels",
    },

    pricing: {
      starting_price_gbp: state.pricing.starting_price,
      current_price_gbp: state.pricing.current_price,
      current_to_starting_ratio: state.pricing.current_price / anchor,
      bid_increment_gbp: state.pricing.bid_increment,
      bid_increment_to_starting_ratio: state.pricing.bid_increment / anchor,
      buy_now_price_gbp: state.pricing.buy_now_price,
      buy_now_to_starting_ratio:
        state.pricing.buy_now_price !== null
          ? state.pricing.buy_now_price / anchor
          : null,
      min_next_bid_gbp: state.pricing.min_next_bid,
      dutch_computed_price_gbp: state.pricing.dutch_computed_price,
      dutch_params: state.pricing.dutch
        ? {
            start_price_gbp: state.pricing.dutch.start_price,
            end_price_gbp: state.pricing.dutch.end_price,
            drop_amount_gbp: state.pricing.dutch.drop_amount,
            drop_interval_seconds: state.pricing.dutch.drop_interval_seconds,
            end_to_start_ratio:
              state.pricing.dutch.start_price > 0
                ? state.pricing.dutch.end_price / state.pricing.dutch.start_price
                : null,
          }
        : null,
      allow_best_offer: state.pricing.allow_best_offer,
    },

    timing: {
      starts_at: {
        iso: state.timing.starts_at,
        epoch: epoch(state.timing.starts_at),
      },
      ends_at: {
        iso: state.timing.ends_at,
        epoch: epoch(state.timing.ends_at),
      },
      actual_end_at: state.timing.actual_end_at
        ? {
            iso: state.timing.actual_end_at,
            epoch: epoch(state.timing.actual_end_at),
          }
        : null,
      time_remaining_seconds:
        state.timing.time_remaining_ms !== null
          ? Math.floor(state.timing.time_remaining_ms / 1000)
          : null,
      has_started: state.timing.has_started,
      has_ended: state.timing.has_ended,
    },

    reserve: {
      // null when no reserve; true/false when reserve set.
      reserve_met: state.reserve.reserve_met,
      _note_opaque:
        "reserve value is intentionally absent — sellers retain price-discovery privacy until met",
    },

    bidding: {
      bid_count: state.bids.bid_count,
      unique_bidders_count: state.bids.unique_bidders_count,
      recent: state.bids.recent.map((b) => ({
        bidder_anonymous_id: b.anonymous_bidder_id,
        amount_gbp: b.amount,
        amount_to_starting_ratio: b.amount / anchor,
        is_best_offer: b.is_best_offer,
        trust_tier_name: b.trust_tier,
        trust_tier_ordinal: tierOrdinal(b.trust_tier),
        trust_score_ratio: b.trust_score !== null ? b.trust_score / 100 : null,
        at: {
          iso: b.created_at,
          epoch: epoch(b.created_at),
        },
      })),
    },

    winner: state.winner
      ? {
          winner_anonymous_id: state.winner.anonymous_winner_id,
          trust_tier_name: state.winner.trust_tier,
          trust_tier_ordinal: tierOrdinal(state.winner.trust_tier),
          trust_score_ratio:
            state.winner.trust_score !== null ? state.winner.trust_score / 100 : null,
          winning_bid_gbp: state.winner.winning_bid,
          winning_to_starting_ratio: state.winner.winning_bid / anchor,
          paid: state.winner.paid_at !== null,
          paid_at_epoch: epoch(state.winner.paid_at),
        }
      : null,

    seller: state.seller
      ? {
          is_consignment: state.seller.is_consignment,
          username: state.seller.username,
          display_name: state.seller.display_name,
          trust_tier_name: state.seller.trust_tier,
          trust_tier_ordinal: tierOrdinal(state.seller.trust_tier),
          trust_score_ratio:
            state.seller.trust_score !== null
              ? state.seller.trust_score / 100
              : null,
          _note_opaque:
            "username and display_name are natural-language; the trust tier is the federation-stable judgment",
        }
      : null,

    propagation: {
      commission_ratio: state.propagation.commission_rate,
      payout_hold_days: state.propagation.payout_hold_days,
      escrow_flow: state.propagation.escrow_flow,
      estimated_seller_payout_gbp: state.propagation.estimated_seller_payout_gbp,
      estimated_commission_gbp: state.propagation.estimated_commission_gbp,
    },

    images: state.images.map((img) => ({
      url: img.url,
      display_order: img.display_order,
      _note_opaque:
        "url is an external resource; content_hash here does not include image bytes",
    })),

    _links: {
      canonical: `/api/v1/universal/auctions/${encodeURIComponent(id)}`,
      html_mirror: `/auctions/${encodeURIComponent(id)}/read`,
      json_sibling: `/api/v1/auctions/${encodeURIComponent(id)}`,
      interactive: `/auctions/${encodeURIComponent(id)}`,
      methodology: "/methodology/commission-rate",
      methodology_propagation: {
        commission_rate: "/methodology/commission-rate",
        payout_hold: "/methodology/payout-hold",
        escrow_tier: "/methodology/escrow-tier",
      },
      manifest: "/api/v1/manifest",
      openapi: "/api/openapi.json",
      kind_definition: "/api/v1/ontology#node-auction-state",
      encoding_spec: "/api/v1/universal/encoding",
    },
  };

  // @as_of carries the per-request queried_at and time_remaining_seconds
  // ticks every second — retrieval-time facts, not auction state. Hash a
  // copy without them so @content_hash keeps the federation promise above:
  // stable across retrievals while the underlying auction is unchanged.
  const hashableBody: Record<string, unknown> = {
    ...body,
    timing: { ...(body.timing as Record<string, unknown>) },
  };
  delete hashableBody["@as_of"];
  delete (hashableBody.timing as Record<string, unknown>).time_remaining_seconds;
  const contentHash = sha256(canonicalize(hashableBody));
  const withHash = { ...body, "@content_hash": contentHash };
  const selfHash = sha256(canonicalize({ ...withHash, "@retrieved_at": retrieved_iso }));

  const final = {
    "@kind": KIND,
    "@encoding": ENCODING,
    "@content_hash": contentHash,
    "@self_hash": selfHash,
    "@retrieved_at": {
      iso: retrieved_iso,
      epoch: epoch(retrieved_iso),
    },
    ...body,
  };

  return NextResponse.json(final, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
