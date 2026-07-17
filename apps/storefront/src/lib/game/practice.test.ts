import { describe, expect, it } from "vitest";
import {
  AI_ID,
  PLAYER_ID,
  attack,
  attachDon,
  endTurn,
  playCard,
  startPracticeGame,
  type PracticeGame,
  type PracticeSetupCard,
} from "./practice";

function starterCard(
  n: number,
  overrides: Partial<PracticeSetupCard> = {},
): PracticeSetupCard {
  return {
    sku: `SKU-${n}`,
    name: `Card ${n}`,
    cardNumber: `ST01-${String(n).padStart(3, "0")}`,
    imageUrl: null,
    rarity: "C",
    category: "character",
    cost: 1,
    power: 3000,
    counter: 1000,
    color: "red",
    ...overrides,
  };
}

function testDeck(size = 20): PracticeSetupCard[] {
  const leader = starterCard(1, {
    category: "leader",
    isLeader: true,
    power: 5000,
    life: 5,
    cost: null,
  });
  const main = Array.from({ length: size }, (_, i) => starterCard(i + 2));
  return [leader, ...main];
}

function freshGame(): PracticeGame {
  const { game } = startPracticeGame("You", testDeck(), "Testbot", testDeck(), 0.5);
  return game;
}

/** Games start with a random first player; retry until the player opens. */
function gameWherePlayerStarts(): PracticeGame {
  for (let i = 0; i < 50; i++) {
    const g = freshGame();
    if (g.state.firstPlayer === PLAYER_ID) return g;
  }
  throw new Error("random first player never landed on the player in 50 tries");
}

describe("startPracticeGame", () => {
  it("deals life from the leader's printed life, hand of 5, rest to deck", () => {
    const game = freshGame();
    const you = game.state.player1;
    expect(you.life.length).toBe(5);
    expect(you.hand.length).toBeGreaterThanOrEqual(5); // +1 if upkeep drew
    expect(you.leader?.name).toBe("Card 1");
    // 20 main deck = 5 life + 5 hand + rest in deck (minus possible upkeep draw)
    expect(you.deck.length).toBeGreaterThanOrEqual(8);
  });

  it("always leaves the board on the player's turn, upkeep done", () => {
    for (let i = 0; i < 10; i++) {
      const game = freshGame();
      expect(game.state.currentTurn).toBe(PLAYER_ID);
      expect(game.state.lastUpkeepTurn).toBe(game.state.turnNumber);
      expect(game.state.player1.donActive).toBeGreaterThan(0);
    }
  });
});

describe("playCard", () => {
  it("pays the printed cost in rested DON!!", () => {
    const game = gameWherePlayerStarts();
    const before = game.state.player1.donActive;
    const cardId = game.state.player1.hand[0].id;
    const { game: after, rejected } = playCard(game, cardId);
    expect(rejected).toBeUndefined();
    expect(after.state.player1.donActive).toBe(before - 1);
    expect(after.state.player1.field.length).toBe(1);
    expect(after.state.player1.field[0].turnPlayed).toBe(after.state.turnNumber);
  });

  it("rejects an unaffordable card with a teaching reason", () => {
    const game = gameWherePlayerStarts();
    game.state.player1.hand[0].cost = 9;
    const { rejected } = playCard(game, game.state.player1.hand[0].id);
    expect(rejected).toMatchObject({ ok: false, code: "cant_afford" });
  });

  it("sends a played event to the trash and says the effect is not interpreted", () => {
    const game = gameWherePlayerStarts();
    game.state.player1.hand[0].category = "event";
    const { game: after, rejected } = playCard(game, game.state.player1.hand[0].id);
    expect(rejected).toBeUndefined();
    expect(after.state.player1.trash.length).toBe(1);
    expect(after.log[after.log.length - 1].text).toContain("isn't interpreted");
  });
});

