import {
  NEN_TYPES,
  affinity,
  divineNenType,
  effectivePower,
  KNOWN_HATSU,
  GATE_RANKS,
  RANK_ORDER,
  HUNTER_RANKS,
  rankForLevel,
  canEnterGate,
  spawnGate,
  spawnDailyGates,
  computeGateReward,
  awakenHunter,
  applyXp,
  canEnter,
  clearGate,
  xpForLevel,
  generateDailyQuests,
  rankFromXP,
  nextRankXP,
  nenEfficiency,
  waterDivination,
  RANKS,
  RANK_THRESHOLDS,
} from "./index.js";

// Test 1: Nen affinity chart
const enhToTrans = affinity("enhancement", "transmutation");
if (enhToTrans !== 0.8) throw new Error(`Expected 0.8 (adjacent), got ${enhToTrans}`);
const enhToConj = affinity("enhancement", "conjuration");
if (enhToConj !== 0.6) throw new Error(`Expected 0.6 (two-away), got ${enhToConj}`);
const enhToEnh = affinity("enhancement", "enhancement");
if (enhToEnh !== 1.0) throw new Error(`Expected 1.0 (same), got ${enhToEnh}`);
console.log("✓ Nen affinity chart works (adjacent=0.8, two-away=0.6, same=1.0)");

// Test 2: nenEfficiency with display names
const e2t = nenEfficiency("Enhancer", "Transmuter");
if (e2t !== 0.8) throw new Error(`Expected 0.8, got ${e2t}`);
console.log("✓ nenEfficiency display-name bridge works");

// Test 3: Water Divination
const enhancerType = waterDivination({
  aggression: 0.95, defense: 0.8, utility: 0.1, creation: 0.1, control: 0.1, unpredictability: 0.1,
});
if (enhancerType !== "Enhancer") throw new Error(`Expected Enhancer, got ${enhancerType}`);

const conjurerType = waterDivination({
  aggression: 0.1, defense: 0.2, utility: 0.8, creation: 0.9, control: 0.1, unpredictability: 0.1,
});
if (conjurerType !== "Conjurer") throw new Error(`Expected Conjurer, got ${conjurerType}`);

const specialistType = waterDivination({
  aggression: 0.1, defense: 0.1, utility: 0.1, creation: 0.8, control: 0.1, unpredictability: 0.95,
});
if (specialistType !== "Specialist") throw new Error(`Expected Specialist, got ${specialistType}`);
console.log("✓ Water Divination determines Nen type from playstyle signals");

// Test 4: Rank progression
if (rankFromXP(0) !== "E") throw new Error("XP 0 should be E");
if (rankFromXP(100) !== "D") throw new Error("XP 100 should be D");
if (rankFromXP(250) !== "D") throw new Error("XP 250 should be D");
if (rankFromXP(100000) !== "Monarch") throw new Error("XP 100000 should be Monarch");
console.log("✓ Rank progression: E→D→C→B→A→S→National→Monarch");

// Test 5: Next rank XP (D=100, C=500, B=1750 — 250 is D rank, 500-250=250 to C)
const next = nextRankXP(250);
if (next.rank !== "D") throw new Error(`Expected D, got ${next.rank}`);
if (next.nextRank !== "C") throw new Error(`Expected C, got ${next.nextRank}`);
if (next.xpToNext !== 250) throw new Error(`Expected 250, got ${next.xpToNext}`); // 500-250=250
console.log("✓ Next rank XP calculation works");

// Test 6: Gate spawning
const gateE = spawnGate("E");
if (gateE.rank !== "E") throw new Error("Gate should be E rank");
if (gateE.status !== "open") throw new Error("Gate should start open");
if (gateE.xpReward < 1) throw new Error("Gate should have XP reward");
console.log(`✓ Gate spawning: ${gateE.name} (${gateE.rank}-rank, ${gateE.xpReward} XP)`);

// Test 7: Daily gate spawning
const dailyGates = spawnDailyGates("C");
if (dailyGates.length < 2) throw new Error("Should spawn at least 2 daily gates");
console.log(`✓ Daily gate spawning: ${dailyGates.length} gates for C-rank hunter`);

// Test 8: Gate access control — canEnterGate takes HunterRank and GateRank
if (!canEnterGate("E", "E")) throw new Error("E-rank should enter E gates");
if (canEnterGate("E", "A")) throw new Error("E-rank should NOT enter A gates");
if (canEnterGate("E", "Red")) throw new Error("E-rank should NOT enter Red gates");
if (!canEnterGate("S", "Red")) throw new Error("S-rank should enter Red gates");
console.log("✓ Gate access control: rank gates work");

