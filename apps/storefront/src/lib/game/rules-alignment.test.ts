// Wave-1 regression tests — each test carries the official Comprehensive
// Rules number it enforces (v1.2.0, 2026-01-16). If one of these fails,
// the engine has drifted from what Bandai says the game is.

import { describe, expect, it } from "vitest";
import { applyAction } from "./reducer";
import type { GameCard, GameState, PlayerState } from "./types";

let nextId = 0;
function card(overrides: Partial<GameCard> = {}): GameCard {
  return {
    id: `c${nextId++}`,
    sku: "SKU",
    name: "Test Card",
    cardNumber: "ST01-002",
    imageUrl: null,
    rarity: "C",
    isRested: false,
    attachedDon: 0,
    zone: "field",
    position: 0,
    faceDown: false,
    ...overrides,
  };
}

function playerState(userId: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    userId,
    name: userId,
    leader: card({ zone: "leader", category: "leader", power: 5000 }),
    field: [],
    stage: null,
    hand: [],
    life: [card({ zone: "life", faceDown: true })],
    trash: [],
    deck: [card({ zone: "deck" }), card({ zone: "deck" })],
    donActive: 2,
    donRested: 0,
    donDeck: 6,
    lifeCount: 1,
    ...overrides,
  };
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    player1: playerState("p1"),
    player2: playerState("p2"),
    currentTurn: "p1",
    turnNumber: 3,
    phase: "main",
    firstPlayer: "p1",
    ...overrides,
  };
}

describe("CR 6-2-3 — given DON!! return at Refresh", () => {
  it("begin_turn returns given DON!! to the cost area as spendable", () => {
    const s = gameState();
    s.player1.leader!.attachedDon = 2;
    const boosted = card({ zone: "field", attachedDon: 1 });
    s.player1.field = [boosted];
    s.player1.donActive = 0;
    s.player1.donRested = 1;

    const after = applyAction(s, "player1", "begin_turn", {});
    expect(after.player1.leader!.attachedDon).toBe(0);
    expect(after.player1.field[0].attachedDon).toBe(0);
    // 1 previously rested + 3 returned, all active after 6-2-4, +2 from DON phase
    expect(after.player1.donActive).toBe(1 + 3 + 2);
    expect(after.player1.donRested).toBe(0);
  });
});

describe("CR 6-5-5-4 — DON!! return when a card leaves its area", () => {
  it("a KO'd character's given DON!! go to the owner's cost area, rested", () => {
    const s = gameState();
    const target = card({ zone: "field", isRested: true, attachedDon: 2, power: 1000 });
    s.player2.field = [target];
    s.player2.donRested = 0;

    const after = applyAction(s, "player1", "attack", {
      attackerId: s.player1.leader!.id,
      targetType: "character",
      targetId: target.id,
      resolve: "hit",
    });
    expect(after.player2.field).toHaveLength(0);
    expect(after.player2.trash).toHaveLength(1);
    expect(after.player2.trash[0].attachedDon).toBe(0);
    expect(after.player2.donRested).toBe(2); // returned, not destroyed
  });

  it("a card manually moved off the field returns its DON!!", () => {
    const s = gameState();
    const c = card({ zone: "field", attachedDon: 3 });
    s.player1.field = [c];
    const after = applyAction(s, "player1", "move_card", {
      cardId: c.id,
      toZone: "hand",
    });
    expect(after.player1.donRested).toBe(3);
    expect(after.player1.hand[0].attachedDon).toBe(0);
  });
});

describe("CR 1-2-1-1-2 — defeat at 0 cards in deck", () => {
  it("drawing your last card loses the game immediately", () => {
    const s = gameState();
    s.player1.deck = [card({ zone: "deck" })]; // exactly one left
    const after = applyAction(s, "player1", "begin_turn", {});
    expect(after.phase).toBe("finished");
    expect(after.winner).toBe("p2");
  });

  it("a deck that can still draw does not lose", () => {
    const s = gameState();
    s.player1.deck = [card({ zone: "deck" }), card({ zone: "deck" })];
    const after = applyAction(s, "player1", "begin_turn", {});
    expect(after.phase).not.toBe("finished");
    expect(after.player1.deck).toHaveLength(1);
  });
});
