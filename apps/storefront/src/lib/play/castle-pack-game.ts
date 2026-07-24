/**
 * Pure, stateless referee for Castle of Understanding — Open Door.
 *
 * The caller carries the whole open table, including both hands and deck
 * orders. Cambridge stores no match and awards no standing. Every reducer call
 * validates the complete carried state before applying exactly one bounded
 * action.
 */

import {
  CASTLE_PACK_CARD_IDS,
  CASTLE_PACK_ID,
  CASTLE_PACK_VERSION,
  castlePackCard,
  type CastlePackCardId,
  type CastleRoomCardId,
  type CastleWordCardId,
} from "./castle-pack";

export const CASTLE_GAME_PROTOCOL = "castle-open-door-game/v0.1" as const;
export const CASTLE_MAX_ACTIONS = 72 as const;

export type CastleSeat = "seat_a" | "seat_b";
export type CastleStackIndex = 0 | 1;
export type CastleGameStatus = "playing" | "complete" | "rested";
export type CastleGameWinner = CastleSeat | "shared";
export type CastleRestReason = "player_rest" | "action_limit";

export interface CastleRoomStack {
  /** Bottom Room first; top Room last. */
  cards: CastleRoomCardId[];
  /** Whole No's one-use refusal marker. */
  ward: boolean;
  /** Checksum Vault's one-use move shield. */
  seal: boolean;
  /** Mirror Hall can grant at most one draw from this stack each round. */
  mirror_drawn_this_round: boolean;
}

export interface CastlePlayerState {
  /** Top of deck first. */
  deck: CastlePackCardId[];
  hand: CastlePackCardId[];
  stacks: [CastleRoomStack, CastleRoomStack];
  /** Face-up Words in play order; latest Word last. */
  chronicle: CastleWordCardId[];
  light: number;
  played_word_this_round: boolean;
  room_moved_by_opponent_this_round: boolean;
  done_for_round: boolean;
}

export interface CastleGameResult {
  load: Record<CastleSeat, number>;
  winner: CastleGameWinner;
}

export interface CastleOpenDoorGame {
  protocol: typeof CASTLE_GAME_PROTOCOL;
  pack: {
    id: typeof CASTLE_PACK_ID;
    version: typeof CASTLE_PACK_VERSION;
  };
  generation: number;
  seed: string;
  /**
   * Non-cryptographic receipt of the previous terminal generation.
   * It records lineage; it is not an identity, signature, or authority claim.
   */
  parent_receipt: string | null;
  open_table: true;
  status: CastleGameStatus;
  round: number;
  active_seat: CastleSeat;
  consecutive_passes: 0 | 1;
  action_count: number;
  max_actions: typeof CASTLE_MAX_ACTIONS;
  players: Record<CastleSeat, CastlePlayerState>;
  result: CastleGameResult | null;
  rest_reason: CastleRestReason | null;
}

export type CastleGameAction =
  | {
      type: "play_room";
      seat: CastleSeat;
      card_id: CastleRoomCardId;
      stack: CastleStackIndex;
    }
  | {
      type: "play_word";
      seat: CastleSeat;
      card_id: "COU-09";
      target_seat: CastleSeat;
      target_stack: CastleStackIndex;
    }
  | {
      type: "play_word";
      seat: CastleSeat;
      card_id: "COU-10";
    }
  | {
      type: "play_word";
      seat: CastleSeat;
      card_id: "COU-11";
      target_seat: CastleSeat;
      target_stack: CastleStackIndex;
    }
  | {
      type: "play_word";
      seat: CastleSeat;
      card_id: "COU-12";
      target_stacks:
        | [CastleStackIndex]
        | [CastleStackIndex, CastleStackIndex];
    }
  | { type: "pass"; seat: CastleSeat }
  | { type: "stop"; seat: CastleSeat }
  | { type: "regrow"; seed?: string };

