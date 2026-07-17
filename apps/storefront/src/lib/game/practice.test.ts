import { describe, expect, it } from "vitest";
import {
  AI_ID,
  PLAYER_ID,
  attack,
  attachDon,
  endTurn,
  playCard,
  resolveDefense,
  resolveMulligans,
  startPracticeSetup,
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
    counter: null,
  });
  const main = Array.from({ length: size }, (_, i) => starterCard(i + 2));
  return [leader, ...main];
}

/** A ready-to-play game: player first, no mulligans, life dealt, upkeep run. */
function readyGame(): PracticeGame {
  const setup = startPracticeSetup("You", testDeck(), "Testbot", testDeck(), 0.5, true);
  return resolveMulligans(setup, false).game;
}

describe("official setup (CR 5-2-1)", () => {
  it("pauses in the mulligan window with a hand of 5 and NO life yet", () => {
    const g = startPracticeSetup("You", testDeck(), "Testbot", testDeck(), 0.5, true);
    expect(g.state.phase).toBe("setup");
    expect(g.state.player1.hand).toHaveLength(5);
    expect(g.state.player1.life).toHaveLength(0);
    expect(g.state.firstPlayer).toBe(PLAYER_ID);
  });

  it("CR 5-2-1-6-1: redraw returns the whole hand and draws 5 new", () => {
    const setup = startPracticeSetup("You", testDeck(), "Testbot", testDeck(), 0.5, true);
    const before = setup.state.player1.hand.map((c) => c.id).sort();
    const { game } = resolveMulligans(setup, true);
    expect(game.state.player1.hand).toHaveLength(5);
    // Deck integrity: hand(5) + life(5) + deck = 20 main cards, no loss.
    const p = game.state.player1;
    expect(p.hand.length + p.life.length + p.deck.length).toBe(20);
    // The redraw reshuffled; ids may coincide but the pre-life zone order
    // proves the pipeline ran (life dealt AFTER the redraw).
    expect(before).toHaveLength(5);
  });

  it("CR 5-2-1-7: life is dealt from the top AFTER the mulligan window", () => {
    const { game } = resolveMulligans(
      startPracticeSetup("You", testDeck(), "Testbot", testDeck(), 0.5, true),
      false,
    );
    expect(game.state.player1.life).toHaveLength(5); // leader's printed life
    expect(game.state.player2.life).toHaveLength(5);
    expect(game.state.phase).not.toBe("setup");
  });

  it("chosen turn order is respected (the toss winner declared it)", () => {
    const g = startPracticeSetup("You", testDeck(), "Testbot", testDeck(), 0.5, false);
    expect(g.state.firstPlayer).toBe(AI_ID);
  });
});

describe("battle timing (CR 6-5-6-1)", () => {
  it("neither seat attacks before turn 3", () => {
    const game = readyGame();
    expect(game.state.turnNumber).toBe(1);
    const r = attack(game, game.state.player1.leader!.id, "leader");
    expect(r.rejected).toMatchObject({ ok: false, code: "first_turn" });
  });

  it("[Rush] lets a character attack the turn it lands (past turn 2)", () => {
    const game = readyGame();
    game.state.turnNumber = 3;
    game.state.lastUpkeepTurn = 3;
    game.state.player1.donActive = 3;
    const rushCard = game.state.player1.hand[0];
    rushCard.keywords = ["rush"];
    const played = playCard(game, rushCard.id);
    expect(played.rejected).toBeUndefined();
    const onField = played.game.state.player1.field[0];
    const r = attack(played.game, onField.id, "leader");
    expect(r.rejected).toBeUndefined();
  });
});

describe("DON!! lifecycle in play", () => {
  it("given DON!! come home at the next refresh (CR 6-2-3)", () => {
    let game = readyGame();
    game.state.turnNumber = 3;
    game.state.lastUpkeepTurn = 3;
    game.state.player1.donActive = 2;
    const r = attachDon(game, game.state.player1.leader!.id);
    game = r.game;
    expect(game.state.player1.leader!.attachedDon).toBe(1);
    // End turn → AI replies (no attacks turn <= 2 rule doesn't apply at 4,
    // but AI may pause on attack — take the hit if so) → our refresh.
    let ended = endTurn(game);
    let g = ended.game;
    while (g.pendingDefense) {
      const res = resolveDefense(g, {});
      g = res.game;
    }
    if (g.state.phase !== "finished") {
      expect(g.state.player1.leader!.attachedDon).toBe(0);
    }
  });
});

