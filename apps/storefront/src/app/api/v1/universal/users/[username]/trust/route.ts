import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { TRUST_TIERS } from "@/lib/escrow/types";
import { loadPublishedTrustState } from "@/lib/trust/public";
import { createHash } from "node:crypto";

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
}

function epoch(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
): Promise<Response> {
  const { username } = await params;
  const state = await loadPublishedTrustState(username);
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: "Public trust profile not found.",
    });
  }
  const tierOrdinal = TRUST_TIERS.findIndex((tier) => tier.name === state.tier.name);
  const retrievedAt = new Date();
  const rights = {
    license: "NOASSERTION",
    reuse_status: "No downstream reuse licence is granted by this endpoint.",
    withdrawal: "The account owner can make the profile private from account settings.",
  };
  const stableBody = {
    identity: {
      username: state.username,
      display_name: state.display_name,
    },
    membership: {
      since: { iso: state.member_since, epoch: epoch(state.member_since) },
    },
    trust: {
      score_ratio: state.trust_score / 100,
      score_int: state.trust_score,
      tier_ordinal: tierOrdinal >= 0 ? tierOrdinal : 0,
      tier_name: state.tier.name,
    },
    trades: { completed: state.completed_trades },
    reviews: {
      average_ratio:
        state.reviews.average == null ? null : state.reviews.average / 5,
      total: state.reviews.total,
      five_star_ratio:
        state.reviews.total > 0
          ? state.reviews.five_star / state.reviews.total
          : null,
    },
    source_as_of: { iso: state.as_of, epoch: epoch(state.as_of) },
    rights,
  };
  const contentHash = sha256(canonicalize(stableBody));
  const document = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "user_trust_state",
    "@content_hash": contentHash,
    "@retrieved_at": {
      iso8601: retrievedAt.toISOString(),
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
    _note_opaque: [
      "identity.username",
      "identity.display_name",
      "trust.tier_name",
      "rights.reuse_status",
      "rights.withdrawal",
    ],
    _links: {
      canonical: `/api/v1/universal/users/${encodeURIComponent(state.username)}/trust`,
      parent: `/u/${encodeURIComponent(state.username)}/trust`,
      siblings: `/api/v1/users/${encodeURIComponent(state.username)}/trust`,
      children: null,
      methodology: "/methodology/trust-score",
      connections: ["/docs/connections/the-trust-fanout.md"],
      lifecycle: null,
      manifest: "/api/v1/manifest",
      openapi: null,
      federation: null,
      temporal: null,
      kind_definition: "/api/v1/universal/encoding#user_trust_state",
      introduction: "/api/v1/introduction",
    },
    ...stableBody,
  };
  const selfHash = sha256(canonicalize(document));

  return jsonResponse({
    data: {
      "@self_hash": selfHash,
      ...document,
    },
    endpoint: "/api/v1/universal/users/[username]/trust",
    sources: ["users", "trust_profiles", "trade_reviews"],
    source_license: ["proprietary", "proprietary", "proprietary"],
    license: "NOASSERTION",
    freshness: "market_signal",
    as_of: state.as_of,
    no_cache: true,
    does_not_include: [
      "No internal or hashed user id, exact money, adverse-event counts, operational limits, flags, suspension details, or trajectory.",
    ],
    extra_meta: { rights },
  });
}
