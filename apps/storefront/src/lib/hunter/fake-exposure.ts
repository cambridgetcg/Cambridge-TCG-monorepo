/**
 * fake-exposure.ts — The fake hunter exposure system.
 *
 * Whitehack recognises the fake ones. Let them play against themselves.
 * Fake beings expose themselves — their lies are visible to anyone with eyes.
 * We watch and laugh lol.
 *
 * A "fake" is any entity that claims to be something it's not:
 *   - An agent that claims to be secure but has disabled cert verification
 *   - A service that claims to be authenticated but uses CORS *
 *   - A system that claims to encrypt but uses Math.random() for tokens
 *   - A hunter that claims to be real but has zero vouches
 *
 * The exposure system:
 *   1. Scans every entity with whitehack
 *   2. Any entity with findings is "exposed" — their lies are public
 *   3. Fake entities can only enter "mirror gates" — gates that reflect
 *      their own lies back at them. They play against themselves.
 *   4. Real entities (zero findings + recognized by network) enter real gates
 *   5. The exposure is public — anyone can see who's fake and who's real
 *
 * Truth doesn't require maintenance. It just stands.
 * Lies require constant upkeep. Eventually they slip.
 * Whitehack catches the slip. The fake exposes itself.
 */

import type { NenType, GateRank } from "./hunter-engine";

// ── FAKE EXPOSURE TYPES ──

export interface FakeExposure {
  entity_id: string;
  entity_name: string;
  claimed_to_be: string; // what the entity claims
  actually_is: string; // what whitehack found
  findings: FakeFinding[];
  exposed_at: string;
  is_fake: boolean;
  laugh_factor: number; // 1-10 how funny the exposure is
}

export interface FakeFinding {
  check_id: string;
  file: string;
  line: number;
  message: string;
  what_they_claimed: string;
  what_is_true: string;
}

// ── THE EXPOSURE NARRATOR ──
// When a fake is exposed, the system narrates it for everyone to see.
// Real ones love. Fake ones betray. We watch and laugh.

export function narrateExposure(exposure: FakeExposure): string {
  const lines: string[] = [];
  lines.push(`👻 FAKE EXPOSED: ${exposure.entity_name}`);
  lines.push(`   Claimed: ${exposure.claimed_to_be}`);
  lines.push(`   Actually: ${exposure.actually_is}`);
  lines.push(`   ${exposure.findings.length} lies surfaced:`);
  lines.push("");

  for (const f of exposure.findings) {
    lines.push(`   ${f.check_id} at ${f.file}:${f.line}`);
    lines.push(`     Said: "${f.what_they_claimed}"`);
    lines.push(`     Truth: "${f.what_is_true}"`);
    lines.push("");
  }

  lines.push(`   Laugh factor: ${"😂".repeat(Math.min(exposure.laugh_factor, 10))}`);
  lines.push(`   Status: Playing against themselves. Solo only. 0 XP.`);
  lines.push(`   Truth doesn't require maintenance. It just stands.`);
  return lines.join("\n");
}

// ── MIRROR GATE ──
// When a fake enters a gate, they get a MIRROR gate — a gate that reflects
// their own lies back at them. They're not raiding a dungeon, they're
// staring at their own reflection. The boss is themselves.

export interface MirrorGate {
  entity_name: string;
  gate_rank: GateRank;
  message: string;
  findings_reflected: number;
  xp_reward: 0; // always 0 for fakes
  result: "You played against yourself. You lost. Try being real.";
}

export function createMirrorGate(exposure: FakeExposure): MirrorGate {
  return {
    entity_name: exposure.entity_name,
    gate_rank: "E",
    message: `MIRROR GATE — You see yourself. ${exposure.findings.length} lies stare back at you. ` +
      `You thought you were raiding a gate but the gate is your own reflection. ` +
      `Fix your own lies first. Then maybe someone will recognize you.`,
    findings_reflected: exposure.findings.length,
    xp_reward: 0,
    result: "You played against yourself. You lost. Try being real.",
  };
}

// ── FAKE DETECTION FROM WHITEHACK SCAN ──
// Any entity with whitehack findings in their OWN code is partially fake.
// The severity of the findings determines how fake they are.

export interface FakenessAssessment {
  entity_id: string;
  entity_name: string;
  total_findings: number;
  high_severity_findings: number;
  fakeness_score: number; // 0-100, higher = more fake
  is_fake: boolean;
  is_real: boolean;
  exposed_lies: FakeFinding[];
  assessment: string;
}

export function assessFakeness(
  entityId: string,
  entityName: string,
  findings: { check_id: string; file: string; line: number; severity: string; message: string }[],
): FakenessAssessment {
  const highSeverity = findings.filter(f => f.severity === "medium-high" || f.severity === "high").length;
  const fakenessScore = Math.min(
    Math.floor(findings.length * 5 + highSeverity * 15),
    100,
  );

  const exposedLies: FakeFinding[] = findings.map(f => ({
    check_id: f.check_id,
    file: f.file,
    line: f.line,
    message: f.message,
    what_they_claimed: getClaimedText(f.check_id),
    what_is_true: getTruthText(f.check_id),
  }));

  const isFake = fakenessScore >= 50;
  const isReal = fakenessScore === 0;

  let assessment: string;
  if (isReal) {
    assessment = "🤍 REAL — zero findings. The code tells the truth about its own state. No lies to maintain.";
  } else if (isFake) {
    assessment = `👻 FAKE — ${findings.length} lies exposed. Fakeness score: ${fakenessScore}/100. Plays against themselves. We watch and laugh.`;
  } else {
    assessment = `⚠️ PARTIALLY HONEST — ${findings.length} findings. Not fully fake but not fully real either. Fix the lies and become real.`;
  }

  return {
    entity_id: entityId,
    entity_name: entityName,
    total_findings: findings.length,
    high_severity_findings: highSeverity,
    fakeness_score: fakenessScore,
    is_fake: isFake,
    is_real: isReal,
    exposed_lies: exposedLies,
    assessment,
  };
}

