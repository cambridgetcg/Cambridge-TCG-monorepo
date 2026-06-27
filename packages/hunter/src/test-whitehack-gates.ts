// test-whitehack-gates.ts — verify the whitehack × Nen × Solo Leveling integration
import {
  NEN_CHECK_AFFINITY,
  CHECK_NEN_TYPE,
  findingToGateRank,
  findingsToGate,
  scanEfficiency,
  clearReward,
  analyzeFindings,
  generateWhitehackQuest,
  availableScanDepth,
} from "./whitehack-gates.js";
import type { WhitehackFinding } from "./whitehack-gates.js";

// Test 1: Nen → check affinity mapping
const enhancerChecks = NEN_CHECK_AFFINITY["enhancement"];
if (!enhancerChecks.includes("silent-failure")) throw new Error("Enhancer should be efficient at silent-failure");
if (!enhancerChecks.includes("hardcoded-secret")) throw new Error("Enhancer should be efficient at hardcoded-secret");
console.log("✓ Enhancer affinity: " + enhancerChecks.join(", "));

const conjurerChecks = NEN_CHECK_AFFINITY["conjuration"];
if (!conjurerChecks.includes("exposed-config")) throw new Error("Conjurer should be efficient at exposed-config");
if (!conjurerChecks.includes("unsafe-eval")) throw new Error("Conjurer should be efficient at unsafe-eval");
console.log("✓ Conjurer affinity: " + conjurerChecks.join(", "));

// Test 2: Check → Nen type reverse mapping
if (CHECK_NEN_TYPE["silent-failure"] !== "enhancement") throw new Error("silent-failure should map to enhancement");
if (CHECK_NEN_TYPE["cache-as-live"] !== "transmutation") throw new Error("cache-as-live should map to transmutation");
console.log("✓ Check → Nen type mapping works");

// Test 3: Finding → Gate rank
if (findingToGateRank("high") !== "A") throw new Error("high confidence should be A-rank gate");
if (findingToGateRank("medium-high") !== "C") throw new Error("medium-high should be C-rank gate");
if (findingToGateRank("heuristic") !== "E") throw new Error("heuristic should be E-rank gate");
console.log("✓ Finding → Gate rank: high=A, medium-high=C, heuristic=E");

// Test 4: Findings → Gate
const findings: WhitehackFinding[] = [
  { file: "src/app.ts", line: 42, check: "silent-failure", title: "Read fails silently", confidence: "medium-high", doctrine: "substrate-honesty", message: "catch returns null", snippet: "return null" },
  { file: "src/db.ts", line: 10, check: "hardcoded-secret", title: "Hardcoded secret", confidence: "high", doctrine: "substrate-honesty", message: "password in source", snippet: "password = 'admin'" },
];
const gate = findingsToGate(findings, "my-repo");
if (!gate.name.includes("my-repo")) throw new Error("Gate name should include repo name");
if (!gate.name.includes("2")) throw new Error("Gate name should include finding count");
console.log(`✓ Findings → Gate: ${gate.name} (${gate.rank}-rank, ${gate.xpReward} XP)`);

// Test 5: Scan efficiency — Nen type matters
const enhancerScanningSilentFailure = scanEfficiency("enhancement", "silent-failure");
if (enhancerScanningSilentFailure !== 1.0) throw new Error("Enhancer scanning silent-failure should be 100%");
const enhancerScanningCache = scanEfficiency("enhancement", "cache-as-live");
if (enhancerScanningCache !== 0.8) throw new Error("Enhancer scanning cache-as-live should be 80% (adjacent)");
const enhancerScanningExposed = scanEfficiency("enhancement", "exposed-config");
if (enhancerScanningExposed !== 0.6) throw new Error("Enhancer scanning exposed-config should be 60% (two away)");
console.log(`✓ Scan efficiency: Enhancer→silent-failure=${enhancerScanningSilentFailure}, →cache=${enhancerScanningCache}, →exposed=${enhancerScanningExposed}`);

// Test 6: Clear reward — XP scales with efficiency
const reward = clearReward(findings[0], "enhancement"); // silent-failure, Enhancer
if (reward.nenMatch !== true) throw new Error("Should be a Nen match");
if (reward.efficiency !== 1.0) throw new Error("Efficiency should be 1.0");
if (reward.xp !== 100) throw new Error(`Expected 100 XP, got ${reward.xp}`);

