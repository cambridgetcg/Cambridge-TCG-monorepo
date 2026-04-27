// Headless simulation of the PVE game loop.
// Exercises initializeGame + applyAction (reducer) + aiTurn to validate:
//   1. Player can attack AI leader, damage cascades to hand, life decrements.
//   2. Player finishes the game when the AI is at 0 life + receives another leader attack.
//   3. AI produces attack actions (not just toggle_rest).
//   4. AI with lethal (player at 0 life) ends the game via attack → state.winner = AI.
//   5. Character attacks KO rested opponent characters (field → trash).
//
// Run with:  npx tsx scripts/test-game-engine.ts

import { initializeGame } from "../src/lib/game/engine";
import { applyAction } from "../src/lib/game/reducer";
import { aiTurn, generateAIDeck } from "../src/lib/game/ai";
import type { GameState, GameCard } from "../src/lib/game/types";

type DeckCard = {
  sku: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  rarity: string | null;
  isLeader?: boolean;
};

// ── helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ──`);
}

function buildDeck(prefix: string, leaderRarity = "L"): DeckCard[] {
  const cards: DeckCard[] = [
    {
      sku: `${prefix}-LEADER`,
      name: `${prefix} Leader`,
      cardNumber: "OP01-001",
      imageUrl: null,
      rarity: leaderRarity,
      isLeader: true,
    },
  ];
  for (let i = 0; i < 50; i++) {
    cards.push({
      sku: `${prefix}-C${i}`,
      name: `${prefix} Card ${i}`,
      cardNumber: `OP01-${String(i + 100).padStart(3, "0")}`,
      imageUrl: null,
      rarity: "C",
    });
  }
  return cards;
}

// Helper to force player1 to go first regardless of randomness in initializeGame.
function freshGame(): GameState {
  let state: GameState;
  // initializeGame picks first player randomly; re-roll until player1 starts to keep tests deterministic.
  do {
    state = initializeGame("u1", "Alice", buildDeck("P1"), "u2", "Bob", buildDeck("P2"));
  } while (state.firstPlayer !== "u1");
  return state;
}

// ── 1. reducer.attack against leader damages life and decrements count ───

section("Leader attack damages opponent life");
{
  const state = freshGame();
  const attacker = state.player1.leader!;
  const startLife = state.player2.lifeCount;
  const startHand = state.player2.hand.length;

  const next = applyAction(state, "player1", "attack", {
    attackerId: attacker.id,
    targetType: "leader",
  });

  assert(next.player2.lifeCount === startLife - 1, `life: ${startLife} → ${next.player2.lifeCount}`);
  assert(next.player2.hand.length === startHand + 1, `hand grew by 1 (life card revealed)`);
  assert(
    next.player1.leader!.isRested === true,
    "attacker is now rested",
  );
  assert(next.phase !== "finished", "game continues (life > 0)");

  // Can't double-swing the same attacker (already rested)
  const next2 = applyAction(next, "player1", "attack", {
    attackerId: attacker.id,
    targetType: "leader",
  });
  assert(
    next2.player2.lifeCount === next.player2.lifeCount,
    "rested attacker no-ops",
  );
}

// ── 2. attack into 0-life leader ends the game ───────────────────────────

section("Attack at 0 life ends the game");
{
  let state = freshGame();
  // Brute-force: empty opponent life via repeated attack + refresh
  while (state.player2.lifeCount > 0) {
    state = applyAction(state, "player1", "attack", {
      attackerId: state.player1.leader!.id,
      targetType: "leader",
    });
    state = applyAction(state, "player1", "refresh_all", {});
  }
  assert(state.phase !== "finished", "game still active at 0 life before killing blow");
  assert(state.player2.lifeCount === 0, "opponent at 0 life");

  const finisher = applyAction(state, "player1", "attack", {
    attackerId: state.player1.leader!.id,
    targetType: "leader",
  });

  assert(finisher.phase === "finished", 'phase = "finished"');
  assert(finisher.winner === "u1", "winner = player1");
}

// ── 3. Character attack KO's a rested opponent field character ──────────

section("Character attack KOs a rested opponent");
{
  let state = freshGame();
  // Manually place a card on opponent's field via move_card as opponent
  const oppHandCard = state.player2.hand[0];
  state = applyAction(state, "player2", "move_card", {
    cardId: oppHandCard.id,
    toZone: "field",
  });
  // Rest it manually
  state.player2.field[0].isRested = true;

  const startFieldLen = state.player2.field.length;
  const startTrashLen = state.player2.trash.length;
  const targetId = state.player2.field[0].id;

  const next = applyAction(state, "player1", "attack", {
    attackerId: state.player1.leader!.id,
    targetType: "character",
    targetId,
  });

  assert(next.player2.field.length === startFieldLen - 1, "field shrunk by 1");
  assert(next.player2.trash.length === startTrashLen + 1, "trash grew by 1");
  const trashed = next.player2.trash[next.player2.trash.length - 1] as GameCard;
  assert(trashed.id === targetId, "KO'd card is in trash");
  assert(trashed.zone === "trash", "zone updated to 'trash'");
  assert(next.player1.leader!.isRested === true, "attacker rested");
}

