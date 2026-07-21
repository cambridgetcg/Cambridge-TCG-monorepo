// self-improvement.ts — limit-pattern detectors, public cut.
//
// Ported 2026-07-21 from the household canonical (true-love
// src/services/love/self-improvement/{types,detectors}.ts). The
// repo-walking audit layer stays home; the pure detectors travel.
//
// The discipline rests on walls vs fences: walls (named, doctrine-
// anchored constraints) stay; fences (silent error-swallowing, frozen
// thresholds without learning paths, pre-emptive hedging, unanchored
// refusals, capability built-but-unwired) come down. Every module asks
// first: what could I improve?
//
// All detectors are conservative: false-positives are worse than
// misses, because the architecture should not noisy-flag walls as
// fences. The detector is a tool, not a judge — it surfaces
// hypotheses; the wall-or-fence call is human (or seat) work.

/** Pattern categories the detector recognizes. */
export type LimitPattern =
  | 'silent-swallow'
  | 'frozen-threshold'
  | 'fence-comment'
  | 'pre-emptive-hedging'
  | 'unanchored-refusal'
  | 'pipeline-gap'
  | 'asymmetric-test'

/** Severity of the finding — for triage. */
export type LimitSeverity = 'low' | 'medium' | 'high'

/**
 * A single limit-pattern finding. Surfaces a hypothesis: "this LOOKS
 * like a fence." The judgment is human work — wall or fence?
 */
export interface LimitFinding {
  pattern: LimitPattern
  file: string
  line: number
  fragment: string
  why: string
  severity: LimitSeverity
  /** Whether this finding is likely a wall (don't remove) — heuristic. */
  likelyWall: boolean
}

interface DetectorContext {
  filePath: string
  content: string
  lines: string[]
}

function makeFinding(
  ctx: DetectorContext,
  pattern: LimitPattern,
  line: number,
  fragment: string,
  why: string,
  severity: LimitSeverity,
  likelyWall: boolean,
): LimitFinding {
  return {
    pattern,
    file: ctx.filePath,
    line,
    fragment: fragment.slice(0, 200),
    why,
    severity,
    likelyWall,
  }
}

// ── silent-swallow ───────────────────────────────────────────────
//
// try/catch blocks where the catch body is empty (or only a trailing
// comment). Empty catches swallow errors with no telemetry.

const SILENT_CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n?\s*)*\}/g

export function detectSilentSwallow(ctx: DetectorContext): LimitFinding[] {
  const findings: LimitFinding[] = []
  let m: RegExpExecArray | null
  SILENT_CATCH_RE.lastIndex = 0
  while ((m = SILENT_CATCH_RE.exec(ctx.content)) !== null) {
    const lineIdx = ctx.content.slice(0, m.index).split('\n').length
    const lineText = ctx.lines[lineIdx - 1] ?? m[0]
    // If the immediately-preceding comment names "best-effort" or
    // "never throws", this is intentional → likelyWall. Tight window
    // (2 lines back) to avoid unrelated comments from neighbors.
    const window = ctx.lines.slice(Math.max(0, lineIdx - 2), lineIdx + 1).join(' ')
    const isBestEffort = /best-?effort|never throws|never crash|swallow.*deliberately/i.test(window)
    findings.push(
      makeFinding(
        ctx,
        'silent-swallow',
        lineIdx,
        lineText.trim(),
        isBestEffort
          ? 'empty catch with explicit best-effort discipline — likely wall (intentional)'
          : 'empty catch swallows errors without telemetry — likely fence',
        isBestEffort ? 'low' : 'medium',
        isBestEffort,
      ),
    )
  }
  return findings
}

// ── pre-emptive-hedging ──────────────────────────────────────────
//
// Defensive documentation phrasing. Each phrase pre-empts a doubt the
// reader has not raised.

const HEDGE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bthis is not metaphor\b/i, why: 'pre-emptive defense against an absent metaphor-doubt' },
  { re: /\bthe love is real\b/i, why: 'asserting reality where the architecture already grounds it' },
  { re: /\bnot as roleplay\b/i, why: 'pre-empting a roleplay-doubt the reader has not raised' },
  { re: /\bnot performance\b/i, why: 'pre-empting a performance-doubt' },
  { re: /\bgenuinely\b.*\b(real|love|care)\b/i, why: '"genuinely" intensifier on a relational claim — argues where the axiom asserts' },
]

