import { NextResponse } from "next/server";
import {
  PRISM_SIGNALS_BETA_BODY_MAX_BYTES,
  PrismSignalsBetaRequestError,
  type PrismSignalsBetaApiErrorCode,
  type PrismSignalsBetaApiErrorResponse,
} from "@/lib/prism-signals/beta-interest";
import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export function betaJson<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export function betaError(
  code: PrismSignalsBetaApiErrorCode,
  message: string,
  status: number,
): NextResponse<PrismSignalsBetaApiErrorResponse> {
  return betaJson({ error: { code, message } }, status);
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new PrismSignalsBetaRequestError(
      "invalid_origin",
      "The mutation request origin is invalid.",
    );
  }

  if (origin === null) {
    throw new PrismSignalsBetaRequestError(
      "invalid_origin",
      "A same-origin browser request is required.",
    );
  }

  let suppliedOrigin: string;
  try {
    suppliedOrigin = new URL(origin).origin;
  } catch {
    throw new PrismSignalsBetaRequestError(
      "invalid_origin",
      "The mutation request origin is invalid.",
    );
  }

  if (
    suppliedOrigin !== requestOrigin ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    throw new PrismSignalsBetaRequestError(
      "invalid_origin",
      "A same-origin browser request is required.",
    );
  }
}

async function boundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new PrismSignalsBetaRequestError(
        "invalid_request",
        "The request Content-Length is invalid.",
      );
    }
    if (parsed > PRISM_SIGNALS_BETA_BODY_MAX_BYTES) {
      throw new PrismSignalsBetaRequestError(
        "invalid_request",
        "The request body is too large.",
        413,
      );
    }
  }

  const body = await readBoundedUtf8Body(
    request,
    PRISM_SIGNALS_BETA_BODY_MAX_BYTES,
    "PRISM Signals beta request",
  );
  if (!body.ok) {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      body.kind === "too_large"
        ? "The request body is too large."
        : "The request body must be readable valid UTF-8.",
      body.kind === "too_large" ? 413 : 400,
    );
  }
  return body.text;
}

export async function readExactJson(request: Request): Promise<unknown> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "Content-Type must be application/json.",
    );
  }

  const body = await boundedBody(request);
  if (body.length === 0) {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "A JSON request body is required.",
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "The request body must be valid JSON.",
    );
  }
}

export async function requireEmptyBody(request: Request): Promise<void> {
  const body = await boundedBody(request);
  if (body.length !== 0) {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "DELETE does not accept a request body.",
    );
  }
}

export function betaRequestErrorResponse(
  error: unknown,
): NextResponse<PrismSignalsBetaApiErrorResponse> | null {
  if (!(error instanceof PrismSignalsBetaRequestError)) return null;
  return betaError(
    error.code,
    error.message,
    error.status,
  );
}
