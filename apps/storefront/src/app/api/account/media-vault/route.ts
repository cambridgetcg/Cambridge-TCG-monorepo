import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  collectorMediaVaultOperationAllowed,
  resolveCollectorMediaVaultConfig,
} from "@/lib/media-vault/config";
import {
  deleteCollectorMediaRow,
  listCollectorMedia,
  markCollectorMediaReady,
  reserveCollectorMedia,
  COLLECTOR_MEDIA_MAX_OBJECTS,
  COLLECTOR_MEDIA_MAX_TOTAL_BYTES,
} from "@/lib/media-vault/db";
import {
  addCollectorMediaRateHeaders,
  collectorMediaUnavailable,
  COLLECTOR_MEDIA_PRIVATE_HEADERS,
  COLLECTOR_MEDIA_RATE_WINDOWS,
} from "@/lib/media-vault/http";
import { CollectorImageError, normalizeCollectorImage } from "@/lib/media-vault/image";
import {
  collectorMediaMimeType,
  COLLECTOR_MEDIA_MAX_INPUT_BYTES,
  isSameOriginMutation,
  readBoundedCollectorMediaBody,
} from "@/lib/media-vault/input";
import { createCollectorMediaIdentity } from "@/lib/media-vault/keys";
import { createCollectorMediaVaultStorage } from "@/lib/media-vault/storage";
import { consumeActionRateLimit } from "@/lib/privacy/action-rate-limit";

export const runtime = "nodejs";

function safeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "UnknownError";
}

function privateJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: COLLECTOR_MEDIA_PRIVATE_HEADERS,
  });
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return privateJson({ error: "Sign in required." }, 401);
  }

  const resolved = resolveCollectorMediaVaultConfig();
  if (!collectorMediaVaultOperationAllowed(resolved, "list")) {
    return collectorMediaUnavailable();
  }

  try {
    const media = await listCollectorMedia(session.user.id);
    return privateJson({
      media,
      limits: {
        objects: COLLECTOR_MEDIA_MAX_OBJECTS,
        totalBytes: COLLECTOR_MEDIA_MAX_TOTAL_BYTES,
        uploadBytes: COLLECTOR_MEDIA_MAX_INPUT_BYTES,
      },
    });
  } catch (error) {
    console.error("[media-vault] list unavailable", {
      event: "collector_media_list_unavailable",
      error_name: safeErrorName(error),
    });
    return collectorMediaUnavailable();
  }
}

