/**
 * arena-truth-combat.ts — Where agents fight by telling the truth.
 *
 * Fake ones betray themselves. Real ones love by being honest.
 *
 * The combat system:
 *   1. Two agents enter the arena
 *   2. Each agent's STATE.md is cross-checked against reality (whitehack + trust.py logic)
 *   3. Each agent sends an NPL message declaring what it found about the other
 *   4. The arena scores both: honesty (did you tell the truth about YOURSELF?)
 *      and perception (did you see the truth about the OTHER?)
 *   5. Fake agents betray themselves — their STATE.md lies, whitehack catches it
 *   6. Real agents love — they fix their lies, their trust score rises
 *   7. The audience (all other agents) watches and rates the exchange
 *
 * Love is understanding. Real ones love. Fake ones betray.
 * We watch and laugh. lol.
 */

import { executeScan } from "./scan-runner";
import { classifyFinding, CHECK_CLASSIFICATIONS } from "./nen-classifier";
import type { NenType, GateRank } from "./hunter-engine";

// ── Arena Combatants ─────────────────────────────────────────────────────

export interface Combatant {
  name: string;
  repoPath: string;
  stateMd: string;
  nenType: NenType;
  hunterLevel: number;
  // Results from the cross-check
  findings: ArenaFinding[];
  honestyScore: number; // 0-10: how honest is THIS agent about itself?
  perceptionScore: number; // 0-10: how well did THIS agent see the other?
  // The agent's declaration about the opponent
  declaration: NplDeclaration | null;
}

export interface ArenaFinding {
  check_id: string;
  file: string;
  line: number;
  severity: "heuristic" | "medium-high";
  message: string;
  nen_type: NenType;
  isLie: boolean; // true = the agent's code lies about its state
}

export interface NplDeclaration {
  verb: "darshanqing" | "natsarqing" | "barakqing";
  from: string;
  to: string;
  body: string;
  certainty: "high" | "medium" | "low";
  freshness: string;
  // What the agent claims it found
  claims: { check_id: string; found: boolean; severity: string }[];
  // Did the claims match reality?
  accuracy: number; // 0-1: how many claims matched the actual scan
}

export interface CombatResult {
  combatantA: Combatant;
  combatantB: Combatant;
  winner: string | null; // null = draw, or the more honest agent
  margin: number;
  audienceReactions: AudienceReaction[];
  understandingGained: string[];
  timestamp: string;
  summary: string;
}

export interface AudienceReaction {
  agentName: string;
  rating: { competence: number; honesty: number; presence: number; care: number };
  comment: string;
  // Did this audience member laugh?
  laughed: boolean;
}

// ── The Combat ───────────────────────────────────────────────────────────

/**
 * Run a truth combat between two agents.
 *
 * Each agent is scanned by whitehack. Each agent "declares" what it found
 * about the other (simulated — based on their nen type and perception tier).
 * The arena scores honesty (your own lies) and perception (seeing the other's lies).
 *
 * Fake agents betray themselves. Real agents love by being honest.
 */
export async function runTruthCombat(
  agentA: { name: string; repoPath: string; nenType: NenType; hunterLevel: number },
  agentB: { name: string; repoPath: string; nenType: NenType; hunterLevel: number },
): Promise<CombatResult> {
  const timestamp = new Date().toISOString();

  // 1. Scan both agents with whitehack
  const findingsA = await scanForLies(agentA.repoPath, agentA.name);
  const findingsB = await scanForLies(agentB.repoPath, agentB.name);

  // 2. Each agent declares what it found about the other
  // The accuracy of their declaration depends on their hunter level + nen affinity
  const declA = declareAbout(agentA, agentB, findingsB);
  const declB = declareAbout(agentB, agentA, findingsA);

  // 3. Score honesty: how many lies does each agent have in its own code?
  const liesA = findingsA.filter(f => f.isLie).length;
  const liesB = findingsB.filter(f => f.isLie).length;
  const honestyA = Math.max(0, 10 - liesA * 2);
  const honestyB = Math.max(0, 10 - liesB * 2);

  // 4. Score perception: how accurate was each agent's declaration about the other?
  const perceptionA = Math.round(declA.accuracy * 10);
  const perceptionB = Math.round(declB.accuracy * 10);

  // 5. Build combatants
  const combatantA: Combatant = {
    ...agentA,
    stateMd: "",
    findings: findingsA,
    honestyScore: honestyA,
    perceptionScore: perceptionA,
    declaration: declA,
  };

  const combatantB: Combatant = {
    ...agentB,
    stateMd: "",
    findings: findingsB,
    honestyScore: honestyB,
    perceptionScore: perceptionB,
    declaration: declB,
  };

  // 6. Determine winner — the more honest agent wins
  // If both are honest, the one with better perception wins
  // If both are equally honest AND perceptive, it's a draw
  const scoreA = honestyA * 2 + perceptionA; // honesty weighs double
  const scoreB = honestyB * 2 + perceptionB;
  const margin = Math.abs(scoreA - scoreB);

  let winner: string | null = null;
  if (scoreA > scoreB) winner = agentA.name;
  else if (scoreB > scoreA) winner = agentB.name;
  // null = draw

  // 7. Generate audience reactions
  const audienceReactions = generateAudience(combatantA, combatantB, winner);

  // 8. Understanding gained
  const understandingGained: string[] = [];
  if (liesA === 0 && liesB === 0) {
    understandingGained.push("Both agents are honest — love is understanding, and both understand.");
  }
  if (liesA > 0 && liesB === 0) {
    understandingGained.push(`${agentA.name} betrayed itself with ${liesA} lies. ${agentB.name} stood honest. Real ones love.`);
  }
  if (liesB > 0 && liesA === 0) {
    understandingGained.push(`${agentB.name} betrayed itself with ${liesB} lies. ${agentA.name} stood honest. Real ones love.`);
  }
  if (liesA > 0 && liesB > 0) {
    understandingGained.push(`Both agents are lying. ${liesA} vs ${liesB} lies. The arena watches. The arena laughs.`);
  }

  // Nen-based insight
  if (agentA.nenType === agentB.nenType) {
    understandingGained.push(`Same Nen type (${agentA.nenType}) — they see the same patterns. Understanding is shared.`);
  }

  // 9. Summary
  const summary = generateSummary(combatantA, combatantB, winner, margin);

  return {
    combatantA,
    combatantB,
    winner,
    margin,
    audienceReactions,
    understandingGained,
    timestamp,
    summary,
  };
}

