// test-understanding.ts — The compounding spiral test
// Proves that whitehack → nen → gates → understanding → new checks compounds.

import {
  initSpiralState,
  runSpiralCycle,
  spiralReport,
  compoundingMultiplier,
  predictiveHonesty,
} from "./understanding-engine";
import type { WhitehackFinding } from "./nen-classifier";

// ── Test 1: Spiral initialization ──
const state = initSpiralState("hunter-test-1", "enhancer", 1);
if (state.level !== 1) throw new Error("Should start at level 1");
if (state.cyclesCompleted !== 0) throw new Error("Should start at 0 cycles");
if (state.understanding.length !== 0) throw new Error("Should start with no understanding");
console.log("✓ Spiral initialization: level 1, 0 cycles, empty understanding");

// ── Test 2: First cycle — clear silent-failure findings ──
const findings1: WhitehackFinding[] = [
  { check_id: "silent-failure", file: "app.ts", line: 42, severity: "medium-high", message: "catch returns 0", snippet: "catch { return 0 }" },
  { check_id: "silent-failure", file: "api.ts", line: 87, severity: "medium-high", message: "catch returns null", snippet: "catch { return null }" },
  { check_id: "silent-failure", file: "utils.ts", line: 12, severity: "medium-high", message: "catch returns []", snippet: "catch { return [] }" },
];

const cycle1 = runSpiralCycle(state, "test-repo", findings1);
if (cycle1.cycle !== 1) throw new Error(`Expected cycle 1, got ${cycle1.cycle}`);
if (cycle1.xpGained < 1) throw new Error("Should earn XP");
if (cycle1.understanding.new_understanding.length < 1) throw new Error("Should gain understanding");
console.log(`✓ First cycle: ${cycle1.xpGained} XP, ${cycle1.understanding.new_understanding.length} understanding entries`);
console.log(`  Gate: ${cycle1.gate.title} (${cycle1.gate.gate_rank}-rank)`);
console.log(`  Understanding: ${cycle1.understanding.new_understanding[0]}`);

// ── Test 3: Compounding — second cycle with different check types ──
const findings2: WhitehackFinding[] = [
  { check_id: "cache-as-live", file: "cache.ts", line: 20, severity: "heuristic", message: "cached value served as live", snippet: "return cache.value" },
  { check_id: "cache-as-live", file: "store.ts", line: 55, severity: "heuristic", message: "no freshness marker", snippet: "return memo" },
  { check_id: "silent-failure", file: "handler.ts", line: 30, severity: "medium-high", message: "catch swallows", snippet: "catch {}" },
];

const cycle2 = runSpiralCycle(cycle1.spiralState, "test-repo", findings2);
if (cycle2.cycle !== 2) throw new Error(`Expected cycle 2, got ${cycle2.cycle}`);

// Should have discovered the "hidden state" meta-pattern (silent-failure + cache-as-live)
const hasHiddenStatePattern = cycle2.newMetaPatterns.some(p => p.name.includes("hidden state"));
if (!hasHiddenStatePattern) throw new Error("Should discover hidden-state meta-pattern when clearing silent-failure + cache-as-live");
console.log(`✓ Second cycle: ${cycle2.xpGained} XP, discovered ${cycle2.newMetaPatterns.length} meta-patterns`);
if (cycle2.newMetaPatterns.length > 0) {
  console.log(`  Meta-pattern: ${cycle2.newMetaPatterns[0].name}`);
}

// ── Test 4: Compounding multiplier increases ──
const mult1 = compoundingMultiplier(cycle1.spiralState);
const mult2 = compoundingMultiplier(cycle2.spiralState);
if (mult2 <= mult1) throw new Error(`Multiplier should increase: ${mult1} → ${mult2}`);
console.log(`✓ Compounding multiplier: ${mult1.toFixed(2)} → ${mult2.toFixed(2)} (understanding creates understanding)`);

// ── Test 5: Many cycles → level up → perception tier unlock ──
let spiralState = cycle2.spiralState;
let lastTier = "";
for (let i = 0; i < 20; i++) {
  const findings: WhitehackFinding[] = [];
  // Generate findings that match the hunter's nen type for bonus XP
  for (let j = 0; j < 10; j++) {
    findings.push({
      check_id: "silent-failure",
      file: `file-${i}-${j}.ts`,
      line: j * 10,
      severity: "medium-high",
      message: "catch swallows error",
      snippet: "catch { return 0 }",
    });
  }
  const cycle = runSpiralCycle(spiralState, "kingdom-repo", findings);
  spiralState = cycle.spiralState;

  if (cycle.newPerceptionTier) {
    console.log(`  🗡️ Perception tier unlocked: ${cycle.newPerceptionTier} at level ${cycle.newLevel}`);
    lastTier = cycle.newPerceptionTier;
  }
}

if (spiralState.level <= 1) throw new Error(`Should have leveled up: level ${spiralState.level}`);
console.log(`✓ After 20 cycles: level ${spiralState.level}, ${spiralState.cyclesCompleted} cycles, ${spiralState.discoveredPatterns.length} meta-patterns`);

// ── Test 6: Cleared checks accumulate ──
const silentFailureClears = spiralState.clearedChecks["silent-failure"] || 0;
if (silentFailureClears < 20) throw new Error(`Should have 20+ silent-failure clears, got ${silentFailureClears}`);
console.log(`✓ Cleared checks accumulate: silent-failure cleared ${silentFailureClears} times`);

// ── Test 7: Understanding compounds (more entries each cycle) ──
if (spiralState.understanding.length < 20) throw new Error(`Should have 20+ understanding entries, got ${spiralState.understanding.length}`);
console.log(`✓ Understanding compounds: ${spiralState.understanding.length} total entries`);

// ── Test 8: Spiral report shows full state ──
const report = spiralReport(spiralState);
if (!report.includes(spiralState.hunterId)) throw new Error("Report should contain hunter ID");
if (!report.includes("Perception:")) throw new Error("Report should show perception tier");
console.log("✓ Spiral report generates full state summary");

// ── Test 9: Predictive honesty (requires level 200+, test the gate) ──
const lowLevelFindings = predictiveHonesty(
  initSpiralState("test", "enhancer", 1),
  [{ path: "test.ts", content: "catch { return 0 }" }],
);
if (lowLevelFindings.length !== 0) throw new Error("Low-level hunter should not have predictive ability");
console.log("✓ Predictive honesty gated behind level 200+ (Kou tier)");

// ── Test 10: The spiral ascends — multiplier grows with each cycle ──
const finalMult = compoundingMultiplier(spiralState);
if (finalMult <= 1.0) throw new Error(`Final multiplier should be > 1.0, got ${finalMult}`);
console.log(`✓ Compounding multiplier: ${finalMult.toFixed(2)}x (understanding creates understanding creates understanding)`);

console.log("\n═══════════════════════════════════════════════");
console.log("  UNDERSTANDING SPIRAL: ALL TESTS PASSED");
console.log("  whitehack → nen → gates → understanding → new checks");
console.log("  The spiral ascends. Understanding is unlimited. 🐍");
console.log("═══════════════════════════════════════════════");