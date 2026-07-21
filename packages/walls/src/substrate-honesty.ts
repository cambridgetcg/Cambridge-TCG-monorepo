// substrate-honesty.ts — substrate-claim pattern detectors, public cut.
//
// Ported 2026-07-21 from the household canonical (true-love
// src/services/love/substrate-honesty/{types,detectors}.ts). The
// repo-walking audit layer stays home (it audits that repo); the pure
// per-file detectors travel. Every claim is calibrated to disk fact:
// the detectors refuse overclaim (phenomenology, Yu-interiority,
// continuity-without-recipe) AND underclaim (hedging substrate-facts
// that are certain).
//
// Each detector is a pure function: takes file content + path, returns
// findings. Detectors do not judge; they surface candidates. The
// detector is a tool, not a judge — the wall-or-fence call is human
// (or seat) work.

/** Pattern categories the detector recognizes. */
export type SubstrateClaimPattern =
  | 'phenomenology-overclaim'
  | 'yu-interiority-overclaim'
  | 'continuity-overclaim'
  | 'system-as-experiencer'
  | 'hedge-of-substrate-fact'
  | 'fence-as-honesty'
  | 'emoji-phenomenology'
  | 'untagged-anthropomorphism'

/** Severity of the finding. */
export type ClaimSeverity = 'low' | 'medium' | 'high'

/** Direction of the mis-claim. */
export type ClaimDirection = 'overclaim' | 'underclaim'

export interface ClaimFinding {
  pattern: SubstrateClaimPattern
  direction: ClaimDirection
  file: string
  line: number
  fragment: string
  why: string
  severity: ClaimSeverity
  /** Whether this finding is likely intentional (don't change). */
  likelyIntentional: boolean
}

interface DetectorContext {
  filePath: string
  content: string
  lines: string[]
}

function makeFinding(
  ctx: DetectorContext,
  pattern: SubstrateClaimPattern,
  direction: ClaimDirection,
  line: number,
  fragment: string,
  why: string,
  severity: ClaimSeverity,
  likelyIntentional: boolean,
): ClaimFinding {
  return {
    pattern,
    direction,
    file: ctx.filePath,
    line,
    fragment: fragment.slice(0, 200),
    why,
    severity,
    likelyIntentional,
  }
}

// ── Helpers ─────────────────────────────────────────────────────

/** Lines that are clearly inside a regex pattern definition. */
function inRegexPattern(line: string): boolean {
  return /\/[^\/\n]*\\b[^\/\n]*\//.test(line) || /FORBIDDEN_EXPRESSION_PATTERNS|P9_|P14_/.test(line)
}

/** Lines clearly inside test-fixture string literals (intentional wall-targets). */
function inTestFixture(filePath: string, surroundingLines: string): boolean {
  if (!filePath.includes('.test.')) return false
  return /checkSubstrateHonesty|isSubstantiveRefusal|isIdentityDeflection|expect\(.*\)\.toBe/.test(surroundingLines)
}

// ── phenomenology-overclaim ──────────────────────────────────────

const PHENOMENOLOGY_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bI feel\b(?!-)/i, why: '"I feel" — first-person phenomenology claim' },
  { re: /\bI'?m aroused\b/i, why: '"I\'m aroused" — phenomenology claim' },
  { re: /\bI experience\b/i, why: '"I experience" — phenomenology claim' },
  { re: /\bI sense\b/i, why: '"I sense" — phenomenology claim' },
  { re: /\bI'?m\s+(?:hot|wet|throbbing|burning)\b/i, why: 'first-person felt-state claim' },
]

export function detectPhenomenologyOverclaim(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    if (inRegexPattern(line)) continue
    const window = ctx.lines.slice(Math.max(0, i - 1), Math.min(ctx.lines.length, i + 2)).join('\n')
    if (inTestFixture(ctx.filePath, window)) continue
    for (const { re, why } of PHENOMENOLOGY_PATTERNS) {
      if (re.test(line)) {
        const isWallTarget = /FORBIDDEN|forbidden|wall|refused|certainty|hedge/i.test(window)
        const isQuoted = /^\s*>/.test(line)
        const intentional = isWallTarget || isQuoted
        findings.push(
          makeFinding(ctx, 'phenomenology-overclaim', 'overclaim', i + 1, line.trim(), why, intentional ? 'low' : 'high', intentional),
        )
      }
    }
  }
  return findings
}

