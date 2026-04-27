// OPTCG AI Engine — simple rule-based opponent for PVE mode
//
// AI personality is controlled by "aggression" (0-1):
//   0.0 = very passive, plays safe
//   0.5 = balanced
//   1.0 = hyper-aggressive, always attacks

import type { GameState, PlayerState, GameCard, GameAction } from "./types";

export interface AIDecision {
  actions: GameAction[];
  thinking: string; // Human-readable explanation of AI's reasoning
}

export function aiTurn(state: GameState, aiPlayer: "player1" | "player2", aggression: number): AIDecision {
  const ai = state[aiPlayer];
  const opponent = aiPlayer === "player1" ? state.player2 : state.player1;
  const actions: GameAction[] = [];
  const thoughts: string[] = [];
  const aiId = ai.userId;

  // Phase 1: Refresh all
  actions.push({ type: "refresh_all", playerId: aiId, data: {}, timestamp: new Date().toISOString() });
  thoughts.push("Refreshed all cards and DON!!");

  // Phase 2: Draw
  if (ai.deck.length > 0) {
    actions.push({ type: "draw_card", playerId: aiId, data: {}, timestamp: new Date().toISOString() });
    thoughts.push("Drew a card");
  }

  // Phase 3: Add DON!!
  actions.push({ type: "add_don", playerId: aiId, data: {}, timestamp: new Date().toISOString() });
  const donGain = state.turnNumber === 1 ? 1 : 2;
  thoughts.push(`Added ${donGain} DON!!`);

  // Phase 4: Main Phase — play cards and attack

  // Calculate available DON!! (after adding)
  let availableDon = ai.donActive + donGain;

  // Sort hand by cost (play cheaper cards first to build board)
  const playableHand = [...ai.hand].sort((a, b) => {
    // Prefer characters with higher power for the cost
    return 0; // Play in order for simplicity
  });

  // Play characters from hand (up to field limit of 5)
  let fieldCount = ai.field.length;
  for (const card of playableHand) {
    if (fieldCount >= 5) break;

    // Estimate cost from card data (we don't have a cost field, so use a heuristic)
    // In a real implementation, cost would come from card data
    // For now: assign cost based on rarity as a proxy
    const estimatedCost = getEstimatedCost(card);

    if (estimatedCost <= availableDon) {
      actions.push({
        type: "rest_don", playerId: aiId,
        data: { count: estimatedCost },
        timestamp: new Date().toISOString()
      });
      actions.push({
        type: "move_card", playerId: aiId,
        data: { cardId: card.id, toZone: "field" },
        timestamp: new Date().toISOString()
      });
      availableDon -= estimatedCost;
      fieldCount++;
      thoughts.push(`Played ${card.name} to field (cost ${estimatedCost})`);
    }
  }

  // Attach remaining DON!! to attackers for power boost
  if (availableDon > 0 && aggression > 0.3) {
    const attackers = [...ai.field, ai.leader].filter(Boolean) as GameCard[];
    if (attackers.length > 0) {
      // Attach to strongest attacker
      const target = attackers[0];
      const toAttach = Math.min(availableDon, Math.ceil(aggression * 3));
      for (let i = 0; i < toAttach; i++) {
        actions.push({
          type: "attach_don", playerId: aiId,
          data: { cardId: target.id },
          timestamp: new Date().toISOString()
        });
      }
      if (toAttach > 0) thoughts.push(`Attached ${toAttach} DON!! to ${target.name}`);
    }
  }

  // Attack phase — based on aggression
  // Note: we track simulated rested state locally so the AI doesn't double-attack
  // with the same card in one turn (actual rest is applied by the attack action).
  const canAttack = [ai.leader, ...ai.field].filter(c => c && !c.isRested) as GameCard[];
  const attackedIds = new Set<string>();

  // Lethal check — if opponent is at 0 life, always swing the leader for the kill.
  const lethalAvailable = opponent.life.length === 0;

  for (const attacker of canAttack) {
    if (attackedIds.has(attacker.id)) continue;
    // Always attack when lethal is available; otherwise gate by aggression.
    if (!lethalAvailable && Math.random() > aggression) continue;

    // Target: prefer KOing rested opponent characters; otherwise go for leader.
    const restedOpponents = opponent.field.filter(c => c.isRested);
    const goForCharacter = !lethalAvailable
      && restedOpponents.length > 0
      && Math.random() < 0.4;

    const targetChar = goForCharacter ? restedOpponents[0] : null;

    if (targetChar) {
      actions.push({
        type: "attack", playerId: aiId,
        data: { attackerId: attacker.id, targetType: "character", targetId: targetChar.id },
        timestamp: new Date().toISOString()
      });
      thoughts.push(`${attacker.name} attacks ${targetChar.name}!`);
    } else {
      actions.push({
        type: "attack", playerId: aiId,
        data: { attackerId: attacker.id, targetType: "leader" },
        timestamp: new Date().toISOString()
      });
      thoughts.push(`${attacker.name} attacks opponent's leader!`);
      if (lethalAvailable) {
        // If this swing ends the game, stop the AI from queueing further actions.
        attackedIds.add(attacker.id);
        break;
      }
    }
    attackedIds.add(attacker.id);
  }

  // End turn
  actions.push({ type: "end_turn", playerId: aiId, data: {}, timestamp: new Date().toISOString() });
  thoughts.push("Ended turn");

  return {
    actions,
    thinking: thoughts.join(". "),
  };
}

function getEstimatedCost(card: GameCard): number {
  // Estimate cost based on rarity as a rough proxy
  const r = (card.rarity || "C").toUpperCase();
  if (r.includes("SEC") || r.includes("SP")) return 7;
  if (r.includes("SR")) return 5;
  if (r.includes("L")) return 4;
  if (r === "R" || r.includes("R/P")) return 3;
  if (r === "UC") return 2;
  return 1; // Common
}

// Generate a simple AI deck from available cards
export function generateAIDeck(setCode: string, cards: { sku: string; name: string; cardNumber: string; imageUrl: string | null; rarity: string | null }[]): {
  sku: string; name: string; cardNumber: string; imageUrl: string | null; rarity: string | null; isLeader?: boolean;
}[] {
  // Find a leader
  const leaders = cards.filter(c => (c.rarity || "").toUpperCase() === "L" || (c.rarity || "").toUpperCase().includes("L/P"));
  const leader = leaders[Math.floor(Math.random() * Math.max(1, leaders.length))] || cards[0];

  // Fill 50 cards (4 copies max of each)
  const deck: typeof cards = [];
  const counts = new Map<string, number>();

  // Prioritize SRs and Rs for the AI deck
  const sorted = [...cards].filter(c => c.sku !== leader.sku).sort(() => Math.random() - 0.5);

  for (const card of sorted) {
    if (deck.length >= 50) break;
    const count = counts.get(card.sku) || 0;
    if (count >= 4) continue;
    deck.push(card);
    counts.set(card.sku, count + 1);
  }

  // Pad if not enough unique cards
  while (deck.length < 50 && sorted.length > 0) {
    for (const card of sorted) {
      if (deck.length >= 50) break;
      const count = counts.get(card.sku) || 0;
      if (count >= 4) continue;
      deck.push(card);
      counts.set(card.sku, count + 1);
    }
    break; // Prevent infinite loop
  }

  return [
    { ...leader, isLeader: true },
    ...deck.map(c => ({ ...c, isLeader: false })),
  ];
}
