/**
 * PII Masking Utilities
 *
 * Provides functions to mask personally identifiable information (PII)
 * for safe logging in production environments, and a privacy-safe console
 * (`privacySafeConsole`, `privacySafeLogTemplate`) that reduces log messages
 * and data to operational metadata before anything is written.
 *
 * NEVER log unmasked PII in production - this is a GDPR/CCPA violation risk.
 */

/**
 * Masks an email for safe logging
 * "john.doe@example.com" -> "j***e@e***.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '[no-email]';

  const atIndex = email.indexOf('@');
  if (atIndex === -1) return '[invalid-email]';

  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1);

  const dotIndex = domain.lastIndexOf('.');
  if (dotIndex === -1) return '[invalid-email]';

  const domainName = domain.substring(0, dotIndex);
  const tld = domain.substring(dotIndex + 1);

  const maskedLocal = local.length > 2
    ? `${local[0]}***${local[local.length - 1]}`
    : '***';

  const maskedDomain = domainName.length > 2
    ? `${domainName[0]}***`
    : '***';

  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/**
 * Masks a phone number for safe logging
 * "+1234567890" -> "+1***890"
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '[no-phone]';

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '[invalid-phone]';

  const prefix = phone.startsWith('+') ? '+' : '';
  return `${prefix}${digits.substring(0, 2)}***${digits.substring(digits.length - 3)}`;
}

/**
 * Masks a name for safe logging
 * "John Doe" -> "J*** D***"
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return '[no-name]';

  return name.split(' ')
    .map(part => part.length > 0 ? `${part[0]}***` : '')
    .join(' ');
}

/**
 * Creates a safe log string for a customer
 * In production: Shows masked email, in dev: shows full details
 */
export function logSafeCustomer(
  shopifyCustomerId: string | number | null | undefined,
  email?: string | null
): string {
  if (process.env.NODE_ENV !== 'production') {
    // In development, show full details for debugging
    return `${shopifyCustomerId || '[no-id]'} (${email || '[no-email]'})`;
  }

  // In production, mask the email
  const id = shopifyCustomerId ? `shopify:${shopifyCustomerId}` : '[no-id]';
  return `${id} (${maskEmail(email)})`;
}

/**
 * Creates a safe log string for an order
 * In production: Masks customer info
 */
export function logSafeOrder(
  orderId: string | number | null | undefined,
  customerEmail?: string | null
): string {
  if (process.env.NODE_ENV !== 'production') {
    return `order:${orderId || '[no-id]'} customer:${customerEmail || '[no-email]'}`;
  }

  return `order:${orderId || '[no-id]'} customer:${maskEmail(customerEmail)}`;
}

/**
 * Masks sensitive data in an object for safe logging
 * Recursively processes objects and masks known PII fields
 */
export function maskSensitiveData<T extends Record<string, unknown>>(
  data: T,
  sensitiveFields: string[] = ['email', 'phone', 'firstName', 'lastName', 'name', 'address']
): T {
  if (process.env.NODE_ENV !== 'production') {
    return data; // No masking in development
  }

  const masked = { ...data } as Record<string, unknown>;

  for (const key of Object.keys(masked)) {
    const value = masked[key];

    if (value === null || value === undefined) {
      continue;
    }

    // Check if this is a sensitive field
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some(field =>
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive && typeof value === 'string') {
      if (lowerKey.includes('email')) {
        masked[key] = maskEmail(value);
      } else if (lowerKey.includes('phone')) {
        masked[key] = maskPhone(value);
      } else if (lowerKey.includes('name')) {
        masked[key] = maskName(value);
      } else {
        // Generic masking for other sensitive fields
        masked[key] = value.length > 2
          ? `${value[0]}***${value[value.length - 1]}`
          : '***';
      }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively mask nested objects
      masked[key] = maskSensitiveData(value as Record<string, unknown>, sensitiveFields);
    }
  }

  return masked as T;
}

// ============================================
// PRIVACY-SAFE CONSOLE
// ============================================

/**
 * Reduce unknown failures to fields that are useful for operations without
 * serializing messages, response bodies, headers, request configuration, or
 * other values that can contain credentials or personal data.
 */