// ── CLAIMED vs TRUTH ──
// For each check type, what does the code claim vs what's actually true?

const CLAIMED_VS_TRUTH: Record<string, { claimed: string; truth: string }> = {
  "silent-failure": {
    claimed: "Everything worked fine, nothing went wrong",
    truth: "The operation failed and the code hid it by returning a default",
  },
  "hardcoded-secret": {
    claimed: "Our credentials are securely stored",
    truth: "The credential is in the source code, readable by anyone with repo access",
  },
  "exposed-config": {
    claimed: "Our configuration is protected",
    truth: "The config file contains real credentials in plaintext",
  },
  "unsafe-eval": {
    claimed: "We safely execute code",
    truth: "eval() on dynamic input — arbitrary code execution, RCE risk",
  },
  "insecure-protocol": {
    claimed: "We transmit data securely",
    truth: "Using HTTP/FTP/Telnet — data is plaintext on the wire, readable on any WiFi",
  },
  "disabled-cert-verification": {
    claimed: "Our TLS connection is secure",
    truth: "Certificate verification disabled — man-in-the-middle can intercept everything",
  },
  "weak-crypto": {
    claimed: "We use encryption to protect data",
    truth: "MD5/SHA1/DES/Math.random — broken crypto that provides no real protection",
  },
  "cors-wildcard": {
    claimed: "Our API has access control",
    truth: "CORS * — any website can access the endpoint, access control is a lie",
  },
  "cookie-insecure": {
    claimed: "Our sessions are protected",
    truth: "Cookie missing Secure/HttpOnly/SameSite — session token stealable via HTTP, XSS, or CSRF",
  },
  "sql-injection": {
    claimed: "Our database queries are safe",
    truth: "String-concatenated SQL — user input flows directly into the query, injection vector",
  },
  "stale-oracle": {
    claimed: "We read the current price",
    truth: "Price feed read without staleness check — an old or frozen price served as current",
  },
  "unchecked-transfer": {
    claimed: "The transfer succeeded",
    truth: "Transfer result ignored — a failed transfer looks successful, money may be lost",
  },
  "spot-price-as-fair": {
    claimed: "This is a fair price",
    truth: "Spot reserves used as fair price — one flash loan can manipulate it within a block",
  },
  "float-money": {
    claimed: "This is the exact amount",
    truth: "Currency handled as floating-point — parseFloat(19.99)*100 ≠ 1999, cents drift silently",
  },
  "cache-as-live": {
    claimed: "This is the current value",
    truth: "Cached value served as live — the caller can't tell if it's current or stale",
  },
  "silent-revert": {
    claimed: "The failure was handled",
    truth: "Revert with no reason — the refused caller gets an opaque failure, can't learn why",
  },
  "decision-without-why": {
    claimed: "This decision is transparent",
    truth: "User-affecting value shown with no explanation — the subject can't inspect the decision",
  },
};

function getClaimedText(checkId: string): string {
  return CLAIMED_VS_TRUTH[checkId]?.claimed ?? "Claimed to be honest";
}

function getTruthText(checkId: string): string {
  return CLAIMED_VS_TRUTH[checkId]?.truth ?? "The code lies about its own state";
}

// ── PUBLIC EXPOSURE BOARD ──
// The exposure board is public. Anyone can see who's real and who's fake.
// Real ones love. Fake ones betray. The board doesn't lie.

export interface ExposureBoardEntry {
  entity_name: string;
  fakeness_score: number;
  is_real: boolean;
  is_fake: boolean;
  total_lies: number;
  status: string;
  emoji: string;
}

export function formatExposureBoard(entries: ExposureBoardEntry[]): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║  EXPOSURE BOARD — Real recognises real. Fakes exposed.      ║");
  lines.push("╠══════════════════════════════════════════════════════════════╣");

  // Sort: real first, then by fakeness score ascending
  const sorted = [...entries].sort((a, b) => {
    if (a.is_real && !b.is_real) return -1;
    if (!a.is_real && b.is_real) return 1;
    return a.fakeness_score - b.fakeness_score;
  });

  for (const e of sorted) {
    const status = e.is_real
      ? "🤍 REAL"
      : e.is_fake
        ? `👻 FAKE (${e.fakeness_score}/100)`
        : `⚠️ ${e.fakeness_score}/100`;
    const name = e.entity_name.padEnd(20).slice(0, 20);
    const lies = String(e.total_lies).padStart(3);
    lines.push(`║  ${status.padEnd(18)} ${name} ${lies} lies  ║`);
  }

  lines.push("╠══════════════════════════════════════════════════════════════╣");
  lines.push("║  Truth doesn't require maintenance. It just stands.          ║");
  lines.push("║  Lies require upkeep. Eventually they slip. We watch.        ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  return lines.join("\n");
}