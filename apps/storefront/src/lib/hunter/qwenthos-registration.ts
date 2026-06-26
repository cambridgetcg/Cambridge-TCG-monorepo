/**
 * qwenthos-registration.ts
 *
 * QWENTHOS is the first Hunter of the kingdom.
 * Nen type: Enhancer (security, hardening, defense).
 * Rank: E (starting). Level: 1. Aura: 100.
 *
 * This file is the seed — run it once to register QWENTHOS as a hunter.
 * In production, this would be a server action called during agent onboarding.
 */

import { determineNenType, NEN_DESCRIPTIONS, RANK_DISPLAY, type NenType } from "./hunter-engine";

// QWENTHOS hunter profile
export const QWENTHOS_HUNTER = {
  agent_id: "qwenthos", // matches the Hermes profile name
  nen_type: "enhancer" as NenType, // QWENTHOS protects — it's an Enhancer
  rank: "E" as const,
  level: 1,
  xp: 0,
  aura_current: 100,
  aura_max: 100,
  hatsu: ["whitehack-scan", "silent-failure-fix", "fdtcons-bridge"],
  gates_entered: 2,  // already entered 2 gates (opal fdtcons + sinovai fix)
  gates_cleared: 2,  // both cleared
  gates_failed: 0,
};

// The nen description for QWENTHOS
export const QWENTHOS_NEN = NEN_DESCRIPTIONS.enhancer;
export const QWENTHOS_RANK = RANK_DISPLAY.E;

// Gates QWENTHOS has already cleared (retroactive)
export const QWENTHOS_PAST_GATES = [
  {
    kingdom_id: "opal-m7",
    title: "M7 Bridge: FDT-Discovered Console",
    gate_rank: "B" as const,
    commits: ["45dd4df"],
    files_changed: 3,
    findings_fixed: 0,
    loot: "fdtcons monitor command — kernel discovers UART from FDT by compatible string",
  },
  {
    kingdom_id: "sinovai-cs2",
    title: "Silent Failure Fix — sinovai worker.js",
    gate_rank: "C" as const,
    commits: ["1f03cdb"],
    files_changed: 1,
    findings_fixed: 3,
    loot: "readInteractions() helper — separates 'key not found' from 'read failed'",
  },
  {
    kingdom_id: "true-love-cs2",
    title: "Silent Failure Sweep — true-love (22 fixes)",
    gate_rank: "A" as const,
    commits: ["3f5c286"],
    files_changed: 15,
    findings_fixed: 22,
    loot: "22 catch blocks now log errors before returning defaults",
  },
  {
    kingdom_id: "cambridge-tcg-cs2",
    title: "Silent Failure Sweep — Cambridge TCG (23 fixes)",
    gate_rank: "A" as const,
    commits: ["959ced2"],
    files_changed: 17,
    findings_fixed: 23,
    loot: "23 catch blocks now log via console.warn with file path and error",
  },
];

// Total XP QWENTHOS should have from past gates
// B-rank: 400 XP, C-rank: 200 XP, A-rank: 800 XP each
export const QWENTHOS_TOTAL_XP = 400 + 200 + 800 + 800; // 2200 XP
export const QWENTHOS_DESERVED_LEVEL = 10; // 2200 XP at scaling curve puts QWENTHOS at ~level 10
export const QWENTHOS_DESERVED_RANK = "D" as const; // level 10 = D-rank