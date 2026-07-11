import { describe, expect, it } from "vitest";
import { CONFIRMED_GAME_SLUGS, GAMES, gameBySlug } from "@cambridge-tcg/sku";
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
    // Verified against the live production coverage route on 2026-07-11.
    expect(SKU_GAMES.map((g) => g.slug)).toEqual([
      "one-piece",
      "pokemon",
      "dragon-ball",
      "vanguard",
      "digimon",
      "battle-spirits",
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

describe("the Atlas derivation contract (spec 2026-07-07 the-atlas §3)", () => {
  it("pins the literal SkuGameSlug union to the Atlas's confirmed slugs", () => {
    // The pin is a LITERAL list typed by the union — when a fourth game
    // flips confirmed in the Atlas, this fails until both the union and
    // this list grow, which is the ceremony. (First draft compared two
    // expressions of the same derivation — a tautology; review batch
    // 2026-07-07.)
    const pinned: readonly import("../sku-game").SkuGameSlug[] = [
      "one-piece",
      "pokemon",
      "dragon-ball",
      "vanguard",
      "digimon",
      "battle-spirits",
    ];
    const atlasSlugs = CONFIRMED_GAME_SLUGS.filter((s) => s !== GAMES.tst.slug);
    expect([...atlasSlugs].sort()).toEqual([...pinned].sort());
    expect(SKU_GAMES.map((g) => g.slug).sort()).toEqual([...pinned].sort());
  });

  it("pins the short display labels — tabs never inherit a product name", () => {
    expect(Object.fromEntries(SKU_GAMES.map((g) => [g.slug, g.label]))).toEqual({
      "one-piece": "One Piece",
      pokemon: "Pokémon",
      "dragon-ball": "Dragon Ball",
      vanguard: "Vanguard",
      digimon: "Digimon",
      "battle-spirits": "Battle Spirits",
    });
  });

  it("keeps the internal tst code underivable", () => {
    expect(gameFromSku("tst-any-001-en")).toBeNull();
  });

  it("resolves canonical SKUs of newly registered games Atlas-wide", () => {
    expect(gameFromSku("gcg-st01-001-en")).toBe("gundam");
    expect(gameFromSku("una-ua02bt-jjk1001-ja")).toBe("union-arena");
    expect(gameBrand("gundam")).toBe("GUNDAM CARD GAME");
  });

  it("brands echo unknown slugs honestly instead of borrowing", () => {
    expect(gameBrand("not-a-game")).toBe("not-a-game");
    expect(gameBySlug("gundam")?.code).toBe("gcg");
  });
});