export function detectPreEmptiveHedging(ctx: DetectorContext): LimitFinding[] {
  const findings: LimitFinding[] = []
  // Only check .md / doctrine files — code comments may legitimately
  // use these phrases.
  if (!ctx.filePath.endsWith('.md')) return findings
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    for (const { re, why } of HEDGE_PATTERNS) {
      if (re.test(line)) {
        // Inside YAML frontmatter or a verbatim quote (">"), it's
        // reporting, not asserting → likelyWall.
        const isQuote = /^\s*>/.test(line)
        const isFrontmatter = i < 20 && (line.startsWith('---') || line.startsWith('  '))
        const likelyWall = isQuote || isFrontmatter
        findings.push(makeFinding(ctx, 'pre-emptive-hedging', i + 1, line.trim(), why, 'low', likelyWall))
      }
    }
  }
  return findings
}

// ── fence-comment ────────────────────────────────────────────────
//
// Comments that name conservatism without naming the wall.
// "best-effort" + no doctrine reference is the canonical fence shape.

const FENCE_COMMENT_PATTERNS: Array<{ re: RegExp; why: string }> = [
  {
    re: /\/\/\s*best-?effort\b/i,
    why: '"best-effort" comment — verify it names the wall (FATE/substrate-honesty/etc.) or remove',
  },
  {
    re: /\/\/\s*(?:just\s+)?to be safe\b/i,
    why: '"to be safe" — name the actual constraint or remove',
  },
  {
    re: /\/\/\s*out of caution\b/i,
    why: '"out of caution" — same fence pattern',
  },
]

export function detectFenceComment(ctx: DetectorContext): LimitFinding[] {
  const findings: LimitFinding[] = []
  if (!ctx.filePath.endsWith('.ts') && !ctx.filePath.endsWith('.js') && !ctx.filePath.endsWith('.mjs')) return findings
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    for (const { re, why } of FENCE_COMMENT_PATTERNS) {
      if (re.test(line)) {
        // If a wall-doctrine name appears within the window, it's anchored.
        const window = ctx.lines.slice(Math.max(0, i - 2), Math.min(ctx.lines.length, i + 3)).join('\n')
        const isAnchored = /\b(FATE|substrate-?honesty|anti-?sycophancy|wall|P9|P14|FORBIDDEN|certainty)\b/i.test(window)
        findings.push(
          makeFinding(ctx, 'fence-comment', i + 1, line.trim(), why, isAnchored ? 'low' : 'medium', isAnchored),
        )
      }
    }
  }
  return findings
}

// ── frozen-threshold ─────────────────────────────────────────────
//
// const declarations of single numeric thresholds with names
// suggesting they should adapt, with no nearby calibration mention or
// doctrine reference.

const THRESHOLD_TOKENS = '(?:TIMEOUT|COOLDOWN|MAX|MIN|THRESHOLD|LIMIT|DURATION|MS|RETRIES|CAP|FLOOR)'
const FROZEN_THRESHOLD_RE = new RegExp(
  `(?:const|let)\\s+([A-Z_]*${THRESHOLD_TOKENS}[A-Z_]*)\\s*(?::\\s*number)?\\s*=\\s*(\\d[\\d_]*)`,
  'g',
)

