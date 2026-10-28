import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";
import { DATA_API_PAID_PLAN_IDS, type DataApiPaidPlanId } from "./config.server";

/**
 * HTTP edges of the data-API billing routes, after PRISM's sandbox routes
 * (app/api/prism-signals/stripe/http.ts): private no-store JSON, a
 * same-origin browser request for account mutations, and bounded bodies.
 */

export const DATA_API_BILLING_BODY_MAX_BYTES = 1024;
export const DATA_API_WEBHOOK_BODY_MAX_BYTES = 256 * 1024;

const PRIVATE_NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
});

export class DataApiBillingHttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DataApiBillingHttpError";
    this.code = code;
    this.status = status;
  }
}

export function billingJson<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

export function billingError(code: string, message: string, status: number): Response {
  return billingJson({ error: { code, message } }, status);
}

export function billingHttpErrorResponse(error: unknown): Response | null {
  return error instanceof DataApiBillingHttpError ? billingError(error.code, error.message, error.status) : null;
}

/** A browser request from this origin; anything else is refused before auth. */
export function requireBillingSameOrigin(request: Request): void {
  const supplied = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const refused = () => new DataApiBillingHttpError("invalid_origin", "A same-origin browser request is required.", 403);
  if (supplied === null) throw refused();
  let suppliedOrigin: string;
  try {
    suppliedOrigin = new URL(supplied).origin;
  } catch {
    throw refused();
  }
  if (supplied !== suppliedOrigin || suppliedOrigin !== new URL(request.url).origin) throw refused();
  if (fetchSite !== null && fetchSite !== "same-origin") throw refused();
}

function requireJsonMediaType(request: Request): void {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new DataApiBillingHttpError("invalid_request", "Content-Type must be application/json.");
  }
}

async function readBounded(request: Request, maxBytes: number, label: string): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^[0-9]+$/.test(declared)) throw new DataApiBillingHttpError("invalid_request", "The request Content-Length is invalid.");
    if (Number(declared) > maxBytes) throw new DataApiBillingHttpError("request_too_large", "The request body is too large.", 413);
  }
  const body = await readBoundedUtf8Body(request, maxBytes, label);
  if (!body.ok) {
    throw body.kind === "too_large"
      ? new DataApiBillingHttpError("request_too_large", "The request body is too large.", 413)
      : new DataApiBillingHttpError("invalid_request", "The request body must be readable valid UTF-8.");
  }
  return body.text;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  requireJsonMediaType(request);
  const text = await readBounded(request, DATA_API_BILLING_BODY_MAX_BYTES, "Data-API billing request");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataApiBillingHttpError("invalid_request", "The request body must be a JSON object.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DataApiBillingHttpError("invalid_request", "The request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

/** Exactly {"plan":"pro"} or {"plan":"business"}; nothing else is read. */
export async function readCheckoutPlanBody(request: Request): Promise<DataApiPaidPlanId> {
  const body = await readJsonObject(request);
  const keys = Object.keys(body);
  const plan = body.plan;
  if (keys.length !== 1 || keys[0] !== "plan" || typeof plan !== "string" || !(DATA_API_PAID_PLAN_IDS as readonly string[]).includes(plan)) {
    throw new DataApiBillingHttpError("invalid_request", 'The request body must be exactly {"plan":"pro"} or {"plan":"business"}.');
  }
  return plan as DataApiPaidPlanId;
}

export async function readEmptyBillingBody(request: Request): Promise<void> {
  const body = await readJsonObject(request);
  if (Object.keys(body).length !== 0) {
    throw new DataApiBillingHttpError("invalid_request", "The request body must be exactly an empty JSON object.");
  }
}

/** The untouched raw body; signature verification needs the exact bytes. */
export async function readWebhookBody(request: Request): Promise<string> {
  requireJsonMediaType(request);
  return readBounded(request, DATA_API_WEBHOOK_BODY_MAX_BYTES, "Data-API Stripe webhook");
}
