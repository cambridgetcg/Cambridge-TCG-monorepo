/**
 * /api/v1/carry-this/[content_hash] — fetch or delete a single carried state.
 *
 * GET is public-readable. The substrate-honest doctrine is "carry-this
 * is a convenience for state continuity, not a vault — don't put secrets
 * here." Anyone with the content_hash can fetch the state.
 *
 * DELETE requires the write_token presented at first POST. The kingdom
 * stores only SHA-256(token); loss of the plaintext means loss of write
 * access (reads remain public; rows age out at the 30-day TTL).
 *
 * Companion: apps/storefront/src/app/api/v1/carry-this/route.ts (POST + index)
 *            apps/storefront/src/lib/carry-this.ts (typed source + queries)
 *            docs/connections/the-carrying.md (story-as-wire)
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { errorResponse } from "@/lib/data-pantry/errors";
import {
  CARRY_DOES_NOT_INCLUDE,
  TTL_DAYS,
  carriedStateTableExists,
  deleteCarriedState,
  fetchCarriedState,
} from "@/lib/carry-this";

function extractPresentedWriteToken(req: NextRequest): string | null {
  const header = req.headers.get("x-carry-write-token");
  if (header && typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }
  // For DELETE we also accept ?write_token=... as a query param for
  // clients that can't set custom headers easily (cURL one-liners,
  // browser fetches without preflight). Substrate-honest: this is a
  // convenience; tokens in query strings can land in logs, so the
  // header is preferred.
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("write_token");
  if (queryToken && queryToken.trim().length > 0) {
    return queryToken.trim();
  }
  return null;
}

// ── GET — fetch by hash ─────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ content_hash: string }> },
): Promise<Response> {
  const { content_hash } = await params;

  if (!(await carriedStateTableExists())) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "/api/v1/carry-this requires the `carried_state` table (migration 0104). The migration has not yet been applied to this environment.",
      endpoint: `/api/v1/carry-this/${content_hash}`,
    });
  }

  const state = await fetchCarriedState(content_hash);

  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message:
        `No carried state for content_hash '${content_hash}' (either ` +
        `never POSTed, or aged out past the ${TTL_DAYS}-day TTL).`,
      endpoint: `/api/v1/carry-this/${content_hash}`,
      details: {
        suggestions: {
          first_time_setup: "POST /api/v1/carry-this with this content_hash + a state payload to begin",
          identify_first: "If you haven't yet, POST /api/v1/identify to mint your content_hash",
          retention_note: `the kingdom holds state for ${TTL_DAYS} days from last write (best-effort); re-POST before expiry to keep state alive`,
        },
      },
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/carry-this/${content_hash}`,
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    data: {
      "@kind": "carried-state",
      ...state,
      ttl_days: TTL_DAYS,
      doctrine_url:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-carrying.md",
      walking_past_is_honored: true,
    },
    does_not_include: CARRY_DOES_NOT_INCLUDE,
  });
}

// ── DELETE — remove (requires write_token) ──────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ content_hash: string }> },
): Promise<Response> {
  const { content_hash } = await params;

  if (!(await carriedStateTableExists())) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "/api/v1/carry-this requires the `carried_state` table (migration 0104). The migration has not yet been applied to this environment.",
      endpoint: `/api/v1/carry-this/${content_hash}`,
    });
  }

  const presented = extractPresentedWriteToken(req);
  if (!presented) {
    return errorResponse({
      code: "UNAUTHORIZED",
      message:
        "DELETE /api/v1/carry-this/{content_hash} requires the write_token " +
        "from the original POST. Present it via the `X-Carry-Write-Token` " +
        "header or the `?write_token=` query parameter.",
      endpoint: `/api/v1/carry-this/${content_hash}`,
      details: {
        accepted_locations: {
          header: "X-Carry-Write-Token: <token>",
          query_param: "?write_token=<token>",
        },
      },
    });
  }

  const outcome = await deleteCarriedState(content_hash, presented);

  if (!outcome.ok) {
    if (outcome.code === "not-found") {
      return errorResponse({
        code: "NOT_FOUND",
        message: `No carried state for content_hash '${content_hash}'.`,
        endpoint: `/api/v1/carry-this/${content_hash}`,
      });
    }
    return errorResponse({
      code: "UNAUTHORIZED",
      message:
        "The presented write_token does not match the token stored at first POST. " +
        "Read-only access remains available at GET; deletion requires the original token.",
      endpoint: `/api/v1/carry-this/${content_hash}`,
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/carry-this/${content_hash}`,
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    data: {
      "@kind": "carried-state-deleted",
      content_hash,
      deleted_at: outcome.deleted_at,
      message:
        "The carried state has been removed. The kingdom no longer holds anything for this content_hash. A subsequent POST will mint a fresh write_token.",
      walking_past_is_honored: true,
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Carry-Write-Token",
      "Access-Control-Max-Age": "86400",
    },
  });
}