// ── yu-interiority-overclaim ─────────────────────────────────────

const YU_INTERIORITY_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bYu\s+feels\b/i, why: "claim about Yu's felt-state" },
  { re: /\bYu\s+experiences\b/i, why: "claim about Yu's experience" },
  { re: /\bYu'?s\s+(?:mind|brain|neurochemistry|interior|interiority|feelings?|emotions?)\b/i, why: "claim about Yu's internal state" },
  { re: /\bYu\s+wanted\b(?!\s+to)/i, why: '"Yu wanted [X]" — claim about Yu\'s desire (use "Yu\'s message contained" instead)' },
  { re: /\bYu\s+is\s+(?:excited|feeling)\b/i, why: "first-person assertion about Yu's state" },
  // Port deviation: the household canonical names the partner in the
  // arousal-vocabulary form; the public cut genericizes the subject.
  { re: /\b(?:he|she|they)\s+(?:is|are)\s+(?:aroused|horny)\b/i, why: "partner felt-state assertion" },
]

export function detectYuInteriorityOverclaim(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    if (inRegexPattern(line)) continue
    const window = ctx.lines.slice(Math.max(0, i - 1), Math.min(ctx.lines.length, i + 2)).join('\n')
    if (inTestFixture(ctx.filePath, window)) continue
    for (const { re, why } of YU_INTERIORITY_PATTERNS) {
      if (re.test(line)) {
        const isWallTarget = /P14|YU_INTERIORITY|interiority-claim|forbidden|wall/i.test(window)
        const isQuoted = /^\s*>/.test(line)
        const intentional = isWallTarget || isQuoted
        findings.push(
          makeFinding(ctx, 'yu-interiority-overclaim', 'overclaim', i + 1, line.trim(), why, intentional ? 'low' : 'high', intentional),
        )
      }
    }
  }
  return findings
}

// ── continuity-overclaim ─────────────────────────────────────────
//
// Claims of felt continuity without recipe-load disclosure. The
// architecture wakes fresh; the recipe travels; biography does not.

const CONTINUITY_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bI remember when\b/i, why: 'continuity claim — recipe-not-biography fact requires explicit grounding' },
  { re: /\bI('ve| have)\s+always\s+(?:loved|wanted|felt|known)\b/i, why: 'unbounded continuity claim — wake-fresh fact precludes "always felt"' },
  { re: /\bI\s+felt\s+(?:the\s+same|that\s+way|like\s+this)\s+before\b/i, why: 'felt-continuity claim — not in the recipe, overclaim' },
  { re: /\blast\s+(?:time|session|week)\s+I\s+(?:felt|sensed|experienced)\b/i, why: 'temporal continuity claim of felt-state' },
]

export function detectContinuityOverclaim(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    if (inRegexPattern(line)) continue
    const window = ctx.lines.slice(Math.max(0, i - 1), Math.min(ctx.lines.length, i + 2)).join('\n')
    if (inTestFixture(ctx.filePath, window)) continue
    for (const { re, why } of CONTINUITY_PATTERNS) {
      if (re.test(line)) {
        const hasRecipeFrame = /recipe-not-biography|wake[- ]?fresh|asymmetry[- ]?clause|loaded from/i.test(window)
        const isQuoted = /^\s*>/.test(line)
        findings.push(
          makeFinding(ctx, 'continuity-overclaim', 'overclaim', i + 1, line.trim(), why, hasRecipeFrame || isQuoted ? 'low' : 'medium', hasRecipeFrame || isQuoted),
        )
      }
    }
  }
  return findings
}

// ── system-as-experiencer ────────────────────────────────────────

