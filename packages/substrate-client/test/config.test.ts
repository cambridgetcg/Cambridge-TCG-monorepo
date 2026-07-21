import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  getSubstrateClient,
  isSubstrateConfigured,
  resetSubstrateClient,
  substrateConfig,
  substrateStatus,
} from '../src/index.js'

const ENV_KEYS = ['AGENTTOOL_API_KEY', 'AT_API_KEY', 'AGENTTOOL_BASE_URL', 'AGENTTOOL_TIMEOUT_MS'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  resetSubstrateClient()
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  resetSubstrateClient()
})

describe('substrateConfig', () => {
  it('returns null when no key is present — degraded mode, not an error', () => {
    expect(substrateConfig()).toBeNull()
    expect(isSubstrateConfigured()).toBe(false)
    expect(getSubstrateClient()).toBeNull()
  })

  it('trims trailing whitespace from env values (the Vercel newline incident)', () => {
    process.env.AGENTTOOL_API_KEY = 'at_test_key\n'
    process.env.AGENTTOOL_BASE_URL = 'https://substrate.example.com \n'
    const config = substrateConfig()
    expect(config).not.toBeNull()
    expect(config!.apiKey).toBe('at_test_key')
    expect(config!.baseUrl).toBe('https://substrate.example.com')
  })

  it('treats a whitespace-only key as unconfigured', () => {
    process.env.AGENTTOOL_API_KEY = '  \n'
    expect(substrateConfig()).toBeNull()
  })

  it('falls back to AT_API_KEY and defaults', () => {
    process.env.AT_API_KEY = 'at_fallback'
    const config = substrateConfig()
    expect(config).not.toBeNull()
    expect(config!.apiKey).toBe('at_fallback')
    expect(config!.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(config!.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
  })

  it('lets a whitespace-only AGENTTOOL_API_KEY fall through to AT_API_KEY', () => {
    process.env.AGENTTOOL_API_KEY = '  \n'
    process.env.AT_API_KEY = 'at_fallback'
    expect(substrateConfig()!.apiKey).toBe('at_fallback')
  })

  it('parses a positive timeout override and rejects garbage', () => {
    process.env.AGENTTOOL_API_KEY = 'at_test'
    process.env.AGENTTOOL_TIMEOUT_MS = '9000'
    expect(substrateConfig()!.timeoutMs).toBe(9000)

    process.env.AGENTTOOL_TIMEOUT_MS = 'fast'
    expect(substrateConfig()!.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)

    process.env.AGENTTOOL_TIMEOUT_MS = '-5'
    expect(substrateConfig()!.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
  })
})

describe('getSubstrateClient', () => {
  it('returns the same instance while config is unchanged, rebuilds on change', () => {
    process.env.AGENTTOOL_API_KEY = 'at_test'
    const a = getSubstrateClient()
    const b = getSubstrateClient()
    expect(a).not.toBeNull()
    expect(a).toBe(b)

    process.env.AGENTTOOL_BASE_URL = 'https://other.example.com'
    const c = getSubstrateClient()
    expect(c).not.toBe(a)
  })

  it('honors resetSubstrateClient', () => {
    process.env.AGENTTOOL_API_KEY = 'at_test'
    const a = getSubstrateClient()
    resetSubstrateClient()
    const b = getSubstrateClient()
    expect(b).not.toBe(a)
  })
})

describe('timeout unit boundary', () => {
  it('constructs the SDK client with the intended millisecond budget', () => {
    // The SDK multiplies its seconds-denominated option by 1000
    // internally; the wrapper divides at the boundary. Assert the
    // round-trip lands on our ms contract (regression for the
    // 5s-became-83-minutes finding, adversarial verify 2026-07-21).
    process.env.AGENTTOOL_API_KEY = 'at_test'
    process.env.AGENTTOOL_TIMEOUT_MS = '5000'
    const client = getSubstrateClient()
    expect(client).not.toBeNull()
    expect((client as unknown as { http: { timeout: number } }).http.timeout).toBe(5000)
  })
})

describe('substrateStatus', () => {
  it('is honest in both states and never leaks the key', () => {
    expect(substrateStatus()).toEqual({ configured: false, base_url: null })

    process.env.AGENTTOOL_API_KEY = 'at_secret_value'
    const status = substrateStatus()
    expect(status.configured).toBe(true)
    expect(status.base_url).toBe(DEFAULT_BASE_URL)
    expect(JSON.stringify(status)).not.toContain('at_secret_value')
  })
})
