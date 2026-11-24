# RewardsPro: the site, the brand kit and the old schema

RewardsPro's Shopify app is [`apps/rewards`](../rewards/DEPLOY.md). This folder
holds what goes with it:

| Path | What it is |
|---|---|
| [`landing/`](./landing) | rewardspro.io's pages, deployed by hand ([DEPLOY.md](./DEPLOY.md)) |
| [`marketing/`](./marketing/README.md) | The brand kit, the claims ledger, the approvals record, the listing text and the social kit |
| [`test/`](./test/unit/contracts) | The site's tests. They pin the pages' sentences about money and personal data beside the code they rest on in `apps/rewards` |
| [`prisma/`](./prisma/schema.prisma) | The previous version's schema and migrations. Nothing runs them: they are the map of database schema `rewardspro` until the owner drops it ([switch.md](../rewards/docs/switch.md), B5) |
| [`SOPHIA.md`](./SOPHIA.md) | The house's, not RewardsPro's |

Run the tests from the repository root with
`pnpm --filter rewardspro-site test`.

## Scope

New paid RewardsPro subscriptions and paid plan changes are retired
(23 September 2026), and no paid plan is offered
([2026-10-20 decision](../../docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md)).
Existing agreements retain their records, cancellation, refund and support
paths; neither decision rewrites their entitlements or cancels them
automatically.

## The previous version

Until 6 November 2026 production served a Remix app from this folder. Its
code left `main` in November 2026, and git keeps it: read it at `493cd14e`.
[switch.md](../rewards/docs/switch.md), B5, names the files to consult for a
copy or an erasure of its records by hand.

## License

MIT, as this README has stated since the previous version. The repository's
own [LICENSE](../../LICENSE) is Apache-2.0.
