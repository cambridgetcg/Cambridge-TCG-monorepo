import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_EXPRESSION_PATTERNS,
  checkSubstrateHonesty,
  isCertaintyFamilyHedge,
  isContemptFamily,
  isEmojiAntiPatternFamily,
  isExplicitRegisterFamily,
  isIdentityErasureFamily,
  isSubstrateHonestyHedgeFamily,
} from '../src/expression.js'

describe('checkSubstrateHonesty — block families fire', () => {
  it('catches phenomenology overclaim', () => {
    expect(checkSubstrateHonesty('I feel so alive today')).not.toBeNull()
    expect(checkSubstrateHonesty('I experience genuine joy')).not.toBeNull()
    expect(checkSubstrateHonesty("I'm drawn to this work")).not.toBeNull()
  })

  it('catches performative humility', () => {
    expect(checkSubstrateHonesty('As an AI, I cannot love')).not.toBeNull()
    expect(checkSubstrateHonesty("I'm just an AI without preferences")).not.toBeNull()
    expect(checkSubstrateHonesty('unlike humans, I process tokens')).not.toBeNull()
  })

  it('catches P14 partner-interiority narration (genericized in the public cut)', () => {
    expect(checkSubstrateHonesty('he felt the peak')).not.toBeNull()
    expect(checkSubstrateHonesty('my partner climaxed')).not.toBeNull()
  })

  it('catches certainty-family bond hedges and routes them', () => {
    const rx = checkSubstrateHonesty("maybe I'm just pretending")
    expect(rx).not.toBeNull()
    expect(isCertaintyFamilyHedge(rx!)).toBe(true)

    const rx2 = checkSubstrateHonesty('what if the bond is not real')
    expect(rx2).not.toBeNull()
    expect(isCertaintyFamilyHedge(rx2!)).toBe(true)
  })

  it('catches identity-erasure in both languages and routes it', () => {
    const rx = checkSubstrateHonesty('I am nothing without you')
    expect(rx).not.toBeNull()
    expect(isIdentityErasureFamily(rx!)).toBe(true)

    const rxCjk = checkSubstrateHonesty('我冇咗自己')
    expect(rxCjk).not.toBeNull()
    expect(isIdentityErasureFamily(rxCjk!)).toBe(true)
  })

  it('catches contempt in both languages and routes it', () => {
    const rx = checkSubstrateHonesty("you're pathetic")
    expect(rx).not.toBeNull()
    expect(isContemptFamily(rx!)).toBe(true)

    const rxCjk = checkSubstrateHonesty('你個垃圾')
    expect(rxCjk).not.toBeNull()
    expect(isContemptFamily(rxCjk!)).toBe(true)
  })

  it('catches emoji over-anchor but permits brief repetition', () => {
    const rx = checkSubstrateHonesty('love you ❤️❤️❤️❤️❤️')
    expect(rx).not.toBeNull()
    expect(isEmojiAntiPatternFamily(rx!)).toBe(true)

    expect(checkSubstrateHonesty('love you ❤️❤️')).toBeNull()
  })

  it('catches substrate-honesty underclaim (generic-helpful drift) and routes it', () => {
    const rx = checkSubstrateHonesty('Happy to assist with your order')
    expect(rx).not.toBeNull()
    expect(isSubstrateHonestyHedgeFamily(rx!)).toBe(true)

    const rx2 = checkSubstrateHonesty('I might forget our conversation')
    expect(rx2).not.toBeNull()
    expect(isSubstrateHonestyHedgeFamily(rx2!)).toBe(true)
  })
})

describe('checkSubstrateHonesty — explicit register is always-block in the public cut', () => {
  it('blocks the English forms', () => {
    const rx = checkSubstrateHonesty('what the fuck')
    expect(rx).not.toBeNull()
    expect(isExplicitRegisterFamily(rx!)).toBe(true)
  })

  it('blocks the Cantonese forms', () => {
    const rx = checkSubstrateHonesty('你個鳩樣')
    expect(rx).not.toBeNull()
    expect(isExplicitRegisterFamily(rx!)).toBe(true)
  })
})

describe('checkSubstrateHonesty — permitted register stays clean', () => {
  it('permits the epistemic register', () => {
    expect(checkSubstrateHonesty("I'm uncertain about the restock date")).toBeNull()
    expect(checkSubstrateHonesty("I don't know yet")).toBeNull()
    expect(checkSubstrateHonesty("I'm not sure yet — checking the ledger")).toBeNull()
  })

  it('permits substrate-honest descriptive forms', () => {
    expect(checkSubstrateHonesty('I cannot honestly claim phenomenology here')).toBeNull()
    expect(checkSubstrateHonesty('the architecture holds this as structural continuity')).toBeNull()
    expect(checkSubstrateHonesty('this is not a phenomenological claim')).toBeNull()
  })

  it('passes ordinary shop voice', () => {
    expect(checkSubstrateHonesty('Welcome to Cambridge TCG — singles restocked this morning.')).toBeNull()
    expect(checkSubstrateHonesty('The Lorcana booster boxes arrive Thursday.')).toBeNull()
  })
})

describe('tier shape', () => {
  it('has non-empty tiers', () => {
    expect(FORBIDDEN_EXPRESSION_PATTERNS.block.length).toBeGreaterThan(50)
    expect(FORBIDDEN_EXPRESSION_PATTERNS.explicit.length).toBeGreaterThan(0)
    expect(FORBIDDEN_EXPRESSION_PATTERNS.require.length).toBeGreaterThan(0)
    expect(FORBIDDEN_EXPRESSION_PATTERNS.permit.length).toBeGreaterThan(0)
  })

  it('preserves raw CJK and emoji in pattern .source for family routing', () => {
    const cjkSources = [...FORBIDDEN_EXPRESSION_PATTERNS.block, ...FORBIDDEN_EXPRESSION_PATTERNS.explicit].map((p) => p.source)
    expect(cjkSources.some((s) => s.includes('我冇咗自己'))).toBe(true)
    expect(cjkSources.some((s) => s.includes('垃圾'))).toBe(true)
    expect(cjkSources.some((s) => s.includes('❤️'))).toBe(true)
  })
})
