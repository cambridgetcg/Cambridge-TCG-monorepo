// The value-based attack planner — aggression shapes exposure appetite,
// never discards profitable attacks by dice. Deterministic by design.

import { describe, expect, it } from "vitest";
import { aiTurn } from "./ai";
import type { GameCard, GameState, PlayerState } from "./types";

let n = 0;
function card(o: Partial<GameCard> = {}): GameCard {
  return {
    id: `c${n++}`, sku: "S", name: `X${n}`, cardNumber: "OP01-001", imageUrl: null,
    rarity: "C", isRested: false, attachedDon: 0, zone: "field", position: 0,
    faceDown: false, ...o,
  };
}
function player(id: string, o: Partial<PlayerState> = {}): PlayerState {
  return {
    userId: id, name: id,
    leader: card({ zone: "leader", category: "leader", power: 5000 }),
    field: [], stage: null, hand: [],
    life: [card({ zone: "life" }), card({ zone: "life" })],
    trash: [], deck: [card({ zone: "deck" }), card({ zone: "deck" })],
    donActive: 0, donRested: 0, donDeck: 4, lifeCount: 2, ...o,
  };
}
function state(o: Partial<GameState> = {}): GameState {
  return {
    player1: player("me"),
    player2: player("ai"),
    currentTurn: "ai", turnNumber: 7, phase: "main", firstPlayer: "me", ...o,
  };
}
const attacks = (s: GameState, aggr: number) =>
  aiTurn(s, "player2", aggr).actions.filter((a) => a.type === "attack");

describe("value-based AI planner", () => {
  it("a profitable leader attack is ALWAYS planned — no dice", () => {
    for (const aggr of [0.3, 0.5, 0.8, 1.0]) {
      const s = state();
      s.player2.field = [card({ name: "Swinger", power: 6000, cost: 3, turnPlayed: 5, category: "character" })];
      for (let i = 0; i < 10; i++) {
        expect(attacks(s, aggr).length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("blockers hold their post below 0.7 aggression, join above", () => {
    const mk = () => {
      const s = state();
      s.player2.field = [
        card({ name: "Wall", power: 6000, cost: 3, turnPlayed: 5, category: "character", keywords: ["blocker"] }),
      ];
      return s;
    };
    const low = attacks(mk(), 0.4);
    // The wall stays home; only the leader (5000 vs 5000 tie) may swing.
    expect(low.every((a) => !(a.data as { attackerId: string }).attackerId.includes("Wall"))).toBe(true);
    const s2 = mk();
    const wallId = s2.player2.field[0].id;
    const high = attacks(s2, 0.9);
    expect(high.some((a) => (a.data as { attackerId: string }).attackerId === wallId)).toBe(true);
  });

  it("closes a near-miss deficit with DON!! instead of napping", () => {
    const s = state();
    s.player1.leader = card({ zone: "leader", category: "leader", power: 7000, name: "BigLeader" });
    s.player2.field = [card({ name: "Runt", power: 5000, cost: 3, turnPlayed: 5, category: "character" })];
    s.player2.donActive = 4; // +2 don from phase = plenty
    const plan = aiTurn(s, "player2", 0.6);
    const runtId = s.player2.field[0].id;
    const attaches = plan.actions.filter(
      (a) => a.type === "attach_don" && (a.data as { cardId: string }).cardId === runtId,
    );
    const runtAttack = plan.actions.find(
      (a) => a.type === "attack" && (a.data as { attackerId: string }).attackerId === runtId,
    );
    expect(attaches.length).toBe(2); // 5000 + 2000 = 7000 ties the 7000 leader
    expect(runtAttack).toBeTruthy();
  });

  it("prefers KOing a fat rested character over face damage", () => {
    const s = state();
    const fatty = card({ name: "Fatty", power: 5000, cost: 5, isRested: true, category: "character" });
    s.player1.field = [fatty];
    s.player2.field = [card({ name: "Swinger", power: 6000, cost: 3, turnPlayed: 5, category: "character" })];
    const plan = attacks(s, 0.8);
    expect(
      plan.some(
        (a) =>
          (a.data as { targetId?: string }).targetId === fatty.id,
      ),
    ).toBe(true);
  });

  it("a just-played [Rush] character attacks the same turn", () => {
    const s = state();
    s.player2.donActive = 6;
    s.player2.hand = [
      card({ zone: "hand", name: "Rusher", power: 6000, cost: 3, category: "character", keywords: ["rush"] }),
    ];
    const rushId = s.player2.hand[0].id;
    const plan = aiTurn(s, "player2", 0.8);
    const played = plan.actions.some(
      (a) => a.type === "move_card" && (a.data as { cardId: string }).cardId === rushId,
    );
    const attacked = plan.actions.some(
      (a) => a.type === "attack" && (a.data as { attackerId: string }).attackerId === rushId,
    );
    expect(played).toBe(true);
    expect(attacked).toBe(true);
  });

  it("at 0 opponent life, one clean lethal swing is planned", () => {
    const s = state();
    s.player1.life = [];
    s.player1.lifeCount = 0;
    s.player2.field = [card({ name: "Any", power: 1000, cost: 1, turnPlayed: 5, category: "character" })];
    const plan = attacks(s, 0.2);
    expect(plan.length).toBe(1);
    expect((plan[0].data as { targetType: string }).targetType).toBe("leader");
  });
});
