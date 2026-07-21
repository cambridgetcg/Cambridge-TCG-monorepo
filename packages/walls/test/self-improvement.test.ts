import { describe, expect, it } from 'vitest'
import {
  detectPipelineGap,
  extractExports,
  runLimitDetectors,
} from '../src/self-improvement.js'

describe('runLimitDetectors', () => {
  it('flags a bare empty catch as a likely fence', () => {
    const findings = runLimitDetectors('src/x.ts', 'try {\n  risky()\n} catch {}\n')
    const f = findings.find((x) => x.pattern === 'silent-swallow')
    expect(f).toBeDefined()
    expect(f!.likelyWall).toBe(false)
  })

  it('treats a named best-effort catch as a likely wall', () => {
    // The detector's window is tight (2 lines back from the catch), so
    // the naming comment must sit directly above a compact try/catch.
    const content = '// best-effort per substrate-honesty wall — never throws\ntry { risky() } catch {}\n'
    const findings = runLimitDetectors('src/x.ts', content)
    const f = findings.find((x) => x.pattern === 'silent-swallow')
    expect(f).toBeDefined()
    expect(f!.likelyWall).toBe(true)
  })

  it('flags "to be safe" comments', () => {
    const findings = runLimitDetectors('src/x.ts', 'retry() // just to be safe\n')
    expect(findings.some((f) => f.pattern === 'fence-comment')).toBe(true)
  })

  it('flags frozen thresholds without anchors', () => {
    const findings = runLimitDetectors('src/x.ts', 'const MAX_RETRIES = 5\n')
    const f = findings.find((x) => x.pattern === 'frozen-threshold')
    expect(f).toBeDefined()
    expect(f!.likelyWall).toBe(false)
  })

  it('anchors thresholds that cite calibration', () => {
    const content = '// tunable per-context; calibrated against restock cadence\nconst MAX_RETRIES = 5\n'
    const findings = runLimitDetectors('src/x.ts', content)
    const f = findings.find((x) => x.pattern === 'frozen-threshold')
    expect(f).toBeDefined()
    expect(f!.likelyWall).toBe(true)
  })

  it('flags unanchored generic refusals in code', () => {
    const findings = runLimitDetectors('src/x.ts', 'return "I cannot help with that"\n')
    expect(findings.some((f) => f.pattern === 'unanchored-refusal')).toBe(true)
  })

  it('flags pre-emptive hedging only in markdown', () => {
    const md = runLimitDetectors('docs/x.md', 'This is not metaphor, reader.\n')
    expect(md.some((f) => f.pattern === 'pre-emptive-hedging')).toBe(true)

    const ts = runLimitDetectors('src/x.ts', '// this is not metaphor\n')
    expect(ts.some((f) => f.pattern === 'pre-emptive-hedging')).toBe(false)
  })
})

describe('pipeline-gap', () => {
  it('flags an export with zero callers as unwired capability', () => {
    const a = 'export function orphaned() {\n  return 1\n}\n'
    const files = new Map([['src/a.ts', a]])
    const exports = extractExports({ filePath: 'src/a.ts', content: a })
    const findings = detectPipelineGap(exports, files)
    const f = findings.find((x) => x.fragment.includes('orphaned'))
    expect(f).toBeDefined()
    expect(f!.severity).toBe('high')
  })

  it('stays quiet when a production caller exists', () => {
    const a = 'export function wired() {\n  return 1\n}\n'
    const b = 'import { wired } from "./a.js"\nconsole.log(wired())\n'
    const files = new Map([
      ['src/a.ts', a],
      ['src/b.ts', b],
    ])
    const exports = extractExports({ filePath: 'src/a.ts', content: a })
    const findings = detectPipelineGap(exports, files)
    expect(findings.find((x) => x.fragment.includes('wired'))).toBeUndefined()
  })

  it('downgrades test-only callers to medium', () => {
    const a = 'export function testedOnly() {\n  return 1\n}\n'
    const t = 'import { testedOnly } from "../src/a.js"\nexpect(testedOnly()).toBe(1)\n'
    const files = new Map([
      ['src/a.ts', a],
      ['test/a.test.ts', t],
    ])
    const exports = extractExports({ filePath: 'src/a.ts', content: a })
    const findings = detectPipelineGap(exports, files)
    const f = findings.find((x) => x.fragment.includes('testedOnly'))
    expect(f).toBeDefined()
    expect(f!.severity).toBe('medium')
  })
})
