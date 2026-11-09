/**
 * Reads one window of the storefront's Vercel logs, a page at a time, for
 * the hourly traffic pull (pull.ts). The endpoint is the one the Vercel CLI
 * (vercel@64.5.0, `vercel logs` and `vercel logs requests`) calls; Vercel's
 * public REST reference does not document it, so its shape can change
 * without notice. docs/operations/monitoring.md records what the CLI sends.
 *
 *   POST https://api.vercel.com/v1/observability/events?teamId=<team>
 *   { event, scope: { ownerId, projectIds }, timeRange: { start, end },
 *     select, order: "desc", limit (≤ 1000), filter?, cursor? }
 *   → { events, pagination: { hasMore, nextCursor }, meta?: { excludedIntervals? } }
 *
 * The token is VERCEL_TOKEN, passed in by the caller and sent only in the
 * Authorization header; no error, log line or report carries it, a response
 * body, or a record. Failures come back as Cambridge's own codes.
 */

import { PROJECTS, TEAM_ID } from "@/lib/admin/vercel";

export const VERCEL_EVENTS_URL = "https://api.vercel.com/v1/observability/events";
/** The CLI's own limit per page. */
export const MAX_PAGE_SIZE = 1000;
/** Pages read for one window before it is called incomplete: 200,000
 * records, about 19 hours of the study's traffic in one hour. */
export const MAX_PAGES = 200;
const STOREFRONT_PROJECT_ID = PROJECTS.find(project => project.key === "storefront")!.projectId;

/** What the pull asks for. Only the fields it classifies (classify.ts) or
 * needs to count a record once (requestId); Vercel adds each record's
 * timestamp. No IP address field is asked for. */
export const LOG_SOURCES = {
  /** CDN request records (`vercel logs requests`), production only, without
   * background function executions, as the CLI filters them. */
  requests: {
    event: "vercel.proxy_response",
    select: ["requestId", "requestHostname", "requestPath", "route", "httpStatus", "cacheResult", "wafAction", "clientUserAgent", "clientIpCountry"],
    filter: `(environment:"production") AND (NOT pathType:"background_func")`,
  },
  /** Runtime log lines (`vercel logs`) at error level, production only. */
  runtime: {
    event: "vercel.log",
    select: ["requestId", "level", "message"],
    filter: `(environment:"production") AND (level:(error OR fatal))`,
  },
} as const;
export type LogSource = keyof typeof LOG_SOURCES;

/** Why a read stopped short. stopsRun: the next window would fail the same
 * way (a refused token, a rate limit, Vercel failing, the run's time), so
 * the pull stops asking. Otherwise only this window is affected. */
export interface ReadFailure { code: string; stopsRun: boolean }

export interface ReadResult {
  complete: boolean;
  pages: number;
  /** Intervals Vercel says it left out of the results ("stream gaps"). */
  excluded: { start: string; end: string }[];
  failure: ReadFailure | null;
}

export interface ReadOptions {
  source: LogSource;
  start: Date;
  end: Date;
  token: string;
  /** ms since epoch; no request starts after it. */
  deadline: number;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Each page's records, in order; the records are the caller's to drop. */
  onEvents: (events: Record<string, unknown>[]) => void;
}

/** The most a single request may take, and the longest Retry-After the pull
 * waits out rather than stopping for this run. */
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_MS = 20_000;
const BACKOFF_MS = [2_000, 5_000] as const;

const fail = (code: string, stopsRun: boolean): ReadFailure => ({ code, stopsRun });
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

type Page = { events: Record<string, unknown>[]; hasMore: boolean; nextCursor: string | null; excluded: { start: string; end: string }[] };

function parsePage(body: unknown): Page | null {
  if (!isRecord(body) || !Array.isArray(body.events) || !isRecord(body.pagination)) return null;
  const { hasMore, nextCursor } = body.pagination;
  if (typeof hasMore !== "boolean" || (nextCursor !== null && typeof nextCursor !== "string")) return null;
  const intervals = isRecord(body.meta) && Array.isArray(body.meta.excludedIntervals) ? body.meta.excludedIntervals : [];
  return {
    events: body.events.filter(isRecord),
    hasMore,
    nextCursor,
    excluded: intervals.filter((interval): interval is { start: string; end: string } => isRecord(interval) && typeof interval.start === "string" && typeof interval.end === "string"),
  };
}

