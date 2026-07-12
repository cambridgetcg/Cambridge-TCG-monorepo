import { describe, expect, it } from "vitest";
import {
  MAX_GAME_ACTION_DATA_BYTES,
  MAX_GAME_DECK_CARDS,
  validateGameAction,
  validateGameDeck,
} from "./request-input";

function card(index: number, isLeader = false) {
  return {
    sku: `op-card-${index}`,
    name: `Card ${index}`,
    cardNumber: `OP01-${String(index).padStart(3, "0")}`,
    imageUrl: null,
    rarity: isLeader ? "L" : "C",
    ...(isLeader ? { isLeader: true } : {}),
    ignored: "caller fields are not persisted",
  };
}

describe("game request input", () => {
  it("returns a bounded, allow-listed deck shape", () => {
    const result = validateGameDeck(
      Array.from({ length: 10 }, (_, i) => card(i, i === 0)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).not.toHaveProperty("ignored");
  });

  it("rejects oversized decks and duplicate leaders", () => {
    expect(
      validateGameDeck(
        Array.from({ length: MAX_GAME_DECK_CARDS + 1 }, (_, i) =>
          card(i, i === 0),
        ),
      ).ok,
    ).toBe(false);
    expect(
      validateGameDeck(Array.from({ length: 10 }, (_, i) => card(i, i < 2))).ok,
    ).toBe(false);
  });

  it("bounds action data and normalizes chat to its message", () => {
    expect(
      validateGameAction({
        type: "move",
        data: { value: "x".repeat(MAX_GAME_ACTION_DATA_BYTES) },
      }).ok,
    ).toBe(false);
    expect(
      validateGameAction({
        type: "chat",
        data: { message: " hello ", extra: "drop" },
      }),
    ).toEqual({
      ok: true,
      value: { type: "chat", data: { message: "hello" } },
    });
  });
});
