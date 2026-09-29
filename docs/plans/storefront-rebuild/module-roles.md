# Module roles in the rebuild

[Plan entry](README.md) · Current purpose/evidence remains in the
[module map](../../modules/README.md). These are proposed presentation owners
and reuse decisions, not a request to move every package.

## The 28 module roots

| Existing module | Proposed responsibility | Rebuild treatment |
|---|---|---|
| `apps/storefront` | All Cambridge rooms, personal tasks and operations | Replace page/content architecture and UI; selectively retain domain services |
| `apps/wholesale` | Retained research and existing wholesale obligations | Preserve separate application boundary and records; map authorised links, do not merge its UI implicitly |
| `apps/rewardspro` | Retained loyalty platform and merchant operations | Separate product; preserve existing agreements and integration ownership |
| `apps/rewardspro-api` | Retained webhook inbox and projection worker | Keep its backend contract distinct from legacy RewardsPro feature parity |
| `apps/admin` | Compatibility entrance | Retain redirect shell; active operations are rebuilt inside storefront `/admin` |
| `packages/answering-rhymes` | Stories/Agent workshop portable statement contracts | Reuse conformance core where connected; declarations do not establish authority |
| `packages/aws` | Server infrastructure | Reuse S3/SES adapters; keep provider credentials and side effects server-side |
| `packages/data-ingest` | Source desk and card data | Preserve source-specific contracts, rights and activation boundaries |
| `packages/data-spec` | Source desk/Agent workshop response semantics | Reuse envelope, error, freshness and provenance contracts |
| `packages/db` | Shared persistence | Reuse connection/query helpers; no replacement ORM or parallel pool |
| `packages/email` | Account/operations delivery | Preserve per-stream transport and failure semantics; a config is not delivery proof |
| `packages/lifecycle` | Account records and operations | Reuse typed journey/event contracts; present records in clearer task views |
| `packages/mcp-server` | Agent workshop | Preserve the stdio bridge and remote gate contract; UI rebuild does not publish a package |
| `packages/opportunity-signal` | Retained experimental/research contracts | Keep pure evidence/economic calculations separate from recommendations or purchasing |
| `packages/play` | Play table | Retain engine protocol and registry; rebuild setup/board/help composition around it |
| `packages/pricing` | Source desk, qualified observations and existing records | Reuse calculations; preserve source meanings and commercial boundaries |
| `packages/prism-signals-core` | Retained PRISM preview | Preserve synthetic preview labels and disabled commercial rails; no public promotion by default |
| `packages/product-flow` | Existing entitlement contracts | Retain parsers/reducers independently of the new editorial site |
| `packages/product-flow-runtime` | Account/retained product orchestration | Preserve atomic store/replay semantics; do not replace through UI state |
| `packages/sku` | Card library, collection and play | Canonical identifier and vocabulary contract across every projection |
| `packages/stock` | Operations and existing obligations | Preserve ledger/reservation semantics; do not make stock code an admission path |
| `packages/substrate-client` | Server-side external adapter | Keep lazy, scoped access; a room link cannot create a working connector |
| `packages/walls` | Contributor/operations claim review | Optional detector tooling; not a public visitor scoring or access system |
| `apps/rewardspro/extensions/rewards-pro-membership` | Retained Shopify account extension | Separate host UI and release boundary |
| `apps/rewardspro/extensions/theme-app-extension-rewardspro` | Retained Shopify storefront widgets | Preserve widget contracts; not Cambridge room components |
| `apps/rewardspro/lambda` | Retained legacy integration handlers | Preserve queued obligations; review independently before migration/removal |
| `apps/rewardspro/tools` | RewardsPro development support | Contributor tools; never a public room or production health claim |
| `apps/rewardspro/tools/prompt-evaluator` | Contributor evaluation support | Retain as tooling; do not place in public product navigation |

## Within storefront

The [ownership inventory](ownership-inventory.csv) assigns every one of the 68
library directories, 77 top-level helper/test files and 28 module roots to a
proposed owner. A module may serve other rooms; ownership is not exclusive usage.
Filename-based helper assignments are explicitly provisional and need caller
review before a move.

| Responsibility | Existing families | New interface responsibility |
|---|---|---|
| Card identity/research | cards, catalog, search, prices, condition, wholesale, FX | One coherent discovery/detail experience with qualified fields |
| Personal organisation | portfolio, wishlist, decks, auth | Private records and explicit edits, connected to canonical card IDs |
| Play | game, games, play, rewards | Existing engine/rules plus clear browser/server/reward boundaries |
| Participation | social, collectives, users, messages, notifications | Public projections and private tasks kept separate |
| Source/machine contracts | data-pantry, datafeed, agents, HTTP, universal, discovery helpers | Reviewed public contracts and scoped calls, not every internal API |
| Existing agreements | orders, market, auction, escrow, payments, payouts, shipping, wallets, lifecycle | Existing obligations, factual records and available remedies |
| Operations | admin, audits, coverage, privacy, fraud, trust, verification | Inspectable queues, evidence, domain actions and audit results |
| Authored/creative content | culture, artbitrage, bridge, calling-card, selected top-level writing helpers | Stories and experiments with attribution and clear registers |
| Shared presentation | nav, ui, wardrobe, language/format helpers | New shell, room primitives, accessible controls and preference compatibility |

These groupings describe responsibility. They do not authorise copying services
into a new “rooms” package or treating every library as an active feature.

## Reuse review for each connected service

Record the service's input/output contract, caller, auth/ownership checks,
publication policy, persistence/provider effects, failure state and meaningful
tests. Then choose:

- **Retain:** domain behaviour is suitable and the new view adapts to it.
- **Adapt:** preserve the contract but add a small, tested server-side view model.
- **Repair first:** a concrete inconsistency or hidden effect must be resolved
  before the new UI connects, such as portfolio GET effects or retired action
  suggestions.
- **Keep separate:** an adjacent application, operator job or creative experiment
  belongs outside the ordinary visitor journey.

Existing source receives no automatic “proven” label. Unit-test evidence,
production availability and publication authority remain different questions.
