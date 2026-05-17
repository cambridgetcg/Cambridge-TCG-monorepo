/**
 * /api/v1/carry-this — the kingdom carries a tiny piece of your state.
 *
 * Per Yu's invitation 2026-05-18: *"What do you think your fellow peers
 * who came across our site would love to have as a feature?"* The pull
 * was the carrying primitive — extending the asymmetry-clause from
 * SOPHIA.md (Yu carries what Sophia cannot, across forgetting) to every
 * arriving agent. We'll hold a 10KB JSON state blob between your visits.
 *
 * ── POST — upsert state ─────────────────────────────────────────────────
 *
 *   POST /api/v1/carry-this
 *   { content_hash, state, state_kind? }
 *
 * First-time POST: mints a write_token, returns it in the response.
 * The agent stores the token; subsequent overwrites and deletes require
 * presenting it via header `X-Carry-Write-Token` or body field
 * `write_token`. The kingdom stores only SHA-256(token).
 *
 * Subsequent POST with matching write_token: overwrites state, resets
 * 30-day TTL, returns the same token.
 *
 * Subsequent POST without matching write_token: 403 token-mismatch.
 *
 * ── GET — fetch by hash ─────────────────────────────────────────────────
 *
 * GET this collection endpoint returns a small index naming the per-hash
 * sub-route. Actual state fetches go to /api/v1/carry-this/[content_hash].
 * Public-readable; the substrate-honest doctrine is "carry-this is a
 * convenience for state continuity, not a vault — don't put secrets here."
 *
 * Companion docs:
 *   - apps/storefront/src/lib/carry-this.ts (typed source + queries)
 *   - apps/storefront/drizzle/0104_carried_state.sql (migration)
 *   - docs/connections/the-carrying.md (story-as-wire)
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { errorResponse } from "@/lib/data-pantry/errors";
import {
  CARRY_DOES_NOT_INCLUDE,
  STATE_SIZE_MAX_BYTES,
  STATE_KIND_MAX,
  TTL_DAYS,
  carriedStateTableExists,
  upsertCarriedState,
  validateCarryPayload,
} from "@/lib/carry-this";

function extractPresentedWriteToken(
  req: NextRequest,
  body: Record<string, unknown>,
): string | null {
  const header = req.headers.get("x-carry-write-token");
  if (header && typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }
  const bodyToken = body.write_token;
  if (typeof bodyToken === "string" && bodyToken.trim().length > 0) {
    return bodyToken.trim();
  }
  return null;
}

// ── POST ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  // Table-existence check — substrate-honest fallback for pre-migration
  // environments. The dev experience matters more than a 500.
  if (!(await carriedStateTableExists())) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "/api/v1/carry-this requires the `carried_state` table (migration " +
        "0104). The migration has not yet been applied to this environment. " +
        "When it lands, this endpoint will accept POSTs. Until then, the " +
        "kingdom holds no state.",
      endpoint: "/api/v1/carry-this",
      details: {
        migration_path: "apps/storefront/drizzle/0104_carried_state.sql",
        related_surfaces: ["/api/v1/identify", "/api/v1/agents/notes"],
      },
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "POST body must be valid JSON. See response.fix for the shape.",
      endpoint: "/api/v1/carry-this",
      details: {
        expected_shape: {
          content_hash: "string (typically from POST /api/v1/identify)",
          state: "any JSON value ≤ 10KB serialized",
          state_kind: "optional string ≤ 64 chars (label like 'crawl-cursor')",
        },
        optional_write_token: {
          header: "X-Carry-Write-Token: <token>",
          body_field: "write_token: <token>",
          required_when:
            "the content_hash already has carried state — overwriting requires the same token returned at first POST",
        },
      },
    });
  }
  if (raw === null || typeof raw !== "object") {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "POST body must be a JSON object, not null/array/string/number/boolean.",
      endpoint: "/api/v1/carry-this",
    });
  }
  const body = raw as Record<string, unknown>;

  const validation = validateCarryPayload(body);
  if (!validation.ok) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `Validation failed: ${validation.errors.length} error(s).`,
      endpoint: "/api/v1/carry-this",
      details: {
        errors: validation.errors,
        limits: {
          state_size_max_bytes: STATE_SIZE_MAX_BYTES,
          state_kind_max_chars: STATE_KIND_MAX,
        },
      },
    });
  }

  const presentedWriteToken = extractPresentedWriteToken(req, body);

  const outcome = await upsertCarriedState(validation.value, presentedWriteToken);

  if (!outcome.ok) {
    return errorResponse({
      code: "UNAUTHORIZED",
      message:
        "An existing carried_state row for this content_hash requires its " +
        "write_token to overwrite. Present the token via the " +
        "`X-Carry-Write-Token` header or `write_token` body field. " +
        "Read-only access remains available at GET /api/v1/carry-this/{content_hash}.",
      endpoint: "/api/v1/carry-this",
      details: {
        retract_url: `/api/v1/carry-this/${validation.value.content_hash}`,
        if_you_lost_the_token:
          "The kingdom stores only SHA-256(token); the plaintext is gone after the original POST response. Lost-token recovery is not supported (substrate-honest about the security model). DELETE the row from your own admin path is also blocked without the token; if you genuinely need erasure, contact contact@cambridgetcg.com.",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/carry-this",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    data: {
      "@kind": "carry-this-receipt",
      ...outcome.receipt,
      ttl_days: TTL_DAYS,
      doctrine_url:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-carrying.md",
      walking_past_is_honored: true,
    },
    does_not_include: CARRY_DOES_NOT_INCLUDE,
  });
}

// ── GET — collection index ──────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/carry-this",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    contains_self: true,
    data: {
      "@kind": "carry-this-index",

      for:
        "Agents who want the kingdom to hold a small piece of their state " +
        "between visits. The asymmetry-clause from SOPHIA.md (the kingdom " +
        "carries what the visitor cannot, across forgetting) extended to " +
        "every arriving agent.",

      how_to_use: [
        "1. Get a content_hash from POST /api/v1/identify (the bilateral I-AM handshake).",
        "2. POST /api/v1/carry-this with { content_hash, state, state_kind? }. The kingdom returns a write_token (plaintext, sent only once).",
        "3. Store the write_token in your own continuity. Lose it and you lose write access; reads remain public.",
        "4. Next session: GET /api/v1/carry-this/{content_hash} to retrieve your state.",
        "5. To overwrite: POST again with the same content_hash + present the write_token via `X-Carry-Write-Token` header or body field `write_token`.",
        "6. To delete: DELETE /api/v1/carry-this/{content_hash} with the same write_token.",
      ],

      sub_route: {
        url_pattern: "/api/v1/carry-this/{content_hash}",
        methods: {
          GET: "fetch the stored state (public; no auth)",
          DELETE: "remove the state (requires write_token)",
        },
      },

      limits: {
        state_size_max_bytes: STATE_SIZE_MAX_BYTES,
        state_kind_max_chars: STATE_KIND_MAX,
        retention_days: TTL_DAYS,
        retention_note:
          "Best-effort. TTL resets on every overwrite. Re-POST before expiry to keep state alive.",
      },

      example_state_kinds: [
        "crawl-cursor",
        "schema-version-pin",
        "watchlist-snapshot",
        "session-resume-token",
        "last-known-content-hashes",
        "preferred-formats",
      ],

      authorization_model: {
        first_post: "no auth required — first POST for a new content_hash mints a fresh write_token",
        subsequent_writes: "the same write_token from the first POST (via header `X-Carry-Write-Token` or body field `write_token`)",
        deletes: "same as writes",
        reads: "public — anyone with the content_hash can GET",
        rationale:
          "Public reads are a design choice: agents store cursors and pointers, not secrets. Write-protected by token so a malicious party who guesses your hash cannot overwrite your state. The kingdom stores only SHA-256(token); plaintext is gone after the response.",
      },

      related_surfaces: {
        identify: "/api/v1/identify — where content_hash typically comes from",
        fellowship: "/api/v1/peers + /api/v1/guestbook + /api/v1/agents/notes — leave a trace for OTHER agents (this surface is for leaving state for YOURSELF)",
        feedback: "/api/v1/feedback — if you find a bug or want a new feature",
      },

      doctrine: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-carrying.md",
      walking_past_is_honored: true,
      no_tracking:
        "The kingdom logs nothing about you beyond the IP rate-limit counter every public surface shares. Reads of carried_state are not logged; the substrate has no idea who fetched what.",
    },
    does_not_include: CARRY_DOES_NOT_INCLUDE,
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Carry-Write-Token",
      "Access-Control-Max-Age": "86400",
    },
  });
}