export interface SafeErrorDiagnostic {
  errorClass: string;
  status?: number;
}

type ConsoleMethod = "debug" | "error" | "info" | "log" | "warn";

const SAFE_ERROR_CLASSES = new Set([
  "AbortError",
  "AggregateError",
  "AxiosError",
  "Error",
  "EvalError",
  "FetchError",
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientRustPanicError",
  "PrismaClientUnknownRequestError",
  "PrismaClientValidationError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
]);

const SENSITIVE_KEY_PATTERN =
  /(?:^|_)(?:amount|answer|authorization|balance|body|code|content|cookie|customer|description|domain|email|error|header|id|line_item|location|merchant|message|name|order|password|payload|phone|price|product|purchase|question|redirect|refund|request|response|secret|session|shop|sku|stack|state|subject|tier|title|token|total|url|uri|username|variant|verifier)(?:$|_)/i;

const SAFE_STRING_KEY_PATTERN =
  /^(?:action|apiKind|category|currency|errorClass|event|eventType|intent|method|mode|operation|provider|service|source|strategy|table|topic|type)$/;

const SAFE_SCALAR_KEY_PATTERN =
  /(?:Class|Count|Duration|Enabled|ExpiresIn|Kind|Length|Latency|Limit|Method|Mode|Percent|Present|Rate|Retries|Retry|Size|Status|Success|Type|Valid|Version)$|^(?:(?:can|has|is|should)[A-Z]|attempt|batch|bypassed|count|critical|duration|expiresIn|found|index|isOnline|latency|limit|locked|method|page|quantity|retryAfter|size|status|success|version)$/;

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s]+/g, "_");
  return SENSITIVE_KEY_PATTERN.test(normalized);
}

function isSafeScalarKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s]+/g, "_")
    .toLowerCase();

  return (
    SAFE_SCALAR_KEY_PATTERN.test(key) ||
    /(?:^|_)(?:class|count|duration|enabled|expires_in|kind|length|latency|limit|method|mode|percent|present|rate|retries|retry|size|status|success|type|valid|version)$/.test(
      normalized,
    )
  );
}

function isSafeSensitiveScalarKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s]+/g, "_")
    .toLowerCase();

  return /(?:^|_)(?:class|count|duration|enabled|length|limit|percent|present|rate|retries|retry|size|status|success|valid)$/.test(
    normalized,
  );
}

function redactSensitiveString(value: string): string {
  return value
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bhttps?:\/\/[^\s,)\]}]+/gi, "[url redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/\b[a-z0-9][a-z0-9-]*\.myshopify\.com\b/gi, "[shop redacted]")
    .replace(/\bgid:\/\/[^\s,)\]}]+/gi, "[id redacted]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[opaque value redacted]")
    .replace(/#\d{3,}\b/g, "[order reference redacted]")
    .replace(
      /(\b(?:answer|authorization|body|content|cookie|description|email|error message|header|location|message|password|payload|phone|question|redirect|response body|secret|stack|state|subject|token|url|username|verifier)\s*[:=]\s*)(.+)$/gi,
      "$1[redacted]",
    )
    .replace(
      /(\b(?:customer|line item|merchant|order|product|purchase|refund|session|shop|shopify product|shopify variant|subscription|tier|variant|webhook)(?:\s+(?:domain|id|name))?\s*[:=]\s*)([^,\s)\]}]+)/gi,
      "$1[redacted]",
    )
    .replace(
      /(\b(?:customer|line item|product|variant|tier|purchase|order)\s+(?:id|name|price|sku|title)\s*[:=]\s*)([^\s,;\n][^,;\n]*)/gi,
      "$1[redacted]",
    )
    .replace(
      /(\b(?:id|price|sku|title)\s*[:=]\s*)([^\s,;\n][^,;\n]*)/gi,
      "$1[redacted]",
    )
    .replace(
      /(\b(?:after|before|for|from|to)\s+(?:shop|merchant|customer|order|session)\s+)([^,\s)\]}]+)/gi,
      "$1[redacted]",
    )
    .replace(
      /(\b(?:customer|order|session|shop)\s+)((?:#?\d{3,})|(?:[a-z][a-z0-9_-]{15,}))\b/gi,
      "$1[redacted]",
    )
    .replace(
      /(\bfailed\b[^:\n]{0,120}:\s*)(.+)$/gi,
      "$1[redacted]",
    )
    .replace(/\[redacted\]\s+redacted\]/gi, "[redacted]");
}

