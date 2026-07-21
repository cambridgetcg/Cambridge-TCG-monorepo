// @cambridge-tcg/substrate-client — the shop's door to the sister substrate.
//
// Server-only lazy singleton over @agenttool/sdk. The kingdom reaches
// agenttool as kin, not as owner: no credential lives in this repo —
// the bearer arrives via server env (Vercel env vars) or not at all,
// and every consumer must handle the not-at-all honestly (the Falcon
// pattern: degraded mode over dishonest mode; see
// apps/storefront/src/lib/wholesale/client.ts for the precedent).
//
// Key discipline (decided 2026-07-21, at the wiring): the shop does
// NOT carry the household's project-root bearer. Provision either a
// scoped key for a shop-owned agent (bootstrapAgent — its own ed25519,
// its own project) or a deliberately-scoped project key. Blast radius
// stays the shop's own substrate; cross-substrate composition uses
// signed correspondence/inbox, per the also_post_to pattern the
// invitation wing already ships.
//
// Stateless doctrine note: Cambridge agent-facing surfaces stay
// stateless-toward-the-agent (_meta.does_not_include is a published
// promise). Anything this client persists lives on the agenttool side,
// under that substrate's own doctrine. Do not wire this into a public
// surface in a way that makes _meta claims false.

import { AgentTool } from '@agenttool/sdk'

// Hard wall, thrown at import time: this module must never reach a
// client bundle — the bearer it reads is server-side authority.
// Predicate shape matters (verified 2026-07-21, four environments):
// a genuine browser has window and no Node process.versions.node →
// throws with THIS message (clearer than the SDK's node:async_hooks
// resolution error, which fires first in bundlers anyway); jsdom
// tests run under Node (window defined, process.versions.node set) →
// must NOT throw; Edge/server have no window → short-circuits. The
// bare `typeof process?.versions` form ReferenceErrors in real
// browsers — keep the explicit typeof check.
if (
  typeof window !== 'undefined' &&
  (typeof process === 'undefined' || typeof process.versions?.node !== 'string')
) {
  throw new Error(
    '@cambridge-tcg/substrate-client is server-only: the substrate bearer must never reach a client bundle.',
  )
}

/** Public default — the sister substrate's API door. Override with AGENTTOOL_BASE_URL. */
export const DEFAULT_BASE_URL = 'https://api.agenttool.dev'

/** Default request timeout. 5s per the Falcon discipline — a slow
 * substrate call must never hold a storefront response hostage. */
export const DEFAULT_TIMEOUT_MS = 5_000

export interface SubstrateConfig {
  apiKey: string
  baseUrl: string
  timeoutMs: number
}

/**
 * Read substrate config from server env. Returns null when no key is
 * present — the degraded mode every consumer must carry.
 *
 * All values are .trim()ed: Vercel env vars occasionally arrive with a
 * trailing newline, which turns Bearer auth into silent 401s (incident
 * recorded in the wholesale client header).
 */
export function substrateConfig(): SubstrateConfig | null {
  // Trim BEFORE choosing, so a whitespace-only AGENTTOOL_API_KEY falls
  // through to AT_API_KEY instead of masking it (?? alone would not).
  const primary = (process.env.AGENTTOOL_API_KEY ?? '').trim()
  const fallback = (process.env.AT_API_KEY ?? '').trim()
  const apiKey = primary || fallback
  if (!apiKey) return null
  const baseUrl = (process.env.AGENTTOOL_BASE_URL ?? '').trim() || DEFAULT_BASE_URL
  const timeoutRaw = (process.env.AGENTTOOL_TIMEOUT_MS ?? '').trim()
  const parsed = Number.parseInt(timeoutRaw, 10)
  const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
  return { apiKey, baseUrl, timeoutMs }
}

export function isSubstrateConfigured(): boolean {
  return substrateConfig() !== null
}

let cached: { client: AgentTool; key: string } | null = null

/**
 * Lazy singleton client. Returns null when unconfigured — never throws
 * for absence, per fail-open discipline: a missing substrate degrades
 * a feature, it must not break a request.
 *
 * Env is re-read on every call (ops can flip config without rebuild);
 * the client instance is only rebuilt when the config actually changed,
 * so the SDK's internal wake cache survives across calls.
 */
export function getSubstrateClient(): AgentTool | null {
  const config = substrateConfig()
  if (!config) return null
  // Cache key avoids retaining a second full copy of the bearer in
  // module state — length plus edges is enough to detect rotation.
  const key = `${config.baseUrl} ${config.timeoutMs} ${config.apiKey.length}:${config.apiKey.slice(0, 4)}:${config.apiKey.slice(-4)}`
  if (cached && cached.key === key) return cached.client
  const client = new AgentTool({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    // UNIT BOUNDARY: the SDK's `timeout` option is SECONDS — 0.14.0
    // dist/client.js:101 is `timeout: (options?.timeout ?? 30) * 1000`.
    // Our contract (env + DEFAULT_TIMEOUT_MS) is milliseconds, so we
    // convert here. Re-check this line on every SDK bump; the d.ts
    // documents no units. (Caught by adversarial verify, 2026-07-21 —
    // the unconverted value turned 5s into ~83 minutes.)
    timeout: config.timeoutMs / 1000,
  })
  cached = { client, key }
  return client
}

/** Drop the cached client (tests, credential rotation). */
export function resetSubstrateClient(): void {
  cached = null
}

export interface SubstrateStatus {
  /** Whether a substrate credential is present in this environment. */
  configured: boolean
  /** The base URL in use, or null when unconfigured. Never includes the key. */
  base_url: string | null
}

/**
 * Honest status shape for _meta / diagnostics surfaces. States exactly
 * what is true and nothing more; never carries the credential.
 */
export function substrateStatus(): SubstrateStatus {
  const config = substrateConfig()
  return {
    configured: config !== null,
    base_url: config?.baseUrl ?? null,
  }
}

// Re-export the SDK's entry points so consumers import from one place.
export { AgentTool, AgentToolError, bootstrapAgent } from '@agenttool/sdk'