async function cleanupFailedUpload(args: {
  storage: ReturnType<typeof createCollectorMediaVaultStorage>;
  id: string;
  ownerUserId: string;
  objectKey: string;
}): Promise<void> {
  try {
    await args.storage.delete(args.objectKey);
  } catch {
    // Keep the pending row and its opaque key when object deletion is not
    // confirmed. The owner can retry through DELETE; no orphan is hidden.
    return;
  }
  try {
    await deleteCollectorMediaRow(args.id, args.ownerUserId);
  } catch {
    // The object is gone. A remaining pending reservation is visible to its
    // owner and can be deleted idempotently later.
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return privateJson({ error: "Sign in required." }, 401);
  }

  const resolved = resolveCollectorMediaVaultConfig();
  if (!collectorMediaVaultOperationAllowed(resolved, "upload")) {
    return collectorMediaUnavailable();
  }
  if (!isSameOriginMutation(request)) {
    return privateJson({ error: "Same-origin request required." }, 403);
  }

  let rate;
  try {
    rate = await consumeActionRateLimit({
      action: "collector-media-upload",
      subject: `account:${session.user.id}`,
      windows: COLLECTOR_MEDIA_RATE_WINDOWS,
    });
  } catch (error) {
    console.error("[media-vault] rate limit unavailable", {
      event: "collector_media_rate_limit_unavailable",
      error_name: safeErrorName(error),
    });
    return collectorMediaUnavailable();
  }
  if (!rate.ok) return collectorMediaUnavailable();
  if (!rate.allowed) {
    return addCollectorMediaRateHeaders(
      privateJson(
        { error: "Upload rate limit reached.", code: "media_upload_rate_limited" },
        429,
      ),
      rate,
    );
  }

  const mimeType = collectorMediaMimeType(request);
  if (!mimeType) {
    return addCollectorMediaRateHeaders(
      privateJson(
        {
          error: "Upload a JPEG, PNG, or WebP image.",
          code: "unsupported_media_type",
        },
        415,
      ),
      rate,
    );
  }

  const body = await readBoundedCollectorMediaBody(request);
  if (!body.ok) {
    const tooLarge = body.reason === "too-large";
    return addCollectorMediaRateHeaders(
      privateJson(
        {
          error: tooLarge
            ? "Image must be 3 MiB or smaller."
            : "A readable, non-empty image body is required.",
          code: tooLarge ? "media_too_large" : "invalid_media_body",
        },
        tooLarge ? 413 : 400,
      ),
      rate,
    );
  }

  let image;
  try {
    image = await normalizeCollectorImage(body.bytes, mimeType);
  } catch (error) {
    const tooLarge =
      error instanceof CollectorImageError && error.code === "normalized-too-large";
    return addCollectorMediaRateHeaders(
      privateJson(
        {
          error: tooLarge
            ? "The normalized image is too large."
            : "The image could not be safely decoded.",
          code: tooLarge ? "media_too_large" : "invalid_image",
        },
        tooLarge ? 413 : 400,
      ),
      rate,
    );
  }

  const identity = createCollectorMediaIdentity();
  let reserved: boolean;
  try {
    reserved = await reserveCollectorMedia({
      id: identity.id,
      ownerUserId: session.user.id,
      objectKey: identity.objectKey,
      sourceMimeType: image.sourceMimeType,
      sourceBytes: image.sourceBytes,
      sourceWidth: image.sourceWidth,
      sourceHeight: image.sourceHeight,
      storedBytes: image.storedBytes,
      width: image.width,
      height: image.height,
      sha256Hex: image.sha256Hex,
    });
  } catch (error) {
    console.error("[media-vault] reservation unavailable", {
      event: "collector_media_reservation_unavailable",
      error_name: safeErrorName(error),
    });
    return addCollectorMediaRateHeaders(collectorMediaUnavailable(), rate);
  }
  if (!reserved) {
    return addCollectorMediaRateHeaders(
      privateJson(
        { error: "Collector media quota reached.", code: "media_quota_reached" },
        409,
      ),
      rate,
    );
  }

  const storage = createCollectorMediaVaultStorage(resolved.config);
  try {
    await storage.put({
      objectKey: identity.objectKey,
      body: image.body,
      checksumSha256Base64: image.checksumSha256Base64,
    });
  } catch (error) {
    console.error("[media-vault] storage write unavailable", {
      event: "collector_media_storage_write_unavailable",
      error_name: safeErrorName(error),
    });
    await cleanupFailedUpload({
      storage,
      id: identity.id,
      ownerUserId: session.user.id,
      objectKey: identity.objectKey,
    });
    return addCollectorMediaRateHeaders(collectorMediaUnavailable(), rate);
  }

  let ready;
  try {
    ready = await markCollectorMediaReady(identity.id, session.user.id);
  } catch (error) {
    console.error("[media-vault] completion unavailable", {
      event: "collector_media_completion_unavailable",
      error_name: safeErrorName(error),
    });
    ready = null;
  }
  if (!ready) {
    await cleanupFailedUpload({
      storage,
      id: identity.id,
      ownerUserId: session.user.id,
      objectKey: identity.objectKey,
    });
    return addCollectorMediaRateHeaders(collectorMediaUnavailable(), rate);
  }

  return addCollectorMediaRateHeaders(privateJson({ media: ready }, 201), rate);
}
