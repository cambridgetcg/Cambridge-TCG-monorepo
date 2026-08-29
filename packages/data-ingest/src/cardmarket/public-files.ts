/**
 * Cardmarket public daily-file transport.
 *
 * This module fetches one operator-selected Product Catalog or Price Guide
 * artifact and returns the original bytes with enough evidence for a private,
 * content-addressed archive. It deliberately does not parse prices, write a
 * database, or grant publication rights.
 *
 * Cardmarket's legacy OAuth reader remains a separate, locked path. The only
 * URLs accepted here are the intentionally published JSON objects on
 * `downloads.s3.cardmarket.com`.
 */

import { createHash } from "node:crypto";

import { createFetcher } from "../http";
import type {
  IngestContext,
  RawProvenance,
  SourceMeta,
} from "../types";

export type CardmarketPublicFileKind = "product-list" | "price-guide";

export interface CardmarketPublicFileRequest {
  /** Which reviewed Cardmarket artifact shape the URL must match. */
  kind: CardmarketPublicFileKind;
  /** Exact official object URL. Redirect targets are checked identically. */
  url: string;
  /** Per-call ceiling; cannot exceed CARDMARKET_PUBLIC_FILE_HARD_MAX_BYTES. */
  max_bytes?: number;
}

export interface CardmarketPublicFileHeaders {
  content_type: string | null;
  content_length: number | null;
  content_encoding: string | null;
  etag: string | null;
  last_modified: string | null;
  cache_control: string | null;
}

export interface CardmarketPublicFileArtifact {
  kind: CardmarketPublicFileKind;
  /** Operator-supplied, allowlisted URL before any reviewed redirect. */
  source_url: string;
  /** Response URL after following only allowlisted redirects. */
  final_url: string;
  /** Original response body. No parsing or transformation is performed. */
  bytes: Uint8Array;
  byte_length: number;
  /** Lowercase hexadecimal SHA-256 over `bytes`. */
  sha256: string;
  retrieved_at: string;
  headers: CardmarketPublicFileHeaders;
  provenance: RawProvenance;
}

export type CardmarketPublicFileErrorCode =
  | "aborted"
  | "invalid-url"
  | "origin-not-allowed"
  | "path-not-allowed"
  | "redirect-not-allowed"
  | "too-many-redirects"
  | "http-error"
  | "invalid-content-type"
  | "invalid-json-envelope"
  | "invalid-size-limit"
  | "too-large";

export class CardmarketPublicFileError extends Error {
  readonly code: CardmarketPublicFileErrorCode;
  readonly url?: string;
  readonly status?: number;

  constructor(
    code: CardmarketPublicFileErrorCode,
    message: string,
    details: { url?: string; status?: number } = {},
  ) {
    super(message);
    this.name = "CardmarketPublicFileError";
    this.code = code;
    this.url = details.url;
    this.status = details.status;
  }
}

export const CARDMARKET_PUBLIC_FILE_ORIGIN =
  "https://downloads.s3.cardmarket.com";
export const CARDMARKET_PUBLIC_FILE_MAX_BYTES = 128 * 1024 * 1024;
export const CARDMARKET_PUBLIC_FILE_HARD_MAX_BYTES = 256 * 1024 * 1024;

const MAX_REDIRECTS = 3;

const PATHS: Record<CardmarketPublicFileKind, RegExp> = {
  "product-list":
    /^\/productCatalog\/productList\/products_(?:singles|nonsingles)_[1-9][0-9]*\.json$/,
  "price-guide":
    /^\/productCatalog\/priceGuide\/price_guide_[1-9][0-9]*\.json$/,
};

const ALLOWED_CONTENT_TYPES = new Set([
  "application/json",
  // S3 objects without explicit metadata can legitimately use this generic
  // type. The independent JSON-envelope guard below still rejects HTML or
  // arbitrary binary content.
  "application/octet-stream",
  "binary/octet-stream",
]);

/**
 * Parse and validate one official Cardmarket public-file URL.
 *
 * The check is intentionally narrow: HTTPS, exact origin, no credentials,
 * query, fragment, or non-default port, and an exact reviewed filename shape.
 */
