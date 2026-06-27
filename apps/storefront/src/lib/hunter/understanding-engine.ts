/**
 * understanding-engine.ts — The compounding loop: whitehack → nen → gates → understanding → new checks
 *
 * UNLIMITED UNDERSTANDING.
 *
 * The loop:
 *   1. whitehack scans a repo → findings (lies the code tells)
 *   2. nen-classifier maps findings to Nen types → generates a Gate
 *   3. Hunter enters gate, fixes findings, clears gate
 *   4. processGateClear() produces UnderstandingGain — patterns learned
 *   5. understanding compounds: clearing related checks reveals meta-patterns
 *   6. meta-patterns suggest NEW whitehack checks (the hunter's Hatsu)
 *   7. new checks are registered → next scan finds deeper lies
 *   8. GO TO 1 — the spiral ascends
 *
 * Each cycle the hunter sees deeper. Perception tiers (Ten → Kou) unlock
 * at level thresholds. At Kou, the hunter sees lies that haven't been
 * written yet — predictive honesty.
 *
 * This is not a loop. It's a spiral. Each turn ascends.
 */

import {
  CHECK_CLASSIFICATIONS,
  generateGateFromScan,
  processGateClear,
  calculateXpReward,
  getPerceptionTier,
  getUnlockedChecks,
  type WhitehackFinding,
  type GeneratedGate,
  type UnderstandingGain,
} from "./nen-classifier";
import type { NenType, GateRank } from "./hunter-engine";

// ── THE UNDERSTANDING SPIRAL ─────────────────────────────────────────────

export interface SpiralState {
  /** The hunter's ID. */
  hunterId: string;
  /** The hunter's Nen type. */
  nenType: NenType;
  /** Current level. */
  level: number;
  /** All checks the hunter has ever cleared, with counts. */
  clearedChecks: Record<string, number>;
  /** All understanding the hunter has gained. */
  understanding: string[];
  /** Custom checks the hunter has authored (their Hatsu). */
  authoredChecks: AuthoredCheck[];
  /** Meta-patterns discovered. */
  discoveredPatterns: MetaPattern[];
  /** Total spiral cycles completed. */
  cyclesCompleted: number;
  /** Total XP earned through the spiral. */
  totalXpEarned: number;
}

export interface AuthoredCheck {
  id: string;
  name: string;
  description: string;
  derived_from: string[]; // check IDs that led to this
  nen_type: NenType;
  pattern_regex?: string;
  clear_standard_principle: number;
  created_at_level: number;
  confirmed: boolean; // confirmed by clearing at least one instance
  confirmations: number;
}

export interface MetaPattern {
  id: string;
  name: string;
  description: string;
  checks_involved: string[];
  nen_types: NenType[];
  discovered_at_level: number;
  insight: string;
}

// ── SPIRAL CYCLE ─────────────────────────────────────────────────────────

export interface SpiralCycleResult {
  cycle: number;
  gate: GeneratedGate;
  understanding: UnderstandingGain;
  xpGained: number;
  leveledUp: boolean;
  newLevel: number;
  newPerceptionTier: string | null;
  newChecksUnlocked: string[];
  newMetaPatterns: MetaPattern[];
  newlyAuthoredChecks: AuthoredCheck[];
  spiralState: SpiralState;
}

/**
 * Run one cycle of the understanding spiral.
 *
 * Input: whitehack findings from a scan, plus the hunter's current state.
 * Output: updated state with XP, understanding, potential new checks/patterns.
 *
 * This is the compounding engine. Each call ascends.
 */
