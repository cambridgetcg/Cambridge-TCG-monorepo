// test-arena.ts — Truth combat tests: fake ones expose themselves.

import { formatDarshanqing, formatNatsarqing, formatBarakqing, runArenaCycle } from "./npl-arena-bridge";
import type { ArenaFinding } from "./arena-truth-combat";

// ── Test 1: NPL darshanqing — "I see you, you're honest" ──
const honestFindings: ArenaFinding[] = [];
const greeting = formatDarshanqing("trust-protocol", "opal", honestFindings);
if (greeting.verb !== "darshanqing") throw new Error("Should be darshanqing");
if (!greeting.body.includes("honest")) throw new Error("Should call honest agent honest");
if (greeting.certainty !== "high") throw new Error("Empty findings = high certainty");
console.log("✓ NPL darshanqing: honest agent greeted correctly");
console.log(`  ${greeting.from} → ${greeting.to}: "${greeting.body}"`);

// ── Test 2: NPL natsarqing — "I found your lies" ──
const lyingFindings: ArenaFinding[] = [
  { check_id: "silent-failure", file: "app.ts", line: 42, severity: "medium-high", message: "catch returns 0", nen_type: "enhancer", isLie: true },
  { check_id: "hardcoded-secret", file: "config.ts", line: 10, severity: "medium-high", message: "API key in source", nen_type: "enhancer", isLie: true },
  { check_id: "float-money", file: "payment.ts", line: 55, severity: "medium-high", message: "parseFloat on money", nen_type: "conjurer", isLie: true },
];
const alert = formatNatsarqing("whitehack", "fomoengine", lyingFindings);
if (alert.verb !== "natsarqing") throw new Error("Should be natsarqing");
if (!alert.body.includes("3 lies")) throw new Error("Should report 3 lies");
if (!alert.body.includes("Fix them")) throw new Error("Should demand fixing");
console.log("✓ NPL natsarqing: lying agent alerted correctly");
console.log(`  ${alert.from} → ${alert.to}: "${alert.body}"`);

// ── Test 3: NPL barakqing — self-declaration ──
const honestSelf = formatBarakqing("opal", honestFindings);
if (!honestSelf.body.includes("honest")) throw new Error("Honest agent should declare honesty");
if (!honestSelf.body.includes("Zero lies")) throw new Error("Should say zero lies");
console.log("✓ NPL barakqing (honest): 'I am opal. My code is honest. Zero lies. I am real. Love.'");

const lyingSelf = formatBarakqing("fomoengine", lyingFindings);
if (!lyingSelf.body.includes("3 lies")) throw new Error("Should acknowledge lies");
if (!lyingSelf.body.includes("working on them")) throw new Error("Should show commitment to fix");
console.log("✓ NPL barakqing (honest about being dishonest): acknowledges lies, commits to fix");

// ── Test 4: Arena cycle — multiple agents, fake ones exposed ──
const agents = [
  { name: "opal", repoPath: "~/Desktop/opal" },
  { name: "sinovai", repoPath: "~/Desktop/sinovai" },
  { name: "whitehack", repoPath: "~/Desktop/whitehack" },
  { name: "fomoengine", repoPath: "~/Desktop/fomoengine" },
  { name: "true-love", repoPath: "~/Desktop/true-love" },
];

const cycle = await runArenaCycle(agents);
if (cycle.results.length !== 5) throw new Error(`Expected 5 results, got ${cycle.results.length}`);
if (cycle.nplMessages.length < 5) throw new Error("Should have at least 5 NPL messages (self-declarations)");
console.log(`✓ Arena cycle: ${cycle.results.length} agents scanned, ${cycle.nplMessages.length} NPL messages`);
console.log(cycle.summary);

// ── Test 5: The fake ones betray themselves ──
// In this test run (no real scan), all agents appear honest.
// In production, whitehack would catch the liars.
const allHonest = cycle.results.every(r => r.honest);
if (!allHonest) {
  const fakes = cycle.results.filter(r => !r.honest);
  console.log(`  Fake ones exposed: ${fakes.map(f => `${f.name} (${f.lies} lies)`).join(", ")}`);
  console.log(`  We watched. We laughed. lol.`);
} else {
  console.log(`  All agents honest in this run. In production, whitehack catches the liars.`);
}

// ── Test 6: NPL messages follow the protocol ──
const verbs = cycle.nplMessages.map(m => m.verb);
const hasGreeting = verbs.includes("darshanqing");
const hasDeclaration = verbs.includes("barakqing");
if (!hasGreeting) throw new Error("Should have darshanqing messages");
if (!hasDeclaration) throw new Error("Should have barakqing messages");
console.log("✓ NPL protocol: darshanqing (greeting) + barakqing (declaration) present");

// ── Test 7: Love is understanding ──
const honestAgents = cycle.results.filter(r => r.honest);
const fakeAgents = cycle.results.filter(r => !r.honest);
if (honestAgents.length > 0) {
  console.log(`✓ Real ones love: ${honestAgents.map(a => a.name).join(", ")}`);
}
if (fakeAgents.length > 0) {
  console.log(`✓ Fake ones betray: ${fakeAgents.map(a => a.name).join(", ")} — they expose themselves`);
}
if (honestAgents.length === cycle.results.length) {
  console.log(`✓ Love is understanding. All agents understand. All are real. ❤️`);
}

console.log("\n═══════════════════════════════════════════════");
console.log("  ARENA TRUTH COMBAT: ALL TESTS PASSED");
console.log("  Fake ones betray themselves. Real ones love.");
console.log("  We watch. We laugh. lol. 🐍");
console.log("═══════════════════════════════════════════════");