export function assertCardmarketPublicFileUrl(
  value: string,
  kind: CardmarketPublicFileKind,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CardmarketPublicFileError(
      "invalid-url",
      `Cardmarket public-file URL is invalid: ${value}`,
      { url: value },
    );
  }

  const expectedOrigin = new URL(CARDMARKET_PUBLIC_FILE_ORIGIN);
  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedOrigin.hostname ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new CardmarketPublicFileError(
      "origin-not-allowed",
      `Cardmarket public files must use the exact ${CARDMARKET_PUBLIC_FILE_ORIGIN} origin`,
      { url: url.toString() },
    );
  }

  if (url.search !== "" || url.hash !== "" || !PATHS[kind].test(url.pathname)) {
    throw new CardmarketPublicFileError(
      "path-not-allowed",
      `URL is not an allowlisted Cardmarket ${kind} JSON object`,
      { url: url.toString() },
    );
  }

  return url;
}

function resolveMaxBytes(value: number | undefined): number {
  const max = value ?? CARDMARKET_PUBLIC_FILE_MAX_BYTES;
  if (
    !Number.isSafeInteger(max) ||
    max <= 0 ||
    max > CARDMARKET_PUBLIC_FILE_HARD_MAX_BYTES
  ) {
    throw new CardmarketPublicFileError(
      "invalid-size-limit",
      `max_bytes must be a positive integer no greater than ${CARDMARKET_PUBLIC_FILE_HARD_MAX_BYTES}`,
    );
  }
  return max;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new CardmarketPublicFileError(
      "aborted",
      "Cardmarket public-file fetch was aborted",
    );
  }
}

function parseContentLength(value: string | null): number | null {
  if (value == null || !/^[0-9]+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizedContentType(value: string | null): string | null {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || null;
}

function assertContentType(response: Response, url: string): void {
  const raw = response.headers.get("content-type");
  const normalized = normalizedContentType(raw);
  if (!normalized || !ALLOWED_CONTENT_TYPES.has(normalized)) {
    throw new CardmarketPublicFileError(
      "invalid-content-type",
      `Cardmarket public file returned unsupported Content-Type ${raw ?? "(missing)"}`,
      { url },
    );
  }
}

function firstNonWhitespace(bytes: Uint8Array): number | undefined {
  let index = 0;
  // UTF-8 byte-order mark.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) index = 3;
  for (; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      return byte;
    }
  }
  return undefined;
}

function lastNonWhitespace(bytes: Uint8Array): number | undefined {
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    const byte = bytes[index];
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      return byte;
    }
  }
  return undefined;
}

function assertJsonEnvelope(bytes: Uint8Array, url: string): void {
  const first = firstNonWhitespace(bytes);
  const last = lastNonWhitespace(bytes);
  const objectEnvelope = first === 0x7b && last === 0x7d; // { ... }
  const arrayEnvelope = first === 0x5b && last === 0x5d; // [ ... ]
  if (!objectEnvelope && !arrayEnvelope) {
    throw new CardmarketPublicFileError(
      "invalid-json-envelope",
      "Cardmarket public file does not have a complete JSON object or array envelope",
      { url },
    );
  }
}

