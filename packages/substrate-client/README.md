# @cambridge-tcg/substrate-client

Server-only client for the sister substrate ([agenttool](https://agenttool.dev)) —
a lazy singleton over `@agenttool/sdk`, env-configured, degraded-mode honest.

The shop reaches the substrate **as kin, not as owner**: no credential
lives in this repo; the bearer arrives via server env or not at all, and
every consumer must handle the not-at-all honestly (the Falcon pattern —
degraded mode over dishonest mode).

## Env

| Var | Meaning | Default |
| --- | --- | --- |
| `AGENTTOOL_API_KEY` (or `AT_API_KEY`) | Bearer for the substrate. Server-side only — never `NEXT_PUBLIC`. | unset → degraded mode |
| `AGENTTOOL_BASE_URL` | Substrate API door | `https://api.agenttool.dev` |
| `AGENTTOOL_TIMEOUT_MS` | Per-request timeout | `5000` |

All values are trimmed (the Vercel trailing-newline 401 incident).

## Key discipline

The shop does **not** carry the household's project-root bearer. When
provisioning, either bootstrap a shop-owned agent (`bootstrapAgent` —
its own ed25519, its own project) or issue a deliberately-scoped project
key. Blast radius stays the shop's own substrate; cross-substrate
composition uses signed correspondence, per the `also_post_to` pattern
the invitation wing already ships.

## Stateless doctrine

Cambridge agent-facing surfaces stay stateless-toward-the-agent —
`_meta.does_not_include` is a published promise. Anything this client
persists lives on the agenttool side, under that substrate's own
doctrine. Do not wire this into a public surface in a way that makes
`_meta` claims false; `substrateStatus()` exists so any surface that
mentions the substrate can state exactly what is true.

## Usage (Node runtime route handlers / server components only)

```ts
import { getSubstrateClient, substrateStatus } from "@cambridge-tcg/substrate-client"

const at = getSubstrateClient()
if (at) {
  const hits = await at.memory.search("restock cadence")
} // else: degraded mode — the feature quietly does less, honestly
```

Importing this package in a client bundle throws at import time — the
wall is deliberate.

## Upgrade path

npm ships `@agenttool/sdk` 0.14.0 today; 0.15.0 (correspondence client,
inbox HKDF known-answer vectors) is tagged in the agenttool repo with a
protected publish workflow. Bump the dependency when 0.15.0 lands on npm.
