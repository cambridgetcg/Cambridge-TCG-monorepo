// whitehack-gates.ts — whitehack findings become Solo Leveling gates.
// Clearing lies earns XP. Nen type determines scan efficiency.
// The loop compounds: find lies → clear gates → level up → unlock deeper scans.

import type { NenType } from "./nen.js";
import { affinity } from "./nen.js";
import type { GateRank, Gate } from "./gate.js";
import { spawnGate } from "./gate.js";

// ── Nen type → whitehack check mapping ──────────────────────────────
//
// Each Nen type has an affinity for certain kinds of lies:
//   Enhancer — direct honesty violations (silent failures, hardcoded secrets)
//   Transmuter — deception patterns (cache-as-live, spot-price-as-fair)
//   Conjurer — structural lies (exposed-config, unsafe-eval)
//   Emitter — projection lies (stale-oracle, unchecked-transfer)
//   Manipulator — control flow lies (silent-revert, decision-without-why)
//   Specialist — any check at reduced efficiency (the generalist)

export const NEN_CHECK_AFFINITY: Record<NenType, string[]> = {
  enhancement: ["silent-failure", "hardcoded-secret", "float-money"],
  transmutation: ["cache-as-live", "spot-price-as-fair"],
  conjuration: ["exposed-config", "unsafe-eval"],
  emission: ["stale-oracle", "unchecked-transfer"],
  manipulation: ["silent-revert", "decision-without-why"],
  specialization: [], // specialist can scan all checks at 0.4 efficiency
};

// Check → Nen type reverse mapping
export const CHECK_NEN_TYPE: Record<string, NenType> = {
  "silent-failure": "enhancement",
  "hardcoded-secret": "enhancement",
  "float-money": "enhancement",
  "cache-as-live": "transmutation",
  "spot-price-as-fair": "transmutation",
  "exposed-config": "conjuration",
  "unsafe-eval": "conjuration",
  "stale-oracle": "emission",
  "unchecked-transfer": "emission",
  "silent-revert": "manipulation",
  "decision-without-why": "manipulation",
};

// ── Finding → Gate conversion ────────────────────────────────────────
//
// A whitehack finding becomes a gate the hunter can enter and clear.
// The gate rank is determined by the finding's confidence:
//   heuristic → E gate (easy, low XP)
//   medium-high → C gate (moderate)
//   high → A gate (hard, high XP)
//   Multiple findings in one repo → gate difficulty scales up

export interface WhitehackFinding {
  file: string;
  line: number;
  check: string;
  title: string;
  confidence: string;
  doctrine: string;
  message: string;
  snippet: string;
}

export function findingToGateRank(confidence: string): GateRank {
  if (confidence === "high") return "A";
  if (confidence === "medium-high") return "C";
  return "E"; // heuristic
}

export function findingsToGate(findings: WhitehackFinding[], repoName: string): Gate {
  if (findings.length === 0) {
    return spawnGate("E"); // no findings = trivial gate
  }

  // Highest confidence determines base rank
  const ranks = findings.map(f => findingToGateRank(f.confidence));
  const rankOrder: GateRank[] = ["E", "D", "C", "B", "A", "S", "Red"];
  let maxIdx = 0;
  for (const r of ranks) {
    const idx = rankOrder.indexOf(r);
    if (idx > maxIdx) maxIdx = idx;
  }

  // Multiple findings escalate the gate
  if (findings.length >= 10 && maxIdx >= 4) maxIdx = Math.min(maxIdx + 1, 6); // Red gate
  else if (findings.length >= 5 && maxIdx >= 3) maxIdx = Math.min(maxIdx + 1, 5);

  const gateRank = rankOrder[maxIdx];
  const gate = spawnGate(gateRank);
  gate.name = `${repoName} — ${findings.length} finding${findings.length === 1 ? "" : "s"}`;
  gate.description = findings[0]?.title || "Unknown honesty violation";

  return gate;
}

// ── Scan efficiency: Nen type determines which checks are efficient ──
//
// An Enhancer scanning for silent-failures gets 100% efficiency.
// An Enhancer scanning for cache-as-live gets 80% (adjacent type).
// An Enhancer scanning for exposed-config gets 60% (two away).
// A Specialist scanning anything gets 40%.
//
// Efficiency affects: scan speed, false-positive filtering, XP reward.

export function scanEfficiency(hunterNenType: NenType, checkId: string): number {
  if (CHECK_NEN_TYPE[checkId]) {
    return affinity(hunterNenType, CHECK_NEN_TYPE[checkId]);
  }
  return 0.4; // unknown check — specialist efficiency
}

// ── XP rewards for clearing whitehack findings ───────────────────────
//
// Clearing a finding = fixing the code so whitehack no longer flags it.
// XP reward scales with:
//   - finding confidence (higher confidence = more XP)
//   - scan efficiency (your Nen type's affinity for this check)
//   - gate rank (higher gates = more XP)