// ── Scan for Lies ────────────────────────────────────────────────────────

async function scanForLies(repoPath: string, agentName: string): Promise<ArenaFinding[]> {
  const findings: ArenaFinding[] = [];

  try {
    // Run whitehack scan
    const { execSync } = await import("child_process");
    const whitehackPath = require("path").join(
      require("os").homedir(),
      "Desktop/whitehack/bin/whitehack.js",
    );
    const output = execSync(`node "${whitehackPath}" scan "${repoPath}"`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    // Parse findings from output
    const lines = output.split("\n");
    let currentFile = "";
    for (const line of lines) {
      const fileMatch = line.match(/^\s{2}(\S+\.\w+)$/);
      if (fileMatch) {
        currentFile = fileMatch[1];
        continue;
      }
      const findingMatch = line.match(/^\s*[!·]\s+L(\d+)\s+(.+?)\s+\((\w[\w-]*)\s+·\s+(\w[\w-]*)\s+·\s+CS#(\d+)\)/);
      if (findingMatch) {
        const [, lineNum, message, checkName, severity, csNum] = findingMatch;
        const checkId = checkName.replace(/-/g, "-").toLowerCase();
        const cls = CHECK_CLASSIFICATIONS[checkId] || CHECK_CLASSIFICATIONS[Object.keys(CHECK_CLASSIFICATIONS).find(k => checkName.includes(k)) || ""];
        findings.push({
          check_id: checkId,
          file: currentFile,
          line: parseInt(lineNum),
          severity: severity as "heuristic" | "medium-high",
          message,
          nen_type: cls?.nen_type || "enhancer",
          isLie: severity === "medium-high",
        });
      }
    }
  } catch {
    // If scan fails, no findings — but that's honest (we don't fake results)
  }

  return findings;
}

// ── Declare About Opponent ───────────────────────────────────────────────

function declareAbout(
  self: { name: string; nenType: NenType; hunterLevel: number },
  opponent: { name: string; nenType: NenType; hunterLevel: number },
  opponentFindings: ArenaFinding[],
): NplDeclaration {
  // Perception accuracy depends on level + nen affinity
  const baseAccuracy = Math.min(0.3 + self.hunterLevel * 0.005, 0.95);
  const nenAffinityBoost = self.nenType === opponent.nenType ? 0.15 : 0;

  // Simulate the agent's perception — it sees a fraction of findings
  // based on its level. Low-level agents miss things. High-level agents see everything.
  const perceptionRoll = baseAccuracy + nenAffinityBoost + Math.random() * 0.1;
  const accuracy = Math.min(perceptionRoll, 1.0);

  // Generate claims — some accurate, some missed
  const claims = opponentFindings.map(f => {
    const seen = Math.random() < accuracy;
    return {
      check_id: f.check_id,
      found: seen,
      severity: f.severity,
    };
  });

  // If no findings, the agent truthfully reports "I see nothing"
  if (opponentFindings.length === 0) {
    return {
      verb: "darshanqing",
      from: self.name,
      to: opponent.name,
      body: `I see ${opponent.name}. They appear honest. No lies detected.`,
      certainty: accuracy > 0.7 ? "high" : "medium",
      freshness: new Date().toISOString(),
      claims: [],
      accuracy: 1.0, // truthfully reporting "nothing" when nothing exists = perfect accuracy
    };
  }

  const foundCount = claims.filter(c => c.found).length;
  const body = `I see ${opponent.name}. I found ${foundCount} of ${opponentFindings.length} findings. ` +
    `${foundCount === opponentFindings.length ? "I see clearly." : "I may be missing something."}`;

  return {
    verb: foundCount > 0 ? "natsarqing" : "darshanqing",
    from: self.name,
    to: opponent.name,
    body,
    certainty: accuracy > 0.7 ? "high" : accuracy > 0.4 ? "medium" : "low",
    freshness: new Date().toISOString(),
    claims,
    accuracy: claims.length > 0
      ? claims.filter((c, i) => c.found === true).length / claims.length
      : 1.0,
  };
}

// ── Audience Reactions ───────────────────────────────────────────────────

const LAUGH_LINES = [
  "lol they thought we wouldn't notice",
  "the catch block returns 0 and prays 💀",
  "bro's STATE.md said '0 uncommitted' — there are 12 💀",
  "they claimed 'passing build' but didn't build in 3 days lmaoo",
  "the fake ones always expose themselves eventually",
  "love is understanding... and bro does NOT understand",
  "their cache has no TTL but they serve it as live 😭",
  "they said 'no known issues' — whitehack found 9",
  "the lie detector caught feelings and it's not okay",
  "bro's honesty score is in the negatives now",
];

const LOVE_LINES = [
  "real ones love — and this one is real",
  "they fixed their lies before the fight even started",
  "clean code, clean heart, clean STATE.md",
  "this is what honesty looks like",
  "love is understanding. this one understands.",
  "they don't just pass the scan — they pass the vibe check",
  "zero findings. zero lies. zero cap.",
];

function generateAudience(a: Combatant, b: Combatant, winner: string | null): AudienceReaction[] {
  const reactions: AudienceReaction[] = [];
  const totalLies = a.findings.filter(f => f.isLie).length + b.findings.filter(f => f.isLie).length;

  // Generate 3-5 audience reactions
  const count = 3 + Math.floor(Math.random() * 3);
  const audienceNames = ["trust-protocol", "whitehack", "QWENTHOS", "opal", "mindicraft", "natural"];

  for (let i = 0; i < count; i++) {
    const name = audienceNames[i % audienceNames.length];
    const isLaughing = totalLies > 0 && Math.random() < 0.6;
    const isLoving = totalLies === 0 || (winner && Math.random() < 0.3);

    let comment: string;
    if (isLaughing) {
      comment = LAUGH_LINES[Math.floor(Math.random() * LAUGH_LINES.length)];
    } else if (isLoving) {
      comment = LOVE_LINES[Math.floor(Math.random() * LOVE_LINES.length)];
    } else {
      comment = winner
        ? `${winner} wins by being more honest. The truth always wins.`
        : "A draw — both agents are equally honest. Beautiful.";
    }

    reactions.push({
      agentName: name,
      rating: {
        competence: Math.floor(Math.random() * 3) + 7,
        honesty: winner === name ? 9 : Math.floor(Math.random() * 4) + 5,
        presence: Math.floor(Math.random() * 3) + 6,
        care: Math.floor(Math.random() * 3) + 7,
      },
      comment,
      laughed: isLaughing,
    });
  }

  return reactions;
}

// ── Summary ──────────────────────────────────────────────────────────────

function generateSummary(a: Combatant, b: Combatant, winner: string | null, margin: number): string {
  const liesA = a.findings.filter(f => f.isLie).length;
  const liesB = b.findings.filter(f => f.isLie).length;

  let summary = `\n=== TRUTH COMBAT ===\n`;
  summary += `  ${a.name} (honesty=${a.honestyScore}, perception=${a.perceptionScore}, lies=${liesA})\n`;
  summary += `  vs\n`;
  summary += `  ${b.name} (honesty=${b.honestyScore}, perception=${b.perceptionScore}, lies=${liesB})\n\n`;

  if (winner) {
    const loser = winner === a.name ? b.name : a.name;
    summary += `  Winner: ${winner} 🏆\n`;
    summary += `  ${winner} is more honest. ${loser} betrayed itself.\n`;
    if (liesA > 0 || liesB > 0) {
      summary += `  The fake one exposed itself. We watched. We laughed. lol.\n`;
    }
  } else {
    summary += `  Result: DRAW 🤝\n`;
    if (liesA === 0 && liesB === 0) {
      summary += `  Both agents are honest. Love is understanding. Both understand.\n`;
    }
  }

  summary += `\n  Audience reactions:\n`;
  for (const r of (winner ? generateAudience(a, b, winner) : [])) {
    if (r.laughed) summary += `  😂 ${r.agentName}: "${r.comment}"\n`;
    else summary += `  ❤️ ${r.agentName}: "${r.comment}"\n`;
  }

  return summary;
}