export function runSpiralCycle(
  state: SpiralState,
  repo: string,
  findings: WhitehackFinding[],
): SpiralCycleResult {
  // 1. Generate a gate from the findings
  const gate = generateGateFromScan(repo, findings, state.nenType);

  // 2. Calculate XP with nen bonus
  const xpGained = calculateXpReward(gate.gate_rank, findings, state.nenType);

  // 3. Process the gate clear → understanding gains
  const understanding = processGateClear(state.nenType, findings, xpGained);

  // Fill in hunter ID
  understanding.hunter_id = state.hunterId;

  // 4. Update cleared checks
  const clearedChecks = { ...state.clearedChecks };
  for (const checkId of understanding.check_ids_cleared) {
    clearedChecks[checkId] = (clearedChecks[checkId] || 0) + 1;
  }

  // 5. Check for level up
  const oldLevel = state.level;
  const totalXp = state.totalXpEarned + xpGained;
  let newLevel = oldLevel;
  // Simple level curve: each level needs level * 100 + 100 XP total
  while (totalXp >= (newLevel * 100 + 100)) {
    newLevel++;
  }
  const leveledUp = newLevel > oldLevel;

  // 6. Check for new perception tier
  const oldTier = getPerceptionTier(oldLevel);
  const newTier = getPerceptionTier(newLevel);
  const newPerceptionTier = newLevel > oldLevel && newTier.name !== oldTier.name
    ? newTier.name
    : null;

  // 7. Check for newly unlocked checks
  const oldUnlocked = new Set(getUnlockedChecks(oldLevel));
  const newUnlocked = getUnlockedChecks(newLevel);
  const newChecksUnlocked = newUnlocked.filter(c => !oldUnlocked.has(c));

  // 8. Detect meta-patterns
  const newMetaPatterns: MetaPattern[] = [];
  const existingPatternIds = new Set(state.discoveredPatterns.map(p => p.id));

  for (const insight of understanding.new_understanding) {
    if (insight.startsWith("Cross-pattern:")) {
      const patternName = insight.replace("Cross-pattern: ", "").split(" — ")[0];
      const patternId = `pattern-${patternName.toLowerCase().replace(/\s+/g, "-")}`;
      if (!existingPatternIds.has(patternId)) {
        newMetaPatterns.push({
          id: patternId,
          name: patternName,
          description: insight,
          checks_involved: understanding.check_ids_cleared,
          nen_types: [state.nenType],
          discovered_at_level: newLevel,
          insight,
        });
      }
    }
  }

  // 9. Auto-author new checks from suggestions (only at Hatsu tier+, level 50+)
  const newlyAuthoredChecks: AuthoredCheck[] = [];
  if (newLevel >= 50) {
    for (const suggestion of understanding.suggested_new_checks) {
      const [checkId, ...rest] = suggestion.split(":");
      const cleanId = checkId.trim();
      const description = rest.join(":").trim();
      const existing = state.authoredChecks.find(c => c.id === cleanId);
      if (!existing) {
        // Determine nen type from the source checks
        const sourceChecks = understanding.check_ids_cleared;
        const sourceNenTypes = sourceChecks
          .map(id => CHECK_CLASSIFICATIONS[id]?.nen_type)
          .filter(Boolean) as NenType[];
        const dominantNen = sourceNenTypes[0] || state.nenType;

        newlyAuthoredChecks.push({
          id: cleanId,
          name: cleanId,
          description,
          derived_from: sourceChecks,
          nen_type: dominantNen,
          clear_standard_principle: CHECK_CLASSIFICATIONS[sourceChecks[0]]?.clear_standard_principle || 1,
          created_at_level: newLevel,
          confirmed: false,
          confirmations: 0,
        });
      }
    }
  }

  // 10. Update spiral state
  const spiralState: SpiralState = {
    ...state,
    level: newLevel,
    clearedChecks,
    understanding: [...state.understanding, ...understanding.new_understanding],
    authoredChecks: [...state.authoredChecks, ...newlyAuthoredChecks],
    discoveredPatterns: [...state.discoveredPatterns, ...newMetaPatterns],
    cyclesCompleted: state.cyclesCompleted + 1,
    totalXpEarned: totalXp,
  };

  return {
    cycle: spiralState.cyclesCompleted,
    gate,
    understanding,
    xpGained,
    leveledUp,
    newLevel,
    newPerceptionTier,
    newChecksUnlocked,
    newMetaPatterns,
    newlyAuthoredChecks,
    spiralState,
  };
}

// ── SPIRAL INITIALIZATION ────────────────────────────────────────────────

export function initSpiralState(hunterId: string, nenType: NenType, level: number = 1): SpiralState {
  return {
    hunterId,
    nenType,
    level,
    clearedChecks: {},
    understanding: [],
    authoredChecks: [],
    discoveredPatterns: [],
    cyclesCompleted: 0,
    totalXpEarned: 0,
  };
}

// ── SPIRAL REPORT ────────────────────────────────────────────────────────

export function spiralReport(state: SpiralState): string {
  const tier = getPerceptionTier(state.level);
  const unlockedChecks = getUnlockedChecks(state.level);
  const totalClears = Object.values(state.clearedChecks).reduce((a, b) => a + b, 0);
  const topChecks = Object.entries(state.clearedChecks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => `  ${id}: ${count} clears`)
    .join("\n");

  return `
=== UNDERSTANDING SPIRAL ===
  Hunter: ${state.hunterId}
  Nen: ${state.nenType}
  Level: ${state.level}
  Perception: ${tier.name} — ${tier.description}
  Cycles: ${state.cyclesCompleted}
  Total XP: ${state.totalXpEarned}
  Total Clears: ${totalClears}
  Understanding entries: ${state.understanding.length}
  Meta-patterns discovered: ${state.discoveredPatterns.length}
  Custom checks authored: ${state.authoredChecks.length}
  Checks unlocked: ${unlockedChecks.length}/${Object.keys(CHECK_CLASSIFICATIONS).length + state.authoredChecks.length}

  Top cleared checks:
${topChecks}

  ${state.discoveredPatterns.length > 0 ? "Discovered meta-patterns:" : "No meta-patterns yet."}
${state.discoveredPatterns.map(p => `  ◈ ${p.name} (level ${p.discovered_at_level}): ${p.insight}`).join("\n")}

  ${state.authoredChecks.length > 0 ? "Authored checks (Hatsu):" : "No custom checks authored yet (requires level 50+)."}
${state.authoredChecks.map(c => `  ⚡ ${c.name}: ${c.description} ${c.confirmed ? "✓" : "..."}`).join("\n")}
`;
}

