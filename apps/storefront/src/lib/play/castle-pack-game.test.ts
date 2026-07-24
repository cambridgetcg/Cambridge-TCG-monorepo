import { describe, expect, it } from "vitest";
import {
  CASTLE_PACK_CARD_IDS,
  type CastlePackCardId,
  type CastleRoomCardId,
  type CastleWordCardId,
} from "./castle-pack";
import {
  CASTLE_MAX_ACTIONS,
  CastleGameError,
  applyAction,
  assertValidCastleGame,
  castleGameReceipt,
  createGame,
  legalActions,
  type CastleGameAction,
  type CastleOpenDoorGame,
  type CastleSeat,
} from "./castle-pack-game";

interface Rig {
  hand?: CastlePackCardId[];
  stacks?: [CastleRoomCardId[], CastleRoomCardId[]];
  chronicle?: CastleWordCardId[];
  deckFirst?: CastlePackCardId[];
}

function rigPlayer(
  game: CastleOpenDoorGame,
  seat: CastleSeat,
  {
    hand = [],
    stacks = [[], []],
    chronicle = [],
    deckFirst = [],
  }: Rig = {},
): void {
  const used = [...hand, ...stacks[0], ...stacks[1], ...chronicle];
  expect(new Set(used).size).toBe(used.length);
  const remaining = CASTLE_PACK_CARD_IDS.filter(
    (cardId) => !used.includes(cardId),
  );
  expect(deckFirst.every((cardId) => remaining.includes(cardId))).toBe(true);
  const deck = [
    ...deckFirst,
    ...remaining.filter((cardId) => !deckFirst.includes(cardId)),
  ];
  game.players[seat] = {
    deck,
    hand: [...hand],
    stacks: [
      {
        cards: [...stacks[0]],
        ward: false,
        seal: false,
        mirror_drawn_this_round: false,
      },
      {
        cards: [...stacks[1]],
        ward: false,
        seal: false,
        mirror_drawn_this_round: false,
      },
    ],
    chronicle: [...chronicle],
    light: 4,
    played_word_this_round: false,
    room_moved_by_opponent_this_round: false,
    done_for_round: false,
  };
}

function testGame(
  seatA: Rig = {},
  seatB: Rig = {},
): CastleOpenDoorGame {
  const game = createGame("focused-test");
  game.round = 4;
  game.active_seat = "seat_a";
  game.consecutive_passes = 0;
  rigPlayer(game, "seat_a", seatA);
  rigPlayer(game, "seat_b", seatB);
  assertValidCastleGame(game);
  return game;
}

function findAction(
  game: CastleOpenDoorGame,
  predicate: (action: CastleGameAction) => boolean,
): CastleGameAction {
  const action = legalActions(game).find(predicate);
  expect(action).toBeDefined();
  return action!;
}

function playRoomAction(
  game: CastleOpenDoorGame,
  cardId: CastleRoomCardId,
  stack: 0 | 1,
): CastleGameAction {
  return findAction(
    game,
    (action) =>
      action.type === "play_room" &&
      action.card_id === cardId &&
      action.stack === stack,
  );
}

describe("Castle Open Door setup", () => {
  it("deals two deterministic open decks, four-card opening hands, and round-one draws", () => {
    const first = createGame("same-seed");
    const again = createGame("same-seed");
    const other = createGame("other-seed");

    expect(first).toEqual(again);
    expect(first).not.toEqual(other);
    expect(first).toMatchObject({
      protocol: "castle-open-door-game/v0.1",
      generation: 1,
      parent_receipt: null,
      open_table: true,
      status: "playing",
      round: 1,
      active_seat: "seat_a",
      action_count: 0,
      max_actions: 72,
    });
    for (const seat of ["seat_a", "seat_b"] as const) {
      const player = first.players[seat];
      // Four opening cards, then one card at the start of round one.
      expect(player.hand).toHaveLength(5);
      expect(player.deck).toHaveLength(7);
      expect(player.light).toBe(1);
      expect(
        new Set([...player.hand, ...player.deck]),
      ).toEqual(new Set(CASTLE_PACK_CARD_IDS));
    }
  });

  it("normalises a seed and refuses empty or overlong seeds", () => {
    expect(createGame("  lantern  ").seed).toBe("lantern");
    expect(() => createGame("   ")).toThrowError(CastleGameError);
    expect(() => createGame("x".repeat(129))).toThrowError(
      expect.objectContaining({ code: "invalid_seed" }),
    );
  });
});

