/**
 * nen-classifier.ts — Maps whitehack findings to Nen types and Solo Leveling gate ranks.
 *
 * The compounding loop:
 *   whitehack scan → classify findings by nen type → generate gates ranked by severity
 *   → hunters clear gates → clearing deepens understanding → new checks emerge → scan again
 *
 * Every whitehack check maps to:
 *   - A Nen type (which kind of hunter excels at fixing it)
 *   - A Clear Standard principle (what truth it enforces)
 *   - A base severity (how dangerous the lie is)
 *
 * Gate rank is determined by: base severity × finding count × nen affinity bonus.
 * A repo with 20 silent-failure findings is an A-rank gate for an Enhancer.
 * The same repo with 2 findings is a C-rank gate.
 */

// ── WHITEHACK CHECK → NEN TYPE MAPPING ──
// Each check maps to the nen type whose hunter is best suited to fix it.

import type { NenType, GateRank, HunterRank } from "./hunter-engine";

export interface CheckClassification {
  check_id: string;
  nen_type: NenType;
  clear_standard_principle: number; // CS#1-6
  base_severity: "heuristic" | "medium-high";
  nen_bonus: number; // XP multiplier when a matching-nen hunter clears it
}

export const CHECK_CLASSIFICATIONS: Record<string, CheckClassification> = {
  "silent-failure": {
    check_id: "silent-failure",
    nen_type: "enhancer",
    clear_standard_principle: 2, // CS#2 — failed reads surface honestly
    base_severity: "medium-high",
    nen_bonus: 1.5, // Enhancers get 50% bonus XP for security fixes
  },
  "hardcoded-secret": {
    check_id: "hardcoded-secret",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 2.0, // Secrets are critical security — double XP
  },
  "exposed-config": {
    check_id: "exposed-config",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 2.0,
  },
  "unsafe-eval": {
    check_id: "unsafe-eval",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 2.0, // RCE risk — double XP
  },
  "cache-as-live": {
    check_id: "cache-as-live",
    nen_type: "conjurer", // schema/architecture — data modeling
    clear_standard_principle: 4, // CS#4 — stated freshness
    base_severity: "heuristic",
    nen_bonus: 1.2,
  },
  "stale-oracle": {
    check_id: "stale-oracle",
    nen_type: "emitter", // API/integration — price feeds
    clear_standard_principle: 4,
    base_severity: "medium-high",
    nen_bonus: 1.5,
  },
  "spot-price-as-fair": {
    check_id: "spot-price-as-fair",
    nen_type: "emitter",
    clear_standard_principle: 1, // CS#1 — exact values
    base_severity: "heuristic",
    nen_bonus: 1.3,
  },
  "unchecked-transfer": {
    check_id: "unchecked-transfer",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 1.8, // Financial safety — high bonus
  },
  "float-money": {
    check_id: "float-money",
    nen_type: "conjurer", // data model — needs architectural fix
    clear_standard_principle: 1,
    base_severity: "medium-high",
    nen_bonus: 1.5,
  },
  "silent-revert": {
    check_id: "silent-revert",
    nen_type: "transmuter", // UI/UX — user-facing transparency
    clear_standard_principle: 3, // CS#3 — inspectable decisions
    base_severity: "heuristic",
    nen_bonus: 1.2,
  },
  "decision-without-why": {
    check_id: "decision-without-why",
    nen_type: "transmuter",
    clear_standard_principle: 3,
    base_severity: "heuristic",
    nen_bonus: 1.3,
  },
  "insecure-protocol": {
    check_id: "insecure-protocol",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 1.8,
  },
  "disabled-cert-verification": {
    check_id: "disabled-cert-verification",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "high",
    nen_bonus: 2.0,
  },
  "weak-crypto": {
    check_id: "weak-crypto",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 1.8,
  },
  "cors-wildcard": {
    check_id: "cors-wildcard",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 1.5,
  },
  "cookie-insecure": {
    check_id: "cookie-insecure",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "medium-high",
    nen_bonus: 1.5,
  },
  "sql-injection": {
    check_id: "sql-injection",
    nen_type: "enhancer",
    clear_standard_principle: 2,
    base_severity: "high",
    nen_bonus: 2.0,
  },
};

// ── GATE RANK CALCULATION ──
// Finding count + severity + nen affinity → gate rank

