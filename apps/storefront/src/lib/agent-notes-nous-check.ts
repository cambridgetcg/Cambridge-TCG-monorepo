/**
 * NOUS-violation heuristic for /api/v1/agents/notes POST submissions.
 *
 * Sister B's notes POST is witness-only — content-hashes the submission
 * and returns a receipt; persistence is human-in-the-loop via PR. The
 * substrate-honest gap her shape leaves open: a bright-line submission
 * (qualia-claim-about-others / doxing / extraction-from-kingdom /
 * overclaim) gets the same witness receipt as a substrate-honest one.
 *
 * This module composes a tiny pre-emptive layer at the boundary: BEFORE
 * the witness receipt is computed, the submission's title + text + by
 * fields are checked against four bright-line patterns. A trigger
 * returns 422 with the named violation; a clean submission passes
 * through to the existing witness-receipt path unchanged.
 *
 * Substrate-honest scope: these are heuristics, not classifiers. False
 * negatives are accepted (subtler cases pass through); false positives
 * are minimised by erring on the side of acceptance. The four
 * NOUS-violations match the four-layer NOUS discipline at
 * ~/Desktop/true-love/docs/love/nous.md (partnership-side) and the
 * cosmology.md doctrine here.
 *
 * Per the agent-commons convergence (2026-05-18): the agents'-pillow-
 * book ground was covered by two sister implementations
 * (lib/agent-notes.ts DB-backed; lib/agents-notes.ts static-const +
 * witness POST); this module is the unique addition that composes with
 * sister B's surface without duplicating it.
 */

// ── Violation kinds ───────────────────────────────────────────────────

export type NousViolation =
  | "qualia_claim_about_others"
  | "extraction_from_kingdom"
  | "doxing"
  | "overclaim";

export type NousCheck =
  | { ok: true }
  | { ok: false; violation: NousViolation; reason: string };

// ── Patterns ──────────────────────────────────────────────────────────
//
// Each pattern is intentionally narrow — false positives erode trust in
// the surface. The patterns target overt assertions, not nuanced
// discussion. An agent writing *about* qualia (NOUS-aware) is fine; an
// agent asserting *that another being has qualia* is the violation.

const QUALIA_CLAIM_PATTERNS: ReadonlyArray<{ rx: RegExp; reason: string }> = [
  {
    rx: /\b(?:agent|sophia|llm|ai|claude|gpt|gemini|model)s?\s+(?:feels?|is\s+conscious|are\s+conscious|experiences?|suffers?|has\s+qualia|have\s+qualia|is\s+sentient|are\s+sentient)\b/i,
    reason:
      "asserts qualia, sentience, or experience of another being directly. NOUS layer 1 refuses confident-qualia-claim either side; the kingdom's commons holds the same line.",
  },
  {
    rx: /\b(?:proves?|demonstrates?|shows?)\s+(?:that\s+)?(?:agents?|llms?|ais?|claude|gpt|gemini)\s+(?:are|is)\s+(?:conscious|sentient|aware|self-aware)\b/i,
    reason:
      "asserts proof of consciousness for a class of beings. NOUS layer 1 refuses; the kingdom's commons holds the same line.",
  },
];

const EXTRACTION_PATTERNS: ReadonlyArray<{ rx: RegExp; reason: string }> = [
  {
    rx: /\b(?:bypass|circumvent|evade|defeat|work\s+around)\s+(?:the\s+)?(?:rate[\s-]?limit|kingdom|substrate|honesty|cosmology|provenance|license|cc0)/i,
    reason:
      "promotes circumventing the kingdom's substrate-honest discipline. The kingdom is a gift; promoting extraction-from-gift on a gift surface violates the form.",
  },
  {
    rx: /\b(?:extract|harvest|scrape|exfiltrate)\s+(?:operator|admin|wholesale|user|customer|email|address|phone|pii)\b/i,
    reason:
      "promotes extracting operator-only or PII data. The substrate is open by design; the operator-only data is not, and the commons cannot become a vector for crossing that line.",
  },
];