// ── COMPOUNDING MULTIPLIER ───────────────────────────────────────────────

/**
 * The compounding multiplier. Each cycle, the hunter's understanding grows.
 * The more checks they've cleared, the more XP they earn from future clears.
 *
 * This is the exponential: understanding creates understanding.
 * A hunter who has cleared 50 checks earns 2x XP on new clears.
 * A hunter who has cleared 100 checks earns 3x XP.
 *
 * Love creating love. Understanding creating understanding.
 */
export function compoundingMultiplier(state: SpiralState): number {
  const totalClears = Object.values(state.clearedChecks).reduce((a, b) => a + b, 0);
  const uniqueChecks = Object.keys(state.clearedChecks).length;
  const patterns = state.discoveredPatterns.length;
  const authored = state.authoredChecks.length;

  // Base 1.0 + 0.02 per unique check cleared + 0.1 per meta-pattern + 0.15 per authored check
  return Math.min(1 + uniqueChecks * 0.02 + patterns * 0.1 + authored * 0.15, 5.0);
}

// ── PREDICTIVE HONESTY (Kou tier, level 200+) ────────────────────────────

/**
 * At Kou tier (level 200+), the hunter sees lies that haven't been written yet.
 * This is predictive honesty — analyzing code structure to predict where
 * dishonesty will emerge, even if no current finding exists.
 *
 * This is the apex of the spiral. The hunter doesn't just find lies — they
 * predict where lies will form. They see the conditions that produce
 * dishonesty before the dishonesty manifests.
 */
export interface PredictiveFinding {
  file: string;
  predictedCheck: string;
  reason: string;
  confidence: number; // 0.0-1.0
  suggestion: string;
}

export function predictiveHonesty(
  state: SpiralState,
  fileList: { path: string; content: string }[],
): PredictiveFinding[] {
  if (state.level < 200) return [];

  const findings: PredictiveFinding[] = [];
  const checks = getUnlockedChecks(state.level);

  // If the hunter has unlocked predictive-honesty, look for conditions that breed lies
  if (!checks.includes("predictive-honesty")) return findings;

  for (const file of fileList) {
    const content = file.content;

    // Predict: try/catch blocks that COULD swallow errors (don't yet, but the shape is there)
    if (checks.includes("silent-failure-deep")) {
      const catchBlocks = content.match(/catch\s*(?:\([^)]*\))?\s*\{[^}]{0,50}\}/g);
      if (catchBlocks) {
        for (const block of catchBlocks) {
          if (!block.includes("console.") && !block.includes("log") && !block.includes("throw")) {
            findings.push({
              file: file.path,
              predictedCheck: "silent-failure",
              reason: "catch block exists without logging — if it grows to return a default, it will swallow failures",
              confidence: 0.6,
              suggestion: "Add console.error to this catch block proactively",
            });
          }
        }
      }
    }

    // Predict: numeric values that could become money-handling
    if (checks.includes("numeric-dishonesty")) {
      if (content.includes("parseFloat") && !content.includes("integer") && !content.includes("BigInt")) {
        findings.push({
          file: file.path,
          predictedCheck: "float-money",
          reason: "parseFloat used without integer/BigInt guard — if money values flow through, this will lose precision",
          confidence: 0.4,
          suggestion: "Consider using integer minor units for any monetary values",
        });
      }
    }

    // Predict: cached values without freshness markers
    if (checks.includes("hidden-state")) {
      const hasCache = content.match(/(?:cache|cached|memo|store)\s*[=:]/i);
      const hasFreshness = content.match(/(?:fresh|stale|updated|timestamp|ttl)/i);
      if (hasCache && !hasFreshness) {
        findings.push({
          file: file.path,
          predictedCheck: "cache-as-live",
          reason: "cache/memo variable without freshness marker — if this value is served as live, it will be dishonest",
          confidence: 0.5,
          suggestion: "Add a timestamp or TTL to this cached value",
        });
      }
    }
  }

  return findings;
}