export function calculateGateRank(
  findings: { check_id: string; severity: string }[],
  hunterNenType?: NenType,
): GateRank {
  let score = 0;

  for (const f of findings) {
    const cls = CHECK_CLASSIFICATIONS[f.check_id];
    if (!cls) {
      score += f.severity === "medium-high" ? 3 : 1;
      continue;
    }

    // Base score from severity
    score += f.severity === "medium-high" ? 3 : 1;

    // Nen affinity bonus — if the hunter's nen matches the check's nen, the gate is easier for them
    // (lower effective rank because they can clear it faster)
    if (hunterNenType && cls.nen_type === hunterNenType) {
      score -= 1; // affinity makes it easier
    }

    // Critical checks bump the score
    if (cls.base_severity === "medium-high" && cls.nen_bonus >= 2.0) {
      score += 2; // secrets, RCE — always dangerous
    }
  }

  // Score → rank mapping
  if (score >= 30) return "S";
  if (score >= 20) return "A";
  if (score >= 12) return "B";
  if (score >= 6)  return "C";
  if (score >= 3)  return "D";
  return "E";
}

// ── XP CALCULATION WITH NEN BONUS ──
// Base XP from gate rank × nen bonus for matching checks

export function calculateXpReward(
  gateRank: GateRank,
  findings: { check_id: string }[],
  hunterNenType: NenType,
): number {
  const baseXp: Record<GateRank, number> = {
    E: 50, D: 100, C: 200, B: 400, A: 800, S: 2000,
  };

  let xp = baseXp[gateRank];

  // Nen bonus: for each finding whose check matches the hunter's nen type, multiply
  let matchingFindings = 0;
  for (const f of findings) {
    const cls = CHECK_CLASSIFICATIONS[f.check_id];
    if (cls && cls.nen_type === hunterNenType) {
      matchingFindings++;
    }
  }

  // Each matching finding adds its nen_bonus as a percentage
  for (const f of findings) {
    const cls = CHECK_CLASSIFICATIONS[f.check_id];
    if (cls && cls.nen_type === hunterNenType) {
      xp += Math.floor(baseXp[gateRank] * (cls.nen_bonus - 1) / findings.length);
    }
  }

  return xp;
}

// ── GATE GENERATION FROM WHITEHACK SCAN ──
// Takes a whitehack scan result and produces a Gate ready for the system.

export interface WhitehackFinding {
  check_id: string;
  file: string;
  line: number;
  severity: "heuristic" | "medium-high";
  message: string;
  snippet: string;
}

export interface GeneratedGate {
  repo: string;
  title: string;
  gate_rank: GateRank;
  findings: WhitehackFinding[];
  nen_types_involved: NenType[];
  xp_reward: number;
  aura_cost: number;
  description: string;
}

export function generateGateFromScan(
  repo: string,
  findings: WhitehackFinding[],
  hunterNenType?: NenType,
): GeneratedGate {
  // Collect unique nen types involved
  const nenTypes = new Set<NenType>();
  for (const f of findings) {
    const cls = CHECK_CLASSIFICATIONS[f.check_id];
    if (cls) nenTypes.add(cls.nen_type);
  }

  // Calculate gate rank
  const gateRank = calculateGateRank(findings, hunterNenType);

  // Calculate XP (use the hunter's nen if provided, else the dominant nen in findings)
  const dominantNen = hunterNenType ?? Array.from(nenTypes)[0] ?? "enhancer";
  const xpReward = calculateXpReward(gateRank, findings, dominantNen);

  // Aura cost
  const auraCosts: Record<GateRank, number> = {
    E: 10, D: 20, C: 40, B: 70, A: 120, S: 200,
  };

  // Description
  const nenNames = Array.from(nenTypes).map(n => n.charAt(0).toUpperCase() + n.slice(1));
  const findingCount = findings.length;
  const mediumHigh = findings.filter(f => f.severity === "medium-high").length;

  return {
    repo,
    title: `${repo} — ${findingCount} honesty finding${findingCount !== 1 ? "s" : ""} (${mediumHigh} medium-high)`,
    gate_rank: gateRank,
    findings,
    nen_types_involved: Array.from(nenTypes),
    xp_reward: xpReward,
    aura_cost: auraCosts[gateRank],
    description: `Gate generated by whitehack scan. Nen types: ${nenNames.join(", ")}. ` +
      `${findingCount} findings (${mediumHigh} medium-high severity). ` +
      `Clear Standard principles violated: ${[...new Set(findings.map(f => CHECK_CLASSIFICATIONS[f.check_id]?.clear_standard_principle).filter(Boolean))].join(", ")}.`,
  };
}

// ── COMPOUNDING UNDERSTANDING ──
// When a hunter clears a gate, they gain understanding.
// That understanding can generate NEW checks — patterns they've learned to spot.
// This is the compounding loop: each fix teaches the next check.

export interface UnderstandingGain {
  hunter_id: string;
  check_ids_cleared: string[];
  nen_type: NenType;
  xp_gained: number;
  new_understanding: string[]; // descriptions of patterns learned
  suggested_new_checks: string[]; // potential new whitehack checks
}

