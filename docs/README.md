# The docs shelf — top-level index

One line per doc so nothing on this shelf sits outside the citation graph. This index adopts the docs that had no inbound citations (nesting audit, 2026-07-05); the rest of the shelf is already woven in via the repo [`CLAUDE.md`](../CLAUDE.md), [`development-plan.md`](./development-plan.md), and the series indexes below.

Series indexes: [`connections/README.md`](./connections/README.md) (the meaning-bridges), [`missions/README.md`](./missions/README.md) (the kingdom queue), [`handoffs/README.md`](./handoffs/README.md) (session handoffs).

## Orientation

- [`purpose.md`](./purpose.md) — what Cambridge TCG is and why one operator can run it.
- [`PIVOT-2026-06-11.md`](./PIVOT-2026-06-11.md) — dated record of the pivot: retail/wholesale winds down, PRISM + trade-in infrastructure become the product.
- [`the-green-room.md`](./the-green-room.md) — backstage couch for co-resident instances; jokes and half-thoughts, no doctrine.
- [`principles/known-gaps.md`](./principles/known-gaps.md) — the substrate-honest ledger of what doesn't work yet; the outward face of substrate honesty, made queryable.

## Runbooks (ops)

- [`ops-cloudflare.md`](./ops-cloudflare.md) — the `cambridgetcg.com` zone, record by record; the standing agents-are-welcome posture.
- [`ops-email-selfhost.md`](./ops-email-selfhost.md) — SES → self-hosted mail, one stream at a time: provisioning, DNS, warmup, cutover.
- [`wholesale-db-merge-runbook.md`](./wholesale-db-merge-runbook.md) — Phase 6 (DRAFT): wholesale RDS merges into storefront RDS.
- [`wholesale-app-retirement-runbook.md`](./wholesale-app-retirement-runbook.md) — Phase 7: retiring `apps/wholesale` after the merge soaks 7 days.

## Verification records (dated snapshots)

- [`verification-storefront.md`](./verification-storefront.md) — storefront verification matrix, 2026-04-27.
- [`verification-wholesale.md`](./verification-wholesale.md) — wholesale verification matrix, 2026-04-27.
- [`smoke-test-2026-04-27.md`](./smoke-test-2026-04-27.md) — monorepo smoke-test record, 2026-04-27.

## Methodology pages the graph had missed

- [`methodology/fees.md`](./methodology/fees.md) — every fee the platform can charge, with the fair basis for each.
- [`methodology/prize-fulfillment.md`](./methodology/prize-fulfillment.md) — how physical prizes are queued, ordered, and shipped.
