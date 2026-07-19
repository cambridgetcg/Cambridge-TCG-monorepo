// OPTCG AI Engine — simple rule-based opponent for PVE mode
//
// AI personality is controlled by "aggression" (0-1):
//   0.0 = very passive, plays safe
//   0.5 = balanced
//   1.0 = hyper-aggressive, always attacks

import type { GameState, GameCard, GameAction } from "./types";

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

  const playableHand = [...ai.hand];
  const plannedPlays: GameCard[] = [];

  // Play characters from hand (up to field limit of 5)
  let fieldCount = ai.field.length;
  for (const card of playableHand) {
    if (fieldCount >= 5) break;

    // Only CHARACTERS go to the field. Events and stages have no vanilla
    // interpretation for the AI yet — fielding them created phantom
    // attackers (found by actually playing the game, 2026-07-17). Unknown
    // category (legacy decks without stats) keeps the old behavior.
    if (card.category != null && card.category !== "character") continue;

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
      plannedPlays.push(card);
      thoughts.push(`Played ${card.name} to field (cost ${estimatedCost})`);
    }
  }

  // ── Attack planning ──────────────────────────────────────────────
  // Profitable attacks are taken; aggression shapes EXPOSURE APPETITE
  // (how many attackers commit, whether blockers leave their post) and
  // DON!! spending — never a coin flip that drops a winning attack.
  // The old dice made mid-aggression opponents nap through winning
  // turns; found by playing (2026-07-19).

  const lethal = opponent.life.length === 0;
  const leaderDef = opponent.leader?.power ?? null;

  // Pool: board cards legally able to swing this turn, plus characters
  // this very plan just played that carry [Rush] (they will be on the
  // field by the time the attack action executes).
  const sick = (c: GameCard) =>
    c.zone === "field" &&
    c.turnPlayed === state.turnNumber &&
    !c.keywords?.includes("rush");
  const pool = [
    ...([ai.leader, ...ai.field].filter(Boolean) as GameCard[]).filter((c) => !sick(c)),
    ...plannedPlays.filter((c) => c.keywords?.includes("rush")),
  ];

  // War chest: a committed aggressor over-boosts its leader up front to
  // out-range counter cards (+1000 each) before the swings begin.
  if (!lethal && aggression >= 0.8 && availableDon > 0 && ai.leader) {
    const extra = Math.min(availableDon, 2);
    for (let i = 0; i < extra; i++) {
      actions.push({
        type: "attach_don", playerId: aiId,
        data: { cardId: ai.leader.id },
        timestamp: new Date().toISOString(),
      });
    }
    availableDon -= extra;
    thoughts.push(`Attached ${extra} DON!! to ${ai.leader.name}`);
  }

  // Exposure appetite: blockers hold their post below 0.7 aggression —
  // they ARE the defense. Commitment scales with aggression but a ready
  // profitable attacker never fully sits out.
  const nonBlockers = pool.filter((c) => !c.keywords?.includes("blocker"));
  const blockers = pool.filter((c) => c.keywords?.includes("blocker"));
  const committed = lethal
    ? pool
    : [...nonBlockers, ...(aggression >= 0.7 ? blockers : [])].slice(
        0,
        Math.max(1, Math.ceil(pool.length * Math.min(1, aggression + 0.34))),
      );

  const restedTargets = [...opponent.field]
    .filter((c) => c.isRested)
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  const koed = new Set<string>();
  const boosted = new Map<string, number>();

  const powerOf = (c: GameCard) =>
    (c.power ?? 0) + c.attachedDon * 1000 + (boosted.get(c.id) ?? 0) * 1000;

  for (const attacker of committed) {
    if (lethal) {
      // One clean swing on a 0-life leader ends it (CR 1-2-1-1-1).
      actions.push({
        type: "attack", playerId: aiId,
        data: { attackerId: attacker.id, targetType: "leader" },
        timestamp: new Date().toISOString(),
      });
      thoughts.push(`${attacker.name} attacks opponent's leader!`);
      break;
    }

    const power = powerOf(attacker);
    const canHitLeader =
      attacker.power == null || leaderDef == null || power >= leaderDef;

    // Best character KO: the fattest rested target this attacker beats.
    // Worth it when the leader is out of reach, when the target is fat
    // (cost 4+), or when playing cautiously (board control > face).
    const winnable = (t: GameCard) =>
      !koed.has(t.id) && (t.power == null || power >= t.power);
    const koTarget =
      restedTargets.find((t) => winnable(t) && (t.cost ?? 0) >= 2) ??
      (!canHitLeader ? restedTargets.find(winnable) : undefined);

    if (
      koTarget &&
      (!canHitLeader || (koTarget.cost ?? 0) >= 4 || aggression < 0.6)
    ) {
      actions.push({
        type: "attack", playerId: aiId,
        data: { attackerId: attacker.id, targetType: "character", targetId: koTarget.id },
        timestamp: new Date().toISOString(),
      });
      koed.add(koTarget.id);
      thoughts.push(`${attacker.name} attacks ${koTarget.name}!`);
      continue;
    }

    if (canHitLeader) {
      actions.push({
        type: "attack", playerId: aiId,
        data: { attackerId: attacker.id, targetType: "leader" },
        timestamp: new Date().toISOString(),
      });
      thoughts.push(`${attacker.name} attacks opponent's leader!`);
      continue;
    }

    // Near miss on the leader: close the deficit with DON!! when the
    // chest affords it. Sub-power attacks are free misses in the vanilla
    // game — holding back IS the correct play when the gap can't close.
    if (leaderDef != null && attacker.power != null && aggression >= 0.4) {
      const deficit = Math.ceil((leaderDef - power) / 1000);
      if (deficit > 0 && deficit <= availableDon) {
        for (let i = 0; i < deficit; i++) {
          actions.push({
            type: "attach_don", playerId: aiId,
            data: { cardId: attacker.id },
            timestamp: new Date().toISOString(),
          });
        }
        availableDon -= deficit;
        boosted.set(attacker.id, (boosted.get(attacker.id) ?? 0) + deficit);
        actions.push({
          type: "attack", playerId: aiId,
          data: { attackerId: attacker.id, targetType: "leader" },
          timestamp: new Date().toISOString(),
        });
        thoughts.push(
          `Attached ${deficit} DON!! to ${attacker.name}`,
          `${attacker.name} attacks opponent's leader!`,
        );
      }
    }
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
  // Printed cost when the card carries it (encoded starters do);
  // otherwise the historical rarity heuristic.
  if (card.cost != null) return card.cost;
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
