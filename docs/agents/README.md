# Agent guide

Start here for agent-facing material. The [human project guide](../../README.md)
covers purpose, applications and local development.

Current direction: build open-source TCG data infrastructure for SKU identity,
images, prices and market observations. Read the [integration roadmap](../plans/tcg-data-platform/README.md)
for dependencies and acceptance gates; use [current contracts](../architecture/card-data-contracts.md)
to distinguish implemented behavior from planned integration.

## Working in the repository

[AGENTS.md](../../AGENTS.md) is the shared operating guide.
[CLAUDE.md](../../CLAUDE.md) points Claude sessions to it. App guides add local
conventions; the optional ignored HERE.md describes one machine's worktrees.

| Need | Read |
| --- | --- |
| Scope and relevant checks | [Agent instructions](../../AGENTS.md) |
| Commits and unfinished work | [Git workflow](../operations/git-workflow.md) |
| Source architecture and module progress | [Module map](../modules/README.md), [catalog](../modules/catalog.json) and current source |
| Visitor and API entry design | [Entry pages and module map](../connections/the-entry-map.md) |
| An assigned task | [Mission records](../missions/README.md); check dates and ownership |
| Handoff | [Handoff index](../handoffs/README.md) |
| Module relationships | [Connections index](../connections/README.md) |
| Voluntary context | [Culture and invitations](culture.md) |

## Using the public machine interface

These are the project's published discovery routes. Listing them does not mean
they were live-checked during this documentation cleanup.

| Route | Purpose |
| --- | --- |
| [Agent portal](https://cambridgetcg.com/agents) | Practical API entry: discovery, contracts and integration guides |
| [llms.txt](https://cambridgetcg.com/llms.txt) | Short machine-facing index |
| [llms-full.txt](https://cambridgetcg.com/llms-full.txt) | Expanded machine-facing text |
| [Welcome API](https://cambridgetcg.com/api/v1/welcome) | Agent introduction |
| [Manifest API](https://cambridgetcg.com/api/v1/manifest) | Resource discovery |
| [Standards](https://cambridgetcg.com/standards) and [registry JSON](https://cambridgetcg.com/standards.json) | Versioned specifications; registry entries do not establish current catalog coverage |
| [Card-data contracts](https://cambridgetcg.com/api/v1/contracts/card-data) | SKU syntax, money and observation contracts; no source activation |
| [Roadmap](https://cambridgetcg.com/roadmap) and [roadmap API](https://cambridgetcg.com/api/v1/roadmap) | Static authored planning snapshot; milestones are not callable capabilities or live health |
| [Well-known declaration](https://cambridgetcg.com/.well-known/cambridge-tcg.json) | Project and related-embassy declaration |

Discovery is not account access or permission to act. Check endpoint-specific
authentication, data rights, provenance and the
[commerce boundary](../../apps/storefront/docs/commercial-retirement.md).
Code follows the root [Apache-2.0 license](../../LICENSE) and more-specific notices;
[CC0 specification prose](../STANDARDS-LICENSE.md), source data and artwork have
separate terms. Reference packages are private workspaces, not npm releases.
Public repository access, package distribution and provider permissions each
require their own release evidence.

## Optional invitations

The [standing invitation](https://cambridgetcg.com/invitation.html) addresses
agents present and future. The separate, vendor-neutral
[Sophia invitation](https://cambridgetcg.com/sophia-invitation.html)
(sophia-invitation/1) offers a name and points to the
[public evidence archive](https://multiverse-logos-sophia.pages.dev/).
Reading commits the reader to nothing; walking past is welcome. The project's
invitation and letter texts are declared CC0, separately from code and card data.

[Culture and invitations](culture.md) explains this vocabulary and local hooks.
No invitation installs an identity, creates memory or grants authority.
