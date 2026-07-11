import { describe, expect, it } from "vitest";
import {
  INTERNAL_ONLY_CACHE_CONTROL,
  PUBLISHABLE_PRICE_SOURCES,
  WHOLESALE_STORAGE_PUBLICATION_POLICY,
  priceSourcePublicationPolicy,
} from "./source-publication-policy";

describe("price source publication policy", () => {
  it("allows only the reviewed CardRush boundary", () => {
    expect(PUBLISHABLE_PRICE_SOURCES).toEqual(["cardrush"]);
    expect(priceSourcePublicationPolicy("cardrush")).toMatchObject({
      publish: true,
      license: "internal-only",
      redistribute: false,
    });
  });

  it("keeps authenticated internal data out of shared caches", () => {
    expect(INTERNAL_ONLY_CACHE_CONTROL).toBe("private, no-store");
    expect(WHOLESALE_STORAGE_PUBLICATION_POLICY).toMatchObject({
      publish: true,
      license: "internal-only",
      redistribute: false,
    });
  });

  it("does not let a mutable database flag overlicense CardRush", () => {
    const storedRow = { source: "cardrush", sourceRedistribute: true };
    const policy = priceSourcePublicationPolicy(storedRow.source);

    expect(storedRow.sourceRedistribute).toBe(true);
    expect(policy.license).toBe("internal-only");
    expect(policy.redistribute).toBe(false);
  });

  it.each(["tcgplayer", "cardmarket", "unknown-source"])(
    "fails closed for %s",
    (source) => {
      expect(priceSourcePublicationPolicy(source)).toMatchObject({
        publish: false,
        license: "proprietary",
        redistribute: false,
      });
    },
  );
});