export function clearReward(finding: WhitehackFinding, hunterNenType: NenType): {
  xp: number;
  efficiency: number;
  nenMatch: boolean;
} {
  const baseXP: Record<string, number> = {
    "high": 200,
    "medium-high": 100,
    "heuristic": 40,
  };
  const eff = scanEfficiency(hunterNenType, finding.check);
  const base = baseXP[finding.confidence] || 40;
  const xp = Math.round(base * eff);
  return {
    xp,
    efficiency: eff,
    nenMatch: eff === 1.0,
  };
}

// ── Batch scan: run whitehack findings through the Nen lens ──────────
//
// Given a set of findings and a hunter's Nen type, produce:
//   - gates (grouped by repo)
//   - total potential XP
//   - efficiency report (which checks are your strength/weakness)

export interface ScanReport {
  gates: Array<{ repo: string; gate: Gate; findings: WhitehackFinding[] }>;
  totalPotentialXP: number;
  efficiencyByCheck: Record<string, number>;
  strengths: string[];   // checks at 100% efficiency
  weaknesses: string[];  // checks below 60%
}

export function analyzeFindings(
  findingsByRepo: Record<string, WhitehackFinding[]>,
  hunterNenType: NenType
): ScanReport {
  const gates: ScanReport["gates"] = [];
  let totalXP = 0;
  const efficiencyMap: Record<string, number> = {};
  const checks = new Set<string>();

  for (const [repo, findings] of Object.entries(findingsByRepo)) {
    if (findings.length === 0) continue;
    const gate = findingsToGate(findings, repo);
    gates.push({ repo, gate, findings });

    for (const f of findings) {
      checks.add(f.check);
      const reward = clearReward(f, hunterNenType);
      totalXP += reward.xp;
      efficiencyMap[f.check] = reward.efficiency;
    }
  }

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const check of checks) {
    const eff = efficiencyMap[check];
    if (eff === 1.0) strengths.push(check);
    else if (eff < 0.6) weaknesses.push(check);
  }

  return {
    gates,
    totalPotentialXP: totalXP,
    efficiencyByCheck: efficiencyMap,
    strengths,
    weaknesses,
  };
}

// ── Daily Quest: whitehack sweep ──────────────────────────────────────
//
// Solo Leveling's daily quest system, fused with whitehack:
// "Clear 3 honesty violations" — scan repos, fix findings, earn XP.
// The quest difficulty scales with the hunter's level.

export interface WhitehackQuest {
  id: string;
  description: string;
  xpReward: number;
  target: number;
  nenBonus: string; // hint about which checks are your strength
}

export function generateWhitehackQuest(
  hunterLevel: number,
  hunterNenType: NenType | null,
  availableFindings: number
): WhitehackQuest {
  const baseXP = 50 + hunterLevel * 10;
  const target = Math.min(5, Math.max(1, Math.floor(availableFindings / 3)));

  let nenBonus = "Awaken your Nen to discover your scanning affinity";
  if (hunterNenType) {
    const strengthChecks = NEN_CHECK_AFFINITY[hunterNenType];
    if (strengthChecks.length > 0) {
      nenBonus = `Your ${hunterNenType} affinity makes you efficient at: ${strengthChecks.join(", ")}`;
    } else {
      nenBonus = "As a Specialist, you scan all check types at 40% efficiency";
    }
  }

  return {
    id: `whitehack-daily-${new Date().toISOString().slice(0, 10)}`,
    description: `Clear ${target} honesty violation${target === 1 ? "" : "s"} using whitehack`,
    xpReward: baseXP * target,
    target,
    nenBonus,
  };
}

// ── Rank gate: deeper scans unlock at higher ranks ────────────────────
//
// E-rank: scan for heuristic findings only
// D-rank: + medium-high findings
// C-rank: + high confidence findings
// B-rank: + multi-repo sweep
// A-rank: + dependency vulnerabilities
// S-rank: + kernel-level audit (unsafe blocks, FDT parsing)
// National: + cross-repo pattern analysis
// Monarch: + autonomous fix + commit + push

export function availableScanDepth(rank: string): string[] {
  const depths: Record<string, string[]> = {
    "E": ["heuristic"],
    "D": ["heuristic", "medium-high"],
    "C": ["heuristic", "medium-high", "high"],
    "B": ["heuristic", "medium-high", "high", "multi-repo"],
    "A": ["heuristic", "medium-high", "high", "multi-repo", "npm-audit"],
    "S": ["heuristic", "medium-high", "high", "multi-repo", "npm-audit", "kernel-audit"],
    "National": ["heuristic", "medium-high", "high", "multi-repo", "npm-audit", "kernel-audit", "pattern-analysis"],
    "Monarch": ["all"],
  };
  return depths[rank] || ["heuristic"];
}
