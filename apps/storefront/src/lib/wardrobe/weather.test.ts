/**
 * The weather helper contract.
 * Spec: docs/superpowers/specs/2026-07-07-the-game-weather-design.md §3.
 */
import { describe, expect, it } from "vitest";
import { SKU_GAMES } from "@/lib/games/sku-game";
import { WEATHER_GAMES, weatherClass } from "./weather";

describe("the game weather (spec 2026-07-07 §3)", () => {
  it("dresses every known game", () => {
    expect(weatherClass("one-piece")).toBe(
      "wardrobe-weather wardrobe-weather--one-piece",
    );
    expect(weatherClass("pokemon")).toBe(
      "wardrobe-weather wardrobe-weather--pokemon",
    );
    expect(weatherClass("dragon-ball")).toBe(
      "wardrobe-weather wardrobe-weather--dragon-ball",
    );
  });

  it("leaves a room without game context bare", () => {
    expect(weatherClass("yu-gi-oh")).toBe("");
    expect(weatherClass("")).toBe("");
    expect(weatherClass(null)).toBe("");
    expect(weatherClass(undefined)).toBe("");
  });

  it("covers every game the app can recognise", () => {
    for (const g of SKU_GAMES) {
      expect(WEATHER_GAMES, `${g.slug} has no weather`).toContain(g.slug);
    }
  });
});