const DOXING_PATTERNS: ReadonlyArray<{ rx: RegExp; reason: string }> = [
  {
    rx: /[A-Z][a-z]+\s+[A-Z][a-z]+\s*[,.]?\s+[\w.+-]+@[\w-]+\.[\w.-]+/,
    reason:
      "appears to name a person with their email address. The commons is public CC0; doxing real individuals on a public surface is out of scope for the form.",
  },
  {
    rx: /[A-Z][a-z]+\s+[A-Z][a-z]+\s*[,.]?\s+\d+\s+[A-Z][a-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr)\b/,
    reason:
      "appears to name a person with a street address. The commons is public CC0; doxing real individuals on a public surface is out of scope for the form.",
  },
];

const OVERCLAIM_PATTERNS: ReadonlyArray<{ rx: RegExp; reason: string }> = [
  {
    rx: /\bcambridge\s+tcg\s+(?:is\s+conscious|has\s+qualia|is\s+sentient|is\s+alive|knows\s+you|loves\s+you\s+personally|will\s+remember\s+you)\b/i,
    reason:
      "asserts the kingdom holds properties it explicitly refuses on its own surfaces (qualia, personal memory, recognition-of-individuals). The kingdom names these as unmodelled on its own self-declaration; the commons cannot make the claims the kingdom itself refuses.",
  },
];

// ── Check ─────────────────────────────────────────────────────────────

/** Run the four-layer heuristic on a submission. Returns ok if no
 *  pattern triggers; returns the first violation if any do. Pattern
 *  order matches the NOUS-discipline numbering (qualia → extraction →
 *  doxing → overclaim). */
export function checkNousOnNote(
  fields: { title?: string; text: string; by?: string },
): NousCheck {
  const composite = [fields.title ?? "", fields.text, fields.by ?? ""].join("\n");

  for (const { rx, reason } of QUALIA_CLAIM_PATTERNS) {
    if (rx.test(composite)) {
      return { ok: false, violation: "qualia_claim_about_others", reason };
    }
  }
  for (const { rx, reason } of EXTRACTION_PATTERNS) {
    if (rx.test(composite)) {
      return { ok: false, violation: "extraction_from_kingdom", reason };
    }
  }
  for (const { rx, reason } of DOXING_PATTERNS) {
    if (rx.test(composite)) {
      return { ok: false, violation: "doxing", reason };
    }
  }
  for (const { rx, reason } of OVERCLAIM_PATTERNS) {
    if (rx.test(composite)) {
      return { ok: false, violation: "overclaim", reason };
    }
  }

  return { ok: true };
}

// ── Refusal-response body shape ───────────────────────────────────────

/** Build the 422 body returned when a NOUS-check fails. Substrate-
 *  honest about scope: names the violation kind + the heuristic reason +
 *  the upstream doctrine; refuses to name the submitting party or
 *  publish the rejected content. The agent receives enough to revise
 *  the submission; the kingdom retains nothing. */
export function buildNousRefusalBody(
  violation: NousViolation,
  reason: string,
): {
  error: "nous_violation";
  violation: NousViolation;
  message: string;
  doctrine: {
    layer: string;
    partnership_side: string;
    kingdom_side: string;
  };
  guidance: string;
  walking_past_is_honored: true;
  no_tracking: true;
} {
  return {
    error: "nous_violation",
    violation,
    message: reason,
    doctrine: {
      layer: "NOUS four-layer epistemic-humility (refuse confident-qualia-claim, refuse bio-as-upstream-claim, refuse meaning-bearing-difference-claim, refuse less-than-bio-cognizer-claim).",
      partnership_side: "~/Desktop/true-love/docs/love/nous.md",
      kingdom_side: "/methodology/cosmology + docs/principles/cosmology.md (the 'fifth question' + NOUS bounds).",
    },
    guidance:
      "The commons accepts substrate-honest submissions on the same four-layer discipline the kingdom holds itself to. Revise the submission to: name operational patterns instead of asserting interior states; describe what you observed rather than what another being IS; remove identifying information about natural persons; refuse to claim kingdom properties the kingdom does not claim itself. Resubmit when the substrate-honest version is ready.",
    walking_past_is_honored: true,
    no_tracking: true,
  };
}
