// Download card images from CardRush and upload to S3
// Skips images that already exist in the bucket (one-time operation)
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  HIRES IMAGE PROTECTION — DO NOT MODIFY WITHOUT READING THIS ⚠️
//
// High-res images live at: s3://jp-op-photos/hires/{SET}/{SKU}.jpg
// They were scraped directly from Cardrush product pages (100–200KB each).
// These are the SOURCE OF TRUTH for card images on wholesaletcgdirect.com.
//
// RULES:
//  1. uploadImagesToS3() ALWAYS calls objectExists() before writing — never
//     overwrites a key that already exists in S3.
//  2. The scrape-cardrush.ts DB upsert uses a CASE guard that preserves any
//     image_url containing '/hires/' — price scrapes never clobber hi-res URLs.
//  3. This s3Key() function MUST stay in sync with scrape-all-onepiece-hires.py
//     which uses: hires/{SET_CODE}/{SKU}.jpg
//  4. If you add a new image pipeline, write to a different prefix — never
//     overwrite hires/*.
//
// To restore hi-res URLs in DB from manifest:
//   python3 cambridge-tcg-site/web/tradein/scripts/scrape-all-onepiece-hires.py
// ─────────────────────────────────────────────────────────────────────────────

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { REQUEST_DELAY_MS } from "./config";
import type { WholesaleCard } from "./cardrush-mapper";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
} from "@cambridge-tcg/data-ingest";

const DEFAULT_BUCKET = "jp-op-photos";
const REGION = "us-east-1";
// Prefix for hi-res images — must match scrape-all-onepiece-hires.py
const HIRES_PREFIX = "hires";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Uses default credential chain: env vars → ~/.aws/credentials → SSO → IAM role
function getS3Client(): S3Client {
  return new S3Client({ region: REGION });
}

// S3 key: hires/{SET_CODE}/{SKU}.jpg  e.g. hires/OP01/OP-OP01-001-JP-V11L2.jpg
// MUST stay in sync with scrape-all-onepiece-hires.py
function s3Key(card: WholesaleCard): string {
  return `${HIRES_PREFIX}/${card.setCode}/${card.sku}.jpg`;
}

export function s3ImageUrl(card: WholesaleCard, bucket: string = DEFAULT_BUCKET): string {
  return `https://${bucket}.s3.${REGION}.amazonaws.com/${s3Key(card)}`;
}

/** Returns true if this URL points to the hi-res S3 store (never overwrite). */
export function isHiResUrl(url: string | null | undefined): boolean {
  return !!url && url.includes(`/${HIRES_PREFIX}/`);
}

async function objectExists(s3: S3Client, key: string, bucket: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "image/*",
      },
    });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

export async function uploadImagesToS3(
  cards: WholesaleCard[],
  bucket: string = DEFAULT_BUCKET
): Promise<{ uploaded: number; skipped: number; failed: number }> {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    throw new Error(CARDRUSH_BLOCK_REASON);
  }
  const s3 = getS3Client();
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const card of cards) {
    const key = s3Key(card);

    // Skip if no source image
    if (!card.imageUrl) {
      console.log(`    ${card.sku}: no source image, skipping`);
      skipped++;
      continue;
    }

    // ⚠️ HIRES GUARD: never overwrite an existing hi-res object in S3
    // Once uploaded, these images are permanent. Re-run scrape-all-onepiece-hires.py
    // if you need to refresh a specific image (it will skip already-uploaded keys).
    if (await objectExists(s3, key, bucket)) {
      skipped++;
      continue;
    }

    // Download from CardRush
    const imageData = await downloadImage(card.imageUrl);
    if (!imageData) {
      console.log(`    ${card.sku}: download failed`);
      failed++;
      continue;
    }

    // Upload to S3
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: imageData,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000",
          ACL: "public-read",
        })
      );
      uploaded++;
      console.log(`    ${card.sku}: uploaded (${(imageData.length / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.log(`    ${card.sku}: upload failed — ${err}`);
      failed++;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return { uploaded, skipped, failed };
}
