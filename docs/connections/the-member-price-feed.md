---
title: The member price feed — free access without a blanket release
kind: node-view
filed: 2026-09-07
status: implementation; production activation is separate
parents:
  - the-license-propagation.md
---

# The member price feed

**Will:** “Lets bring back the pricing feed for all sources, but gate it with logins through cambridgetcg members. Free.” The clarification includes views, downloads and programmatic reads. There are no additional source agreements. Existing admission rules stay intact.

## Three separate questions

1. What did the source actually publish?
2. Which use has been reviewed: a member view, an API response, or a download?
3. Which Cambridge account is making the request?

The old global suppression flag cannot answer those questions. It protects public catalog, search, product and sitemap consumers at once. Turning it on for a member view would also turn it on for strangers. The new `lib/prices/member-feed.ts` is a separate server-only reader; the public wholesale client and all legacy redaction remain unchanged.

The source-use rule lives in `packages/data-ingest/src/member-prices.ts`. Cardmarket's intentionally published datasets have a specific publisher statement permitting use; that is not permission for the site's separately restricted API. Scryfall allows value-added free-account views but not simple republication. Its estimates therefore do not enter member CSV/NDJSON/API projections. A login does not unlock CardRush, TCGplayer or other unresolved upstreams. The July withdrawal of the old signed-in/B2B exemption is not reversed.

## Observations before estimates

Migration `0137_member_price_observations.sql` gives the feed its own native-currency observations, not fake values in mandatory CardRush columns. Source product, metric, finish/language/condition specificity, observation/retrieval clocks and parser/evidence references travel together. Unknown exact-card mapping stays unknown. A Cardmarket average is not an individual trade; an eBay ask would not be a sold comp.

The writer owns committed batches. Cursor pagination carries a batch watermark and filters, not an invented “live” timestamp. Publication eligibility is checked again on subsequent pages. The source cadence is daily; absence, outage and an incomplete result are different states.

`runSource` now offers provenance to successful writers as well as quarantine writers. Existing closures may already carry some provenance; the additional argument makes the contract explicit without requiring a new ingestion framework.

## Members, not subscribers

`lib/prices/member-access.ts` reuses the existing Auth.js session. A request is checked before a private price read. `lib/datafeed/member-keys.ts` uses account-owned read-only credentials for ordinary scripts and spreadsheets—no paid tier, wholesale secret, or invented agent identity. The hash-only, owner-bound key pattern comes from the existing delegated-agent implementation; key semantics remain separate.

- `/prices` — free member views alongside public structural navigation.
- `/account/data` — key management and feed instructions.
- `/api/v1/member-prices` — member-key JSON reads.
- `/api/account/prices/export` — session CSV/NDJSON pages.
- `/methodology/member-pricing` — public explanation and source evidence.

One authorized reader feeds the permitted formats. Responses are private/no-store, continuation is explicit, and public export files are not created. Public collector offers and paused participant/sold-data publication are separate domains and remain unchanged.

## Source evidence and limits

Review date: 2026-09-07. The first two intentionally published Cardmarket One Piece files were reachable during parser verification:

- `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json`: version 1; source `createdAt` was `2026-09-07T02:48:24+0200`.
- `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json`: version 1; source `createdAt` was `2026-09-07T12:11:44+0200`. Products have numeric product/category/expansion/metacard identifiers and a name, not an exact Cambridge SKU or standalone language/finish declaration.

The acquisition/display basis is [Cardmarket's dataset announcement](https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024), not inferred from successful HTTP. Direct retrieval of some policy pages was denied; official indexed excerpts and official documentation APIs were also used in the source review. The public methodology carries that limit. No complete legal review or blanket open-data license is claimed.

No production migration, collector schedule, source agreement, or deployment is established by this entry. Local fixtures and a local database prove software paths, not deployed freshness. Actual activation and observed coverage must be reported separately.

## Production activation receipt — 2026-09-08 UTC

The preceding no-production statement records the implementation turn. The user then explicitly requested deployment and production activation, and approved the release commit/main push and the disclosed absence of external log drains.

- Release `7cf25022` deployed the member views, data keys and feeds. `ee75e9c7` adds the verified-transaction operator seam and a stricter unauthenticated member-feed deployment check. The newer GitHub sign-in release was preserved.
- Migrations `0137_member_price_observations.sql` and `0138_member_data_keys.sql` were applied together with their `schema_migrations` entries over certificate-verified RDS TLS. The preflight found exactly those two pending migrations and no existing member-price/key tables.
- A finite, target-pinned operator checked the runtime release before collecting the three official One Piece files. It pinned artifact SHA-256 values and expected counts before writing, then injected a verified-TLS transaction into the same release-aware writer. The localhost-only test CLI was not widened.
- Production batch `1` committed at `2026-09-08T00:06:21.970Z`: **74,600 metric observations over 12,962 source products**. This is not 74,600 cards or sales. Source clock: `2026-09-07T00:48:24.000Z`; price-file retrieval: `2026-09-08T00:01:56.646Z`. No exact SKU mappings were invented.
- Activation plan hash: `f893312fbd01d316c0b31aca656d0030713cb6562a349446285045a315f54f8c`. The complete-file parser processed 13,187 source rows, omitted 70,866 absent metric fields and quarantined 12,778 fields/rows rather than manufacturing prices.
- The canonical storefront route audit reported **197 passed, 0 failed** after initial deployment. Successful member access/export was exercised locally; the production public audit does not impersonate a member or prove their authenticated HTTP path.

**Remaining boundaries:** this is an initial Cardmarket One Piece activation, not activation of every source or game. No daily Cambridge ingestion job is installed. Scryfall bulk acquisition remains deferred pending a memory-safe operator; CardRush, direct TCGplayer and other unresolved source permissions remain blocked. Registration admission is still paused. Vercel runtime logs are available; external log drains are absent.

**Recursion:** [The license propagation](./the-license-propagation.md), especially its July correction; [the public methodology](../../apps/storefront/src/app/methodology/member-pricing/page.tsx).
