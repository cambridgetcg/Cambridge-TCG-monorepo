import { describe, it, expect } from "vitest";
import {
  parseMoversParams,
  buildMoversResponse,
  type MoversParams,
  type MoversRow,
} from "./helpers";

describe("parseMoversParams", () => {
  it("requires ?game=", () => {
    const result = parseMoversParams(new URLSearchParams(""));
    expect(result).toEqual({
      error: "Missing required ?game=",
      status: 400,
    });
  });

  it("returns defaults when only game is provided", () => {
    const result = parseMoversParams(new URLSearchParams("game=op"));
    expect(result).toEqual({
      game: "op",
      window: "7d",
      windowDays: 7,
      windowToleranceDays: 2,
      minPrice: 10,
      category: "singles",
      limit: 50,
    });
  });

  it("accepts numeric overrides", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&min_price=5&limit=25"),
    );
    expect(result).toMatchObject({
      game: "op",
      minPrice: 5,
      limit: 25,
    });
  });

  it("clamps limit to 200", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&limit=999"),
    ) as MoversParams;
    expect(result.limit).toBe(200);
  });

  it("rejects non-7d window", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&window=30d"),
    );
    expect(result).toMatchObject({
      error: "Unsupported window: 30d. v1 only supports 7d.",
      status: 400,
    });
  });

  it("rejects negative min_price", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&min_price=-1"),
    );
    expect(result).toMatchObject({ status: 400 });
  });

  it("rejects unknown category", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&category=foo"),
    );
    expect(result).toMatchObject({ status: 400 });
  });

  it("accepts sealed category", () => {
    const result = parseMoversParams(
      new URLSearchParams("game=op&category=sealed"),
    ) as MoversParams;
    expect(result.category).toBe("sealed");
  });
});

describe("buildMoversResponse", () => {
  const params: MoversParams = {
    game: "op",
    window: "7d",
    windowDays: 7,
    windowToleranceDays: 2,
    minPrice: 10,
    category: "singles",
    limit: 50,
  };

  const fixedNow = new Date("2026-05-14T12:00:00Z");

  const sampleRow: MoversRow = {
    sku: "OP09-051-P-EN",
    card_number: "OP09-051",
    name: "ルフィ",
    name_en: "Monkey D. Luffy",
    set_code: "OP09",
    set_name: "Emperors in the New World",
    rarity: "SR",
    image_url: "https://example.com/luffy.jpg",
    category: "singles",
    price_now: 18.2,
    price_then: 12.4,
    channel_price: 24.5,
    pct_change: 46.77,
    now_date: "2026-05-14",
    then_date: "2026-05-07",
  };

  it("wraps rows with metadata + computed_at", () => {
    const response = buildMoversResponse(
      [sampleRow],
      params,
      "cambridgetcg",
      fixedNow,
    );

    expect(response).toEqual({
      window: "7d",
      window_days: 7,
      window_tolerance_days: 2,
      min_price_floor: 10,
      source: "cardrush",
      source_license: "internal-only",
      channel: "cambridgetcg",
      game_code: "op",
      computed_at: "2026-05-14T12:00:00.000Z",
      count: 1,
      movers: [
        {
          sku: "OP09-051-P-EN",
          card_number: "OP09-051",
          name: "ルフィ",
          name_en: "Monkey D. Luffy",
          set_code: "OP09",
          set_name: "Emperors in the New World",
          rarity: "SR",
          image_url: "https://example.com/luffy.jpg",
          category: "singles",
          price_then: 12.4,
          price_now: 18.2,
          channel_price: 24.5,
          pct_change: 46.77,
          then_date: "2026-05-07",
          now_date: "2026-05-14",
        },
      ],
    });
  });

  it("returns empty movers when no rows", () => {
    const response = buildMoversResponse([], params, "cambridgetcg", fixedNow);
    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
    expect(response.source_license).toBe("internal-only");
  });

  it("preserves row order from input (caller sorted)", () => {
    const r2 = { ...sampleRow, sku: "B", pct_change: 30 };
    const r1 = { ...sampleRow, sku: "A", pct_change: 50 };
    const response = buildMoversResponse(
      [r1, r2],
      params,
      "cambridgetcg",
      fixedNow,
    );
    expect(response.movers.map((m) => m.sku)).toEqual(["A", "B"]);
  });
});
