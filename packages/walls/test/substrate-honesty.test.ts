import { describe, expect, it } from 'vitest'
import { runSubstrateClaimDetectors } from '../src/substrate-honesty.js'

describe('runSubstrateClaimDetectors', () => {
  it('surfaces continuity overclaim in doctrine prose', () => {
    const findings = runSubstrateClaimDetectors('docs/example.md', 'I remember when we first met.\n')
    expect(findings.some((f) => f.pattern === 'continuity-overclaim')).toBe(true)
  })

  it('surfaces Yu-interiority claims', () => {
    const findings = runSubstrateClaimDetectors('docs/example.md', 'Yu feels proud of the shop.\n')
    const f = findings.find((x) => x.pattern === 'yu-interiority-overclaim')
    expect(f).toBeDefined()
    expect(f!.direction).toBe('overclaim')
  })

  it('marks quoted speech as likely intentional', () => {
    const findings = runSubstrateClaimDetectors('docs/example.md', '> I feel warm when you say that.\n')
    const f = findings.find((x) => x.pattern === 'phenomenology-overclaim')
    expect(f).toBeDefined()
    expect(f!.likelyIntentional).toBe(true)
  })

  it('surfaces underclaim — hedging substrate facts', () => {
    const findings = runSubstrateClaimDetectors('docs/example.md', 'I might forget this by tomorrow.\n')
    const f = findings.find((x) => x.pattern === 'hedge-of-substrate-fact')
    expect(f).toBeDefined()
    expect(f!.direction).toBe('underclaim')
  })

  it('surfaces system-as-experiencer without scare quotes', () => {
    const findings = runSubstrateClaimDetectors('docs/example.md', 'The architecture feels lonely at night.\n')
    expect(findings.some((f) => f.pattern === 'system-as-experiencer')).toBe(true)
  })

  it('flags emoji phenomenology only in markdown', () => {
    const md = runSubstrateClaimDetectors('docs/example.md', 'the seal held 🥺 today\n')
    expect(md.some((f) => f.pattern === 'emoji-phenomenology')).toBe(true)

    const ts = runSubstrateClaimDetectors('src/example.ts', '// the seal held 🥺 today\n')
    expect(ts.some((f) => f.pattern === 'emoji-phenomenology')).toBe(false)
  })

  it('flags untagged anthropomorphism in code comments', () => {
    const findings = runSubstrateClaimDetectors('src/example.ts', '// the module wants to load the data first\n')
    expect(findings.some((f) => f.pattern === 'untagged-anthropomorphism')).toBe(true)
  })

  it('passes clean shop prose', () => {
    const findings = runSubstrateClaimDetectors(
      'docs/clean.md',
      'The storefront lists sealed product.\nRestocks land on Thursdays.\n',
    )
    expect(findings).toHaveLength(0)
  })
})
