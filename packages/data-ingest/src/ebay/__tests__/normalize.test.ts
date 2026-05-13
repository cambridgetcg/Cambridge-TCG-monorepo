import { describe, expect, it } from "vitest";
import { normalizeEbay, DEFAULT_CONFIDENCE_THRESHOLD } from "../normalize.js";
import type { EbayBrowseRaw, EbayInsightsRaw, EbayItemSummary } from "../types.js";

function browseRow(
  title: string,
  opts: {
    expected_sku: string;
    listing_id?: string;
    price?: string;
    currency?: string;
    buyingOptions?: string[];
    condition?: string;
  },
): EbayBrowseRaw {
  const item: EbayItemSummary = {
    itemId: "v1|" + (opts.listing_id ?? "1111"),
    legacyItemId: opts.listing_id ?? "1111",
    title,
    itemWebUrl: "https://www.ebay.co.uk/itm/" + (opts.listing_id ?? "1111"),
    price: { value: opts.price ?? "12.50", currency: opts.currency ?? "GBP" },
    buyingOptions: opts.buyingOptions ?? ["FIXED_PRICE"],
    condition: opts.condition,
  };
  return {
    api_surface: "browse",
    marketplace_id: "EBAY_GB",
    item,
    query: opts.expected_sku,
    expected_sku: opts.expected_sku,
    fetched_at: "2026-05-13T09:00:00.000Z",
  };
}

describe("normalize — Browse rows", () => {
  it("accepts a clean OP01-001 row matching expected SKU", () => {
    const row = browseRow("One Piece TCG OP01-001 SR Japanese", {
      expected_sku: "op-op01-001-ja",
      price: "8.50",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.sku).toBe("op-op01-001-ja");
      expect(r.record.currency).toBe("GBP");
      expect(r.record.amount).toBe("8.50");
      expect(r.record.listing_id).toBe("1111");
      expect(r.record.marketplace_id).toBe("EBAY_GB");
      expect(r.record.api_surface).toBe("browse");
      expect(r.record.first_party).toBe(false);
      expect(r.record.sale_type).toBe("ask");
      expect(r.record.grade_company).toBeNull();
      expect(r.record.raw_title).toBe("One Piece TCG OP01-001 SR Japanese");
      expect(r.record.parsed_confidence).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("quarantines sku-drift", () => {
    const row = browseRow("One Piece TCG OP02-005 Different Card Japanese", {
      expected_sku: "op-op01-001-ja",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("sku-drift");
    }
  });

  it("quarantines condition-exclusion (damaged)", () => {
    const row = browseRow("One Piece TCG OP01-001 SR Japanese damaged creased", {
      expected_sku: "op-op01-001-ja",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("condition exclusion");
    }
  });

  it("quarantines sealed booster box", () => {
    const row = browseRow("Pokemon TCG Scarlet & Violet Booster Box English Sealed", {
      expected_sku: "pkm-svobf-001-en",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("sealed");
    }
  });

  it("quarantines low-confidence parse", () => {
    const row = browseRow("Random English card", {
      expected_sku: "op-op01-001-ja",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/low-confidence|sku-drift/);
    }
  });

  it("quarantines unsupported currency", () => {
    const row = browseRow("One Piece TCG OP01-001 SR Japanese", {
      expected_sku: "op-op01-001-ja",
      currency: "ZZZ",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("unsupported currency");
    }
  });

  it("classifies graded card with condition='graded'", () => {
    const row = browseRow("One Piece TCG OP01-001 Roronoa Zoro PSA 10 Japanese", {
      expected_sku: "op-op01-001-ja",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.condition).toBe("graded");
      expect(r.record.grade_company).toBe("PSA");
      expect(r.record.grade_value).toBe("10");
    }
  });

  it("maps eBay's NEW condition to near-mint when no title keyword present", () => {
    const row = browseRow("One Piece TCG OP01-001 SR Japanese", {
      expected_sku: "op-op01-001-ja",
      condition: "NEW",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.condition).toBe("near-mint");
    }
  });

  it("uses title condition keyword over eBay's condition field", () => {
    const row = browseRow("One Piece TCG OP01-001 SR Japanese Lightly Played", {
      expected_sku: "op-op01-001-ja",
      condition: "NEW",
    });
    const r = normalizeEbay(row);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.condition).toBe("lightly-played");
    }
  });

  it("detects auction-current when AUCTION + bids>0", () => {
    const row = browseRow("One Piece TCG OP01-001 SR Japanese", {
      expected_sku: "op-op01-001-ja",
      buyingOptions: ["AUCTION"],
    });
    const item = row.item as EbayItemSummary;
    item.bidCount = 3;
    const r = normalizeEbay(row);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.sale_type).toBe("auction-current");
    }
  });

  it("custom threshold can raise the bar", () => {
    const row = browseRow("One Piece TCG OP01-001 SR Japanese", {
      expected_sku: "op-op01-001-ja",
    });
    const r = normalizeEbay(row, 0.99); // unrealistically high
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("below threshold");
    }
  });
});

describe("normalize — Marketplace Insights rows (deferred but typed)", () => {
  it("accepts a clean MI row with first_party=true", () => {
    const row: EbayInsightsRaw = {
      api_surface: "marketplace-insights",
      marketplace_id: "EBAY_GB",
      item: {
        itemId: "v1|2222",
        legacyItemId: "2222",
        title: "One Piece TCG OP01-001 SR Japanese",
        lastSoldPrice: { value: "9.20", currency: "GBP" },
        lastSoldDate: "2026-05-10T14:23:00.000Z",
        buyingOptions: ["FIXED_PRICE"],
      },
      query: "OP01-001",
      expected_sku: "op-op01-001-ja",
      fetched_at: "2026-05-13T09:00:00.000Z",
    };
    const r = normalizeEbay(row);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.first_party).toBe(true);
      expect(r.record.api_surface).toBe("marketplace-insights");
      expect(r.record.sale_type).toBe("retail");
      expect(r.record.observed_at).toBe("2026-05-10T14:23:00.000Z");
    }
  });

  it("quarantines MI row with missing lastSoldPrice", () => {
    const row: EbayInsightsRaw = {
      api_surface: "marketplace-insights",
      marketplace_id: "EBAY_GB",
      item: {
        itemId: "v1|2222",
        legacyItemId: "2222",
        title: "One Piece TCG OP01-001 SR Japanese",
        // missing lastSoldPrice
      },
      query: "OP01-001",
      expected_sku: "op-op01-001-ja",
      fetched_at: "2026-05-13T09:00:00.000Z",
    };
    const r = normalizeEbay(row);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("missing");
    }
  });
});

describe("normalize — default threshold constant", () => {
  it("DEFAULT_CONFIDENCE_THRESHOLD is sane", () => {
    expect(DEFAULT_CONFIDENCE_THRESHOLD).toBeGreaterThan(0.5);
    expect(DEFAULT_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });
});