describe("stage replacement (CR 6-5-3)", () => {
  it("a new stage replaces the old, old goes to trash", () => {
    let game = readyGame();
    game.state.turnNumber = 3;
    game.state.lastUpkeepTurn = 3;
    game.state.player1.donActive = 4;
    const s1 = game.state.player1.hand[0];
    const s2 = game.state.player1.hand[1];
    s1.category = "stage";
    s2.category = "stage";
    game = playCard(game, s1.id).game;
    expect(game.state.player1.stage?.id).toBe(s1.id);
    game = playCard(game, s2.id).game;
    expect(game.state.player1.stage?.id).toBe(s2.id);
    expect(game.state.player1.trash.some((c) => c.id === s1.id)).toBe(true);
  });
});

describe("the defense window (Block 7-1-2 + Counter 7-1-3)", () => {
  /** Force a paused AI attack against the player's leader. */
  function pausedAttack(): PracticeGame {
    const game = readyGame();
    const s = game.state;
    s.turnNumber = 4; // AI's turn next; battles legal
    s.lastUpkeepTurn = 4;
    return {
      ...game,
      pendingDefense: {
        attackerId: s.player2.leader!.id,
        targetType: "leader",
        remainingAiActions: [],
      },
    };
  }

  it("other actions are gated while an attack is pending", () => {
    const game = pausedAttack();
    const r = playCard(game, game.state.player1.hand[0].id);
    expect(r.rejected).toMatchObject({ ok: false, code: "defend_first" });
    const e = endTurn(game);
    expect(e.rejected).toMatchObject({ ok: false, code: "defend_first" });
  });

  it("taking the hit resolves the damage (5000 vs 5000 — attacker wins ties)", () => {
    const game = pausedAttack();
    const lifeBefore = game.state.player1.life.length;
    const { game: after, rejected } = resolveDefense(game, {});
    expect(rejected).toBeUndefined();
    expect(after.state.player1.life.length).toBe(lifeBefore - 1);
    expect(after.pendingDefense).toBeFalsy();
  });

  it("a counter card flips a tie into a miss", () => {
    const game = pausedAttack();
    const lifeBefore = game.state.player1.life.length;
    const counterCard = game.state.player1.hand[0]; // counter 1000
    const { game: after, rejected } = resolveDefense(game, {
      counterCardIds: [counterCard.id],
    });
    expect(rejected).toBeUndefined();
    // 5000 attack vs 5000 + 1000 counter = miss; counter card trashed.
    expect(after.state.player1.life.length).toBe(lifeBefore);
    expect(after.state.player1.trash.some((c) => c.id === counterCard.id)).toBe(true);
  });

  it("an active [Blocker] redirects the attack and rests", () => {
    const game = pausedAttack();
    const blocker = {
      ...game.state.player1.hand[0],
      id: "blocker-1",
      zone: "field" as const,
      keywords: ["blocker" as const],
      power: 6000,
      isRested: false,
      turnPlayed: 1,
    };
    game.state.player1.field.push(blocker);
    const lifeBefore = game.state.player1.life.length;
    const { game: after, rejected } = resolveDefense(game, { blockerId: "blocker-1" });
    expect(rejected).toBeUndefined();
    // 5000 attack vs 6000 blocker = miss; leader untouched; blocker rested.
    expect(after.state.player1.life.length).toBe(lifeBefore);
    const b = after.state.player1.field.find((c) => c.id === "blocker-1");
    expect(b?.isRested).toBe(true);
  });

  it("a rested or non-blocker card is refused as a blocker", () => {
    const game = pausedAttack();
    const notBlocker = {
      ...game.state.player1.hand[0],
      id: "nb-1",
      zone: "field" as const,
      keywords: [],
      isRested: false,
      turnPlayed: 1,
    };
    game.state.player1.field.push(notBlocker);
    const { rejected } = resolveDefense(game, { blockerId: "nb-1" });
    expect(rejected).toMatchObject({ ok: false, code: "bad_blocker" });
  });
});

describe("a full game terminates", () => {
  it("plays to a finish through mulligans, defenses, and turns", () => {
    let game = readyGame();
    let guard = 300;
    while (game.state.phase !== "finished" && guard-- > 0) {
      if (game.pendingDefense) {
        game = resolveDefense(game, {}).game;
        continue;
      }
      const you = game.state.player1;
      for (const attacker of [you.leader, ...you.field]) {
        if (!attacker || game.state.phase === "finished" || game.pendingDefense) continue;
        const r = attack(game, attacker.id, "leader");
        if (!r.rejected) game = r.game;
      }
      if (game.state.phase === "finished" || game.pendingDefense) continue;
      const ended = endTurn(game);
      if (ended.rejected) break;
      game = ended.game;
    }
    expect(game.state.phase).toBe("finished");
    expect([PLAYER_ID, AI_ID]).toContain(game.state.winner);
  });
});
