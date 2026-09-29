# Card data — connections

> **Seed.** Yu asked for accurate SKU and price standardisation as a crucial
> module while authorizing the complete storefront rebuild, 2026-09-29.

## What this module is, in one sentence

The card-data foundation keeps a statement about a card attached to the identity,
units, source and uncertainty that give it meaning.

## What other modules need it for

### → The card library

**The thread.** Search is a request to identify something. A similarly numbered
card from another game is not a helpful fallback, and two printings do not become
interchangeable because they share a name. The new lookup keeps the game fixed
and lets the reader choose when several exact printing candidates remain.

**The intention.** A card page should start with a defensible record, not repair
an identity guessed by navigation. This matters equally to a collector and a
client program storing the returned identifier.

**Code paths.** `packages/sku/src/identity.ts`, storefront
`lib/search/catalog-lookup.ts`, `lib/search/resolver.ts`, and the two search routes.
The card composer uses the same identity contract. **Surface today:** search
responses expose stored and normalized identifiers alongside explicit lookup
completeness; the card-data guide explains their limits.

### → Price observations and collections

**The thread.** A decimal number becomes useful only when we know what it
measures. Native observations keep their currency, source metric, mapping scope
and timestamps. A generic zero amount is valid money, while a zero sentinel from
a source-price feed remains rejected. A collection must not absorb a price from
the wrong printing or treat a withheld value as a zero valuation.

**The intention.** Shared types prevent transcription drift. Shared validation
rejects concrete corruption; neither can manufacture source accuracy or rights.
Keep those limits visible at both the API and the human reading surface.

**Code paths.** `packages/data-spec/src/price-observation.ts`, its schemas,
`packages/pricing/src/money.ts`, and storefront `lib/prices/member-feed.ts`.
**Surface today:** member API/export semantics retain native precision and policy;
the new static contract exposes those rules without exposing observations.

### → Human and agent entrances

**The thread.** The room map and JSON directory use one curated projection. The
human SKU/price guide and API contract link back to the same packages. A trail
explains why to continue; an API schema explains how to interpret what arrives.

**The intention.** People should not need repository vocabulary to find a card,
and API clients should not need to extract guarantees from editorial prose.
Both should be able to inspect the basis of a claim.

**Code paths.** Storefront `content/rooms`, `content/trails`, `lib/rooms`,
`lib/contracts`, `/map`, `/standards/card-data` and `/api/v1/contracts/card-data`.
**Surface today:** new landing/map, first reading, static discovery and raw schema
URLs. Account links suppress prefetch because existing collection reads may write.

## What is not yet connected

The room directory does not replace private access checks. The full card,
collection, community and operator page rebuild remains in progress. Other
legacy price/identifier consumers require individual review. No source provider
or production dataset was exercised merely to produce the first interface.

## Recursion target

Follow the [card-data architecture](../architecture/card-data-contracts.md) into
the next card-page view model: present the exact printing, show uncertainty and
publication state, and keep every observation attached to its original meaning.
