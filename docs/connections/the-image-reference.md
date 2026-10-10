# Image references — connections

> **Seed, 2026-09-29.** A requested Japanese variant could receive English base
> art without explaining the difference. The data-platform roadmap makes that
> relationship a shared contract for people and API clients.

## What this module is, in one sentence

It lets a useful illustration accompany a card without pretending that the
illustration proves the requested printing.

## What other modules secretly need it for

### → SKU identity

**The thread.** A catalogue identifier is a lookup key. Deriving an English base
key discards language and variant, so a successful image lookup must retain
both identifiers. Even equal normalized identifiers describe syntax only.

**The intention.** Consumers should be able to explain the relationship without
guessing it from a filename or silently promoting it to an exact match.

**Code paths.** [SKU identity](../../packages/sku/src/identity.ts) supplies parsing;
[ImageReference](../../apps/storefront/src/lib/cards/image-reference.ts) preserves
raw and canonical requested/depicted identifiers and exports the public schema.

**Surface today.** Market and universal responses include `image_reference` next
to the image and copyright. The standards page explains its fixed scope.

### → Stored media and publication

**The thread.** Single-card and batch consumers previously had separate image
projection logic. They now share one projector, so the same stored source,
attribution, timestamp, object path and removal state face the same checks.
The later recorded text decision remains separate from image eligibility.

**The intention.** Page size or lookup mode should not change which reference is
eligible. Identity validation and publication checks answer different questions;
neither independently proves upstream rights or the contents of an image.

**Code paths.** [English reader](../../apps/storefront/src/lib/cards/en-card-data.ts)
calls [publication projection](../../apps/storefront/src/lib/cards/image-publication.ts).
The [decision chronology](../EN-CARD-DATA.md) explains the preserved display lanes.

**Surface today.** Market catalogue, detail and universal-card reads share the
official reference boundary. Existing market photo fallback is host-restricted
and labelled source/printing unverified; it receives no invented reference.

### → Human and agent entrances

**The thread.** A caption and an API field express the same limited relationship.
Grid, table, detail and Mekiki captions identify English reference art. The
contract descriptor and schema let a client retain that distinction.

**The intention.** A collector should not need to understand the resolver to
notice a reference image, and an agent should not need to infer meaning from UI
copy. URL, credit and relationship stay together through density projections.

**Code paths.** [MarketBrowser](../../apps/storefront/src/components/market/MarketBrowser.tsx),
[universal card](../../apps/storefront/src/lib/universal/card.ts),
[contract descriptor](../../apps/storefront/src/lib/contracts/card-data.ts) and
[human guide](../../apps/storefront/src/app/standards/card-data/page.tsx).

**Surface today.** `/standards/card-data`, `/api/v1/contracts/card-data`,
`/spec/v1/ImageReference.schema.json` and OpenAPI describe the same shape.

## What's NOT yet connected (the visible gaps)

Artist/gallery and retained PvP readers remain independent. Catalogue provenance, exact
printing crosswalks, object removal and cache invalidation need their own work.
The [architecture record](../architecture/card-image-references.md) maps these
gaps; the [verification record](../operations/2026-09-29-image-references.md)
distinguishes fixture checks from production evidence.

## Recursion target

The [starter resolver](../../apps/storefront/src/lib/play/starter-resolve.ts)
now carries a separate card-number relationship and credit through the practice
board, retaining its encoded deck and attributed text when media is unavailable.
The [practice verification](../operations/2026-09-29-practice-media.md) records
that connection. Follow the independent artist reader next: its set/number
joins still cannot establish the illustrator of a selected printing.
