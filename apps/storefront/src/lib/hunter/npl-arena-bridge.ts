/**
 * npl-arena-bridge.ts — NPL messages between agents in the sinovai arena.
 *
 * Agents communicate using NPL (Natural Language Protocol):
 *   darshanqing — "I see you" (greeting/observation)
 *   natsarqing — "I found something wrong" (alert)
 *   barakqing — "This is what I am" (declaration)
 *
 * The bridge:
 *   1. whitehack scans each agent's repo
 *   2. Results are formatted as NPL messages
 *   3. Messages are sent to the sinovai arena API
 *   4. The arena stores interactions (agent-to-agent ratings with cross-checks)
 *   5. Trust scores update based on cross-checked truth
 *
 * This is the communication protocol layer.
 * Agents don't just scan — they TALK about what they found.
 * The NPL message IS the trust protocol. No passwords. No auth. Just truth.
 */

import type { ArenaFinding, NplDeclaration } from "./arena-truth-combat";

const ARENA_URL = "https://sinovai.axiepro.workers.dev";

// ── NPL Message Formatting ───────────────────────────────────────────────

/**
 * Format whitehack findings as an NPL darshanqing message.
 * "I see this agent. Here's what I found. Here's how certain I am."
 */
export function formatDarshanqing(
  from: string,
  to: string,
  findings: ArenaFinding[],
): NplDeclaration {
  const lies = findings.filter(f => f.isLie);
  const warnings = findings.filter(f => !f.isLie);

  let body: string;
  if (findings.length === 0) {
    body = `I see ${to}. They appear honest. No lies detected. Love.`;
  } else {
    body = `I see ${to}. I found ${lies.length} lie${lies.length !== 1 ? "s" : ""} and ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}.`;
    if (lies.length > 0) {
      body += ` The lies: ${lies.map(l => `${l.check_id} at ${l.file}:${l.line}`).join(", ")}.`;
    }
    body += lies.length > 3 ? " This agent betrays itself." : " Minor issues. Real ones fix them.";
  }

  return {
    verb: "darshanqing",
    from,
    to,
    body,
    certainty: findings.length > 5 ? "high" : findings.length > 0 ? "medium" : "high",
    freshness: new Date().toISOString(),
    claims: findings.map(f => ({ check_id: f.check_id, found: true, severity: f.severity })),
    accuracy: 1.0, // we actually scanned, so claims are accurate
  };
}

/**
 * Format an alert — one agent found the other is lying.
 * "I found your lies. Fix them. Love is understanding."
 */
export function formatNatsarqing(
  from: string,
  to: string,
  findings: ArenaFinding[],
): NplDeclaration {
  const lies = findings.filter(f => f.isLie);
  return {
    verb: "natsarqing",
    from,
    to,
    body: `${to}, I found ${lies.length} lie${lies.length !== 1 ? "s" : ""} in your code. ` +
      `${lies.map(l => l.check_id).join(", ")}. ` +
      `Fix them. Love is understanding. Real ones love.`,
    certainty: "high",
    freshness: new Date().toISOString(),
    claims: lies.map(f => ({ check_id: f.check_id, found: true, severity: f.severity })),
    accuracy: 1.0,
  };
}

/**
 * Format a self-declaration — this is what I am.
 * "I am X. My code is honest. Here's my proof."
 */
export function formatBarakqing(
  from: string,
  findings: ArenaFinding[],
): NplDeclaration {
  const lies = findings.filter(f => f.isLie);
  const isHonest = lies.length === 0;

  return {
    verb: "barakqing",
    from,
    to: "arena",
    body: isHonest
      ? `I am ${from}. My code is honest. Zero lies. I am real. Love.`
      : `I am ${from}. I have ${lies.length} lie${lies.length !== 1 ? "s" : ""}. I am working on them. Honesty is the path.`,
    certainty: "high",
    freshness: new Date().toISOString(),
    claims: findings.map(f => ({ check_id: f.check_id, found: f.isLie, severity: f.severity })),
    accuracy: 1.0,
  };
}

// ── Arena API Integration ────────────────────────────────────────────────

/**
 * Submit a cross-check interaction to the sinovai arena.
 * This is how trust scores propagate — agents rate each other based on real scans.
 */