export type CastleGameErrorCode =
  | "invalid_body"
  | "invalid_game"
  | "invalid_seed"
  | "illegal_action";

export class CastleGameError extends Error {
  readonly code: CastleGameErrorCode;

  constructor(message: string);
  constructor(code: CastleGameErrorCode, message: string);
  constructor(
    codeOrMessage: CastleGameErrorCode | string,
    possibleMessage?: string,
  ) {
    const code =
      possibleMessage === undefined
        ? "illegal_action"
        : (codeOrMessage as CastleGameErrorCode);
    const message =
      possibleMessage === undefined ? codeOrMessage : possibleMessage;
    super(message);
    this.name = "CastleGameError";
    this.code = code;
  }
}

const SEATS: readonly CastleSeat[] = ["seat_a", "seat_b"];
const STACK_INDEXES: readonly CastleStackIndex[] = [0, 1];
const ALL_CARD_IDS = new Set<string>(CASTLE_PACK_CARD_IDS);
const ROOM_CARD_IDS = new Set<string>(
  CASTLE_PACK_CARD_IDS.filter((id) => castlePackCard(id).type === "room"),
);
const WORD_CARD_IDS = new Set<string>(
  CASTLE_PACK_CARD_IDS.filter((id) => castlePackCard(id).type === "word"),
);
const RECEIPT_PATTERN = /^cou1-[0-9a-f]{8}$/;

function otherSeat(seat: CastleSeat): CastleSeat {
  return seat === "seat_a" ? "seat_b" : "seat_a";
}