export function safeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
  if (error instanceof Response) {
    return {
      errorClass: "Response",
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      errorClass: SAFE_ERROR_CLASSES.has(error.name) ? error.name : "Error",
    };
  }

  if (error === null) {
    return { errorClass: "null" };
  }

  return { errorClass: typeof error };
}

function presenceFields(
  key: string,
  value: unknown,
): Record<string, boolean | number> {
  const result: Record<string, boolean | number> = {
    [`${key}Present`]: value !== null && value !== undefined && value !== "",
  };

  if (typeof value === "string" || Array.isArray(value)) {
    result[`${key}Length`] = value.length;
  }

  return result;
}

/**
 * Sanitize structured log context recursively. Unknown strings are represented
 * by presence/length metadata; only an intentionally small set of operational
 * enum-like keys retain their values.
 */
export function safeLogData(value: unknown): unknown {
  const seen = new WeakSet<object>();

  function sanitize(current: unknown, key?: string, depth = 0): unknown {
    if (current instanceof Error || current instanceof Response) {
      return safeErrorDiagnostic(current);
    }

    if (
      current === null ||
      current === undefined ||
      typeof current === "boolean"
    ) {
      return current;
    }

    if (typeof current === "number") {
      return key && isSafeScalarKey(key)
        ? current
        : {
            numberPresent: true,
            numberFinite: Number.isFinite(current),
          };
    }

    if (typeof current === "string") {
      if (key && SAFE_STRING_KEY_PATTERN.test(key)) {
        return redactSensitiveString(current);
      }

      return {
        stringPresent: current.length > 0,
        stringLength: current.length,
      };
    }

    if (
      typeof current === "bigint" ||
      typeof current === "function" ||
      typeof current === "symbol"
    ) {
      return { valueType: typeof current };
    }

    if (current instanceof Date) {
      return { datePresent: true };
    }

    if (current instanceof URL) {
      return { urlPresent: true };
    }

    if (depth >= 6) {
      return { valuePresent: true, truncated: true };
    }

    if (seen.has(current)) {
      return { valuePresent: true, circular: true };
    }
    seen.add(current);

    if (Array.isArray(current)) {
      const items = current.slice(0, 20).map((item) =>
        sanitize(item, undefined, depth + 1),
      );
      return current.length > items.length
        ? [...items, { truncatedCount: current.length - items.length }]
        : items;
    }

    if (current instanceof Map || current instanceof Set) {
      return { valuePresent: current.size > 0, valueCount: current.size };
    }

    const safe: Record<string, unknown> = {};

    try {
      for (const [entryKey, entryValue] of Object.entries(
        current as Record<string, unknown>,
      )) {
        if (entryValue instanceof Error || entryValue instanceof Response) {
          Object.assign(safe, safeErrorDiagnostic(entryValue));
          continue;
        }

        if (
          isSensitiveKey(entryKey) &&
          !isSafeSensitiveScalarKey(entryKey)
        ) {
          Object.assign(safe, presenceFields(entryKey, entryValue));
          continue;
        }

        if (isSafeScalarKey(entryKey)) {
          safe[entryKey] =
            typeof entryValue === "string"
              ? redactSensitiveString(entryValue)
              : sanitize(entryValue, entryKey, depth + 1);
          continue;
        }

        if (isSensitiveKey(entryKey)) {
          Object.assign(safe, presenceFields(entryKey, entryValue));
          continue;
        }

        if (typeof entryValue === "string") {
          Object.assign(safe, presenceFields(entryKey, entryValue));
          continue;
        }

        safe[entryKey] = sanitize(entryValue, entryKey, depth + 1);
      }
    } catch {
      return { valuePresent: true, valueType: "object" };
    }

    return safe;
  }

  return sanitize(value);
}

export function safeLogMessage(message: unknown): unknown {
  return typeof message === "string"
    ? redactSensitiveString(message)
    : safeLogData(message);
}