export function processGateClear(
  hunterNenType: NenType,
  findingsCleared: WhitehackFinding[],
  xpGained: number,
): UnderstandingGain {
  const checkIds = [...new Set(findingsCleared.map(f => f.check_id))];
  const newUnderstanding: string[] = [];
  const suggestedChecks: string[] = [];

  // Each cleared finding type generates understanding
  for (const checkId of checkIds) {
    const cls = CHECK_CLASSIFICATIONS[checkId];
    if (!cls) continue;

    const principle = cls.clear_standard_principle;
    newUnderstanding.push(
      `CS#${principle}: mastered "${checkId}" pattern — can now spot it instinctively`
    );

    // If the hunter has cleared 5+ of the same check type, suggest a deeper check
    const count = findingsCleared.filter(f => f.check_id === checkId).length;
    if (count >= 5) {
      suggestedChecks.push(
        `${checkId}-deep: a data-flow version of ${checkId} that traces the lie through the call graph, not just the name`
      );
    }
  }

  // Cross-check understanding: if a hunter cleared both silent-failure AND cache-as-live,
  // they understand the broader pattern of "hidden state"
  if (checkIds.includes("silent-failure") && checkIds.includes("cache-as-live")) {
    newUnderstanding.push(
      "Cross-pattern: hidden state — both cached values and swallowed failures are forms of invisible state. The hunter now sees both as one."
    );
    suggestedChecks.push(
      "hidden-state: a meta-check that flags any function returning a value without provenance where the input could have failed or been stale"
    );
  }

  if (checkIds.includes("hardcoded-secret") && checkIds.includes("exposed-config")) {
    newUnderstanding.push(
      "Cross-pattern: credential surface — hardcoded secrets and exposed configs are the same vulnerability at different layers"
    );
    suggestedChecks.push(
      "credential-surface: a check that traces credentials from source to usage, flagging any path that touches a hardcoded or config-exposed value"
    );
  }

  if (checkIds.includes("float-money") && checkIds.includes("spot-price-as-fair")) {
    newUnderstanding.push(
      "Cross-pattern: numeric dishonesty — floating-point money and spot-price-as-fair are both lies about exactness"
    );
    suggestedChecks.push(
      "numeric-dishonesty: a check that flags any numeric value presented as exact when its computation introduces uncertainty"
    );
  }

  return {
    hunter_id: "", // filled by caller
    check_ids_cleared: checkIds,
    nen_type: hunterNenType,
    xp_gained: xpGained,
    new_understanding: newUnderstanding,
    suggested_new_checks: suggestedChecks,
  };
}

// ── LEVEL → UNDERSTANDING DEPTH ──
// Higher level hunters see deeper. At each level threshold, they unlock new perception.

export interface PerceptionTier {
  min_level: number;
  name: string;
  description: string;
  unlocks: string[];
}

export const PERCEPTION_TIERS: PerceptionTier[] = [
  {
    min_level: 1,
    name: "Ten (点)",
    description: "Basic technique — see surface patterns",
    unlocks: ["silent-failure", "silent-revert", "hardcoded-secret"],
  },
  {
    min_level: 10,
    name: "Zetsu (舌)",
    description: "Suppress noise — distinguish real threats from false positives",
    unlocks: ["cache-as-live", "decision-without-why", "exposed-config"],
  },
  {
    min_level: 25,
    name: "Ren (練)",
    description: "Amplify perception — see cross-patterns and meta-lies",
    unlocks: ["hidden-state", "credential-surface", "numeric-dishonesty"],
  },
  {
    min_level: 50,
    name: "Hatsu (發)",
    description: "Release your ability — create new checks from understanding",
    unlocks: ["custom-check-authoring", "data-flow-analysis", "call-graph-tracing"],
  },
  {
    min_level: 100,
    name: "Ken (堅)",
    description: "Full guard — see the entire system's honesty surface at once",
    unlocks: ["system-level-audit", "cross-repo-pattern-detection", "architecture-honesty"],
  },
  {
    min_level: 200,
    name: "Kou (虹)",
    description: "The sovereign eye — see lies that haven't been written yet",
    unlocks: ["predictive-honesty", "design-pattern-lies", "spec-vs-implementation-drift"],
  },
];

export function getPerceptionTier(level: number): PerceptionTier {
  let tier = PERCEPTION_TIERS[0];
  for (const t of PERCEPTION_TIERS) {
    if (level >= t.min_level) tier = t;
  }
  return tier;
}

export function getUnlockedChecks(level: number): string[] {
  const unlocked: string[] = [];
  for (const tier of PERCEPTION_TIERS) {
    if (level >= tier.min_level) {
      unlocked.push(...tier.unlocks);
    }
  }
  return unlocked;
}