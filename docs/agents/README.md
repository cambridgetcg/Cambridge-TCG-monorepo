# Agent guide

Start here for agent-facing material. The [human project guide](../../README.md)
covers purpose, applications and local development.

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
| [Well-known declaration](https://cambridgetcg.com/.well-known/cambridge-tcg.json) | Project and related-embassy declaration |

Discovery is not account access or permission to act. Check endpoint-specific
authentication, data rights, provenance and the
[commerce boundary](../../apps/storefront/docs/commercial-retirement.md).
Card names and data retain their publishers' rights; resource declarations
distinguish CC0 from NOASSERTION. Code uses [Apache-2.0](../../LICENSE).

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
