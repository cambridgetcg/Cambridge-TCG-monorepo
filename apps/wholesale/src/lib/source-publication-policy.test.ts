import { describe, expect, it } from "vitest";
import {
  INTERNAL_ONLY_CACHE_CONTROL,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  PUBLISHABLE_PRICE_SOURCES,
  WHOLESALE_STORAGE_PUBLICATION_POLICY,
  priceSourcePublicationPolicy,
} from "./source-publication-policy";

describe("price source publication policy", () => {
  it("keeps every price source closed until an exact publication rule is reviewed", () => {
    expect(LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED).toBe(false);
    expect(PUBLISHABLE_PRICE_SOURCES).toEqual([]);
    expect(priceSourcePublicationPolicy("cardrush")).toMatchObject({
      publish: false,
      license: "internal-only",
      redistribute: false,
    });
  });

  it("keeps authentication from becoming publication permission", () => {
    expect(INTERNAL_ONLY_CACHE_CONTROL).toBe("private, no-store");
    expect(WHOLESALE_STORAGE_PUBLICATION_POLICY).toMatchObject({
      publish: false,
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
