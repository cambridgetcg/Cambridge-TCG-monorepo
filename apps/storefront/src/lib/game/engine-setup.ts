// Pure game setup — extracted from engine.ts so the browser practice board
// can build a game without pulling in the server-only DB wrapper engine.ts
// imports. engine.ts re-exports initializeGame; server callers are unchanged.

import type { GameCard, GameState, PlayerState } from "./types";

// Card instance ids. Web Crypto's randomUUID exists in every modern browser
// and in Node 19+; the fallback covers older Safari (pre-15.4) so a
// practice battle never dies on id generation. (Node's `crypto` module
// can't be imported here — this file bundles into the browser.)
let idCounter = 0;
function newCardId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  idCounter += 1;
  return `card-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface SetupCard {
  sku: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  rarity: string | null;
  isLeader?: boolean;
  // Printed stats — optional; carried onto the GameCard when present.
  category?: GameCard["category"];
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  color?: string | null;
  textEn?: string | null;
  textAttribution?: string | null;
  keywords?: ("rush" | "blocker" | "double_attack" | "banish")[];
  hasTrigger?: boolean;
  /** Leader life total — used for the life-card count when this card is
   *  the leader. Default 5 when unknown (the pre-stats behavior). */
  life?: number | null;
}

function makeCard(source: SetupCard, zone: GameCard["zone"]): GameCard {
  return {
    id: newCardId(),
    sku: source.sku,
    name: source.name,
    cardNumber: source.cardNumber,
    imageUrl: source.imageUrl,
    rarity: source.rarity,
    category: source.category ?? null,
    cost: source.cost ?? null,
    power: source.power ?? null,
    counter: source.counter ?? null,
    color: source.color ?? null,
    life: source.life ?? null,
    textEn: source.textEn ?? null,
    textAttribution: source.textAttribution ?? null,
    keywords: source.keywords ?? [],
    hasTrigger: source.hasTrigger ?? false,
    isRested: false,
    attachedDon: 0,
    zone,
    position: 0,
    faceDown: zone === "life" || zone === "deck",
  };
}

/**
 * Official setup, first half (CR 5-2-1): decks shuffled, leaders placed,
 * first/second already declared by the toss winner, opening hands of 5
 * dealt — but NO life yet. Life is dealt in finalizeSetup AFTER the
 * mulligan window (5-2-1-6 before 5-2-1-7).
 */
export function dealOpeningHands(
  player1Id: string,
  player1Name: string,
  player1Deck: SetupCard[],
  player2Id: string,
  player2Name: string,
  player2Deck: SetupCard[],
  firstPlayer: string,
): GameState {
  function setupPlayer(userId: string, name: string, deck: SetupCard[]): PlayerState {
    const leader = deck.find((c) => c.isLeader);
    const mainDeck = deck.filter((c) => !c.isLeader);
    for (let i = mainDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mainDeck[i], mainDeck[j]] = [mainDeck[j], mainDeck[i]];
    }
    const deckCards = mainDeck.map((c, i) => {
      const card = makeCard(c, "deck");
      card.position = i;
      return card;
    });
    const handCards = deckCards.splice(0, 5).map((c, i) => {
      c.zone = "hand";
      c.faceDown = false;
      c.position = i;
      return c;
    });
    return {
      userId,
      name,
      leader: leader ? makeCard(leader, "leader") : null,
      field: [],
      stage: null,
      hand: handCards,
      life: [],
      trash: [],
      deck: deckCards,
      donActive: 0,
      donRested: 0,
      donDeck: 10,
      lifeCount: 0,
    };
  }
  return {
    player1: setupPlayer(player1Id, player1Name, player1Deck),
    player2: setupPlayer(player2Id, player2Name, player2Deck),
    currentTurn: firstPlayer,
    turnNumber: 1,
    phase: "setup",
    firstPlayer,
  };
}

/** CR 5-2-1-6-1: return the WHOLE hand to the deck, reshuffle, redraw 5.
 *  At most once per player — callers enforce the once. */
export function mulliganHand(
  state: GameState,
  playerKey: "player1" | "player2",
): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const p = s[playerKey];
  for (const c of p.hand) {
    c.zone = "deck";
    c.faceDown = true;
  }
  p.deck = [...p.deck, ...p.hand];
  p.hand = [];
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
  }
  p.hand = p.deck.splice(0, 5).map((c, i) => {
    c.zone = "hand";
    c.faceDown = false;
    c.position = i;
    return c;
  });
  return s;
}

/** CR 5-2-1-7: after the mulligan window, each player places life from the
 *  top of their deck — "such that the card at the top of their deck is at
 *  the bottom in their Life area". life[0] is the top of the pile (damage
 *  takes life.shift()), so each dealt card is unshifted: the first card
 *  (deck top) sinks to the bottom. */
export function finalizeSetup(state: GameState): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  for (const key of ["player1", "player2"] as const) {
    const p = s[key];
    const lifeCount = Math.min(
      p.leader?.life ?? 5,
      p.deck.length,
    );
    for (let i = 0; i < lifeCount; i++) {
      const card = p.deck.shift()!;
      card.zone = "life";
      card.faceDown = true;
      p.life.unshift(card);
    }
    p.lifeCount = p.life.length;
  }
  s.phase = "main";
  return s;
}

export function initializeGame(
  player1Id: string,
  player1Name: string,
  player1Deck: SetupCard[],
  player2Id: string,
  player2Name: string,
  player2Deck: SetupCard[],
): GameState {
  function setupPlayer(userId: string, name: string, deck: SetupCard[]): PlayerState {
    const leader = deck.find((c) => c.isLeader);
    const mainDeck = deck.filter((c) => !c.isLeader);

    // Shuffle
    for (let i = mainDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mainDeck[i], mainDeck[j]] = [mainDeck[j], mainDeck[i]];
    }

    const leaderCard = leader ? makeCard(leader, "leader") : null;

    // Life cards = top N of the deck; N comes from the leader's printed
    // life when known (4 or 5 on real leaders), else the historical 5.
    const lifeCount = leader?.life ?? 5;
    const lifeCards = mainDeck.splice(0, lifeCount).map((c, i) => {
      const card = makeCard(c, "life");
      card.position = i;
      return card;
    });

    // Hand = next 5 cards
    const handCards = mainDeck.splice(0, 5).map((c, i) => {
      const card = makeCard(c, "hand");
      card.position = i;
      return card;
    });

    // Remaining = deck
    const deckCards = mainDeck.map((c, i) => {
      const card = makeCard(c, "deck");
      card.position = i;
      return card;
    });

    return {
      userId,
      name,
      leader: leaderCard,
      field: [],
      stage: null,
      hand: handCards,
      life: lifeCards,
      trash: [],
      deck: deckCards,
      donActive: 0,
      donRested: 0,
      donDeck: 10,
      lifeCount: lifeCards.length, // honest count — small decks deal fewer life cards
    };
  }

  const p1 = setupPlayer(player1Id, player1Name, player1Deck);
  const p2 = setupPlayer(player2Id, player2Name, player2Deck);

  // Random first player
  const firstPlayer = Math.random() < 0.5 ? player1Id : player2Id;

  return {
    player1: p1,
    player2: p2,
    currentTurn: firstPlayer,
    turnNumber: 1,
    phase: "main",
    firstPlayer,
  };
}
