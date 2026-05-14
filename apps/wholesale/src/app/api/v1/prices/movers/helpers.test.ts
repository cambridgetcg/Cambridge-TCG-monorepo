import { describe, it, expect } from "vitest";
import { parseMoversParams, type MoversParams } from "./helpers";

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