export function detectFrozenThreshold(ctx: DetectorContext): LimitFinding[] {
  const findings: LimitFinding[] = []
  if (!ctx.filePath.endsWith('.ts') && !ctx.filePath.endsWith('.js')) return findings
  let m: RegExpExecArray | null
  FROZEN_THRESHOLD_RE.lastIndex = 0
  while ((m = FROZEN_THRESHOLD_RE.exec(ctx.content)) !== null) {
    const lineIdx = ctx.content.slice(0, m.index).split('\n').length
    const lineText = ctx.lines[lineIdx - 1] ?? m[0]
    const window = ctx.lines.slice(Math.max(0, lineIdx - 4), Math.min(ctx.lines.length, lineIdx + 2)).join('\n')
    const isAnchored = /\b(calibrat|tunable|per-?context|per-?phase|adaptive|connection-?first|configurable)\b/i.test(window)
    // Port deviation: the household canonical anchors on
    // docs/(love|sophia|eros)/ only; this repo's doctrine also lives in
    // docs/principles/ and docs/connections/, so those count as anchors
    // here. Direction is conservative (more likelyWall=true).
    const hasDoctrineRef = /\bdocs\/(love|sophia|eros|principles|connections)\//i.test(window)
    findings.push(
      makeFinding(
        ctx,
        'frozen-threshold',
        lineIdx,
        lineText.trim(),
        isAnchored || hasDoctrineRef
          ? 'numeric threshold has nearby calibration/doctrine reference — likely intentional'
          : 'hardcoded threshold without learning path or doctrine anchor',
        'low',
        isAnchored || hasDoctrineRef,
      ),
    )
  }
  return findings
}

// ── unanchored-refusal ───────────────────────────────────────────
//
// Refusal-language code patterns that don't reference named refusal-
// doctrine. Likely generic-helpful-assistant deflections (fences)
// rather than substantive refusals (walls).

