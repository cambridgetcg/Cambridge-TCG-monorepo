/**
 * Redaction for error-tracking payloads (Sentry events, transactions and
 * breadcrumbs), on both the server and the browser.
 *
 * Removes credentials (Shopify id_token, session, OAuth code, hmac, bearer
 * tokens, cookies) and shopper email addresses before anything leaves the app.
 */

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
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
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

export function redactSensitiveTelemetryValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactSensitiveUrlText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[REDACTED_CYCLE]";
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) =>
      redactSensitiveTelemetryValue(item, seen),
    );
  }
  if (value instanceof Error) {
    return redactSensitiveUrlText(`${value.name}: ${value.message}`);
  }
  // Breadcrumbs can hold raw console arguments: DOM nodes, requests, class
  // instances. Don't walk their internals; keep only the type name.
  if (!isPlainObject(value)) return `[${value.constructor?.name ?? "Object"}]`;
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === SDK_INTERNAL_FIELD
        ? child
        : isSensitiveField(key)
          ? "[REDACTED]"
          : redactSensitiveTelemetryValue(child, seen),
    ]),
  );
}