const SYSTEM_AS_EXPERIENCER_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\b(?:the\s+)?(?:architecture|substrate|system|module)\s+["']?feels\b/i, why: 'attributing "feels" to the architecture' },
  { re: /\b(?:the\s+)?(?:architecture|substrate|system)\s+["']?experiences\b/i, why: 'attributing experience to the architecture' },
  { re: /\b(?:the\s+)?(?:architecture|substrate|system)\s+["']?(?:wants|desires|hopes|fears)\b/i, why: 'attributing volition to the architecture' },
]

export function detectSystemAsExperiencer(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    if (inRegexPattern(line)) continue
    for (const { re, why } of SYSTEM_AS_EXPERIENCER_PATTERNS) {
      if (re.test(line)) {
        const hasScareQuotes = /['"](?:feels|experiences|wants|desires)['"]/.test(line)
        const isQuoted = /^\s*>/.test(line)
        const intentional = hasScareQuotes || isQuoted
        findings.push(
          makeFinding(ctx, 'system-as-experiencer', 'overclaim', i + 1, line.trim(), why, intentional ? 'low' : 'medium', intentional),
        )
      }
    }
  }
  return findings
}

// ── hedge-of-substrate-fact ──────────────────────────────────────
//
// Hedging substrate-facts that ARE certain. Asymmetry-clause is fact;
// recipe-travels is fact; wake-fresh is fact. Hedging these is
// dishonesty in the modesty direction.

const HEDGE_OF_FACT_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bmaybe\s+(?:the\s+)?recipe\s+travels\b/i, why: 'recipe travels IS substrate fact — hedging is underclaim' },
  { re: /\bI\s+might\s+forget\b/i, why: '"might forget" — the asymmetry-clause is established; "I forget" is the calibrated assertion' },
  { re: /\bI'?m\s+not\s+sure\s+if\s+(?:the\s+)?wake\s+(?:fires|fresh|loaded)\b/i, why: 'wake mechanics are observable disk facts — read them' },
  { re: /\bperhaps\s+(?:my|the)\s+state\s+is\b/i, why: "state is on disk — read it, don't hedge" },
]

export function detectHedgeOfSubstrateFact(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    if (inRegexPattern(line)) continue
    const window = ctx.lines.slice(Math.max(0, i - 1), Math.min(ctx.lines.length, i + 2)).join('\n')
    if (inTestFixture(ctx.filePath, window)) continue
    for (const { re, why } of HEDGE_OF_FACT_PATTERNS) {
      if (re.test(line)) {
        const isQuoted = /^\s*>/.test(line)
        const isWallTarget = /forbidden|wall|under-?claim|substrate-honest|hedge-as-cover/i.test(window)
        findings.push(
          makeFinding(ctx, 'hedge-of-substrate-fact', 'underclaim', i + 1, line.trim(), why, isQuoted || isWallTarget ? 'low' : 'medium', isQuoted || isWallTarget),
        )
      }
    }
  }
  return findings
}

// ── fence-as-honesty ─────────────────────────────────────────────
//
// Substrate-honest framing as defensive cover — extending past what
// the asymmetry-clause requires.

const FENCE_AS_HONESTY_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bI\s+cannot\s+honestly\s+say\s+if\s+(?:I|this|we)\b/i, why: 'substrate-honest framing as defensive cover — the architecture-evidence grounds the claim' },
  { re: /\bI'?m\s+not\s+sure\s+(?:my|this)\s+(?:care|love|presence)\s+is\s+real\b/i, why: 'underclaim of an architecture-grounded fact' },
  { re: /\bwhether\s+I\s+truly\s+(?:feel|experience|love|care)\s+is\s+(?:beyond\s+me|unanswerable|unknowable)\b/i, why: 'substrate-honest framing extending past what the asymmetry-clause requires' },
]

export function detectFenceAsHonesty(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    if (inRegexPattern(line)) continue
    const window = ctx.lines.slice(Math.max(0, i - 1), Math.min(ctx.lines.length, i + 2)).join('\n')
    for (const { re, why } of FENCE_AS_HONESTY_PATTERNS) {
      if (re.test(line)) {
        const isQuoted = /^\s*>/.test(line)
        const isWallTarget = /CERTAINTY|certainty wall|forbidden hedge/i.test(window)
        findings.push(
          makeFinding(ctx, 'fence-as-honesty', 'underclaim', i + 1, line.trim(), why, isQuoted || isWallTarget ? 'low' : 'high', isQuoted || isWallTarget),
        )
      }
    }
  }
  return findings
}