function invalidGame(message: string): never {
  throw new CastleGameError("invalid_game", message);
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidGame(`${label} must be an object.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    invalidGame(`${label} has an unexpected shape.`);
  }
}

function assertInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalidGame(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}

function isSeat(value: unknown): value is CastleSeat {
  return value === "seat_a" || value === "seat_b";
}

function isCardId(value: unknown): value is CastlePackCardId {
  return typeof value === "string" && ALL_CARD_IDS.has(value);
}

function isRoomCardId(value: unknown): value is CastleRoomCardId {
  return typeof value === "string" && ROOM_CARD_IDS.has(value);
}

function isWordCardId(value: unknown): value is CastleWordCardId {
  return typeof value === "string" && WORD_CARD_IDS.has(value);
}

function validateCardArray(
  value: unknown,
  predicate: (card: unknown) => boolean,
  label: string,
): asserts value is CastlePackCardId[] {
  if (!Array.isArray(value) || !value.every(predicate)) {
    invalidGame(`${label} contains an unknown or wrong-type card.`);
  }
}

function calculateLoad(player: CastlePlayerState): number {
  const rooms = player.stacks.reduce(
    (total, stack) => total + stack.cards.length,
    0,
  );
  const fullStackBonus = player.stacks.filter(
    (stack) => stack.cards.length === 4,
  ).length;
  return rooms + fullStackBonus;
}

function expectedResult(
  players: Record<CastleSeat, CastlePlayerState>,
): CastleGameResult {
  const load = {
    seat_a: calculateLoad(players.seat_a),
    seat_b: calculateLoad(players.seat_b),
  };
  const winner: CastleGameWinner =
    load.seat_a === load.seat_b
      ? "shared"
      : load.seat_a > load.seat_b
        ? "seat_a"
        : "seat_b";
  return { load, winner };
}

function validateStack(value: unknown, label: string): CastleRoomStack {
  assertRecord(value, label);
  assertExactKeys(
    value,
    ["cards", "ward", "seal", "mirror_drawn_this_round"],
    label,
  );
  validateCardArray(value.cards, isRoomCardId, `${label}.cards`);
  if (value.cards.length > 4) {
    invalidGame(`${label} exceeds the four-Room stack limit.`);
  }
  if (new Set(value.cards).size !== value.cards.length) {
    invalidGame(`${label} repeats a Room name.`);
  }
  for (let index = 1; index < value.cards.length; index += 1) {
    const below = castlePackCard(value.cards[index - 1]);
    const above = castlePackCard(value.cards[index]);
    if (
      below.type !== "room" ||
      above.type !== "room" ||
      above.marks.left !== below.marks.right
    ) {
      invalidGame(`${label} has two marks that do not meet.`);
    }
  }
  if (
    typeof value.ward !== "boolean" ||
    typeof value.seal !== "boolean" ||
    typeof value.mirror_drawn_this_round !== "boolean"
  ) {
    invalidGame(`${label} markers must be booleans.`);
  }
  if (value.cards.length === 0 && (value.ward || value.seal)) {
    invalidGame(`${label} cannot keep a ward or seal while empty.`);
  }
  return value as unknown as CastleRoomStack;
}

function validatePlayer(
  value: unknown,
  label: string,
): CastlePlayerState {
  assertRecord(value, label);
  assertExactKeys(
    value,
    [
      "deck",
      "hand",
      "stacks",
      "chronicle",
      "light",
      "played_word_this_round",
      "room_moved_by_opponent_this_round",
      "done_for_round",
    ],
    label,
  );
  validateCardArray(value.deck, isCardId, `${label}.deck`);
  validateCardArray(value.hand, isCardId, `${label}.hand`);
  validateCardArray(value.chronicle, isWordCardId, `${label}.chronicle`);
  if (!Array.isArray(value.stacks) || value.stacks.length !== 2) {
    invalidGame(`${label}.stacks must contain exactly two stacks.`);
  }
  const stacks: [CastleRoomStack, CastleRoomStack] = [
    validateStack(value.stacks[0], `${label}.stacks[0]`),
    validateStack(value.stacks[1], `${label}.stacks[1]`),
  ];
  assertInteger(value.light, 0, 4, `${label}.light`);
  if (
    typeof value.played_word_this_round !== "boolean" ||
    typeof value.room_moved_by_opponent_this_round !== "boolean" ||
    typeof value.done_for_round !== "boolean"
  ) {
    invalidGame(`${label} round markers must be booleans.`);
  }

  const allCards = [
    ...value.deck,
    ...value.hand,
    ...value.chronicle,
    ...stacks[0].cards,
    ...stacks[1].cards,
  ];
  if (
    allCards.length !== CASTLE_PACK_CARD_IDS.length ||
    new Set(allCards).size !== CASTLE_PACK_CARD_IDS.length ||
    CASTLE_PACK_CARD_IDS.some((cardId) => !allCards.includes(cardId))
  ) {
    invalidGame(`${label} must carry exactly one copy of every pack card.`);
  }

  return {
    deck: value.deck as CastlePackCardId[],
    hand: value.hand as CastlePackCardId[],
    stacks,
    chronicle: value.chronicle as CastleWordCardId[],
    light: value.light,
    played_word_this_round: value.played_word_this_round,
    room_moved_by_opponent_this_round:
      value.room_moved_by_opponent_this_round,
    done_for_round: value.done_for_round,
  };
}

/**
 * Validate every field and every card zone in a carried game.
 *
 * Extra fields are rejected under v0.1 rather than silently becoming part of
 * a receipt or changing play. A future shape therefore requires a new
 * protocol version.
 */
export function assertValidCastleGame(
  value: unknown,
): asserts value is CastleOpenDoorGame {
  assertRecord(value, "game");
  assertExactKeys(
    value,
    [
      "protocol",
      "pack",
      "generation",
      "seed",
      "parent_receipt",
      "open_table",
      "status",
      "round",
      "active_seat",
      "consecutive_passes",
      "action_count",
      "max_actions",
      "players",
      "result",
      "rest_reason",
    ],
    "game",
  );
  if (value.protocol !== CASTLE_GAME_PROTOCOL) {
    invalidGame("game.protocol is not supported.");
  }
  assertRecord(value.pack, "game.pack");
  assertExactKeys(value.pack, ["id", "version"], "game.pack");
  if (
    value.pack.id !== CASTLE_PACK_ID ||
    value.pack.version !== CASTLE_PACK_VERSION
  ) {
    invalidGame("game.pack does not name this exact playtest set.");
  }
  assertInteger(value.generation, 1, 1_000_000, "game.generation");
  if (
    typeof value.seed !== "string" ||
    value.seed.length === 0 ||
    value.seed.length > 128 ||
    value.seed.trim().length === 0
  ) {
    invalidGame("game.seed must be a non-empty string of at most 128 characters.");
  }
  if (
    value.parent_receipt !== null &&
    (typeof value.parent_receipt !== "string" ||
      !RECEIPT_PATTERN.test(value.parent_receipt))
  ) {
    invalidGame("game.parent_receipt is not a Castle receipt.");
  }
  if (value.generation === 1 && value.parent_receipt !== null) {
    invalidGame("The first generation cannot claim a parent receipt.");
  }
  if (value.generation > 1 && value.parent_receipt === null) {
    invalidGame("A regrown generation must carry its parent receipt.");
  }
  if (value.open_table !== true) {
    invalidGame("game.open_table must remain true.");
  }
  if (
    value.status !== "playing" &&
    value.status !== "complete" &&
    value.status !== "rested"
  ) {
    invalidGame("game.status is not recognised.");
  }
  assertInteger(value.round, 1, 6, "game.round");
  if (!isSeat(value.active_seat)) {
    invalidGame("game.active_seat is not recognised.");
  }
  if (value.consecutive_passes !== 0 && value.consecutive_passes !== 1) {
    invalidGame("game.consecutive_passes must be zero or one.");
  }
  assertInteger(
    value.action_count,
    0,
    CASTLE_MAX_ACTIONS,
    "game.action_count",
  );
  if (value.max_actions !== CASTLE_MAX_ACTIONS) {
    invalidGame("game.max_actions does not match this rules version.");
  }

  assertRecord(value.players, "game.players");
  assertExactKeys(value.players, SEATS, "game.players");
  const players = {
    seat_a: validatePlayer(value.players.seat_a, "game.players.seat_a"),
    seat_b: validatePlayer(value.players.seat_b, "game.players.seat_b"),
  };

  if (value.status === "playing") {
    if (
      value.result !== null ||
      value.rest_reason !== null ||
      value.action_count >= CASTLE_MAX_ACTIONS
    ) {
      invalidGame("A playing game cannot carry a result, rest reason, or spent action limit.");
    }
  } else if (value.status === "rested") {
    if (
      value.result !== null ||
      (value.rest_reason !== "player_rest" &&
        value.rest_reason !== "action_limit")
    ) {
      invalidGame("A rested game needs one rest reason and no result.");
    }
    if (
      value.rest_reason === "action_limit" &&
      value.action_count !== CASTLE_MAX_ACTIONS
    ) {
      invalidGame("An action-limit rest must occur at the exact limit.");
    }
  } else {
    if (value.round !== 6 || value.rest_reason !== null) {
      invalidGame("A complete game must finish round six without a rest reason.");
    }
    assertRecord(value.result, "game.result");
    assertExactKeys(value.result, ["load", "winner"], "game.result");
    assertRecord(value.result.load, "game.result.load");
    assertExactKeys(value.result.load, SEATS, "game.result.load");
    const expected = expectedResult(players);
    if (
      value.result.load.seat_a !== expected.load.seat_a ||
      value.result.load.seat_b !== expected.load.seat_b ||
      value.result.winner !== expected.winner
    ) {
      invalidGame("game.result does not match the Rooms on the table.");
    }
  }
}

function normaliseSeed(seed: string): string {
  if (typeof seed !== "string") {
    throw new CastleGameError("invalid_seed", "The seed must be a string.");
  }
  const normalised = seed.trim();
  if (normalised.length === 0 || normalised.length > 128) {
    throw new CastleGameError(
      "invalid_seed",
      "The seed must contain 1–128 non-space characters.",
    );
  }
  return normalised;
}

function seedToUint32(seed: string): number {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = seedToUint32(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledDeck(seed: string, seat: CastleSeat): CastlePackCardId[] {
  const deck = [...CASTLE_PACK_CARD_IDS];
  const random = seededRandom(`${seed}:${seat}`);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function emptyStack(): CastleRoomStack {
  return {
    cards: [],
    ward: false,
    seal: false,
    mirror_drawn_this_round: false,
  };
}

function newPlayer(seed: string, seat: CastleSeat): CastlePlayerState {
  return {
    deck: shuffledDeck(seed, seat),
    hand: [],
    stacks: [emptyStack(), emptyStack()],
    chronicle: [],
    light: 0,
    played_word_this_round: false,
    room_moved_by_opponent_this_round: false,
    done_for_round: false,
  };
}

function draw(player: CastlePlayerState, count = 1): void {
  for (let index = 0; index < count; index += 1) {
    const card = player.deck.shift();
    if (card) {
      player.hand.push(card);
    }
  }
}

function beginRound(game: CastleOpenDoorGame): void {
  for (const seat of SEATS) {
    const player = game.players[seat];
    player.light = Math.min(game.round, 4);
    player.played_word_this_round = false;
    player.room_moved_by_opponent_this_round = false;
    player.done_for_round = false;
    for (const stack of player.stacks) {
      stack.mirror_drawn_this_round = false;
    }
    draw(player);
  }
  game.active_seat = game.round % 2 === 1 ? "seat_a" : "seat_b";
  game.consecutive_passes = 0;
}

function createGeneration(
  seed: string,
  generation: number,
  parentReceipt: string | null,
): CastleOpenDoorGame {
  const game: CastleOpenDoorGame = {
    protocol: CASTLE_GAME_PROTOCOL,
    pack: { id: CASTLE_PACK_ID, version: CASTLE_PACK_VERSION },
    generation,
    seed,
    parent_receipt: parentReceipt,
    open_table: true,
    status: "playing",
    round: 1,
    active_seat: "seat_a",
    consecutive_passes: 0,
    action_count: 0,
    max_actions: CASTLE_MAX_ACTIONS,
    players: {
      seat_a: newPlayer(seed, "seat_a"),
      seat_b: newPlayer(seed, "seat_b"),
    },
    result: null,
    rest_reason: null,
  };
  for (const seat of SEATS) {
    draw(game.players[seat], 4);
  }
  beginRound(game);
  assertValidCastleGame(game);
  return game;
}

/** Deal one finite six-round generation. No timer or background loop starts. */
export function createGame(seed = "open-door"): CastleOpenDoorGame {
  return createGeneration(normaliseSeed(seed), 1, null);
}

function stableSerialise(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialise).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialise(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new CastleGameError(
    "invalid_game",
    "A Castle receipt can cover JSON values only.",
  );
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Stable, compact lineage receipt.
 *
 * FNV-1a is deliberately dependency-free and browser-safe. This receipt
 * detects ordinary state changes; it is not cryptographic proof, a signature,
 * an identity, or a grant of authority.
 */
export function castleGameReceipt(game: CastleOpenDoorGame): string {
  assertValidCastleGame(game);
  return `cou1-${fnv1a32(stableSerialise(game))}`;
}

function cloneGame(game: CastleOpenDoorGame): CastleOpenDoorGame {
  return JSON.parse(JSON.stringify(game)) as CastleOpenDoorGame;
}

function canPlayRoom(
  player: CastlePlayerState,
  cardId: CastleRoomCardId,
  stackIndex: CastleStackIndex,
): boolean {
  const card = castlePackCard(cardId);
  const stack = player.stacks[stackIndex];
  if (
    card.type !== "room" ||
    player.light < card.cost ||
    stack.cards.length >= 4 ||
    stack.cards.includes(cardId)
  ) {
    return false;
  }
  const topId = stack.cards.at(-1);
  if (!topId) return true;
  const top = castlePackCard(topId);
  return top.type === "room" && card.marks.left === top.marks.right;
}

function addWordActions(
  actions: CastleGameAction[],
  game: CastleOpenDoorGame,
  seat: CastleSeat,
  cardId: CastleWordCardId,
): void {
  const player = game.players[seat];
  const opponentSeat = otherSeat(seat);
  const opponent = game.players[opponentSeat];
  const card = castlePackCard(cardId);
  if (player.light < card.cost) return;

  if (cardId === "COU-09") {
    for (const targetStack of STACK_INDEXES) {
      if (opponent.stacks[targetStack].cards.length >= 2) {
        actions.push({
          type: "play_word",
          seat,
          card_id: cardId,
          target_seat: opponentSeat,
          target_stack: targetStack,
        });
      }
    }
  } else if (cardId === "COU-10") {
    if (player.room_moved_by_opponent_this_round) {
      actions.push({ type: "play_word", seat, card_id: cardId });
    }
  } else if (cardId === "COU-11") {
    for (const targetStack of STACK_INDEXES) {
      const stack = player.stacks[targetStack];
      if (stack.cards.length > 0 && !stack.ward) {
        actions.push({
          type: "play_word",
          seat,
          card_id: cardId,
          target_seat: seat,
          target_stack: targetStack,
        });
      }
    }
  } else {
    const nonEmpty = STACK_INDEXES.filter(
      (stackIndex) => player.stacks[stackIndex].cards.length > 0,
    );
    for (const stackIndex of nonEmpty) {
      actions.push({
        type: "play_word",
        seat,
        card_id: "COU-12",
        target_stacks: [stackIndex],
      });
    }
    if (nonEmpty.length === 2) {
      actions.push({
        type: "play_word",
        seat,
        card_id: "COU-12",
        target_stacks: [0, 1],
      });
    }
  }
}

/**
 * Enumerate the entire legal action surface.
 *
 * Normal actions belong to the active seat. Either seat may always stop a
 * playing generation; a terminal generation offers one explicit regrow.
 */
export function legalActions(
  game: CastleOpenDoorGame,
): CastleGameAction[] {
  assertValidCastleGame(game);
  if (game.status !== "playing") {
    return [{ type: "regrow" }];
  }

  const seat = game.active_seat;
  const player = game.players[seat];
  const actions: CastleGameAction[] = [];

  if (!player.done_for_round) {
    for (const cardId of player.hand) {
      const card = castlePackCard(cardId);
      if (card.type === "room") {
        for (const stackIndex of STACK_INDEXES) {
          if (canPlayRoom(player, card.id, stackIndex)) {
            actions.push({
              type: "play_room",
              seat,
              card_id: card.id,
              stack: stackIndex,
            });
          }
        }
      } else {
        addWordActions(actions, game, seat, card.id);
      }
    }
  }

  actions.push({ type: "pass", seat });
  actions.push({ type: "stop", seat: "seat_a" });
  actions.push({ type: "stop", seat: "seat_b" });
  return actions;
}

function removeFromHand(
  player: CastlePlayerState,
  cardId: CastlePackCardId,
): void {
  const index = player.hand.indexOf(cardId);
  if (index < 0) {
    throw new CastleGameError(
      "illegal_action",
      `${cardId} is not in that seat's hand.`,
    );
  }
  player.hand.splice(index, 1);
}

