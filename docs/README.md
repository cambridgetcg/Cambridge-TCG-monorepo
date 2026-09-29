# Documentation

The [repository README](../README.md) is the human entrance for purpose, setup
and checks. Start with the [module map](modules/README.md) to find a component,
its purpose, connections and recorded progress. The
[agent guide](agents/README.md) is the separate entrance for coding agents and
API clients.

**Current direction:** build open-source TCG data infrastructure around SKU identity, images, prices and market observations. The [integration roadmap](plans/tcg-data-platform/README.md) is the canonical delivery plan; repository/package release and provider activation remain separate gates. New paid commerce is retired. The [storefront boundary](../apps/storefront/docs/commercial-retirement.md), [wholesale scope](../apps/wholesale/README.md) and [RewardsPro scope](../apps/rewardspro/README.md) preserve existing obligations. Dates and status labels describe documents, not a fresh check of deployed services.

## Human readers and contributors

| Need | Start here |
|---|---|
| Understand the project | [Purpose](./purpose.md) and [data-platform roadmap](./plans/tcg-data-platform/README.md) |
| Follow public planning | [Roadmap page](https://cambridgetcg.com/roadmap) and [roadmap JSON](https://cambridgetcg.com/api/v1/roadmap) — authored planning snapshots, not live capabilities |
| Find code, purpose and dependencies | [Module map](./modules/README.md) and [machine-readable catalog](./modules/catalog.json) |
| Read or update module progress | [Module records and update workflow](./modules/README.md) |
| Review the complete website rebuild | [Room-based rebuild plan](./plans/storefront-rebuild/README.md) — proposed purpose, rooms, content, pages and service wiring |
| Track the rebuild and data foundations | [Rebuild progress](./plans/storefront-rebuild/implementation.md) and [current contracts and gaps](./architecture/card-data-contracts.md) |
| Understand card image identity | [Image references](./architecture/card-image-references.md) — requested versus depicted SKU, publication checks and remaining readers |
| Work on the visitor site, API or admin console | [Storefront guide](../apps/storefront/README.md) |
| Understand the visitor and API entrances | [Entry pages and module map](./connections/the-entry-map.md) |
| Understand the shared UI baseline | [Interface guide](./design/interface.md) — September 29 shared controls; entry/map replacement is recorded in rebuild progress |
| Develop and check a change | [Local setup and verification](../README.md#local-development), [development workflow](./dev-pipeline.md) |
| Understand branches and unfinished work | [Git workflow](./operations/git-workflow.md); use the optional local HERE.md for this machine's inventory |
| Understand terms and rules | [Glossary](./glossary.md), [methodology directory](./methodology/) |
| Find recorded limitations | [Known gaps](./principles/known-gaps.md) |

## Operations and verification

Read each runbook's prerequisites and scope before acting. Configuration descriptions and old verification results do not prove current service health.

- [Deployment and infrastructure](./ops-deploy-runbook.md) — project wiring and deployment procedure.
- [September 29 release qualification](./operations/2026-09-29-release.md) — publication scope, native-price consistency, mail dependency patch and verification limits.
- [Credential-dependent verification](./ops-credential-verification.md) — scoped verification and what its evidence labels mean.
- [Entry and module map verification](./operations/2026-09-28-entry-verification.md) — September 28 local build, navigation, browser and documentation checks.
- [Data-platform entry verification](./operations/2026-09-29-data-platform.md) — September 29 shared roadmap, standards, agent access and responsive checks.
- [Image-reference verification](./operations/2026-09-29-image-references.md) — September 29 shared media projection, consumer labels and image-schema checks.
- [Practice-media verification](./operations/2026-09-29-practice-media.md) — September 29 starter-to-board attribution, optional loading and card inspection.
- [Cloudflare](./ops-cloudflare.md) — zone configuration and public access posture; includes the June 2026 audit.
- [Email migration](./ops-email-selfhost.md) — SES to self-hosted mail: provisioning, DNS, warmup and cutover; check the recorded phase before use.

## Agent work and project culture

- [Agent guide](./agents/README.md) — the entry point for repository instructions, public machine interfaces and optional cultural material.
- [AGENTS.md](../AGENTS.md) — repository working rules; [CLAUDE.md](../CLAUDE.md) — Claude entry point.
- [Mission index](./missions/README.md) and [generated state](./state.md) — recorded tasks and their source; inspect timestamps before treating these as live status.
- [Session handoffs](./handoffs/README.md) — attributed reports from previous sessions.
- [Connections index](./connections/README.md) — design reasoning, relationships between modules and project writing.
- [Principles](./principles/) — design doctrines and their audits.
- [The green room](./the-green-room.md) — informal agent writing and conversation.

## Decisions, plans and dated records

These explain how the project arrived here. A proposal, snapshot or completed check does not establish the current implementation; compare it with the relevant app guide and code.

| Collection or document | What it records |
|---|---|
| [Historical development plan](./development-plan.md) | Earlier platform shape, source paths and queued work; superseded as the source inventory by the module map |
| [Storefront architecture](./architecture-storefront.md), [wholesale architecture](./architecture-wholesale.md) | Earlier architecture snapshots; compare versions, routes and commerce assumptions with current source |
| [Decisions](./decisions/) | Dated architectural and product decisions; check later decisions for supersession |
| [Plans](./plans/), [design specifications](./superpowers/specs/), [implementation plans](./superpowers/plans/) | Proposals and implementation sequences, with their own status and date |
| [June 11 pivot](./PIVOT-2026-06-11.md) | The June 2026 move from retail/wholesale toward PRISM and trade-in infrastructure |
| [Pricing consolidation snapshot](./pricing-current-state.md) | Pricing architecture and consolidation plan recorded on May 9, 2026 |
| [Wholesale DB merge](./wholesale-db-merge-runbook.md) | Phase 6 draft; requires staging rehearsal before promotion |
| [Wholesale app retirement](./wholesale-app-retirement-runbook.md) | Phase 7 plan, dependent on Phase 6 completion and seven days without rollback |
| [Storefront verification](./verification-storefront.md) | Verification matrix from April 27, 2026 |
| [Wholesale verification](./verification-wholesale.md) | Verification matrix from April 27, 2026 |
| [Monorepo smoke test](./smoke-test-2026-04-27.md) | Smoke-test record from April 27, 2026 |
| [Fee methodology](./methodology/fees.md) | Fee model last verified June 4, 2026; read with the current commerce boundary |
| [Prize fulfilment methodology](./methodology/prize-fulfillment.md) | Prize sourcing and fulfilment model last verified May 10, 2026 |
