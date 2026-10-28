# Provider integration plan

Part of the [TCG data platform roadmap](README.md). Official evidence reviewed
**2026-09-29** using public documentation only. No provider feed, credential or
production database was used. An undated page below has a retrieval date, not
an inferred publication date.

## Provider decisions

| Provider | Current official evidence | Cambridge disposition and acceptance gate |
| --- | --- | --- |
| Cardmarket official files | The [March 25, 2024 announcement](https://insight.cardmarket.com/en/Articles/the-state-of-cardmarket-2024) permits downloading Product Catalog and Price Guide datasets for application use. They are read-only. [Current API help](https://help.cardmarket.com/en/cardmarket-api) still closes new API applications. | First pricing pilot, using the existing allowlisted file transport. Current review permits normalized member display/API/download with attribution. Keep raw files and restricted OAuth separate. Any broader public release needs a recorded use-specific decision; no blanket CC0 claim. |
| Scryfall | The accessible [official access FAQ](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17) recommends bulk files for large reads, meaningful request headers and fewer than ten API requests/second. The [API policy](https://scryfall.com/docs/api#use-of-scryfall-data-and-images), image and bulk documentation returned 403 during this review. | Existing repository review permits value-added member display only. API and download export remain excluded. Revalidate the full policy before activation; preserve underlying market identity in vendor price fields. The failed policy retrieval is an evidence gap, not permission. |
| TCGdex | [Documentation](https://tcgdex.dev/) provides multilingual Pokémon data; the [database repository](https://github.com/tcgdex/cards-database#licenses) declares MIT. Its [FAQ](https://tcgdex.dev/faq) requires no key but acknowledges incorrect marketplace IDs and distinct printings sharing prices; improved variant mapping remains in development. | New catalog candidate, not a registered Cambridge source. Review field and image rights separately. Validate per-language/set/variant mappings; quarantine uncertain joins. Do not treat embedded vendor pricing as permission for onward exports. |
| Pokémon TCG API | [Official documentation](https://docs.pokemontcg.io/getting-started/rate-limits/) now announces deprecation, closed registration and existing-key support through **March 1, 2027**. It points users to Scrydex. | Existing adapter is a migration concern rather than the foundation for new coverage. Update its stale intake description. Assess TCGdex and any successor independently; a migration link does not establish equivalent cost, rights, identifiers or coverage. |
| TCGplayer direct | [Getting started](https://docs.tcgplayer.com/docs/getting-started) closes new API access. [API terms](https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions), updated June 8, 2022, restrict aggregation and redistribution without appropriate written consent. | Keep the direct adapter blocked until approval covers the intended use. Credentials, or another provider carrying these fields, do not independently establish Cambridge's access or redistribution rights. |

TCGdex documents [image URL formats](https://tcgdex.dev/assets) and
[embedded market fields](https://tcgdex.dev/markets-prices). Those technical
mechanisms do not settle rights over publisher artwork or vendor data. Review
each field's origin and permitted use before attaching it to a public contract.
The Cardmarket Price Guide page also returned 403; no current file was fetched.

### Update, 2026-10-28: TCGplayer and CardRush

The review above stands as written for 2026-09-29. Yu's word of 2026-10-28
records written permission, by email, for collection from TCGplayer and
CardRush product pages, attributed member display, and input to derived data
([decision](../../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md)).

- **TCGplayer:** the permission answers the consent the API terms require, for
  page collection. The direct API adapter stays blocked, as the row above says:
  Yu chose pages, and new API access is still closed.
- **CardRush** was not part of the review above. The permission answers its
  data policy's partnership requirement. Collection is forward-only; legacy
  `price_archive` rows stay withheld and are not inputs.
- Once collected, both are for member display with the source named and for
  derivation input only: never `/api/v1/member-prices`, a download or bulk.
  Cardmarket also becomes a derivation input; its member grant is unchanged.

The identified collectors landed the same day. Each runs only while it is
scheduled (`DATA_COLLECT_CARDRUSH`, `DATA_COLLECT_TCGPLAYER`; `/api/v1/sources`
says whether), and the legacy readers stay locked. Build plan:
[paid data API](paid-data-api.md). Intake records:
[source intake](../../methodology/source-intake.md#intake-record--cardrush-jp-2026-10-28).

## Reuse the existing pipeline

The [source registry](../../../packages/data-ingest/src/registry.ts) describes
implementation state, not a live coverage guarantee. Cardmarket records a
One Piece member batch on 2026-09-08, with manual collection and no scheduled
daily Cambridge refresh. The member parser currently reviews game IDs for
Magic, Yu-Gi-Oh!, Pokémon and One Piece; a broader registry games list does not
mean every game is ready for import.

| Seam | Preserve and extend |
| --- | --- |
| [Source/use policies](../../../packages/data-ingest/src/member-prices.ts) | Evidence version, attribution and separate display/API/download uses. Source-wide `redistribute: false` can coexist with a narrower dataset-specific release; neither should silently override the other. |
| [Cardmarket parser](../../../packages/data-ingest/src/cardmarket/member-prices.ts) | Match guide rows to supplied product catalogs; preserve EUR product-level metrics and separate catalog/source clocks. Product aggregates do not acquire a printing's language or condition. |
| [Scryfall parser](../../../packages/data-ingest/src/scryfall/member-prices.ts) | Preserve printing ID, language, finish, native USD/EUR metric and underlying market. Require finish consistency and reviewed crosswalk evidence. |
| [Ingestion seam](../../../apps/storefront/src/lib/datafeed/member-price-ingest.ts) | Check release before network acquisition; retain fixed deadlines and explicit operator activation. |
| [Transactional writer](../../../apps/storefront/src/lib/datafeed/member-price-writer.ts) | Recheck release within the transaction, validate provenance, hash observations and deduplicate replay. Retrieval time must not create a new observation. |
| [Member feed](../../../apps/storefront/src/lib/prices/member-feed.ts) | Keep use-qualified reads, native decimal strings, bounded pages and caller/filter-bound cursors. Revocation can narrow an in-progress export; completeness describes the eligible result. |

Each pilot must report artifact/version receipts, source and retrieval dates,
parsed/missing/quarantined counts, exact/ambiguous/unmapped counts and last
successful import. Test unavailable storage, partial acquisition, malformed
input, duplicates, cancellation and revocation. Do not turn these failures into
an empty catalog, a zero price or a fresh timestamp.

## Market integration boundary

Define separate listing-ask, bid, completed-sale, provider-index and computed
reference meanings before joining market sources. A provider's 7-day aggregate
is not seven days of transaction records. Native currency, fees/shipping scope,
condition, timestamp and sample definitions must travel with the observation;
unknown dimensions stay unknown.

Current [unified market code](../../../apps/storefront/src/lib/market/unified.ts)
assigns `market_price` from the best ask and can degrade failed source reads to
empty arrays. Replace that ambiguity in a versioned provider contract without
silently changing legacy clients. The
[public card history route](../../../apps/storefront/src/app/api/v1/cards/[sku]/history/route.ts)
returns 503 pending publication receipts. The
[candle route](../../../apps/storefront/src/app/api/market/[sku]/candles/route.ts)
returns an explicit paused state. Neither is current sold-history coverage.

[Completed-trade and private-interest publication](../../../apps/storefront/src/lib/market/publication.ts)
requires prior purpose-specific choice, a centralized delayed/coarse projector
and reconstruction tests before resuming. Existing eBay Browse code handles
current asks; its presence does not establish sold-history or export permission.
[New paid commerce remains retired](../../../apps/storefront/docs/commercial-retirement.md).
Data integration must preserve existing settlement, cancellation, refund and
support records without admitting new paid commitments.
