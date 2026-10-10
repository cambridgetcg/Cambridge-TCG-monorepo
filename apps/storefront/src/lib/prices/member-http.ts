import "server-only";

export function memberHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie, Authorization");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  return headers;
}

export function memberJson(body: unknown, status = 200, extra?: HeadersInit): Response {
  return Response.json(body, { status, headers: memberHeaders(extra) });
}
export function memberError(message: string, status: number, extra?: HeadersInit): Response {
  return memberJson({ error: message }, status, extra);
}
export function memberMethodNotAllowed(): Response {
  return memberError("Method not allowed.", 405);
}

/** Canonical operator configuration, never attacker-supplied Host/forwarded-host. */
export function hasTrustedMemberOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://cambridgetcg.com";
  try {
    const canonical = new URL(configured);
    const local = canonical.hostname === "localhost" || canonical.hostname === "127.0.0.1";
    if (canonical.username || canonical.password || canonical.search || canonical.hash || canonical.pathname !== "/") return false;
    if (canonical.protocol !== "https:" && !(canonical.protocol === "http:" && local && process.env.NODE_ENV !== "production")) return false;
    return origin === canonical.origin;
  } catch { return false; }
}

export class MemberBodyError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** Read at most 1 KiB even for chunked bodies; parse only a single exact-shaped object. */
export async function readMemberBody(request: Request, field: "name" | "keyId"): Promise<string> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new MemberBodyError("Use application/json.", 415);
  }
  const max = 1024;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) {
    throw new MemberBodyError("Request body is too large.", 413);
  }
  if (!request.body) throw new MemberBodyError("A JSON object is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new MemberBodyError("Request body is too large.", 413);
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new MemberBodyError("Invalid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !(field in body)) {
    throw new MemberBodyError(`Expected only ${field}.`);
  }
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== "string") throw new MemberBodyError(`${field} must be a string.`);
  return value;
}
