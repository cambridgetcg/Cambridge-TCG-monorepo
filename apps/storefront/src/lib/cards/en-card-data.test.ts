import { describe, expect, it } from "vitest";
import { enCardKey, enCardKeyFromParts, getEnCardData } from "./en-card-data";

describe("Bandai EN card-data boundary", () => {
  it("preserves the internal join-key helpers", () => {
    expect(enCardKeyFromParts("op", "op01", "001")).toBe("OP-OP01-001-EN");
    expect(enCardKey("OP-OP01-001-JP-V11DZ")).toBe("OP-OP01-001-EN");
    expect(enCardKey("SEALED-OP01-BOX-JP")).toBeNull();
  });

  it("publishes neither stored text nor an image URL", async () => {
    await expect(getEnCardData("OP-OP01-001-JP-V11DZ")).resolves.toEqual({
      effect_text: null,
      en_image: null,
    });
  });
});
