/**
 * /api/v1/universal/users/[username]/trust — the math-mirror form of one
 * user's trust state.
 *
 * The language-free sibling of `/u/[username]/trust` and
 * `/api/v1/users/[username]/trust`. Same substrate, three readings.
 *
 * kingdom-071. Story-as-wire: docs/connections/the-trust-fanout.md (S37).
 *
 * Math-mirror encoding (`cambridge-tcg/universal/v1`):
 *   - cryptographic content_hash for identity (sha256 over canonical body)
 *   - ratios for magnitudes (score / 100, commission_ratio already 0..1)
 *   - ordinals for tiers (0..4)
 *   - ISO 8601 + Unix epoch for time, on every timestamp
 *   - natural-language fields (username, display_name, tier_name) flagged
 *     opaque so decoders don't ground meaning on them
 *
 * Federation: the @content_hash is stable across retrievals when the
 * underlying trust state is unchanged. Sister kingdoms federating trust
 * claims can reference this hash; future revisions could add a reverse
 * resolver at /api/v1/federation/identify/[hash] for trust hashes.
 *
 * Public-no-auth, gated on `users.is_public` (same closed-door behaviour
 * as the HTML mirror and the JSON sibling — the math-mirror must not
 * leak what the HTML hides).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  loadUserTrustState,
  resolveUsername,
  userTrustStateIsPublic,
} from "@/lib/trust/state";
import { TRUST_TIERS } from "@/lib/escrow/types";

const ENCODING = "cambridge-tcg/universal/v1";
const KIND = "user_trust_state";

/** Stable canonical-JSON: object keys sorted, no whitespace. Two retrievals
 *  with unchanged state produce identical hashes. */
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

