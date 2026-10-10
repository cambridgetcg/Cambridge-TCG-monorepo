import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";

export const PRISM_STRIPE_MUTATION_BODY_MAX_BYTES = 1024;
export const PRISM_STRIPE_WEBHOOK_BODY_MAX_BYTES = 256 * 1024;

const PRIVATE_NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
});

export type PrismStripeErrorBody = Readonly<{
  error: Readonly<{
    code: string;
    message: string;
  }>;
}>;

export class PrismStripeHttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PrismStripeHttpError";
    this.code = code;
    this.status = status;
  }
}

export function prismStripeJson<T>(body: T, status = 200): Response {
  return Response.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

export function prismStripeError(
  code: string,
  message: string,
  status: number,
): Response {
  return prismStripeJson<PrismStripeErrorBody>(
    { error: { code, message } },
    status,
  );
}

export function prismStripeHttpErrorResponse(error: unknown): Response | null {
  if (!(error instanceof PrismStripeHttpError)) return null;
  return prismStripeError(error.code, error.message, error.status);
}

export function requirePrismStripeSameOrigin(request: Request): void {
  const supplied = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (supplied === null) {
    throw new PrismStripeHttpError(
      "invalid_origin",
      "A same-origin browser request is required.",
      403,
    );
  }

  let expectedOrigin: string;
  let suppliedOrigin: string;
  try {
    expectedOrigin = new URL(request.url).origin;
    const parsed = new URL(supplied);
    suppliedOrigin = parsed.origin;
    if (supplied !== suppliedOrigin) throw new TypeError("Non-origin URL");
  } catch {
    throw new PrismStripeHttpError(
      "invalid_origin",
      "The mutation request origin is invalid.",
      403,
    );
  }

  if (
    suppliedOrigin !== expectedOrigin ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    throw new PrismStripeHttpError(
      "invalid_origin",
      "A same-origin browser request is required.",
      403,
    );
  }
}

function assertDeclaredLength(request: Request, maxBytes: number): void {
  const declared = request.headers.get("content-length");
  if (declared === null) return;
  if (!/^[0-9]+$/.test(declared)) {
    throw new PrismStripeHttpError(
      "invalid_request",
      "The request Content-Length is invalid.",
    );
  }
  const parsed = Number(declared);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PrismStripeHttpError(
      "invalid_request",
      "The request Content-Length is invalid.",
    );
  }
  if (parsed > maxBytes) {
    throw new PrismStripeHttpError(
      "request_too_large",
      "The request body is too large.",
      413,
    );
  }
}

function requireJsonMediaType(request: Request): void {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new PrismStripeHttpError(
      "invalid_request",
      "Content-Type must be application/json.",
    );
  }
}

async function readBoundedBody(
  request: Request,
  maxBytes: number,
  label: string,
): Promise<string> {
  assertDeclaredLength(request, maxBytes);
  const body = await readBoundedUtf8Body(request, maxBytes, label);
  if (!body.ok) {
    throw new PrismStripeHttpError(
      body.kind === "too_large" ? "request_too_large" : "invalid_request",
      body.kind === "too_large"
        ? "The request body is too large."
        : "The request body must be readable valid UTF-8.",
      body.kind === "too_large" ? 413 : 400,
    );
  }
  return body.text;
}

export async function readPrismStripeEmptyJson(request: Request): Promise<void> {
  requireJsonMediaType(request);
  const body = await readBoundedBody(
    request,
    PRISM_STRIPE_MUTATION_BODY_MAX_BYTES,
    "PRISM Stripe mutation",
  );
  if (body.length === 0) {
    throw new PrismStripeHttpError(
      "invalid_request",
      "An empty JSON object is required.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new PrismStripeHttpError(
      "invalid_request",
      "The request body must be valid JSON.",
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 0
  ) {
    throw new PrismStripeHttpError(
      "invalid_request",
      "The request body must be exactly an empty JSON object.",
    );
  }
}

export async function readPrismStripeRawWebhookBody(
  request: Request,
): Promise<string> {
  requireJsonMediaType(request);
  return readBoundedBody(
    request,
    PRISM_STRIPE_WEBHOOK_BODY_MAX_BYTES,
    "PRISM Stripe webhook",
  );
}
