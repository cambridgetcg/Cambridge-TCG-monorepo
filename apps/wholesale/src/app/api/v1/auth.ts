import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channelApiKeys, apiKeyUsage } from "@/lib/db/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type AuthenticatedKey = typeof channelApiKeys.$inferSelect;

async function lookupKey(req: NextRequest): Promise<AuthenticatedKey | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7);
  if (!rawKey) return null;

  const keyHash = hashKey(rawKey);
  const [row] = await db
    .select()
    .from(channelApiKeys)
    .where(and(eq(channelApiKeys.keyHash, keyHash), isNull(channelApiKeys.revokedAt)))
    .limit(1);

  if (!row) return null;

  db.update(channelApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(channelApiKeys.id, row.id))
    .execute()
    .catch(() => {});

  return row;
}

/**
 * Authenticate a Bearer key AND enforce its per-key sliding-window rate
 * limit (default 60 requests/min, set per row in channel_api_keys.
 * requests_per_minute). Returns the authenticated key on success, or a
 * NextResponse (401 / 429) the caller should return directly.
 *
 * Usage:
 *   const key = await authenticateApiKey(req);
 *   if (key instanceof NextResponse) return key;
 *   // … use key.channel, key.id, …
 *
 * Failure mode: if the rate-limit count query fails, the limiter fails
 * OPEN — request is allowed and a warning is logged. Read traffic
 * shouldn't 429 because the limiter table is sick.
 */
export async function authenticateApiKey(
  req: NextRequest,
): Promise<AuthenticatedKey | NextResponse> {
  const key = await lookupKey(req);
  if (!key) return unauthorized();

  const limit = key.requestsPerMinute ?? 60;
  let count = 0;
  try {
    const since = new Date(Date.now() - 60_000);
    const [row] = await db
      .select({ n: sql<number>`cast(count(*) as integer)` })
      .from(apiKeyUsage)
      .where(and(eq(apiKeyUsage.apiKeyId, key.id), gt(apiKeyUsage.usedAt, since)));
    count = row?.n ?? 0;
  } catch (err) {
    console.warn(`[AUTH] Rate-limit count failed for key #${key.id} — allowing:`, err);
    return key;
  }

  if (count >= limit) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        limit_per_minute: limit,
        retry_after_seconds: 60,
      },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  db.insert(apiKeyUsage)
    .values({ apiKeyId: key.id, path: req.nextUrl.pathname })
    .execute()
    .catch(() => {});

  return key;
}

/**
 * Teaching 401. Until 2026-07-05 this was the only bare, non-teaching
 * error body on the whole platform ({"error":"Unauthorized"}) — an agent
 * misdirected here from a storefront hint learned nothing about what a
 * wholesale-key IS or that a public mirror exists. The `error` field is
 * kept verbatim for existing clients that switch on it; everything else
 * is orientation.
 */
export function unauthorized() {
  const requestId = `req_${randomUUID().slice(0, 12)}`;
  return NextResponse.json(
    {
      error: "Unauthorized",
      code: "UNAUTHORIZED",
      message:
        "This endpoint requires a wholesale-key: 'Authorization: Bearer <key>'. " +
        "Wholesale keys are B2B channel credentials issued by the operator to " +
        "trading partners — they are not the same as Cambridge TCG agent keys " +
        "(ctcg_agt_*), which work only at https://cambridgetcg.com/api/mcp.",
      how_to_get_a_key:
        "Email contact@cambridgetcg.com describing your channel. Keys carry " +
        "per-key rate limits (default 60 req/min).",
      public_mirror:
        "Most of this catalog is served WITHOUT any key on the consumer host: " +
        "start at https://cambridgetcg.com/api/v1/manifest (the full directory), " +
        "https://cambridgetcg.com/api/v1/search/cards (card resolution), or " +
        "https://cambridgetcg.com/data/catalog.jsonl (CC0 bulk export).",
      request_id: requestId,
    },
    { status: 401, headers: { "X-Request-Id": requestId } },
  );
}