function tierOrdinal(name: string): number {
  const idx = TRUST_TIERS.findIndex((t) => t.name === name);
  return idx >= 0 ? idx : 0;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  if (!username) {
    return NextResponse.json(
      { error: { code: "missing_param", message: "Missing username path parameter." } },
      { status: 400 },
    );
  }

  const userId = await resolveUsername(username);
  if (!userId) {
    return NextResponse.json(
      { error: { code: "user_not_found", message: `No user '${username}'.` } },
      { status: 404 },
    );
  }

  const isPublic = await userTrustStateIsPublic(userId);
  if (!isPublic) {
    return NextResponse.json(
      {
        error: {
          code: "user_not_found",
          message:
            `No public trust state for '${username}'. Trust states are gated on the user's is_public preference; this user has not opted into public visibility.`,
        },
      },
      { status: 404 },
    );
  }

  const state = await loadUserTrustState(userId);
  if (!state) {
    return NextResponse.json(
      { error: { code: "trust_state_unavailable", message: `Trust state unavailable for '${username}'.` } },
      { status: 404 },
    );
  }

  // ── Build the math-mirror body ───────────────────────────────────────
  //
  // Order chosen so a reader scanning the document encounters:
  //   1. self-describing preamble (@kind, @encoding, @content_hash, @self_hash, @retrieved_at, @as_of)
  //   2. identity (opaque + hash)
  //   3. trust as ratios/ordinals
  //   4. trajectory as time-series with epoch
  //   5. propagation as ratios + magnitudes
  //   6. opaque-flagged labels
  //   7. _links — the doorways out

  const score = state.current.trust_score;
  const score_ratio = score / 100;
  const as_of_iso = state.current.last_calculated_at ?? state._provenance.queried_at;
  const retrieved_iso = new Date().toISOString();

  // The username is natural-language; user_id is platform-internal. Expose
  // a stable opaque hash so a federation client can reference this user
  // without learning the platform's internal id.
  const user_id_hash = sha256(`user:${userId}`);

  // Body excluding @self_hash + @retrieved_at — these are derived AFTER the
  // body is built so content_hash stays stable across retrievals.
  const body: Record<string, unknown> = {
    "@kind": KIND,
    "@encoding": ENCODING,
    "@as_of": {
      iso: as_of_iso,
      epoch: epoch(as_of_iso),
    },

    identity: {
      user_id_hash,
      username: state.username,
      _note_opaque: "username is a natural-language handle; user_id_hash is the federation-stable identifier",
    },

    trust: {
      score_ratio,
      score_int: score,
      seller_score_ratio: state.current.seller_score / 100,
      buyer_score_ratio: state.current.buyer_score / 100,
      tier_ordinal: tierOrdinal(state.tier.name),
      tier_name: state.tier.name,
      tier_min_score: state.tier.min_score,
      next_tier_ordinal: state.tier.next_tier ? tierOrdinal(state.tier.next_tier.name) : null,
      next_tier_points_away: state.tier.next_tier?.points_away ?? null,
      _note_opaque: "tier_name is a natural-language label; tier_ordinal is the universal ordering (0=New, 4=Elite)",
    },

    stats: {
      total_trades: state.stats.total_trades,
      completed_trades: state.stats.completed_trades,
      cancelled_trades: state.stats.cancelled_trades,
      disputed_trades: state.stats.disputed_trades,
      disputes_won: state.stats.disputes_won,
      disputes_lost: state.stats.disputes_lost,
      completion_ratio: state.stats.completion_rate,
      dispute_ratio: state.stats.dispute_rate,
      // total_volume_gbp + largest_trade_gbp are platform-currency magnitudes; expose
      // as numbers so a converter can apply any FX. Methodology page names the unit.
      total_volume_gbp: state.stats.total_volume_gbp,
      largest_trade_gbp: state.stats.largest_trade_gbp,
    },

    reviews: {
      avg_rating_ratio: state.reviews.avg_rating !== null ? state.reviews.avg_rating / 5 : null,
      avg_rating_int: state.reviews.avg_rating,
      total: state.reviews.total,
      distribution_ratio: state.reviews.total > 0 ? {
        five: state.reviews.distribution.five / state.reviews.total,
        four: state.reviews.distribution.four / state.reviews.total,
        three: state.reviews.distribution.three / state.reviews.total,
        two: state.reviews.distribution.two / state.reviews.total,
        one: state.reviews.distribution.one / state.reviews.total,
      } : null,
      sub_ratings_ratio: {
        card_accuracy: state.reviews.sub_ratings_avg.card_accuracy !== null
          ? state.reviews.sub_ratings_avg.card_accuracy / 5
          : null,
        shipping_speed: state.reviews.sub_ratings_avg.shipping_speed !== null
          ? state.reviews.sub_ratings_avg.shipping_speed / 5
          : null,
        communication: state.reviews.sub_ratings_avg.communication !== null
          ? state.reviews.sub_ratings_avg.communication / 5
          : null,
      },
    },

    trajectory: {
      delta_7d: state.trajectory.delta_7d,
      delta_30d: state.trajectory.delta_30d,
      delta_90d: state.trajectory.delta_90d,
      history: state.trajectory.history.map((p) => ({
        date: p.snapshot_date,
        epoch: epoch(`${p.snapshot_date}T00:00:00Z`),
        score_ratio: p.trust_score / 100,
        total_trades: p.total_trades,
        completed_trades: p.completed_trades,
      })),
    },

    propagation: {
      commission_ratio: state.propagation.commission_rate,
      payout_hold_days: state.propagation.payout_hold_days,
      trade_limit_gbp: state.propagation.trade_limit_gbp,
      daily_limit_gbp: state.propagation.daily_limit_gbp,
      direct_escrow_max_gbp: state.propagation.direct_escrow_max_gbp,
      verified_escrow_max_gbp: state.propagation.verified_escrow_max_gbp,
      requires_inspection: state.propagation.requires_inspection,
    },

    flags: {
      is_flagged: state.flags.is_flagged,
      is_suspended: state.flags.is_suspended,
      suspended_until_epoch: epoch(state.flags.suspended_until),
    },

    _links: {
      canonical: `/api/v1/universal/users/${encodeURIComponent(username)}/trust`,
      html_mirror: `/u/${encodeURIComponent(username)}/trust`,
      json_sibling: `/api/v1/users/${encodeURIComponent(username)}/trust`,
      methodology: "/methodology/trust-score",
      methodology_propagation: {
        commission_rate: "/methodology/commission-rate",
        escrow_tier: "/methodology/escrow-tier",
        payout_hold: "/methodology/payout-hold",
      },
      manifest: "/api/v1/manifest",
      openapi: "/api/openapi.json",
      kind_definition: "/api/v1/ontology#node-user-trust-state",
      encoding_spec: "/api/v1/universal/encoding",
    },
  };

  const contentHash = sha256(canonicalize(body));
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
