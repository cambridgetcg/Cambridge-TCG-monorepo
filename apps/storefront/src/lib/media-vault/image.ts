import { createHash } from "node:crypto";
import sharp from "sharp";

import {
  COLLECTOR_MEDIA_MAX_INPUT_BYTES,
  type CollectorMediaMimeType,
} from "./input";

export const COLLECTOR_MEDIA_MAX_PIXELS = 40_000_000;
export const COLLECTOR_MEDIA_MAX_EDGE = 4096;

const SHARP_FORMAT_TO_MIME: Record<string, CollectorMediaMimeType | undefined> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type CollectorImageErrorCode =
  | "decode-failed"
  | "mime-mismatch"
  | "animated-image"
  | "pixel-limit"
  | "normalized-too-large";

export class CollectorImageError extends Error {
  constructor(readonly code: CollectorImageErrorCode) {
    super(code);
    this.name = "CollectorImageError";
  }
}

export interface NormalizedCollectorImage {
  body: Buffer;
  sourceMimeType: CollectorMediaMimeType;
  sourceBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  storedBytes: number;
  width: number;
  height: number;
  sha256Hex: string;
  checksumSha256Base64: string;
}

/** Decode first, then create a metadata-free bounded WebP before S3 sees data. */
export async function normalizeCollectorImage(
  input: Buffer,
  declaredMimeType: CollectorMediaMimeType,
): Promise<NormalizedCollectorImage> {
  let pipeline: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    pipeline = sharp(input, {
      failOn: "error",
      limitInputPixels: COLLECTOR_MEDIA_MAX_PIXELS,
      sequentialRead: true,
      animated: false,
    });
    metadata = await pipeline.metadata();
  } catch {
    throw new CollectorImageError("decode-failed");
  }

  const decodedMimeType = metadata.format
    ? SHARP_FORMAT_TO_MIME[metadata.format]
    : undefined;
  if (!decodedMimeType || decodedMimeType !== declaredMimeType) {
    throw new CollectorImageError("mime-mismatch");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new CollectorImageError("animated-image");
  }
  if (!metadata.width || !metadata.height) {
    throw new CollectorImageError("decode-failed");
  }
  if (metadata.width * metadata.height > COLLECTOR_MEDIA_MAX_PIXELS) {
    throw new CollectorImageError("pixel-limit");
  }

  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    output = await pipeline
      .rotate()
      .resize({
        width: COLLECTOR_MEDIA_MAX_EDGE,
        height: COLLECTOR_MEDIA_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new CollectorImageError("decode-failed");
  }

  if (output.data.byteLength > COLLECTOR_MEDIA_MAX_INPUT_BYTES) {
    throw new CollectorImageError("normalized-too-large");
  }

  const digest = createHash("sha256").update(output.data).digest();
  return {
    body: output.data,
    sourceMimeType: declaredMimeType,
    sourceBytes: input.byteLength,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    storedBytes: output.data.byteLength,
    width: output.info.width,
    height: output.info.height,
    sha256Hex: digest.toString("hex"),
    checksumSha256Base64: digest.toString("base64"),
  };
}