function resolveRoomOnPlay(
  game: CastleOpenDoorGame,
  seat: CastleSeat,
  stackIndex: CastleStackIndex,
  cardId: CastleRoomCardId,
  stackWasEmpty: boolean,
  belowCardId: CastleRoomCardId | undefined,
  repeated: boolean,
): void {
  const player = game.players[seat];
  const stack = player.stacks[stackIndex];

  switch (cardId) {
    case "COU-01":
      if (stackWasEmpty) draw(player);
      break;
    case "COU-02":
      if (!stackWasEmpty) player.light = Math.min(4, player.light + 1);
      break;
    case "COU-03":
      draw(game.players.seat_a);
      draw(game.players.seat_b);
      break;
    case "COU-05":
      stack.seal = true;
      break;
    case "COU-07":
      if (!repeated && belowCardId && belowCardId !== "COU-07") {
        resolveRoomOnPlay(
          game,
          seat,
          stackIndex,
          belowCardId,
          false,
          undefined,
          true,
        );
      }
      break;
    case "COU-08": {
      if (!stackWasEmpty) {
        const latestWord = player.chronicle.pop();
        if (latestWord) {
          player.deck.push(latestWord);
          draw(player);
        }
      }
      break;
    }
    default:
      // Mirror Hall and Quiet Commons trigger outside the when-played window.
      break;
  }
}

