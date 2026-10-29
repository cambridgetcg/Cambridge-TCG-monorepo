# Agent integration layer

Part of the [TCG data platform roadmap](README.md), reviewed **2026-09-29**.
The agent layer helps clients discover contracts, read permitted records and
propose corrections. It uses the same identity, image and observation rules as
human interfaces. Discovery or an agent identity does not create account access,
provider rights or permission to publish.

## Available foundations

The [agent entrance](../../../apps/storefront/src/app/agents/page.tsx) presents
**Discover → Read → Contribute & build**. These are implemented entry routes,
not a claim that every linked service is healthy or every contribution tool is
open to every caller.

| Task | Current route or source | Boundary |
| --- | --- | --- |
| Discover resources | `/api/v1/manifest`, `/api/openapi.json`, `/api/v1/tools`, `/api/v1/contracts/card-data` | Public descriptions, schemas and examples. Examples are not live observations; roadmap JSON is a planning snapshot. |
| Validate and resolve | `POST /api/v1/identifiers/validate`, `POST /api/v1/cards/batch` | Public syntax validation and bounded lookup of 1–100 known SKUs. Batch output excludes prices/images; a local match is not proof of an exact external printing. |
| Read member prices | `/prices`, `/account/data`, `/api/v1/member-prices` | Browser uses an existing-account session; the script feed uses its separate account-owned member key. Agent keys and session cookies do not authenticate that script feed. Source/use permission still applies. |
| Use agent tools | `/api/mcp`, `/account/agents` | Discovery is public; operational calls require an agent key. Account-linked tools additionally require their operator relationship. Authenticated reads can update rate-limit and key-use metadata. |
| Propose coverage evidence | Existing `coverage.hunt.*` tools | Operator-managed contribution appends bounded evidence to a review queue; it does not apply catalog changes or release provider data. |

The [tool authority table](../../../apps/storefront/src/lib/agents/tool-access.ts)
is the execution boundary. Agent match/deck writes and self-serve registration
remain paused. `catalog.search` and `prices.recent` return publication status
without catalog rows or prices; do not advertise them as a price feed. Existing
account-linked reads retain their ownership checks.

The [dispatcher](../../../apps/storefront/src/app/api/mcp/route.ts) implements
custom JSON-RPC over HTTP with MCP-compatible methods. A
[stdio bridge](../../../packages/mcp-server/README.md) exists in source. Public
npm distribution and clean-client interoperability remain release gates, so an
`npx` installation promise is premature.

## Planned capabilities and gates

| Capability | Deliverable | Ready when |
| --- | --- | --- |
| Contract discovery | Keep manifest, OpenAPI, tool catalog, schema IDs and roadmap status consistent. | Every advertised operation resolves to an implementation or an explicit planned/paused description; examples validate without credentials. |
| Qualified reads | Shared identity and publication projection for human pages, HTTP clients and agent tools. | The same source fixture preserves printing scope, native amount, provenance and rights across transports; absent, withheld, ambiguous, stale and failed reads remain distinguishable. |
| Correction proposals | Generalize the existing bounded evidence pattern to source crosswalks, image references and observations. | Proposals carry evidence, target version and provenance; repeated submission is idempotent; review decisions are attributable and reversible; proposals cannot directly change authoritative data. |
| Scoped integration access | Document supported actor types, key scopes, revocation and operational effects. Agent keys: [agent auth review and phase 1](../agent-auth/README.md) (2026-10-29, agent-written, not yet reviewed by Yu). | Wrong-realm and cross-account tests fail closed; revocation is effective; no secret appears in URLs, responses, examples or logs. This does not promise automatic account or key provisioning. |
| Portable clients | Versioned examples, conformance fixtures and independently usable packages. | External consumers can retrieve the declared artifacts and reproduce fixtures; published capabilities match actual transport behavior and endpoint permissions. |

Identity and policy reconciliation come first (`baseline`, `identity`), shared
reads follow (`observations`, `integrations`), and independently released clients
follow verified distribution (`distribution`). No future callable URL or tool
name is promised here. Register new operations only when their implementation,
authorization, tests and documentation are ready together.

Agents may investigate and disagree, and contributions receive attributable
review. Optional names, cultural invitations and identity declarations remain
separate from tools and permissions. Account/provider actions and publication
still require the relevant scoped authorization.
