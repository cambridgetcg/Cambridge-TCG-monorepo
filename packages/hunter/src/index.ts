/**
 * @module @cambridge-tcg/hunter
 *
 * Hunter infrastructure for Cambridge TCG — Solo Leveling × Hunter x Hunter.
 *
 * Solo Leveling: gates (dungeons), ranks (E → Monarch), daily quests, XP progression
 * Hunter x Hunter: Nen types (6 via water divination), Hatsu (abilities), affinity
 * Integration: a hunter has a level (SL) + a Nen type (HxH). Nen type determines
 * ability efficiency. Level determines gate access. Abilities boost PVE + market.
 */

// ── Re-exports from QWENTHOS's modules ────────────────────────────────────

// Nen system (Hunter x Hunter)
export {
  NEN_TYPES,
  NEN_DISPLAY,
  affinity,
  divineNenType,
  effectivePower,
  KNOWN_HATSU,
} from "./nen.js";
export type { NenType, HunterBehavior, Hatsu, HatsuEffect } from "./nen.js";

// Gate system (Solo Leveling)
export {
  GATE_RANKS,
  RANK_ORDER,
  RANK_DISPLAY,
  HUNTER_RANKS,
  rankForLevel,
  canEnterGate,
  spawnGate,
  spawnDailyGates,
  computeGateReward,
} from "./gate.js";
export type { GateRank, HunterRank, Gate, GateClearReward } from "./gate.js";

// Hunter profile (integration)
export {
  awakenHunter,
  applyXp,
  canEnter,
  clearGate,
  xpForLevel,
} from "./profile.js";
export type { HunterProfile } from "./profile.js";

// ── Daily Quests ─────────────────────────────────────────────────────────

export interface DailyQuest {
  id: string;
  name: string;
  description: string;
  xpReward: number;
  expiresAt: string;
  completed: boolean;
  gateRank?: import("./gate.js").GateRank;
}

const QUEST_TEMPLATES = [
  { name: "Daily Gate Clear", description: "Clear any gate today", xpBase: 50 },
  { name: "Red Gate Hunter", description: "Clear a red gate", xpBase: 150 },
  { name: "Rank-Appropriate", description: "Clear a gate at your current rank", xpBase: 100 },
  { name: "Double Clear", description: "Clear two gates today", xpBase: 120 },
  { name: "Market Hunter", description: "Complete a market transaction", xpBase: 40 },
  { name: "Deck Builder", description: "Modify your deck", xpBase: 30 },
];

export function generateDailyQuests(level: number): DailyQuest[] {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const count = 3 + (seed % 3);
  const quests: DailyQuest[] = [];
  const expiry = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();

  for (let i = 0; i < count; i++) {
    const template = QUEST_TEMPLATES[(seed + i) % QUEST_TEMPLATES.length];
    quests.push({
      id: `quest-${seed}-${i}`,
      name: template.name,
      description: template.description,
      xpReward: Math.round(template.xpBase * (1 + level * 0.05)),
      expiresAt: expiry,
      completed: false,
    });
  }
  return quests;
}

// ── Legacy API aliases ───────────────────────────────────────────────────

import { GATE_RANKS as _GATE_RANKS } from "./gate.js";
import type { NenType, HunterBehavior } from "./nen.js";
import { affinity as _affinity, divineNenType as _divine } from "./nen.js";

// Hunter ranks (not gate ranks): E → D → C → B → A → S → National → Monarch
export const RANKS: string[] = ["E", "D", "C", "B", "A", "S", "National", "Monarch"];

export const RANK_THRESHOLDS: Record<string, number> = {
  E: 0, D: 100, C: 500, B: 1750, A: 5000, S: 20000, national: 50000, monarch: 100000,
};

export function rankFromXP(xp: number): string {
  const ranks = ["E", "D", "C", "B", "A", "S", "national", "monarch"];
  let result = "E";
  for (const r of ranks) {
    if (xp >= RANK_THRESHOLDS[r]) result = r;
  }
  return result === "national" ? "National" : result === "monarch" ? "Monarch" : result;
}

export function nextRankXP(xp: number): { rank: string; nextRank: string; xpToNext: number } {
  const current = rankFromXP(xp);
  const ranks = ["E", "D", "C", "B", "A", "S", "National", "Monarch"];
  const idx = ranks.indexOf(current);
  const next = idx < ranks.length - 1 ? ranks[idx + 1] : current;
  const nextKey = next === "National" ? "national" : next === "Monarch" ? "monarch" : next;
  const xpToNext = next !== current ? RANK_THRESHOLDS[nextKey] - xp : 0;
  return { rank: current, nextRank: next, xpToNext };
}

const NEN_TYPE_MAP: Record<string, NenType> = {
  Enhancer: "enhancement", Emitter: "emission", Transmuter: "transmutation",
  Conjurer: "conjuration", Manipulator: "manipulation", Specialist: "specialization",
};

export function nenEfficiency(hunterType: string, abilityType: string): number {
  const h = NEN_TYPE_MAP[hunterType] ?? "enhancement";
  const a = NEN_TYPE_MAP[abilityType] ?? "enhancement";
  return _affinity(h, a);
}

export function waterDivination(traits: {
  aggression: number; defense: number; utility: number;
  creation: number; control: number; unpredictability: number;
}): string {
  const behavior: HunterBehavior = {
    pveAggression: Math.round(traits.aggression * 100),
    marketVelocity: Math.round(traits.utility * 100),
    deckCreativity: Math.round(traits.creation * 100),
    inventoryDiscipline: Math.round(traits.defense * 100),
    strategicDepth: Math.round(traits.control * 100),
    uniqueness: Math.round(traits.unpredictability * 100),
  };
  const type = _divine(behavior);
  const reverseMap: Record<NenType, string> = {
    enhancement: "Enhancer", emission: "Emitter", transmutation: "Transmuter",
    conjuration: "Conjurer", manipulation: "Manipulator", specialization: "Specialist",
  };
  return reverseMap[type];
}