import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { CollectorImageError, normalizeCollectorImage } from "./image";

describe("collector image normalization", () => {
  it("auto-orients, bounds, re-encodes, hashes, and strips metadata", async () => {
    const source = await sharp({
      create: {
        width: 5000,
        height: 10,
        channels: 3,
        background: { r: 80, g: 120, b: 160 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await normalizeCollectorImage(source, "image/jpeg");
    const outputMetadata = await sharp(result.body).metadata();

    expect(result.sourceWidth).toBe(5000);
    expect(result.sourceHeight).toBe(10);
    expect(result.width).toBe(8);
    expect(result.height).toBe(4096);
    expect(result.storedBytes).toBe(result.body.byteLength);
    expect(result.sha256Hex).toBe(createHash("sha256").update(result.body).digest("hex"));
    expect(outputMetadata.format).toBe("webp");
    expect(outputMetadata.orientation).toBeUndefined();
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputMetadata.icc).toBeUndefined();
  });

  it("rejects a content-type that disagrees with decoded bytes", async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 1, g: 2, b: 3, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    await expect(normalizeCollectorImage(png, "image/jpeg")).rejects.toMatchObject({
      name: "CollectorImageError",
      code: "mime-mismatch",
    });
  });

  it("turns decoder details into a stable private error", async () => {
    await expect(
      normalizeCollectorImage(Buffer.from("not an image"), "image/webp"),
    ).rejects.toEqual(new CollectorImageError("decode-failed"));
  });
});
