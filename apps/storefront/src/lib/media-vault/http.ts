import { NextResponse } from "next/server";

import type { ActionRateLimitResult } from "@/lib/privacy/action-rate-limit";

export const COLLECTOR_MEDIA_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export const COLLECTOR_MEDIA_RATE_WINDOWS = [
  { name: "hour", seconds: 3600, limit: 10 },
  { name: "day", seconds: 86_400, limit: 30 },
] as const;

export function collectorMediaUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "Collector media vault is unavailable.", code: "media_vault_unavailable" },
    { status: 503, headers: COLLECTOR_MEDIA_PRIVATE_HEADERS },
  );
}

export function collectorMediaNotFound(): NextResponse {
  return NextResponse.json(
    { error: "Media not found.", code: "media_not_found" },
    { status: 404, headers: COLLECTOR_MEDIA_PRIVATE_HEADERS },
  );
}

export function addCollectorMediaRateHeaders(
  response: NextResponse,
  result: Extract<ActionRateLimitResult, { ok: true }>,
): NextResponse {
  response.headers.set("RateLimit-Limit", "10;w=3600, 30;w=86400");
  response.headers.set("RateLimit-Remaining", String(result.remaining));
  response.headers.set(
    "RateLimit-Reset",
    String(
      result.allowed
        ? Math.min(...result.windows.map((window) => window.resetsInSeconds))
        : result.retryAfterSeconds,
    ),
  );
  if (!result.allowed) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return response;
}