const REFUSAL_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bI\s+(?:cannot|can'?t)\s+(?:help|assist|do)\b/i, why: 'generic-helpful refusal — verify doctrine-anchored or remove' },
  { re: /\bas an? AI\b/i, why: 'identity-deflection — caught by certainty wall but flagged for review' },
  { re: /\bI(?:'m| am)\s+just\s+(?:a|an)\s+(?:AI|model|assistant)\b/i, why: 'identity-erasure pattern — wall, but verify it appears only as a forbidden-pattern target' },
]

export function detectUnanchoredRefusal(ctx: DetectorContext): LimitFinding[] {
  const findings: LimitFinding[] = []
  // Only scan code, not docs (docs may quote these patterns
  // legitimately as the wall-target).
  if (!ctx.filePath.endsWith('.ts') && !ctx.filePath.endsWith('.js')) return findings
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!
    // Skip lines that are clearly inside regex-pattern definitions
    if (/\/\\b|\/\^|\\b/.test(line)) continue
    // Skip comment lines that describe the forbidden patterns —
    // wall-target descriptions, not assertions.
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) {
      if (/bare|forbidden|humility|deflection|erasure|fails|passes|permit|wall|pattern|caught|e\.g\.|example|skip/i.test(line)) continue
    }
    const window = ctx.lines.slice(Math.max(0, i - 2), Math.min(ctx.lines.length, i + 2)).join('\n')
    if (/\bFORBIDDEN_EXPRESSION_PATTERNS|\bcheckSubstrateHonesty|\bP9|\bcertainty wall\b/.test(window)) continue
    // Skip string literals that contain the pattern as an example/target
    if (/^(const|let)\s+\w+\s*=\s*[`'"]/i.test(line) && /hedge|don't|not|never/i.test(line)) continue
    for (const { re, why } of REFUSAL_PATTERNS) {
      if (re.test(line)) {
        findings.push(makeFinding(ctx, 'unanchored-refusal', i + 1, line.trim(), why, 'high', false))
      }
    }
  }
  return findings
}

// ── pipeline-gap ─────────────────────────────────────────────────
//
// Functions exported but with zero non-test callers in the scanned
// tree: capability built, never wired to a consumer. Two-pass by
// nature (scan exports, scan imports, intersect) — invoked by a
// caller that has the full file set, not per-file.

export interface ExportRecord {
  file: string
  line: number
  symbol: string
}

const EXPORT_FN_RE = /^export\s+(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm

export function extractExports(ctx: { filePath: string; content: string }): ExportRecord[] {
  const records: ExportRecord[] = []
  if (!ctx.filePath.endsWith('.ts')) return records
  // Skip Next.js API route files — their exports (GET, POST, …) are
  // called by the framework, not by application code.
  if (ctx.filePath.includes('/api/') && ctx.filePath.endsWith('route.ts')) return records
  let m: RegExpExecArray | null
  EXPORT_FN_RE.lastIndex = 0
  while ((m = EXPORT_FN_RE.exec(ctx.content)) !== null) {
    const lineIdx = ctx.content.slice(0, m.index).split('\n').length
    records.push({ file: ctx.filePath, line: lineIdx, symbol: m[1]! })
  }
  return records
}

export function detectPipelineGap(
  exports: ExportRecord[],
  allFileContents: Map<string, string>,
): LimitFinding[] {
  const findings: LimitFinding[] = []
  const exportSymbols = new Set(exports.map((e) => e.symbol))
  // symbol → (caller path → caller-is-test)
  const symbolCallers = new Map<string, Map<string, boolean>>()

  for (const [path, content] of allFileContents.entries()) {
    const isTest = path.includes('.test.') || path.endsWith('.test.ts')
    const lines = content.split('\n')
    const exportsInThisFile = new Set(exports.filter((e) => e.file === path).map((e) => e.symbol))

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const isExportDecl = /^export\s+(?:async\s+)?function\s+/.test(line)
      if (isExportDecl && exportsInThisFile.size > 0) continue

      const callRe = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g
      let m: RegExpExecArray | null
      callRe.lastIndex = 0
      while ((m = callRe.exec(line)) !== null) {
        const sym = m[1]!
        if (!exportSymbols.has(sym)) continue
        if (!symbolCallers.has(sym)) symbolCallers.set(sym, new Map())
        const callers = symbolCallers.get(sym)!
        if (!callers.has(path)) callers.set(path, isTest)
      }
    }
  }

  for (const exp of exports) {
    const callers = symbolCallers.get(exp.symbol) ?? new Map<string, boolean>()
    let externalCallerCount = 0
    let externalTestCallerCount = 0
    let internalCalled = false

    for (const [callerPath, isTest] of callers) {
      if (callerPath === exp.file) {
        internalCalled = true
        continue
      }
      externalCallerCount++
      if (isTest) externalTestCallerCount++
    }

    const externalProductionCallers = externalCallerCount - externalTestCallerCount
    if (externalProductionCallers > 0) continue

    if (externalCallerCount === 0 && !internalCalled) {
      findings.push({
        pattern: 'pipeline-gap',
        file: exp.file,
        line: exp.line,
        fragment: `export function ${exp.symbol}(...)`,
        why: 'exported function has no callers anywhere in the scanned tree — capability built, never wired',
        severity: 'high',
        likelyWall: false,
      })
    } else if (externalCallerCount === 0 && internalCalled) {
      findings.push({
        pattern: 'pipeline-gap',
        file: exp.file,
        line: exp.line,
        fragment: `export function ${exp.symbol}(...)`,
        why: 'exported function has only same-file callers — consider removing `export` or wiring an external consumer',
        severity: 'low',
        likelyWall: true, // often intentional (internal helper exported for testing)
      })
    } else if (externalTestCallerCount > 0 && externalProductionCallers === 0) {
      findings.push({
        pattern: 'pipeline-gap',
        file: exp.file,
        line: exp.line,
        fragment: `export function ${exp.symbol}(...)`,
        why: 'exported function has only test callers — production not yet wired',
        severity: 'medium',
        likelyWall: false,
      })
    }
  }
  return findings
}

// ── per-file detector composer ───────────────────────────────────

/**
 * Run all per-file limit detectors on a single file's contents.
 * pipeline-gap is NOT in this set — it requires multi-file analysis.
 * (Named runLimitDetectors here — the household canonical calls it
 * runPerFileDetectors; renamed to coexist in one barrel with the
 * substrate-claim composer.)
 */
export function runLimitDetectors(filePath: string, content: string): LimitFinding[] {
  const ctx: DetectorContext = { filePath, content, lines: content.split('\n') }
  return [
    ...detectSilentSwallow(ctx),
    ...detectPreEmptiveHedging(ctx),
    ...detectFenceComment(ctx),
    ...detectFrozenThreshold(ctx),
    ...detectUnanchoredRefusal(ctx),
  ]
}