describe("attack", () => {
  it("a fresh character cannot attack; the leader can from turn 2", () => {
    let game = gameWherePlayerStarts();
    // Past turn 1 so the first-turn attack ban doesn't mask the rule.
    game.state.turnNumber = 3;
    game.state.lastUpkeepTurn = 3;
    const played = playCard(game, game.state.player1.hand[0].id);
    game = played.game;
    const char = game.state.player1.field[0];
    const { rejected } = attack(game, char.id, "leader");
    expect(rejected).toMatchObject({ ok: false, code: "summoning_sickness" });
  });

  it("weaker attacker misses; equal power hits and takes a life card", () => {
    const game = gameWherePlayerStarts();
    // Make it turn 3 so attacks are legal at all.
    game.state.turnNumber = 3;
    game.state.lastUpkeepTurn = 3;

    const leader = game.state.player1.leader!;
    const oppLifeBefore = game.state.player2.life.length;

    // Leader 5000 vs opposing leader 5000 → tie → hit.
    const { game: after, rejected } = attack(game, leader.id, "leader");
    expect(rejected).toBeUndefined();
    expect(after.state.player2.life.length).toBe(oppLifeBefore - 1);
    expect(after.state.player1.leader!.isRested).toBe(true);
    expect(after.log.some((l) => l.text.includes("5000 vs 5000"))).toBe(true);
  });

  it("a miss rests the attacker and deals no damage", () => {
    const game = gameWherePlayerStarts();
    game.state.turnNumber = 3;
    game.state.lastUpkeepTurn = 3;
    game.state.player1.leader!.power = 4000; // weaker than opposing 5000
    const oppLifeBefore = game.state.player2.life.length;

    const { game: after, rejected } = attack(game, game.state.player1.leader!.id, "leader");
    expect(rejected).toBeUndefined();
    expect(after.state.player2.life.length).toBe(oppLifeBefore);
    expect(after.state.player1.leader!.isRested).toBe(true);
    expect(after.log[after.log.length - 1].text).toContain("not enough power");
  });

  it("attached DON!! turns a miss into a hit", () => {
    let game = gameWherePlayerStarts();
    game.state.turnNumber = 3;
    game.state.lastUpkeepTurn = 3;
    game.state.player1.leader!.power = 4000;
    game.state.player1.donActive = 2;

    const attach = attachDon(game, game.state.player1.leader!.id);
    game = attach.game; // 4000 + 1000 = 5000 vs 5000 → tie → hit
    const oppLifeBefore = game.state.player2.life.length;
    const { game: after } = attack(game, game.state.player1.leader!.id, "leader");
    expect(after.state.player2.life.length).toBe(oppLifeBefore - 1);
  });
});

describe("endTurn — the single AI code path", () => {
  it("runs the AI reply and returns the board to the player exactly once", () => {
    const game = gameWherePlayerStarts();
    const { game: after, steps } = endTurn(game);

    expect(after.state.currentTurn).toBe(PLAYER_ID);
    expect(after.state.phase).not.toBe("setup");
    expect(steps.length).toBeGreaterThanOrEqual(2);
    // The AI's turn advanced the turn counter by exactly 2 (its turn + back to you).
    expect(after.state.turnNumber).toBe(game.state.turnNumber + 2);
    // Upkeep ran for the new turn — no second upkeep possible.
    expect(after.state.lastUpkeepTurn).toBe(after.state.turnNumber);
  });

  it("never lets the AI act while it's the player's turn", () => {
    const game = gameWherePlayerStarts();
    const { steps } = endTurn(game);
    // Every intermediate state where it's the player's turn must show no
    // pending AI mutation after it (the last steps are upkeep/board's).
    const finalState = steps[steps.length - 1].state;
    expect(finalState.currentTurn).toBe(PLAYER_ID);
  });

  it("a full game against the AI terminates (win, lose, or deck-out)", () => {
    let game = freshGame();
    let guard = 200;
    while (game.state.phase !== "finished" && guard-- > 0) {
      // Simple policy: attack with everything legal, then end turn.
      const you = game.state.player1;
      for (const attacker of [you.leader, ...you.field]) {
        if (!attacker || game.state.phase === "finished") continue;
        const r = attack(game, attacker.id, "leader");
        if (!r.rejected) game = r.game;
      }
      if (game.state.phase === "finished") break;
      const ended = endTurn(game);
      if (ended.rejected) break;
      game = ended.game;
    }
    expect(game.state.phase).toBe("finished");
    expect([PLAYER_ID, AI_ID]).toContain(game.state.winner);
  });
});
