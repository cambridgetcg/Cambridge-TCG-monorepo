import { describe, expect, it } from "vitest";
import {
  SKU_GAMES,
  gameBrand,
  gameFromSku,
  isSkuGameSlug,
} from "../sku-game";

describe("gameFromSku — one truth for SKU → game", () => {
  it("maps legacy prefix-typed production SKUs", () => {
    // Shapes verified against the live wholesale catalog.
    expect(gameFromSku("OP-OP01-001-JP")).toBe("one-piece");
    expect(gameFromSku("EB-EB01-001-JP")).toBe("one-piece");
    expect(gameFromSku("ST-ST01-001-JP")).toBe("one-piece");
    expect(gameFromSku("P-001-JP")).toBe("one-piece");
    expect(gameFromSku("PRB-PRB01-001-JP")).toBe("one-piece");
    expect(gameFromSku("DON-001-JP")).toBe("one-piece");
    expect(gameFromSku("PK-SV2A-011-JP-V4K5")).toBe("pokemon");
    expect(gameFromSku("FB-FB01-001-JP")).toBe("dragon-ball");
    expect(gameFromSku("SB-SB01-001-JP")).toBe("dragon-ball");
  });

  it("maps canonical lowercase SKUs by game code", () => {
    // Canonical form per @cambridge-tcg/sku: <game>-<set>-<number>-<lang>.
    expect(gameFromSku("op-op01-001-jp")).toBe("one-piece");
    expect(gameFromSku("pkm-sv2a-011-jp")).toBe("pokemon");
    expect(gameFromSku("dbf-fb01-001-jp")).toBe("dragon-ball");
  });

  it("returns null for underivable SKUs instead of guessing", () => {
    // SEALED- exists under multiple games; unknown prefixes stay unknown.
    expect(gameFromSku("SEALED-OP01-BOX")).toBeNull();
    expect(gameFromSku("XYZ-001")).toBeNull();
    expect(gameFromSku("")).toBeNull();
  });

  it("keeps slugs aligned with the wholesale catalog", () => {
    // Verified against prod games.slug on 2026-07-05.
    expect(SKU_GAMES.map((g) => g.slug)).toEqual([
      "one-piece",
      "pokemon",
      "dragon-ball",
    ]);
    expect(isSkuGameSlug("pokemon")).toBe(true);
    expect(isSkuGameSlug("yugioh")).toBe(false);
  });

  it("carries an official brand per game for JSON-LD", () => {
    expect(gameBrand("one-piece")).toBe("One Piece Card Game");
    expect(gameBrand("pokemon")).toBe("Pokémon Trading Card Game");
    expect(gameBrand("dragon-ball")).toBe(
      "Dragon Ball Super Card Game Fusion World",
    );
  });
});
