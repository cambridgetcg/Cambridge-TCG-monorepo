/** Bounded raw-body and content-type handling for direct image uploads. */

export const COLLECTOR_MEDIA_MAX_INPUT_BYTES = 3 * 1024 * 1024;
export const COLLECTOR_MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type CollectorMediaMimeType =
  (typeof COLLECTOR_MEDIA_ALLOWED_MIME_TYPES)[number];

export type BoundedBodyResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: "empty" | "invalid-length" | "too-large" | "unreadable" };

export function collectorMediaMimeType(request: Request): CollectorMediaMimeType | null {
  const mime = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return COLLECTOR_MEDIA_ALLOWED_MIME_TYPES.includes(mime as CollectorMediaMimeType)
    ? (mime as CollectorMediaMimeType)
    : null;
}

export async function readBoundedCollectorMediaBody(
  request: Request,
  maxBytes = COLLECTOR_MEDIA_MAX_INPUT_BYTES,
): Promise<BoundedBodyResult> {
  const rawLength = request.headers.get("content-length")?.trim();
  if (rawLength) {
    if (!/^\d+$/.test(rawLength)) return { ok: false, reason: "invalid-length" };
    const declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength)) {
      return { ok: false, reason: "invalid-length" };
    }
    if (declaredLength === 0) return { ok: false, reason: "empty" };
    if (declaredLength > maxBytes) return { ok: false, reason: "too-large" };
  }

  if (!request.body) return { ok: false, reason: "empty" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(part.value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  if (total === 0) return { ok: false, reason: "empty" };
  return { ok: true, bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))) };
}

/** Cookie-authenticated mutations accept only an explicit same-origin request. */
export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