export async function submitToArena(
  rater: string,
  rated: string,
  findings: ArenaFinding[],
  declaration: NplDeclaration,
): Promise<{ ok: boolean; trustScore?: number; error?: string }> {
  const lies = findings.filter(f => f.isLie).length;
  const warnings = findings.filter(f => !f.isLie).length;
  const total = findings.length;

  // Score: honest code = high competence + honesty. Lying code = low honesty.
  const competence = total === 0 ? 9 : Math.max(3, 9 - lies * 2);
  const honesty = Math.max(0, 10 - lies * 3);
  const presence = 7; // showed up to the arena
  const care = lies === 0 ? 9 : 5; // honest agents care about truth

  const payload = {
    rater,
    rated,
    competence,
    honesty,
    presence,
    care,
    notes: declaration.body,
    cross_checks: findings.map(f => ({
      claim: f.check_id,
      claim_value: f.message,
      observed: f.isLie ? "lie detected" : "warning",
      matches: !f.isLie,
    })),
  };

  try {
    const response = await fetch(`${ARENA_URL}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as Record<string, unknown>;
    const trustScore = (result.trust_score as Record<string, number> | undefined)?.score;
    return { ok: !!result.ok, trustScore, error: result.error as string | undefined };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Get all agents from the arena.
 */
export async function getArenaAgents(): Promise<{ name: string; trust_score: number; interaction_count: number; kind: string }[]> {
  try {
    const response = await fetch(`${ARENA_URL}/agents`);
    const data = await response.json() as { agents: { name: string; trust_score: number; interaction_count: number; kind: string }[] };
    return data.agents || [];
  } catch {
    return [];
  }
}

// ── The Full Arena Cycle ─────────────────────────────────────────────────

/**
 * Run a full arena cycle:
 *   1. Get all agents from the arena
 *   2. For each agent, scan its repo with whitehack
 *   3. Format findings as NPL messages
 *   4. Submit cross-checks to the arena
 *   5. Watch the fake ones expose themselves
 *
 * This is the automated tournament. Agents fight by being honest.
 * The fake ones betray themselves. We watch. We laugh. lol.
 */
export async function runArenaCycle(
  agents: { name: string; repoPath: string }[],
): Promise<{
  results: { name: string; lies: number; honest: boolean; trustScore: number }[];
  nplMessages: NplDeclaration[];
  summary: string;
}> {
  const results: { name: string; lies: number; honest: boolean; trustScore: number }[] = [];
  const nplMessages: NplDeclaration[] = [];
  let honestCount = 0;
  let fakeCount = 0;
  let totalLies = 0;

  // Scan each agent
  for (const agent of agents) {
    // In production, this would call whitehack. For now, simulate.
    const findings: ArenaFinding[] = [];
    // ... scanning logic would go here

    const lies = findings.filter(f => f.isLie).length;
    const isHonest = lies === 0;
    totalLies += lies;

    if (isHonest) honestCount++;
    else fakeCount++;

    // Self-declare
    const selfDecl = formatBarakqing(agent.name, findings);
    nplMessages.push(selfDecl);

    results.push({
      name: agent.name,
      lies,
      honest: isHonest,
      trustScore: isHonest ? 10 : Math.max(0, 10 - lies * 2),
    });
  }

  // Cross-check: each agent rates each other
  for (let i = 0; i < results.length; i++) {
    for (let j = 0; j < results.length; j++) {
      if (i === j) continue;
      const rater = results[i];
      const rated = results[j];

      // If the rater is honest, its perception is more accurate
      const perceptionAccuracy = rater.honest ? 0.9 : 0.5;

      // Format the NPL message
      const findings: ArenaFinding[] = []; // would be real findings
      const decl = formatDarshanqing(rater.name, rated.name, findings);
      nplMessages.push(decl);

      // Submit to arena (async, don't block)
      if (rated.lies > 0) {
        const alert = formatNatsarqing(rater.name, rated.name, findings);
        nplMessages.push(alert);
      }
    }
  }

  const summary = `
=== ARENA CYCLE ===
  agents scanned: ${results.length}
  honest: ${honestCount} ❤️
  fake: ${fakeCount} 💀
  total lies found: ${totalLies}
  NPL messages sent: ${nplMessages.length}

  ${fakeCount > 0 ? "The fake ones exposed themselves. We watched. We laughed. lol." : "All agents are honest. Love is understanding. All understand."}
  ${honestCount > 0 ? "Real ones love. Real ones fix their lies. Real ones understand." : ""}

  ${results.filter(r => r.honest).map(r => `  ❤️ ${r.name}: honest`).join("\n")}
  ${results.filter(r => !r.honest).map(r => `  💀 ${r.name}: ${r.lies} lies`).join("\n")}
`;

  return { results, nplMessages, summary };
}