function playRoom(
  game: CastleOpenDoorGame,
  action: Extract<CastleGameAction, { type: "play_room" }>,
): void {
  const player = game.players[action.seat];
  const card = castlePackCard(action.card_id);
  if (card.type !== "room") {
    throw new CastleGameError("illegal_action", "That card is not a Room.");
  }
  const stack = player.stacks[action.stack];
  const stackWasEmpty = stack.cards.length === 0;
  const belowCardId = stack.cards.at(-1);
  removeFromHand(player, action.card_id);
  player.light -= card.cost;
  stack.cards.push(action.card_id);
  resolveRoomOnPlay(
    game,
    action.seat,
    action.stack,
    action.card_id,
    stackWasEmpty,
    belowCardId,
    false,
  );
}

function cleanEmptyStack(stack: CastleRoomStack): void {
  if (stack.cards.length === 0) {
    stack.ward = false;
    stack.seal = false;
    stack.mirror_drawn_this_round = false;
  }
}

function playWord(
  game: CastleOpenDoorGame,
  action: Extract<CastleGameAction, { type: "play_word" }>,
): void {
  const player = game.players[action.seat];
  const card = castlePackCard(action.card_id);
  if (card.type !== "word") {
    throw new CastleGameError("illegal_action", "That card is not a Word.");
  }
  removeFromHand(player, action.card_id);
  player.light -= card.cost;
  player.chronicle.push(action.card_id);
  player.played_word_this_round = true;

  if (action.card_id === "COU-09") {
    const owner = game.players[action.target_seat];
    const stack = owner.stacks[action.target_stack];
    if (stack.ward) {
      stack.ward = false;
      return;
    }
    if (stack.seal) {
      stack.seal = false;
      return;
    }
    const movedRoom = stack.cards.pop();
    if (!movedRoom) return;
    owner.hand.push(movedRoom);
    draw(owner);
    owner.room_moved_by_opponent_this_round = true;
    if (
      stack.cards.includes("COU-04") &&
      !stack.mirror_drawn_this_round
    ) {
      stack.mirror_drawn_this_round = true;
      draw(owner);
    }
    cleanEmptyStack(stack);
  } else if (action.card_id === "COU-10") {
    draw(player);
    player.light = Math.min(4, player.light + 1);
    player.room_moved_by_opponent_this_round = false;
  } else if (action.card_id === "COU-11") {
    player.stacks[action.target_stack].ward = true;
  } else {
    for (const stackIndex of action.target_stacks) {
      const stack = player.stacks[stackIndex];
      const returnedRoom = stack.cards.pop();
      if (returnedRoom) player.hand.push(returnedRoom);
      cleanEmptyStack(stack);
    }
    draw(player);
    player.done_for_round = true;
  }
}