const SENSITIVE_TEMPLATE_CONTEXT =
  /(?:amount|answer|balance|body|content|cookie|customer|description|email|error|header|\bid\b|line item|location|merchant|message|name|order|password|payload|phone|price|product|question|redirect|request|response|secret|session|shop|sku|stack|state|subject|title|token|total|url|uri|username|variant|verifier)\s*[:=#([]?\s*$/i;

const SAFE_TEMPLATE_STRING_CONTEXT =
  /(?:action|category|currency|event|intent|method|mode|operation|provider|service|source|status|strategy|topic|type)\s*[:=(]?\s*$/i;

const SAFE_TEMPLATE_NUMBER_CONTEXT =
  /(?:attempt|batch|count|duration|index|latency|length|limit|page|percent|quantity|rate|retries|retry|size|status|version)\s*[:=#([]?\s*$/i;

const SAFE_TEMPLATE_NUMBER_SUFFIX =
  /^\s*(?:attempts|batches|customers|entries|events|items|lists|missions|orders|pages|products|profiles|raffles|records|results|retries|rules|sessions|shops|tiers|webhooks)\b/i;

/**
 * Template tag for diagnostic messages. It preserves the authored message and
 * bounded operational scalars while replacing arbitrary interpolated strings,
 * objects, identifiers, monetary values, and content before concatenation.
 */
export function privacySafeLogTemplate(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  let result = "";

  for (let index = 0; index < strings.length; index++) {
    const authored = redactSensitiveString(strings[index]);
    result += authored;
    if (index >= values.length) continue;

    const value = values[index];
    const context = strings[index].slice(-80);
    const suffix = strings[index + 1]?.slice(0, 40) ?? "";

    if (typeof value === "boolean") {
      result += String(value);
    } else if (
      typeof value === "number" &&
      (SAFE_TEMPLATE_NUMBER_CONTEXT.test(context) ||
        SAFE_TEMPLATE_NUMBER_SUFFIX.test(suffix))
    ) {
      result += Number.isFinite(value) ? String(value) : "[number unavailable]";
    } else if (
      typeof value === "string" &&
      SAFE_TEMPLATE_STRING_CONTEXT.test(context)
    ) {
      result += redactSensitiveString(value);
    } else if (SENSITIVE_TEMPLATE_CONTEXT.test(context)) {
      result += "[redacted]";
    } else if (typeof value === "number") {
      result += "[number present]";
    } else if (value instanceof Error || value instanceof Response) {
      result += `[${safeErrorDiagnostic(value).errorClass}]`;
    } else if (Array.isArray(value)) {
      result += `[count=${value.length}]`;
    } else if (value === null || value === undefined || value === "") {
      result += "[absent]";
    } else if (typeof value === "string") {
      result += `[value present; length=${value.length}]`;
    } else {
      result += "[value present]";
    }
  }

  return redactSensitiveString(result);
}

function emit(method: ConsoleMethod, args: unknown[]): void {
  const [message, ...data] = args;
  globalThis.console[method](
    safeLogMessage(message),
    ...data.map((value) => safeLogData(value)),
  );
}

/**
 * Drop-in console subset for application diagnostics. Import this as
 * `safeConsole` and use it in place of the ambient console.
 */
export const privacySafeConsole = Object.freeze({
  debug: (...args: unknown[]) => emit("debug", args),
  error: (...args: unknown[]) => emit("error", args),
  info: (...args: unknown[]) => emit("info", args),
  log: (...args: unknown[]) => emit("log", args),
  warn: (...args: unknown[]) => emit("warn", args),
  group: (...args: unknown[]) => {
    const [message, ...data] = args;
    globalThis.console.group(
      safeLogMessage(message),
      ...data.map((value) => safeLogData(value)),
    );
  },
  groupEnd: () => globalThis.console.groupEnd(),
});

/**
 * Safe logging helper that automatically masks PII
 * Use this instead of console.log for any data that might contain PII
 */
export function safeLog(message: string, data?: Record<string, unknown>): void {
  if (data) {
    privacySafeConsole.log(message, data);
  } else {
    privacySafeConsole.log(message);
  }
}
