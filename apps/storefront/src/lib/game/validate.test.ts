import { describe, expect, it } from "vitest";
import type { GameCard, GameState, PlayerState } from "./types";
import { attackPower, resolveAttack, validateAction } from "./validate";

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
    zone: "hand",
    position: 0,
    faceDown: false,
    ...overrides,
  };
}

function playerState(userId: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    userId,
    name: userId,
    leader: card({ zone: "leader", category: "leader", power: 5000, name: `${userId} Leader` }),
    field: [],
    stage: null,
    hand: [],
    life: [card({ zone: "life", faceDown: true })],
    trash: [],
    deck: [card({ zone: "deck", faceDown: true })],
    donActive: 2,
    donRested: 0,
    donDeck: 8,
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

describe("validateAction — turn ownership", () => {
  it("rejects any action out of turn", () => {
    const s = gameState({ currentTurn: "p2" });
    const r = validateAction(s, "player1", "end_turn", {});
    expect(r).toMatchObject({ ok: false, code: "not_your_turn" });
  });

  it("rejects everything once the game is finished", () => {
    const s = gameState({ phase: "finished", winner: "p2" });
    expect(validateAction(s, "player1", "end_turn", {})).toMatchObject({
      ok: false,
      code: "game_over",
    });
  });

  it("rejects unknown action types", () => {
    const s = gameState();
    expect(validateAction(s, "player1", "take_damage", {})).toMatchObject({
      ok: false,
      code: "unknown_action",
    });
  });
});

describe("validateAction — playing cards", () => {
  it("allows an affordable character with field space", () => {
    const c = card({ category: "character", cost: 2 });
    const s = gameState();
    s.player1.hand = [c];
    expect(validateAction(s, "player1", "play_card", { cardId: c.id })).toEqual({ ok: true });
  });

  it("rejects a card the player can't afford", () => {
    const c = card({ category: "character", cost: 5, name: "Big Guy" });
    const s = gameState();
    s.player1.hand = [c];
    const r = validateAction(s, "player1", "play_card", { cardId: c.id });
    expect(r).toMatchObject({ ok: false, code: "cant_afford" });
    if (!r.ok) expect(r.reason).toContain("Big Guy costs 5");
  });

  it("rejects a 6th character", () => {
    const c = card({ category: "character", cost: 1 });
    const s = gameState();
    s.player1.hand = [c];
    s.player1.field = Array.from({ length: 5 }, () =>
      card({ zone: "field", category: "character" }),
    );
    expect(validateAction(s, "player1", "play_card", { cardId: c.id })).toMatchObject({
      ok: false,
      code: "field_full",
    });
  });

  it("rejects a second stage", () => {
    const c = card({ category: "stage", cost: 1 });
    const s = gameState();
    s.player1.hand = [c];
    s.player1.stage = card({ zone: "stage", category: "stage" });
    expect(validateAction(s, "player1", "play_card", { cardId: c.id })).toMatchObject({
      ok: false,
      code: "stage_occupied",
    });
  });

  it("allows a card with unknown stats (degrades open, not closed)", () => {
    const c = card(); // no category, no cost
    const s = gameState();
    s.player1.hand = [c];
    expect(validateAction(s, "player1", "play_card", { cardId: c.id })).toEqual({ ok: true });
  });
});

describe("validateAction — attacking", () => {
  it("blocks the first player attacking on turn 1", () => {
    const s = gameState({ turnNumber: 1, firstPlayer: "p1" });
    const r = validateAction(s, "player1", "attack", {
      attackerId: s.player1.leader!.id,
      targetType: "leader",
    });
    expect(r).toMatchObject({ ok: false, code: "first_turn" });
  });

  it("lets the second player attack on their first turn", () => {
    const s = gameState({ turnNumber: 2, firstPlayer: "p1", currentTurn: "p2" });
    const r = validateAction(s, "player2", "attack", {
      attackerId: s.player2.leader!.id,
      targetType: "leader",
    });
    expect(r).toEqual({ ok: true });
  });

  it("blocks a character attacking the turn it was played", () => {
    const c = card({ zone: "field", category: "character", turnPlayed: 3, power: 5000 });
    const s = gameState({ turnNumber: 3 });
    s.player1.field = [c];
    expect(
      validateAction(s, "player1", "attack", { attackerId: c.id, targetType: "leader" }),
    ).toMatchObject({ ok: false, code: "summoning_sickness" });
  });

  it("lets that character attack next turn", () => {
    const c = card({ zone: "field", category: "character", turnPlayed: 3, power: 5000 });
    const s = gameState({ turnNumber: 5 });
    s.player1.field = [c];
    expect(
      validateAction(s, "player1", "attack", { attackerId: c.id, targetType: "leader" }),
    ).toEqual({ ok: true });
  });

  it("blocks a rested attacker", () => {
    const s = gameState();
    s.player1.leader!.isRested = true;
    expect(
      validateAction(s, "player1", "attack", {
        attackerId: s.player1.leader!.id,
        targetType: "leader",
      }),
    ).toMatchObject({ ok: false, code: "attacker_rested" });
  });

  it("only allows attacking RESTED characters", () => {
    const target = card({ zone: "field", category: "character", isRested: false });
    const s = gameState();
    s.player2.field = [target];
    const r = validateAction(s, "player1", "attack", {
      attackerId: s.player1.leader!.id,
      targetType: "character",
      targetId: target.id,
    });
    expect(r).toMatchObject({ ok: false, code: "target_active" });

    target.isRested = true;
    expect(
      validateAction(s, "player1", "attack", {
        attackerId: s.player1.leader!.id,
        targetType: "character",
        targetId: target.id,
      }),
    ).toEqual({ ok: true });
  });
});

describe("attack math", () => {
  it("adds 1000 per attached DON!!", () => {
    const c = card({ power: 5000, attachedDon: 2 });
    expect(attackPower(c)).toBe(7000);
  });

  it("resolves ties in the attacker's favor", () => {
    const atk = card({ power: 5000 });
    const def = card({ power: 5000 });
    expect(resolveAttack(atk, def)).toBe("hit");
  });

  it("resolves a weaker attack as a miss", () => {
    const atk = card({ power: 4000 });
    const def = card({ power: 5000 });
    expect(resolveAttack(atk, def)).toBe("miss");
  });

  it("reports unknown when printed power is missing", () => {
    const atk = card({ power: null });
    const def = card({ power: 5000 });
    expect(resolveAttack(atk, def)).toBe("unknown");
  });
});