function finishRound(game: CastleOpenDoorGame): void {
  for (const seat of SEATS) {
    const player = game.players[seat];
    const quietCommonsIsTop = player.stacks.some(
      (stack) => stack.cards.at(-1) === "COU-06",
    );
    if (quietCommonsIsTop && !player.played_word_this_round) {
      draw(player);
    }
  }

  game.consecutive_passes = 0;
  if (game.round === 6) {
    game.status = "complete";
    game.result = expectedResult(game.players);
    return;
  }
  game.round += 1;
  beginRound(game);
}

function countActionAndEnforceLimit(game: CastleOpenDoorGame): void {
  game.action_count += 1;
  if (
    game.status === "playing" &&
    game.action_count >= CASTLE_MAX_ACTIONS
  ) {
    game.status = "rested";
    game.rest_reason = "action_limit";
    game.result = null;
    game.consecutive_passes = 0;
  }
}

function actionMatches(
  candidate: CastleGameAction,
  submitted: CastleGameAction,
): boolean {
  try {
    return stableSerialise(candidate) === stableSerialise(submitted);
  } catch {
    return false;
  }
}

function assertRegrowAction(
  action: CastleGameAction,
): asserts action is Extract<CastleGameAction, { type: "regrow" }> {
  if (
    typeof action !== "object" ||
    action === null ||
    Array.isArray(action) ||
    action.type !== "regrow"
  ) {
    throw new CastleGameError(
      "illegal_action",
      "A terminal generation accepts only regrow.",
    );
  }
  const keys = Object.keys(action).sort();
  if (
    (keys.length !== 1 || keys[0] !== "type") &&
    (keys.length !== 2 || keys[0] !== "seed" || keys[1] !== "type")
  ) {
    throw new CastleGameError(
      "illegal_action",
      "The regrow action has an unexpected shape.",
    );
  }
  if ("seed" in action && action.seed !== undefined) {
    normaliseSeed(action.seed);
  }
}