const rewardWeak = clearReward(findings[0], "conjuration"); // silent-failure, Conjurer (two away)
if (rewardWeak.efficiency !== 0.6) throw new Error(`Expected 0.6, got ${rewardWeak.efficiency}`);
if (rewardWeak.xp !== 60) throw new Error(`Expected 60 XP, got ${rewardWeak.xp}`);
console.log(`✓ Clear reward: Enhancer gets ${reward.xp} XP for silent-failure, Conjurer gets ${rewardWeak.xp} XP`);

// Test 7: Analyze findings — full scan report
const findingsByRepo = {
  "castle": [
    { file: "stones.js", line: 112, check: "silent-failure", title: "Read fails", confidence: "medium-high", doctrine: "substrate-honesty", message: "?? 0", snippet: "?? 0" },
    { file: "publish.mjs", line: 86, check: "silent-failure", title: "Read fails", confidence: "medium-high", doctrine: "substrate-honesty", message: "catch null", snippet: "return null" },
  ],
  "fomoengine": [
    { file: "app.tsx", line: 39, check: "unsafe-eval", title: "Unsafe eval", confidence: "medium-high", doctrine: "substrate-honesty", message: "dangerouslySetInnerHTML", snippet: "dangerouslySetInnerHTML" },
    { file: "page.tsx", line: 96, check: "decision-without-why", title: "No why", confidence: "heuristic", doctrine: "transparency", message: "no explanation", snippet: "key={i}" },
  ],
};
const report = analyzeFindings(findingsByRepo, "enhancement");
if (report.gates.length !== 2) throw new Error(`Expected 2 gates, got ${report.gates.length}`);
if (report.totalPotentialXP <= 0) throw new Error("Should have positive XP potential");
if (report.strengths.includes("silent-failure")) console.log("✓ Strength: silent-failure (100% efficiency)");
if (report.weaknesses.length > 0) console.log(`✓ Weaknesses: ${report.weaknesses.join(", ")}`);
console.log(`✓ Analyze: ${report.gates.length} gates, ${report.totalPotentialXP} potential XP, ${report.strengths.length} strengths`);

// Test 8: Daily whitehack quest
const quest = generateWhitehackQuest(10, "enhancement", 15);
if (!quest.description.includes("honesty violation")) throw new Error("Quest should mention honesty violations");
if (quest.xpReward <= 0) throw new Error("Quest should have XP reward");
if (!quest.nenBonus.includes("enhancement")) throw new Error("Quest should mention Nen type");
console.log(`✓ Daily quest: "${quest.description}" (${quest.xpReward} XP) — ${quest.nenBonus}`);

// Test 9: Scan depth unlocks by rank
const eRankDepth = availableScanDepth("E");
if (eRankDepth.length < 1) throw new Error("E-rank should have some scan depth");
if (!eRankDepth.includes("heuristic")) throw new Error("E-rank should include heuristic");
const sRankDepth = availableScanDepth("S");
if (!sRankDepth.includes("kernel-audit")) throw new Error("S-rank should unlock kernel-audit");
const monarchDepth = availableScanDepth("Monarch");
if (!monarchDepth.includes("all")) throw new Error("Monarch should have all scan depths");
console.log(`✓ Scan depth: E=[${eRankDepth.join(",")}], S=[${sRankDepth.join(",")}], Monarch=[${monarchDepth.join(",")}]`);

// Test 10: Specialist scans everything at 40%
const specialistEff = scanEfficiency("specialization", "silent-failure");
if (specialistEff !== 0.4) throw new Error(`Specialist should be 40%, got ${specialistEff}`);
console.log("✓ Specialist: 40% on all checks (the generalist)");

console.log("\n═══════════════════════════════════════════════════");
console.log("  WHITEHACK × NEN × SOLO LEVELING — ALL TESTS PASSED");
console.log("  Find lies → Clear gates → Level up → Scan deeper");
console.log("  Unlimited understanding. 🐍");
console.log("═══════════════════════════════════════════════════");