/** Reads every page of one window, handing each page's records to onEvents.
 * A 413 (a page too large) halves the page size, as the CLI does; a 429
 * waits out a short Retry-After, and a 5xx or network failure is tried
 * twice more after a pause, while the deadline allows. Never throws. */
export async function readLogWindow(options: ReadOptions): Promise<ReadResult> {
  const { source, start, end, token, deadline } = options;
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const { event, select, filter } = LOG_SOURCES[source];
  const excluded: { start: string; end: string }[] = [];
  let pages = 0, pageSize = MAX_PAGE_SIZE, cursor: string | undefined;
  const result = (failure: ReadFailure | null): ReadResult => ({ complete: failure === null, pages, excluded, failure });

  for (;;) {
    if (pages >= MAX_PAGES) return result(fail("page-cap", false));
    let attempt = 0, page: Page | null = null;
    /** Waits before another try, if one is left and the deadline allows. */
    const retried = async (): Promise<boolean> => {
      const pause = BACKOFF_MS[attempt];
      if (pause === undefined || now() + pause >= deadline) return false;
      attempt += 1;
      await sleep(pause);
      return true;
    };
    while (!page) {
      const remaining = deadline - now();
      if (remaining <= 0) return result(fail("budget-exhausted", true));
      const body = {
        event, scope: { ownerId: TEAM_ID, projectIds: [STOREFRONT_PROJECT_ID] },
        timeRange: { start: start.toISOString(), end: end.toISOString() },
        select, order: "desc", limit: pageSize, filter, ...(cursor ? { cursor } : {}),
      };
      let response: Response;
      try {
        response = await fetcher(`${VERCEL_EVENTS_URL}?teamId=${TEAM_ID}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            // The CLI names why it queries ("cli/logs-requests"); this says
            // who is asking instead of borrowing the CLI's words.
            "x-vercel-observability-query-reason": `cambridgetcg-storefront/traffic-pull/${source}`,
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
        });
      } catch (error) {
        const code = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "network";
        if (await retried()) continue;
        return result(fail(code, true));
      }
      if (response.ok) {
        let parsed: unknown;
        try { parsed = await response.json(); } catch { parsed = null; }
        page = parsePage(parsed);
        if (!page) return result(fail("invalid-response", true));
        break;
      }
      const status = response.status;
      // Only a 400 is read, and only to tell a window Vercel no longer keeps
      // from a query it rejects; nothing in it is kept.
      const text = status === 400 || status === 413 ? await response.text().catch(() => "") : "";
      if (status === 413 && /result_too_large/.test(text)) {
        if (pageSize === 1) return result(fail("record-too-large", false));
        pageSize = Math.max(1, Math.floor(pageSize / 2));
        continue;
      }
      if (status === 401 || status === 403) return result(fail("token-refused", true));
      // Vercel answers 402 for a window its plan does not serve (CDN
      // requests older than a day need Observability Plus).
      if (status === 402) return result(fail("plan-required", false));
      if (status === 400) return result(/retain|time range/i.test(text) ? fail("outside-retention", false) : fail("query-rejected", true));
      if (status === 429) {
        const wait = retryAfterMs(response.headers.get("retry-after"));
        if (wait !== null && wait <= MAX_RETRY_AFTER_MS && attempt < 2 && now() + wait < deadline) {
          attempt += 1;
          await sleep(wait);
          continue;
        }
        return result(fail("rate-limited", true));
      }
      if (status >= 500 && await retried()) continue;
      return result(fail(`http-${status}`, true));
    }
    pages += 1;
    excluded.push(...page.excluded);
    options.onEvents(page.events);
    const next = page.hasMore && page.nextCursor && page.nextCursor !== cursor ? page.nextCursor : null;
    if (!next) return result(null);
    cursor = next;
  }
}

/** Retry-After as milliseconds: seconds, or an HTTP date. */
export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}