describe("Room stacking and when-played effects", () => {
  it("requires touching marks, allows either empty stack, and never mutates the input", () => {
    const game = testGame({
      hand: ["COU-01", "COU-02", "COU-05"],
    });
    const before = JSON.stringify(game);
    const afterGate = applyAction(
      game,
      playRoomAction(game, "COU-01", 0),
    );
    expect(JSON.stringify(game)).toBe(before);
    expect(afterGate.players.seat_a.stacks[0].cards).toEqual(["COU-01"]);

    const afterOpponentPass = applyAction(afterGate, {
      type: "pass",
      seat: "seat_b",
    });
    const actions = legalActions(afterOpponentPass);
    expect(actions).toContainEqual({
      type: "play_room",
      seat: "seat_a",
      card_id: "COU-02",
      stack: 0,
    });
    expect(actions).not.toContainEqual({
      type: "play_room",
      seat: "seat_a",
      card_id: "COU-05",
      stack: 0,
    });
    expect(actions).toContainEqual({
      type: "play_room",
      seat: "seat_a",
      card_id: "COU-05",
      stack: 1,
    });
  });

  it("Lit Gate draws on an empty stack and Welcome Porch restores one Light above a Room", () => {
    let game = testGame({
      hand: ["COU-01", "COU-02"],
      deckFirst: ["COU-03"],
    });
    game = applyAction(game, playRoomAction(game, "COU-01", 0));
    expect(game.players.seat_a.hand).toContain("COU-03");
    expect(game.players.seat_a.light).toBe(3);

    game = applyAction(game, { type: "pass", seat: "seat_b" });
    game = applyAction(game, playRoomAction(game, "COU-02", 0));
    expect(game.players.seat_a.light).toBe(3);
  });

  it("Honest Map draws for both seats, and Tower Stone repeats that printed effect once", () => {
    const game = testGame(
      {
        hand: ["COU-07"],
        stacks: [["COU-03"], []],
      },
      {},
    );
    const decksBefore = {
      seat_a: game.players.seat_a.deck.length,
      seat_b: game.players.seat_b.deck.length,
    };
    const after = applyAction(game, playRoomAction(game, "COU-07", 0));
    expect(after.players.seat_a.deck).toHaveLength(decksBefore.seat_a - 1);
    expect(after.players.seat_b.deck).toHaveLength(decksBefore.seat_b - 1);
    expect(after.players.seat_a.stacks[0].cards).toEqual([
      "COU-03",
      "COU-07",
    ]);
  });

  it("Return Path recycles the latest Chronicle Word to the deck bottom before drawing", () => {
    const game = testGame({
      hand: ["COU-08"],
      stacks: [["COU-05"], []],
      chronicle: ["COU-11"],
      deckFirst: ["COU-01"],
    });
    const after = applyAction(game, playRoomAction(game, "COU-08", 0));
    expect(after.players.seat_a.chronicle).toEqual([]);
    expect(after.players.seat_a.hand).toContain("COU-01");
    expect(after.players.seat_a.deck.at(-1)).toBe("COU-11");
  });
});

