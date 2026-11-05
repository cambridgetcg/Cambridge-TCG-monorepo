/**
 * What leaves the app for Sentry, and the one door it leaves through.
 *
 * The redaction is carried from apps/rewardspro's utils/telemetry-redaction.ts:
 * credentials (Shopify id_token, session, OAuth code, hmac, bearer tokens,
 * cookies) and buyer email addresses are removed before anything is sent.
 * scrubEvent is Sentry's beforeSend: on top of the redaction, an event keeps
 * no query string, cookies or request body (plan Global Constraints: no
 * query strings and no request bodies are logged), so the signed buyer id the
 * app proxy puts in every query string never reaches Sentry.
 *
 * `monitoring` is how the rest of the app reports to Sentry (cron.server.ts
 * reports cron runs through it); it does nothing until Sentry is set up
 * (entry.server.tsx, with SENTRY_DSN).
 */
import * as Sentry from "@sentry/react-router";

const SENSITIVE_QUERY_VALUE =
  /(^|[?&])((?:id_token|session_token|session|token|authorization|code|hmac|signature)=)[^&#\s]*/gi;
const BEARER_VALUE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const LABELLED_SECRET_VALUE =
  /\b((?:id[-_ ]?token|session[-_ ]?token|access[-_ ]?token|refresh[-_ ]?token|authorization|cookie|credential|secret|password|hmac|signature)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi;
// Plain or URL-encoded (%40) email addresses.
const EMAIL_ADDRESS = /[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const SENSITIVE_FIELD =
  /(?:^|[-_])(token|authorization|credential|secret|password|cookie|hmac|signature|api[-_]?key|access[-_]?key|email|phone)(?:$|[-_])/i;

function normalizeFieldName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function isSensitiveField(value: string): boolean {
  return SENSITIVE_FIELD.test(normalizeFieldName(value));
}

// Sentry keeps live SDK objects (scopes) here and deletes the key before
// sending, so it must pass through untouched.
const SDK_INTERNAL_FIELD = "sdkProcessingMetadata";

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function redactSensitiveUrlText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_VALUE, "$1$2[REDACTED]")
    .replace(BEARER_VALUE, "$1[REDACTED]")
    .replace(LABELLED_SECRET_VALUE, "$1[REDACTED]")
    .replace(EMAIL_ADDRESS, "[REDACTED_EMAIL]");
}

export function redactSensitiveTelemetryValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactSensitiveUrlText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[REDACTED_CYCLE]";
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => redactSensitiveTelemetryValue(item, seen));
  }
  if (value instanceof Error) {
    return redactSensitiveUrlText(`${value.name}: ${value.message}`);
  }
  // Spans, URLs and dates serialise through toJSON: scrub what it returns.
  const { toJSON } = value as { toJSON?: unknown };
  if (typeof toJSON === "function") {
    seen.add(value);
    try {
      return redactSensitiveTelemetryValue(toJSON.call(value), seen);
    } catch {
      // Fall through and keep only the type name.
    }
  }
  // Breadcrumbs can hold raw console arguments: requests, class instances.
  // Don't walk their internals; keep only the type name.
  if (!isPlainObject(value)) return `[${value.constructor?.name ?? "Object"}]`;
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === SDK_INTERNAL_FIELD ? child : isSensitiveField(key) ? "[REDACTED]" : redactSensitiveTelemetryValue(child, seen),
    ]),
  );
}

/** A URL without its query string or fragment; text that isn't a URL is cut at its first `?`. */
function withoutQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

type Scrubbable = {
  request?: { url?: string; query_string?: unknown; cookies?: unknown; data?: unknown; headers?: Record<string, string> };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
};

/**
 * Sentry's beforeSend (and beforeSendTransaction): the event without its
 * request's query string, cookies and body, its URLs without their query
 * strings, and everything left redacted.
 */
export function scrubEvent<E extends Scrubbable>(event: E): E | null {
  const copy = { ...event };
  if (event.request) {
    const request = { ...event.request };
    delete request.query_string;
    delete request.cookies;
    delete request.data;
    if (typeof request.url === "string") request.url = withoutQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.toLowerCase() !== "cookie"));
    }
    copy.request = request;
  }
  if (event.breadcrumbs) {
    copy.breadcrumbs = event.breadcrumbs.map((crumb) =>
      typeof crumb.data?.url === "string" ? { ...crumb, data: { ...crumb.data, url: withoutQuery(crumb.data.url) } } : crumb,
    );
  }
  return redactSensitiveTelemetryValue(copy) as E;
}

/**
 * Reporting to Sentry. Every call is a no-op until Sentry is set up, so the
 * app runs the same without SENTRY_DSN (tests spy on these).
 */
export const monitoring = {
  enabled(): boolean {
    return Sentry.isEnabled();
  },
  captureException(error: unknown, context: { tags: Record<string, string>; extra?: Record<string, unknown> }): void {
    if (monitoring.enabled()) Sentry.captureException(error, context);
  },
  /** True when the message was sent. */
  captureMessage(
    message: string,
    level: "info" | "warning" | "error",
    context: { tags: Record<string, string>; extra?: Record<string, unknown> },
  ): boolean {
    if (!monitoring.enabled()) return false;
    Sentry.captureMessage(message, { level, ...context });
    return true;
  },
  captureCheckIn(checkIn: Parameters<typeof Sentry.captureCheckIn>[0], config?: Parameters<typeof Sentry.captureCheckIn>[1]): string {
    return Sentry.captureCheckIn(checkIn, config);
  },
  async flush(): Promise<void> {
    if (monitoring.enabled()) await Sentry.flush(2000);
  },
};
