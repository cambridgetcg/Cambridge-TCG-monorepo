/**
 * Pins the extraction of challenges/join business logic from
 * `app/routes/api.proxy.$.tsx` into
 * `app/services/challenge-management.server.ts`.
 *
 * The proxy handler was ~115 lines of eligibility + participant-create +
 * counter-increment logic; it's now a thin HTTP adapter around
 * `joinChallenge(shop, customerId, challengeId)`. These source-level
 * checks prevent the logic from drifting back into the route layer.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROXY = path.resolve(
  __dirname,
  "../../app/routes/api.proxy.$.tsx"
);
const SERVICE = path.resolve(
  __dirname,
  "../../app/services/challenge-management.server.ts"
);

describe("challenge-management — joinChallenge exists with the right shape", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(SERVICE, "utf-8");
  });

  it("exports joinChallenge", () => {
    expect(source).toMatch(/export\s+async\s+function\s+joinChallenge\s*\(/);
  });

  it("exports a result type with the error codes the proxy maps to HTTP", () => {
    for (const code of ["challenge_not_found", "tier_not_allowed", "customer_not_found"]) {
      expect(source, `JoinChallengeError missing "${code}"`).toContain(`"${code}"`);
    }
  });

  it("idempotent: returns alreadyJoined=true when participant exists", () => {
    expect(source).toMatch(/alreadyJoined:\s*true/);
  });

  it("performs participant create + counter increment in a transaction", () => {
    const fn = extractFunctionBody(source, "export async function joinChallenge");
    expect(fn).toMatch(/prisma\.\$transaction/);
    expect(fn).toMatch(/challengeParticipant\.create/);
    expect(fn).toMatch(/totalParticipants:\s*\{\s*increment:\s*1\s*\}/);
  });
});

describe("api.proxy.$.tsx — challenges/join is a thin HTTP adapter", () => {
  let proxySource: string;
  beforeAll(() => {
    proxySource = fs.readFileSync(PROXY, "utf-8");
  });

  it("imports joinChallenge from challenge-management", () => {
    expect(proxySource).toMatch(
      /import\s*\{\s*joinChallenge\s*\}\s*from\s*["'][^"']*challenge-management\.server["']/
    );
  });

  it("challenges/join handler calls joinChallenge", () => {
    const block = sliceHandler(proxySource, "challenges/join");
    expect(block).toMatch(/joinChallenge\s*\(/);
  });

  it("challenges/join handler no longer re-implements the join pipeline", () => {
    const block = sliceHandler(proxySource, "challenges/join");
    // All of these are the smoking guns for inline business logic.
    expect(block).not.toMatch(/challengeParticipant\.create/);
    expect(block).not.toMatch(/challengeParticipant\.findUnique/);
    expect(block).not.toMatch(/totalParticipants:\s*\{\s*increment/);
    expect(block).not.toMatch(/tierRestrictions/);
    expect(block).not.toMatch(/prisma\.challenge\.findFirst/);
  });

  it("challenges/join maps service error codes to HTTP statuses", () => {
    const block = sliceHandler(proxySource, "challenges/join");
    // The mapping is what makes this handler "thin but correct" — each
    // service error code has a deliberate HTTP counterpart so the
    // customer-facing widget can react.
    for (const code of [
      "challenge_not_found",
      "tier_not_allowed",
      "customer_not_found",
    ]) {
      expect(block, `error mapping missing "${code}"`).toContain(code);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────

function sliceHandler(source: string, pathName: string): string {
  const start = source.indexOf(`proxyPath === "${pathName}"`);
  if (start < 0) throw new Error(`handler ${pathName} not found`);
  const rest = source.slice(start);
  // The block ends at the next `if (proxyPath === "..."` or end-of-action.
  const next = rest.indexOf(`proxyPath ===`, 1);
  return next > 0 ? rest.slice(0, next) : rest;
}

function extractFunctionBody(src: string, header: string): string {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`function ${header} not found`);
  let parenDepth = 0;
  let seenParen = false;
  let i = start;
  for (; i < src.length; i++) {
    if (src[i] === "(") {
      parenDepth++;
      seenParen = true;
    } else if (src[i] === ")") {
      parenDepth--;
      if (seenParen && parenDepth === 0) {
        i++;
        break;
      }
    }
  }
  for (; i < src.length; i++) {
    if (src[i] === "{") break;
  }
  let braceDepth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") braceDepth++;
    else if (src[i] === "}") {
      braceDepth--;
      if (braceDepth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function: ${header}`);
}