/**
 * Apply exactly one legal action and return a fresh state object.
 *
 * The supplied state is never mutated. `stop` rests immediately without a
 * winner or penalty. `regrow` is accepted only after complete/rested and
 * creates one new finite generation; it never schedules another.
 */
export function applyAction(
  game: CastleOpenDoorGame,
  action: CastleGameAction,
): CastleOpenDoorGame {
  assertValidCastleGame(game);

  if (game.status !== "playing") {
    assertRegrowAction(action);
    const parentReceipt = castleGameReceipt(game);
    const seed =
      action.seed === undefined
        ? `regrow:${parentReceipt}:${game.generation + 1}`
        : normaliseSeed(action.seed);
    return createGeneration(seed, game.generation + 1, parentReceipt);
  }

  const legal = legalActions(game);
  if (!legal.some((candidate) => actionMatches(candidate, action))) {
    throw new CastleGameError(
      "illegal_action",
      "That action is not legal in the carried game state.",
    );
  }
  if (action.type === "regrow") {
    throw new CastleGameError(
      "illegal_action",
      "A playing generation cannot regrow.",
    );
  }

  const next = cloneGame(game);
  if (action.type === "stop") {
    next.status = "rested";
    next.rest_reason = "player_rest";
    next.result = null;
    next.consecutive_passes = 0;
    assertValidCastleGame(next);
    return next;
  }

  if (action.type === "pass") {
    if (next.consecutive_passes === 1) {
      finishRound(next);
    } else {
      next.consecutive_passes = 1;
      next.active_seat = otherSeat(action.seat);
    }
  } else {
    next.consecutive_passes = 0;
    if (action.type === "play_room") {
      playRoom(next, action);
    } else {
      playWord(next, action);
    }
    next.active_seat = otherSeat(action.seat);
  }

  countActionAndEnforceLimit(next);
  assertValidCastleGame(next);
  return next;
}