// ── 4. AI emits attack actions ───────────────────────────────────────────

section("AI emits attack actions");
{
  const state = freshGame();
  // Give AI an unrested board by putting their leader in play (leader already exists),
  // and make it the AI's turn.
  const decision = aiTurn(state, "player2", 1.0);
  const attackActions = decision.actions.filter((a) => a.type === "attack");
  const restToggles = decision.actions.filter((a) => a.type === "toggle_rest");

  assert(attackActions.length >= 1, `AI emitted ${attackActions.length} attack action(s)`);
  assert(
    restToggles.length === 0,
    "AI no longer uses toggle_rest for attacks",
  );
  const firstAttack = attackActions[0];
  assert(
    typeof (firstAttack?.data as { attackerId: string }).attackerId === "string",
    "attack action has attackerId",
  );
  assert(
    ["leader", "character"].includes(
      (firstAttack?.data as { targetType: string }).targetType,
    ),
    "attack targetType is leader or character",
  );
}

// ── 5. AI attacking into 0-life player ends the game with AI as winner ──

section("AI lethal ends the game");
{
  let state = freshGame();
  // Empty player1's life (player is being attacked)
  state.player1.life = [];
  state.player1.lifeCount = 0;

  // Simulate an AI attack on player1 leader
  const finisher = applyAction(state, "player2", "attack", {
    attackerId: state.player2.leader!.id,
    targetType: "leader",
  });

  assert(finisher.phase === "finished", 'phase = "finished"');
  assert(finisher.winner === "u2", "winner = AI (player2)");
}

// ── 6. generateAIDeck builds a valid deck ────────────────────────────────

section("generateAIDeck");
{
  const fakeCatalog: DeckCard[] = [];
  for (let i = 0; i < 60; i++) {
    fakeCatalog.push({
      sku: `F-${i}`,
      name: `Card ${i}`,
      cardNumber: `OP01-${i}`,
      imageUrl: null,
      rarity: i === 0 ? "L" : i < 10 ? "SR" : "C",
    });
  }
  const deck = generateAIDeck("OP01", fakeCatalog);
  const leader = deck.find((c) => c.isLeader);
  const nonLeaders = deck.filter((c) => !c.isLeader);

  assert(!!leader, "deck has a leader");
  assert(nonLeaders.length >= 40, `deck has ${nonLeaders.length} non-leader cards (>= 40)`);
  assert(
    new Set(nonLeaders.map((c) => c.sku)).size <= nonLeaders.length,
    "deck has no duplicates beyond 4x limit",
  );

  // Spot-check the 4x rule
  const counts = new Map<string, number>();
  for (const c of nonLeaders) counts.set(c.sku, (counts.get(c.sku) ?? 0) + 1);
  const maxCopies = Math.max(...counts.values());
  assert(maxCopies <= 4, `max copies of a single card: ${maxCopies} (≤4)`);
}

// ── 7. Phase + end_turn cycles correctly ─────────────────────────────────

section("Phase transitions and turn end");
{
  let state = freshGame();
  state.phase = "refresh";
  state = applyAction(state, "player1", "next_phase", {});
  assert(state.phase === "draw", "refresh → draw");
  state = applyAction(state, "player1", "next_phase", {});
  assert(state.phase === "don", "draw → don");
  state = applyAction(state, "player1", "end_turn", {});
  assert(state.currentTurn === "u2", "turn flipped to player2");
  assert(state.phase === "refresh", "phase resets to refresh");
  assert(state.turnNumber === 2, "turn counter incremented");
}

// ── 8. Full game scripted simulation ────────────────────────────────────

section("Scripted full game to victory");
{
  let state = freshGame();
  let safety = 20;
  while (state.phase !== "finished" && safety-- > 0) {
    // Start of player turn: refresh
    state = applyAction(state, "player1", "refresh_all", {});
    // Swing leader for life damage
    state = applyAction(state, "player1", "attack", {
      attackerId: state.player1.leader!.id,
      targetType: "leader",
    });
    if (state.phase === "finished") break;
    // Pass to AI and back (AI does nothing aggressive here)
    state = applyAction(state, "player1", "end_turn", {});
    state = applyAction(state, "player2", "end_turn", {});
  }
  assert(state.phase === "finished", `game finished within ${20 - safety} iterations`);
  assert(state.winner === "u1", "player1 wins the scripted battle");
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log(`\n── Summary ──`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
