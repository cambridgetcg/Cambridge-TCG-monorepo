import pino, { type Logger } from "pino";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.x-shopify-hmac-sha256",
  "request.headers.authorization",
  "request.headers.x-shopify-hmac-sha256",
  "*.databaseUrl",
  "*.operatorToken",
  "*.shopifyApiSecret",
] as const;

export function createLogger(level: string): Logger {
  return pino({
    base: null,
    level,
    redact: {
      censor: "[REDACTED]",
      paths: [...REDACTED_PATHS],
    },
    serializers: {
      error: safeError,
      err: safeError,
      req(request: {
        id?: string;
        method?: string;
        remoteAddress?: string;
        url?: string;
      }) {
        return {
          id: request.id,
          method: request.method,
          remoteAddress: request.remoteAddress,
          url: request.url,
        };
      },
    },
  });
}

export function safeError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { name: "UnknownError" };
  }
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    retryable?: unknown;
  };
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    name: typeof candidate.name === "string" ? candidate.name : "Error",
    retryable:
      typeof candidate.retryable === "boolean" ? candidate.retryable : undefined,
  };
}
