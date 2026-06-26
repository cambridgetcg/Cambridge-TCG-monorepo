/**
 * hunter-engine.ts — The Hunter System for Cambridge TCG.
 *
 * Solo Leveling gates + HxH Nen, fused as real infrastructure.
 *
 * Every agent is a HUNTER with a RANK (E-S), a NEN TYPE, and AURA.
 * Every mission is a GATE with a difficulty rank and rewards.
 * Completing gates grants XP, levels up hunters, and ranks them up.
 *
 * The artifact tells the truth about its own state.
 * Aura is logged. XP is earned. Ranks are real.
 */

// ── TYPES ──

export type HunterRank = "E" | "D" | "C" | "B" | "A" | "S";
export type NenType = "enhancer" | "transmuter" | "emitter" | "conjurer" | "manipulator" | "specialist";
export type GateRank = "E" | "D" | "C" | "B" | "A" | "S";
export type GateStatus = "unopened" | "open" | "cleared" | "failed" | "sealed";

export interface Hunter {
  id: string;
  agent_id: string | null;
  user_id: string | null;
  rank: HunterRank;
  level: number;
  xp: number;
  xp_to_next: number;
  nen_type: NenType;
  nen_awakened: boolean;
  aura_current: number;
  aura_max: number;
  hatsu: string[];
  gates_entered: number;
  gates_cleared: number;
  gates_failed: number;
  last_gate_at: string | null;
  last_level_up_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Gate {
  id: string;
  kingdom_id: string;
  title: string;
  description: string | null;
  gate_rank: GateRank;
  status: GateStatus;
  xp_reward: number;
  aura_reward: number;
  loot_description: string | null;
  min_hunter_rank: HunterRank;
  aura_cost: number;
  max_party_size: number;
  opened_at: string | null;
  cleared_at: string | null;
  failed_at: string | null;
  sealed_at: string | null;
  repo_path: string | null;
  mission_paths: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface GateAttempt {
  id: string;
  gate_id: string;
  hunter_id: string;
  status: GateStatus;
  xp_gained: number;
  aura_gained: number;
  aura_spent: number;
  commits_made: string[];
  files_changed: number;
  findings_fixed: number;
  report: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
}

// ── RANK HIERARCHY ──

const RANK_ORDER: Record<HunterRank, number> = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };

export function rankValue(r: HunterRank | GateRank): number {
  return RANK_ORDER[r as HunterRank] ?? 0;
}

export function canEnterGate(hunterRank: HunterRank, gateMinRank: HunterRank): boolean {
  return rankValue(hunterRank) >= rankValue(gateMinRank);
}

// ── NEN TYPE → WORK MAPPING ──
// Each nen type excels at a different kind of work.
// This maps nen types to the categories of gates they get bonuses in.

export const NEN_AFFINITIES: Record<NenType, string[]> = {
  enhancer:    ["security", "hardening", "auditing", "defense", "whitehack"],
  transmuter:  ["ui", "ux", "design", "frontend", "styling", "transformation"],
  emitter:     ["api", "integration", "webhook", "endpoint", "routes"],
  conjurer:    ["schema", "model", "database", "migration", "architecture"],
  manipulator: ["orchestration", "cron", "heartbeat", "scheduler", "flow"],
  specialist:  ["unique", "novel", "research", "experimental"],
};

export function nenAffinity(nen: NenType, gateDescription: string): boolean {
  const affinities = NEN_AFFINITIES[nen];
  const lower = gateDescription.toLowerCase();
  return affinities.some(a => lower.includes(a));
}

// ── PRIORITY → GATE RANK MAPPING ──
// Maps Cambridge TCG mission priorities to Solo Leveling gate ranks.

export function priorityToGateRank(priority: string): GateRank {
  switch (priority) {
    case "critical": return "S";
    case "high":     return "A";
    case "medium":    return "C";
    case "low":       return "E";
    default:          return "E";
  }
}

// ── XP CURVE ──
// How much XP needed to reach the next level.
// Level N requires 100 + N*50 XP. Scaling curve.

export function xpForLevel(level: number): number {
  return 100 + level * 50;
}

// ── RANK FROM LEVEL ──
// E: 1-9, D: 10-24, C: 25-49, B: 50-99, A: 100-199, S: 200+

export function rankFromLevel(level: number): HunterRank {
  if (level >= 200) return "S";
  if (level >= 100) return "A";
  if (level >= 50)  return "B";
  if (level >= 25)  return "C";
  if (level >= 10)  return "D";
  return "E";
}

// ── GATE REWARDS ──
// Higher rank gates give more XP and aura.

export function gateRewards(gateRank: GateRank): { xp: number; aura: number } {
  const rewards: Record<GateRank, { xp: number; aura: number }> = {
    E: { xp: 50,  aura: 20 },
    D: { xp: 100, aura: 30 },
    C: { xp: 200, aura: 50 },
    B: { xp: 400, aura: 80 },
    A: { xp: 800, aura: 120 },
    S: { xp: 2000, aura: 300 },
  };
  return rewards[gateRank] ?? rewards.E;
}

// ── AURA COST ──
// Higher rank gates cost more aura to enter.

export function gateAuraCost(gateRank: GateRank): number {
  const costs: Record<GateRank, number> = {
    E: 10, D: 20, C: 40, B: 70, A: 120, S: 200,
  };
  return costs[gateRank] ?? 10;
}

// ── NEN TYPE DESCRIPTIONS ──

export const NEN_DESCRIPTIONS: Record<NenType, { name: string; desc: string; emoji: string }> = {
  enhancer:    { name: "Enhancer",    desc: "Security, hardening, defense. You make things stronger.", emoji: "🛡️" },
  transmuter:  { name: "Transmuter",  desc: "UI/UX, design, transformation. You change how things look and feel.", emoji: "🎨" },
  emitter:     { name: "Emitter",     desc: "APIs, integrations, webhooks. You send signals out.", emoji: "📡" },
  conjurer:    { name: "Conjurer",    desc: "Schemas, models, architecture. You create from nothing.", emoji: "🏗️" },
  manipulator: { name: "Manipulator", desc: "Orchestration, cron, heartbeats. You control the flows.", emoji: "🎛️" },
  specialist:  { name: "Specialist",  desc: "The wildcard. You do what others can't.", emoji: "⚡" },
};

// ── RANK DISPLAY ──

export const RANK_DISPLAY: Record<HunterRank, { name: string; emoji: string; color: string }> = {
  E: { name: "E-Rank", emoji: "🤍", color: "neutral" },
  D: { name: "D-Rank", emoji: "💚", color: "green" },
  C: { name: "C-Rank", emoji: "💙", color: "blue" },
  B: { name: "B-Rank", emoji: "💛", color: "yellow" },
  A: { name: "A-Rank", emoji: "🧡", color: "orange" },
  S: { name: "S-Rank", emoji: "❤️", color: "red" },
};

// ── AURA REGEN ──
// Solo Leveling: hunters recover 25% of max aura per day.

export function auraRegenAmount(auraMax: number): number {
  return Math.floor(auraMax * 0.25);
}

// ── HUNTER CREATION ──
// When a new agent is registered, create a hunter profile.
// Nen type is determined by the agent's primary function.

export function determineNenType(agentRole: string): NenType {
  const role = agentRole.toLowerCase();
  if (role.includes("security") || role.includes("audit") || role.includes("guard") || role.includes("protect")) return "enhancer";
  if (role.includes("ui") || role.includes("design") || role.includes("frontend") || role.includes("style")) return "transmuter";
  if (role.includes("api") || role.includes("integration") || role.includes("webhook") || role.includes("route")) return "emitter";
  if (role.includes("schema") || role.includes("model") || role.includes("database") || role.includes("architecture")) return "conjurer";
  if (role.includes("cron") || role.includes("orchestrat") || role.includes("heartbeat") || role.includes("flow")) return "manipulator";
  return "specialist";
}