/**
 * Server-side client for the gallery next door.
 *
 * Keep this module out of client-component barrels. The runtime guard makes a
 * mistaken browser import fail closed; its only callers are Server Components
 * and Route Handlers. The URL is public and no credentials cross this wall.
 */

import { parseArtbitrageFeed } from "./contract";
import type { ArtbitrageFeedResult } from "./types";

if (typeof window !== "undefined") {
  throw new Error("The Artbitrage feed client is server-only.");
}

export const ARTBITRAGE_FEED_REVALIDATE_SECONDS = 3600;
export const ARTBITRAGE_FEED_TIMEOUT_MS = 5_000;
export const ARTBITRAGE_FEED_ENDPOINT = "https://artbitrage.io/api/feed";

type NextFetchInit = RequestInit & {
  next: { revalidate: number };
};

export type ArtbitrageFetch = (
  input: string,
  init: NextFetchInit,
) => Promise<Response>;

export interface FetchArtbitrageFeedOptions {
  limit?: number;
  timeoutMs?: number;
  /** Test seam; production callers use Next's server fetch. */
  fetchImpl?: ArtbitrageFetch;
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit)));
}

/**
 * Fetch and validate one feed response. Failure is data, not an exception:
 * callers can distinguish transport, HTTP and contract failures without ever
 * rendering unvalidated upstream bytes.
 */
export async function fetchArtbitrageFeed(
  options: FetchArtbitrageFeedOptions = {},
): Promise<ArtbitrageFeedResult> {
  const controller = new AbortController();
  const timeoutMs = Math.max(
    1,
    options.timeoutMs ?? ARTBITRAGE_FEED_TIMEOUT_MS,
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetchImpl ?? (fetch as ArtbitrageFetch);
  const url = new URL(ARTBITRAGE_FEED_ENDPOINT);
  url.searchParams.set("limit", String(boundedLimit(options.limit)));

  try {
    const response = await fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
      next: { revalidate: ARTBITRAGE_FEED_REVALIDATE_SECONDS },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "unavailable",
        reason: "http",
        http_status: response.status,
      };
    }

    let body: unknown;
    try {
      body = (await response.json()) as unknown;
    } catch {
      if (controller.signal.aborted) {
        return {
          status: "unavailable",
          reason: "network",
          network_kind: "timeout",
        };
      }
      return { status: "unavailable", reason: "invalid-contract" };
    }

    try {
      return { status: "available", feed: parseArtbitrageFeed(body) };
    } catch {
      return { status: "unavailable", reason: "invalid-contract" };
    }
  } catch {
    return {
      status: "unavailable",
      reason: "network",
      network_kind: controller.signal.aborted ? "timeout" : "request-failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
