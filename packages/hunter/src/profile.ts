// profile.ts — hunter profile integrating Solo Leveling + HxH Nen
// A hunter has a level (SL), a Nen type (HxH), and gates they can enter.

import type { NenType } from "./nen.js";
import type { GateRank, HunterRank, Gate, GateClearReward } from "./gate.js";
import { rankForLevel, canEnterGate, computeGateReward } from "./gate.js";

export interface HunterProfile {
  id: string;
  actorId: string;
  actorKind: "player" | "agent";
  displayName: string;
  level: number;
  xp: number;
  rank: HunterRank;
  nenType: NenType | null;
  nenTechniques: string[];
  hatsu: string[]; // hatsu IDs
  matchesPlayed: number;
  matchesWon: number;
  questsCompleted: number;
  gatesCleared: number;
  lastActiveAt: string;
}

export function awakenHunter(actorId: string, actorKind: "player" | "agent", displayName: string): HunterProfile {
  return {
    id: `hunter-${actorId}`,
    actorId,
    actorKind,
    displayName,
    level: 1,
    xp: 0,
    rank: "E",
    nenType: null,
    nenTechniques: ["Ten"], // everyone starts with Ten
    hatsu: [],
    matchesPlayed: 0,
    matchesWon: 0,
    questsCompleted: 0,
    gatesCleared: 0,
    lastActiveAt: new Date().toISOString(),
  };
}

export function xpForLevel(level: number): number {
  // Each level requires more XP: level N needs N*100 XP to advance
  return level * 100;
}

export function applyXp(profile: HunterProfile, xpGain: number): HunterProfile {
  const newXp = profile.xp + xpGain;
  let newLevel = profile.level;
  let needed = xpForLevel(newLevel);
  while (newXp >= profile.xp + needed && newLevel < 999) {
    newLevel++;
    needed = xpForLevel(newLevel);
  }
  const rank = rankForLevel(newLevel);
  return {
    ...profile,
    level: newLevel,
    xp: newXp,
    rank,
    lastActiveAt: new Date().toISOString(),
  };
}

export function canEnter(profile: HunterProfile, gateRank: GateRank): boolean {
  return canEnterGate(profile.rank, gateRank);
}

export function clearGate(profile: HunterProfile, gate: Gate): { profile: HunterProfile; reward: GateClearReward } {
  const reward = computeGateReward(gate, profile.level);
  const updated = applyXp(profile, reward.xp);
  return {
    profile: { ...updated, gatesCleared: updated.gatesCleared + 1 },
    reward,
  };
}