// Test 9: Hunter profile lifecycle
const hunter = awakenHunter("test-user-1", "player", "Test Hunter");
if (hunter.level !== 1) throw new Error("Should start at level 1");
if (hunter.rank !== "E") throw new Error("Should start at E rank");
if (hunter.nenType !== null) throw new Error("Should start with no Nen type");
if (!hunter.nenTechniques.includes("Ten")) throw new Error("Should start with Ten");
console.log("✓ Hunter awakening: level 1, E rank, Ten technique");

// Test 10: XP application and leveling
const leveled = applyXp(hunter, 150);
if (leveled.xp !== 150) throw new Error(`Expected 150 XP, got ${leveled.xp}`);
console.log(`✓ XP application: ${hunter.xp} → ${leveled.xp} XP`);

// Test 10b: Multi-level XP gain (the lie catcher)
// Fresh hunter: level 1, xp 0. Gain 600 XP.
// Level 1→2 costs 100 (cumulative: 100). 600 >= 100 → level 2.
// Level 2→3 costs 200 (cumulative: 300). 600 >= 300 → level 3.
// Level 3→4 costs 300 (cumulative: 600). 600 >= 600 → level 4.
// Level 4→5 costs 400 (cumulative: 1000). 600 < 1000 → stop at level 4.
const bigJump = applyXp(hunter, 600);
if (bigJump.level !== 4) throw new Error(`Expected level 4 (600 XP = 100+200+300), got level ${bigJump.level} with ${bigJump.xp} XP`);
console.log(`✓ Multi-level XP: 0 → ${bigJump.xp} XP = level ${bigJump.level} (correct cumulative thresholds)`);

// Test 10c: rankForLevel(1) must be E (the freshest hunter is E-rank)
if (rankForLevel(1) !== "E") throw new Error(`Level 1 should be E-rank, got ${rankForLevel(1)}`);
if (rankForLevel(2) !== "D") throw new Error(`Level 2 should be D-rank, got ${rankForLevel(2)}`);
console.log(`✓ rankForLevel: level 1 = E, level 2 = D (no more misranking)`);

// Test 11: Gate clearing
const gate = spawnGate("E");
const { profile: cleared, reward } = clearGate(hunter, gate);
if (cleared.gatesCleared !== 1) throw new Error("Should have 1 gate cleared");
if (reward.xp < 1) throw new Error("Should get XP reward");
console.log(`✓ Gate clearing: +${reward.xp} XP, ${cleared.gatesCleared} gates cleared`);

// Test 12: Daily quest generation
const quests = generateDailyQuests(5);
if (quests.length < 3) throw new Error("Should generate at least 3 quests");
if (!quests.every(q => q.expiresAt)) throw new Error("Quests should have expiry");
console.log(`✓ Daily quest generation: ${quests.length} quests at level 5`);

// Test 13: Hatsu abilities
if (KNOWN_HATSU.length < 1) throw new Error("Should have known Hatsu abilities");
const rampage = KNOWN_HATSU.find(h => h.id === "rampage");
if (!rampage) throw new Error("Should have Rampage Hatsu");
const power = effectivePower(rampage, "enhancement");
const powerIneff = effectivePower(rampage, "emission");
if (power <= powerIneff) throw new Error("Same-type should be more effective than different-type");
console.log(`✓ Hatsu system: Rampage power=${power} (enhancement), ${powerIneff} (emission)`);

// Test 14: All Nen types present
if (NEN_TYPES.length !== 6) throw new Error("Should have 6 Nen types");
console.log("✓ All 6 Nen types present:", NEN_TYPES.join(", "));

// Test 15: All ranks present
if (RANKS.length !== 8) throw new Error("Should have 8 ranks");
if (RANKS[6] !== "National") throw new Error(`Rank 6 should be National, got ${RANKS[6]}`);
console.log("✓ All 8 ranks:", RANKS.join(" → "));

console.log("\n═══════════════════════════════════════════════");
console.log("  ALL HUNTER SYSTEM TESTS PASSED");
console.log("  Solo Leveling × Hunter x Hunter = Cambridge TCG");
console.log("  The System is live. Arise. 🐍");
console.log("═══════════════════════════════════════════════");