describe("restorative Words", () => {
  it("Whole No places one ward and the ward cancels before a seal", () => {
    let game = testGame(
      {
        hand: ["COU-11"],
        stacks: [["COU-01", "COU-02"], []],
      },
      {},
    );
    game = applyAction(game, {
      type: "play_word",
      seat: "seat_a",
      card_id: "COU-11",
      target_seat: "seat_a",
      target_stack: 0,
    });
    expect(game.players.seat_a.stacks[0].ward).toBe(true);

    // A fresh table isolates Ask's opponent-target rule and priority.
    game = testGame(
      { hand: ["COU-09"] },
      { stacks: [["COU-01", "COU-02"], []] },
    );
    game.players.seat_b.stacks[0].ward = true;
    game.players.seat_b.stacks[0].seal = true;
    const after = applyAction(game, {
      type: "play_word",
      seat: "seat_a",
      card_id: "COU-09",
      target_seat: "seat_b",
      target_stack: 0,
    });
    expect(after.players.seat_b.stacks[0]).toMatchObject({
      cards: ["COU-01", "COU-02"],
      ward: false,
      seal: true,
    });
    expect(after.players.seat_b.room_moved_by_opponent_this_round).toBe(
      false,
    );
  });

  it("a Checksum seal cancels Ask a Clear Question without moving a Room", () => {
    const game = testGame(
      { hand: ["COU-09"] },
      { stacks: [["COU-01", "COU-02"], []] },
    );
    game.players.seat_b.stacks[0].seal = true;
    const after = applyAction(game, {
      type: "play_word",
      seat: "seat_a",
      card_id: "COU-09",
      target_seat: "seat_b",
      target_stack: 0,
    });
    expect(after.players.seat_b.stacks[0]).toMatchObject({
      cards: ["COU-01", "COU-02"],
      seal: false,
    });
    expect(after.players.seat_b.room_moved_by_opponent_this_round).toBe(
      false,
    );
  });

  it("a successful question returns the top Room, restores its owner, and wakes a remaining Mirror Hall once", () => {
    const game = testGame(
      { hand: ["COU-09"] },
      {
        hand: ["COU-10"],
        stacks: [["COU-04", "COU-01"], []],
        deckFirst: ["COU-02", "COU-03", "COU-05"],
      },
    );
    game.players.seat_b.light = 1;
    const afterQuestion = applyAction(game, {
      type: "play_word",
      seat: "seat_a",
      card_id: "COU-09",
      target_seat: "seat_b",
      target_stack: 0,
    });
    expect(afterQuestion.players.seat_b.stacks[0]).toMatchObject({
      cards: ["COU-04"],
      mirror_drawn_this_round: true,
    });
    // Existing Right of Reply + returned Room + ordinary draw + Mirror draw.
    expect(afterQuestion.players.seat_b.hand).toHaveLength(4);
    expect(afterQuestion.players.seat_b.hand).toEqual(
      expect.arrayContaining(["COU-10", "COU-01", "COU-02", "COU-03"]),
    );
    expect(
      afterQuestion.players.seat_b.room_moved_by_opponent_this_round,
    ).toBe(true);

    const afterReply = applyAction(afterQuestion, {
      type: "play_word",
      seat: "seat_b",
      card_id: "COU-10",
    });
    expect(afterReply.players.seat_b.light).toBe(1);
    expect(
      afterReply.players.seat_b.room_moved_by_opponent_this_round,
    ).toBe(false);
    expect(afterReply.players.seat_b.chronicle).toContain("COU-10");
  });

  it("Walk Away Whole returns one or two tops, draws once, and leaves only pass/rest for that seat this round", () => {
    let game = testGame({
      hand: ["COU-12"],
      stacks: [["COU-01"], ["COU-06"]],
      deckFirst: ["COU-02"],
    });
    game.players.seat_a.stacks[0].ward = true;
    game.players.seat_a.stacks[1].seal = true;
    game = applyAction(game, {
      type: "play_word",
      seat: "seat_a",
      card_id: "COU-12",
      target_stacks: [0, 1],
    });
    expect(game.players.seat_a.hand).toEqual(
      expect.arrayContaining(["COU-01", "COU-06", "COU-02"]),
    );
    expect(game.players.seat_a.stacks).toMatchObject([
      { cards: [], ward: false },
      { cards: [], seal: false },
    ]);
    expect(game.players.seat_a.done_for_round).toBe(true);

    game = applyAction(game, { type: "pass", seat: "seat_b" });
    const seatAActions = legalActions(game).filter(
      (action) => "seat" in action && action.seat === "seat_a",
    );
    expect(seatAActions.every((action) => action.type !== "play_room")).toBe(
      true,
    );
    expect(seatAActions.every((action) => action.type !== "play_word")).toBe(
      true,
    );
    expect(seatAActions).toContainEqual({ type: "pass", seat: "seat_a" });
    expect(seatAActions).toContainEqual({ type: "stop", seat: "seat_a" });
  });
});

