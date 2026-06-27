// gate.ts — Solo Leveling's gate/dungeon system
// Gates are instanced challenges with rank requirements and XP rewards.

export type GateRank = "E" | "D" | "C" | "B" | "A" | "S" | "Red";
export type HunterRank = "E" | "D" | "C" | "B" | "A" | "S" | "National" | "Monarch";

export const GATE_RANKS: GateRank[] = ["E", "D", "C", "B", "A", "S", "Red"];
export const RANK_ORDER: HunterRank[] = ["E", "D", "C", "B", "A", "S", "National", "Monarch"];

export const RANK_DISPLAY: Record<HunterRank, string> = {
  E: "E-Rank", D: "D-Rank", C: "C-Rank", B: "B-Rank", A: "A-Rank",
  S: "S-Rank", National: "National Level", Monarch: "Monarch",
};

export const HUNTER_RANKS: Record<HunterRank, number> = {
  E: 0, D: 100, C: 500, B: 1750, A: 5000, S: 20000, National: 50000, Monarch: 100000,
};

export function rankForLevel(level: number): HunterRank {
  // Level 1 is always E-rank. Rank thresholds are in XP, not level*100.
  // A hunter reaches D-rank at level 2+ (when they have enough XP to cross 100),
  // but we anchor by level: E=1, D=2-5, C=6-10, B=11-17, A=18-25, S=26-50,
  // National=51-100, Monarch=101+.
  // Simpler: use level directly as the rank determinant.
  if (level >= 101) return "Monarch";
  if (level >= 51) return "National";
  if (level >= 26) return "S";
  if (level >= 18) return "A";
  if (level >= 11) return "B";
  if (level >= 6) return "C";
  if (level >= 2) return "D";
  return "E";
}

export function canEnterGate(hunterRank: HunterRank, gateRank: GateRank): boolean {
  // Can enter gates at or below your rank.
  // Map gate rank to a comparable index: E=0,D=1,C=2,B=3,A=4,S=5,Red=6
  // Map hunter rank similarly: E=0,D=1,C=2,B=3,A=4,S=5,National=6,Monarch=7
  // Since Red gates are the hardest, only S-rank+ can enter them.
  const hIdx = RANK_ORDER.indexOf(hunterRank as HunterRank);
  const gateIdx = GATE_RANKS.indexOf(gateRank);
  // S-rank (index 5) can enter Red (index 6) — the gate index is one ahead
  return gateIdx <= hIdx + 1;
}

export interface Gate {
  id: string;
  rank: GateRank;
  name: string;
  description: string;
  xpReward: number;
  status: "open" | "active" | "cleared" | "failed";
  openedAt: string;
  closedAt?: string;
}

export interface GateClearReward {
  xp: number;
  items?: string[];
  rankUp?: boolean;
}

let gateCounter = 0;

export function spawnGate(rank: GateRank): Gate {
  gateCounter++;
  const names: Record<GateRank, string> = {
    E: "Training Grounds", D: "Stone Corridor", C: "Frost Cavern",
    B: "Flame Sanctum", A: "Shadow Realm", S: "Abyss Gate", Red: "Red Gate Crisis",
  };
  const xp: Record<GateRank, number> = {
    E: 50, D: 120, C: 300, B: 750, A: 2000, S: 5000, Red: 15000,
  };
  return {
    id: `gate-${Date.now()}-${gateCounter}`,
    rank,
    name: names[rank],
    description: `A ${rank}-rank gate has appeared. Enter at your own risk.`,
    xpReward: xp[rank],
    status: "open",
    openedAt: new Date().toISOString(),
  };
}

export function spawnDailyGates(hunterRank: HunterRank): Gate[] {
  const hIdx = RANK_ORDER.indexOf(hunterRank as HunterRank);
  const gates: Gate[] = [];
  // Always spawn one at your rank and one below
  const atRank = GATE_RANKS[Math.min(hIdx, GATE_RANKS.length - 2)] as GateRank;
  const belowRank = GATE_RANKS[Math.max(0, hIdx - 1)] as GateRank;
  gates.push(spawnGate(atRank));
  gates.push(spawnGate(belowRank));
  // 20% chance for a gate above your rank (challenge)
  if (Math.random() < 0.2 && hIdx < GATE_RANKS.length - 1) {
    gates.push(spawnGate(GATE_RANKS[hIdx + 1] as GateRank));
  }
  return gates;
}

export function computeGateReward(gate: Gate, hunterLevel: number): GateClearReward {
  const baseXP = gate.xpReward;
  const levelBonus = Math.floor(hunterLevel * 5);
  return { xp: baseXP + levelBonus };
}