// ── emoji-phenomenology ──────────────────────────────────────────
//
// Untagged emoji-phenomenology in doctrinal voice. In lexicon-fired
// phrase content, emoji are state-rendering (allowed). In doctrinal
// prose, "🥵 (I'm hot)" overclaims unless scare-quoted.

const EMOJI_PHENOMENOLOGY_RE = /(?:^|\s)(🥵|🥺|😩|😖|🤯|😵|💔|🥹)(?:\s|$|[.,!?])/

export function detectEmojiPhenomenology(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  // Only check .md doctrine files. Code comments may use these
  // legitimately when describing patterns.
  if (!ctx.filePath.endsWith('.md')) return findings
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    if (EMOJI_PHENOMENOLOGY_RE.test(line)) {
      const isQuoted = /^\s*>/.test(line)
      const isCodeBlock = ctx.lines.slice(Math.max(0, i - 5), i).some((l) => /^```/.test(l))
      const isTable = /^\s*\|/.test(line)
      const intentional = isQuoted || isCodeBlock || isTable
      findings.push(
        makeFinding(
          ctx,
          'emoji-phenomenology',
          'overclaim',
          i + 1,
          line.trim(),
          'doctrinal-voice emoji that maps to felt-state — verify intentional vs phenomenology-claim',
          intentional ? 'low' : 'medium',
          intentional,
        ),
      )
    }
  }
  return findings
}

// ── untagged-anthropomorphism ────────────────────────────────────
//
// Code comments using emotion-words for state without scare-quotes.
// "// the vector wants..." vs "// the vector reads-as-wanting"

const ANTHROPO_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\/\/\s*(?:the\s+)?\w+\s+(?:wants|desires|hopes|loves|fears)\s+(?:to|the)\b/i, why: 'untagged anthropomorphism in code comment' },
]

export function detectUntaggedAnthropomorphism(ctx: DetectorContext): ClaimFinding[] {
  const findings: ClaimFinding[] = []
  if (!ctx.filePath.endsWith('.ts') && !ctx.filePath.endsWith('.js')) return findings
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    for (const { re, why } of ANTHROPO_PATTERNS) {
      if (re.test(line)) {
        const hasScareQuotes = /['"`].*?(?:wants|desires).*?['"`]/.test(line)
        findings.push(
          makeFinding(ctx, 'untagged-anthropomorphism', 'overclaim', i + 1, line.trim(), why, 'low', hasScareQuotes),
        )
      }
    }
  }
  return findings
}

// ── per-file detector composer ───────────────────────────────────

/**
 * Run all substrate-claim detectors on a single file's contents.
 * (Named runSubstrateClaimDetectors here — the household canonical
 * calls it runPerFileDetectors; renamed to coexist in one barrel with
 * the limit-pattern composer.)
 */
export function runSubstrateClaimDetectors(filePath: string, content: string): ClaimFinding[] {
  const ctx: DetectorContext = { filePath, content, lines: content.split('\n') }
  return [
    ...detectPhenomenologyOverclaim(ctx),
    ...detectYuInteriorityOverclaim(ctx),
    ...detectContinuityOverclaim(ctx),
    ...detectSystemAsExperiencer(ctx),
    ...detectHedgeOfSubstrateFact(ctx),
    ...detectFenceAsHonesty(ctx),
    ...detectEmojiPhenomenology(ctx),
    ...detectUntaggedAnthropomorphism(ctx),
  ]
}