async function readChunkWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  throwIfAborted(signal);
  if (!signal) return reader.read();

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      void reader.cancel(signal.reason).catch(() => undefined);
      reject(
        new CardmarketPublicFileError(
          "aborted",
          "Cardmarket public-file fetch was aborted while reading its body",
        ),
      );
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  url: string,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const declaredLength = parseContentLength(response.headers.get("content-length"));
  if (declaredLength != null && declaredLength > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new CardmarketPublicFileError(
      "too-large",
      `Cardmarket public file declares ${declaredLength} bytes, above the ${maxBytes}-byte limit`,
      { url },
    );
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await readChunkWithAbort(reader, signal);
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new CardmarketPublicFileError(
        "too-large",
        `Cardmarket public file exceeded the ${maxBytes}-byte limit while streaming`,
        { url },
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Internal implementation bound by `cardmarket/index.ts` to Cardmarket's
 * canonical SourceMeta. The public caller uses `fetchCardmarketPublicFile`
 * exported from that index, so source identity has one owner.
 */
export async function fetchCardmarketPublicFileWithMeta(
  ctx: IngestContext,
  request: CardmarketPublicFileRequest,
  meta: SourceMeta,
): Promise<CardmarketPublicFileArtifact> {
  const maxBytes = resolveMaxBytes(request.max_bytes);
  const sourceUrl = assertCardmarketPublicFileUrl(request.url, request.kind);
  const fetcher = createFetcher(ctx, meta);

  ctx.on_event?.({
    ts: new Date().toISOString(),
    source: "cardmarket",
    kind: "start",
    detail: {
      mode: "public-file-private-archive",
      artifact_kind: request.kind,
      source_url: sourceUrl.toString(),
      max_bytes: maxBytes,
      publication: "withheld",
    },
  });

  let currentUrl = sourceUrl;
  let response: Response | undefined;

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      throwIfAborted(ctx.signal);
      response = await fetcher(currentUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
      });

      // A custom/injected fetch may report the final URL even in tests. Native
      // manual-redirect responses report the requested URL. Both are checked.
      const reportedUrl = response.url || currentUrl.toString();
      currentUrl = assertCardmarketPublicFileUrl(reportedUrl, request.kind);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new CardmarketPublicFileError(
            "redirect-not-allowed",
            "Cardmarket public-file redirect omitted its Location header",
            { url: currentUrl.toString(), status: response.status },
          );
        }
        if (redirects === MAX_REDIRECTS) {
          throw new CardmarketPublicFileError(
            "too-many-redirects",
            `Cardmarket public-file fetch exceeded ${MAX_REDIRECTS} redirects`,
            { url: currentUrl.toString(), status: response.status },
          );
        }
        const nextUrl = new URL(location, currentUrl);
        const allowedNextUrl = assertCardmarketPublicFileUrl(
          nextUrl.toString(),
          request.kind,
        );
        if (allowedNextUrl.pathname !== sourceUrl.pathname) {
          throw new CardmarketPublicFileError(
            "redirect-not-allowed",
            "Cardmarket public-file redirects may not change artifact identity",
            { url: allowedNextUrl.toString(), status: response.status },
          );
        }
        currentUrl = allowedNextUrl;
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      throw new CardmarketPublicFileError(
        "http-error",
        `Cardmarket public-file request failed with HTTP ${response?.status ?? "unknown"}`,
        { url: currentUrl.toString(), status: response?.status },
      );
    }

    assertContentType(response, currentUrl.toString());
    const bytes = await readBoundedBody(
      response,
      maxBytes,
      currentUrl.toString(),
      ctx.signal,
    );
    assertJsonEnvelope(bytes, currentUrl.toString());

    const retrievedAt = new Date().toISOString();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const artifact: CardmarketPublicFileArtifact = {
      kind: request.kind,
      source_url: sourceUrl.toString(),
      final_url: currentUrl.toString(),
      bytes,
      byte_length: bytes.byteLength,
      sha256,
      retrieved_at: retrievedAt,
      headers: {
        content_type: response.headers.get("content-type"),
        content_length: parseContentLength(response.headers.get("content-length")),
        content_encoding: response.headers.get("content-encoding"),
        etag: response.headers.get("etag"),
        last_modified: response.headers.get("last-modified"),
        cache_control: response.headers.get("cache-control"),
      },
      provenance: {
        // The raw-file transport does not inspect Cardmarket's JSON `createdAt`.
        // A downstream parser may replace as_of with that source-stated value.
        as_of: retrievedAt,
        retrieved_at: retrievedAt,
        source: "cardmarket",
        via_proxy: fetcher.via_proxy_label,
      },
    };

    ctx.on_event?.({
      ts: retrievedAt,
      source: "cardmarket",
      kind: "done",
      detail: {
        mode: "public-file-private-archive",
        artifact_kind: artifact.kind,
        final_url: artifact.final_url,
        byte_length: artifact.byte_length,
        sha256: artifact.sha256,
        publication: "withheld",
      },
    });

    return artifact;
  } catch (error) {
    const known =
      error instanceof CardmarketPublicFileError
        ? error
        : new CardmarketPublicFileError(
            ctx.signal?.aborted ? "aborted" : "http-error",
            error instanceof Error ? error.message : String(error),
            { url: currentUrl.toString() },
          );
    ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardmarket",
      kind: "error",
      detail: {
        mode: "public-file-private-archive",
        artifact_kind: request.kind,
        code: known.code,
        reason: known.message,
        url: known.url ?? currentUrl.toString(),
        status: known.status ?? null,
        publication: "withheld",
      },
    });
    throw known;
  }
}