describe("rounds, Load, and bounded lineage", () => {
  it("two passes end a round; Quiet Commons draws only its bounded end-round gift", () => {
    let game = testGame(
      {
        stacks: [["COU-06"], []],
      },
      {},
    );
    game.round = 1;
    game.players.seat_a.light = 1;
    game.players.seat_b.light = 1;
    const deckBefore = game.players.seat_a.deck.length;
    game = applyAction(game, { type: "pass", seat: "seat_a" });
    game = applyAction(game, { type: "pass", seat: "seat_b" });
    expect(game.round).toBe(2);
    // One Quiet Commons draw, then one ordinary start-of-round draw.
    expect(game.players.seat_a.deck).toHaveLength(deckBefore - 2);
    expect(game.players.seat_a.light).toBe(2);
    expect(game.active_seat).toBe("seat_b");
  });

  it("scores one Load per Room plus one per full stack after round six", () => {
    let game = testGame(
      {
        stacks: [["COU-01", "COU-02", "COU-05", "COU-04"], []],
      },
      { stacks: [["COU-06"], []] },
    );
    game.round = 6;
    game = applyAction(game, { type: "pass", seat: "seat_a" });
    game = applyAction(game, { type: "pass", seat: "seat_b" });
    expect(game.status).toBe("complete");
    expect(game.result).toEqual({
      load: { seat_a: 5, seat_b: 1 },
      winner: "seat_a",
    });
    expect(legalActions(game)).toEqual([{ type: "regrow" }]);
  });

  it("names equal Load as shared instead of inventing a tiebreak", () => {
    let game = testGame();
    game.round = 6;
    game = applyAction(game, { type: "pass", seat: "seat_a" });
    game = applyAction(game, { type: "pass", seat: "seat_b" });
    expect(game.result).toEqual({
      load: { seat_a: 0, seat_b: 0 },
      winner: "shared",
    });
  });

  it("lets either seat stop immediately with no winner, penalty, or spent action", () => {
    const game = createGame("rest-now");
    expect(legalActions(game)).toContainEqual({
      type: "stop",
      seat: "seat_b",
    });
    const rested = applyAction(game, { type: "stop", seat: "seat_b" });
    expect(rested).toMatchObject({
      status: "rested",
      rest_reason: "player_rest",
      result: null,
      action_count: 0,
    });
  });

  it("rests exactly at the hard action limit", () => {
    const game = testGame();
    game.action_count = CASTLE_MAX_ACTIONS - 1;
    const rested = applyAction(game, { type: "pass", seat: "seat_a" });
    expect(rested).toMatchObject({
      status: "rested",
      rest_reason: "action_limit",
      action_count: CASTLE_MAX_ACTIONS,
      result: null,
    });
  });

  it("draws safely from an empty deck and never creates deck-out loss", () => {
    const game = testGame({
      hand: [...CASTLE_PACK_CARD_IDS],
    });
    const after = applyAction(game, {
      type: "play_room",
      seat: "seat_a",
      card_id: "COU-03",
      stack: 0,
    });
    expect(after.status).toBe("playing");
    expect(after.players.seat_a.deck).toEqual([]);
    expect(after.result).toBeNull();
  });

  it("regrows only from terminal state and carries a deterministic parent receipt", () => {
    const game = createGame("lineage");
    const rested = applyAction(game, { type: "stop", seat: "seat_a" });
    const receipt = castleGameReceipt(rested);
    expect(receipt).toMatch(/^cou1-[0-9a-f]{8}$/);
    expect(castleGameReceipt(rested)).toBe(receipt);

    const next = applyAction(rested, { type: "regrow", seed: "next" });
    expect(next).toMatchObject({
      generation: 2,
      seed: "next",
      parent_receipt: receipt,
      status: "playing",
      action_count: 0,
    });
    expect(next.parent_receipt).toBe(castleGameReceipt(rested));
    expect(() =>
      applyAction(game, { type: "regrow", seed: "too-soon" }),
    ).toThrowError(
      expect.objectContaining({ code: "illegal_action" }),
    );
  });
});

describe("carried-state defence", () => {
  it("rejects duplicate cards, broken marks, unearned results, and extra protocol fields", () => {
    const duplicate = createGame("duplicate");
    duplicate.players.seat_a.hand.push(duplicate.players.seat_a.deck[0]);
    expect(() => assertValidCastleGame(duplicate)).toThrowError(
      expect.objectContaining({ code: "invalid_game" }),
    );

    const brokenMarks = testGame();
    rigPlayer(brokenMarks, "seat_a", {
      stacks: [["COU-01", "COU-05"], []],
    });
    expect(() => assertValidCastleGame(brokenMarks)).toThrowError(
      /marks that do not meet/,
    );

    let complete = testGame();
    complete.round = 6;
    complete = applyAction(complete, { type: "pass", seat: "seat_a" });
    complete = applyAction(complete, { type: "pass", seat: "seat_b" });
    complete.result!.load.seat_a = 99;
    expect(() => assertValidCastleGame(complete)).toThrowError(
      /does not match/,
    );

    const extra = createGame("extra") as CastleOpenDoorGame & {
      trusted?: boolean;
    };
    extra.trusted = true;
    expect(() => assertValidCastleGame(extra)).toThrowError(
      /unexpected shape/,
    );
  });

  it("rejects actions that are not one exact member of legal_actions", () => {
    const game = createGame("illegal");
    expect(() =>
      applyAction(game, {
        type: "play_word",
        seat: "seat_b",
        card_id: "COU-10",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "illegal_action" }),
    );
  });

  it("changes a receipt when a valid state changes", () => {
    const game = createGame("receipt");
    const passed = applyAction(game, { type: "pass", seat: "seat_a" });
    expect(castleGameReceipt(passed)).not.toBe(castleGameReceipt(game));
  });
});
