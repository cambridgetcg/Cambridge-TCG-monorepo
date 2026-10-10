import { envelope } from "@/lib/data-pantry/envelope";
import {
  IDENTIFIER_BODY_MAX_BYTES,
  IDENTIFIER_MAX_LENGTH,
  validateIdentifier,
} from "@/lib/identifier-validation";

const ENDPOINT = "/api/v1/identifiers/validate";
const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "Link",
  Link: '</standards/validator>; rel="describedby"',
};

type RequestErrorCode = "invalid_request" | "payload_too_large" | "unsupported_media_type" | "method_not_allowed";

function respond(data: unknown, status: number, extraHeaders?: Record<string, string>) {
  // Do not use jsonResponse(): its metadata cache warmer does additional work.
  // envelope() itself performs no persistence, database calls or network reads.
  return Response.json(envelope({
    data,
    endpoint: ENDPOINT,
    sources: ["request.identifier", "@cambridge-tcg/sku"],
    freshness: 0,
    license: "NOASSERTION",
    does_not_include: ["Catalog existence or card identity verification", "Authenticity or deck legality checks"],
    extra_meta: { submission_retained: false, validation_scope: "syntax_only" },
  }), { status, headers: { ...HEADERS, ...extraHeaders } });
}

function error(status: number, code: RequestErrorCode, message: string) {
  return respond({ error: { code, message } }, status);
}

export async function POST(request: Request): Promise<Response> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return error(415, "unsupported_media_type", "Send Content-Type: application/json.");
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader)) {
      return error(400, "invalid_request", "Invalid Content-Length header.");
    }
    if (Number(lengthHeader) > IDENTIFIER_BODY_MAX_BYTES) {
      return error(413, "payload_too_large", "JSON body must not exceed 1024 bytes.");
    }
  }

  // Count bytes while reading, including bodies without Content-Length.
  // Keep at most 1 KiB; never use request.json() or unbounded request.text().
  const reader = request.body?.getReader();
  if (!reader) return error(400, "invalid_request", "Send one JSON object with an identifier string.");
  const bytes = new Uint8Array(IDENTIFIER_BODY_MAX_BYTES);
  let size = 0;
  let value: unknown;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > IDENTIFIER_BODY_MAX_BYTES) {
        void reader.cancel().catch(() => {});
        return error(413, "payload_too_large", "JSON body must not exceed 1024 bytes.");
      }
      bytes.set(chunk.value, size - chunk.value.byteLength);
    }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    return error(400, "invalid_request", "The body must be valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }

  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 1 || !("identifier" in value) ||
    typeof value.identifier !== "string"
  ) {
    return error(400, "invalid_request", "Send exactly {\"identifier\":\"...\"}; no additional fields.");
  }
  if (value.identifier.length > IDENTIFIER_MAX_LENGTH) {
    return error(413, "payload_too_large", "Identifier must not exceed 256 characters.");
  }
  return respond(validateIdentifier(value.identifier), 200);
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { ...HEADERS, Allow: "POST, OPTIONS" } });
}

export function GET(): Response {
  return respond({ error: { code: "method_not_allowed", message: "Use POST with a JSON identifier. Documentation: /standards/validator." } }, 405, { Allow: "POST, OPTIONS" });
}

export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "POST, OPTIONS" } });
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
