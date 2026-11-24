import { describe, expect, it } from "vitest";
import { shareableImageUrl } from "./share-card";

describe("shareableImageUrl", () => {
  it("offers a lot photo on the site's own auction bucket", () => {
    const lot = "https://cambridgetcg-auction-images.s3.us-east-1.amazonaws.com/lots/1/front.jpg";
    expect(shareableImageUrl(lot)).toBe(lot);
  });

  it("offers nothing else: no official image, catalogue photo, other host, or plain http", () => {
    for (const url of [
      "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-EN.png",
      "https://ctcg-card-images.s3.amazonaws.com/official/OP-OP01-001-EN.png",
      "https://jp-op-photos.s3.us-east-1.amazonaws.com/hires/a.jpg",
      "https://example.test/a.jpg",
      "http://cambridgetcg-auction-images.s3.us-east-1.amazonaws.com/lots/1/front.jpg",
      "/lots/1/front.jpg", "not a url", "", null, undefined,
    ]) expect(shareableImageUrl(url)).toBeNull();
  });
});
