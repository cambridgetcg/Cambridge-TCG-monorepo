# Collector Passport methodology

Collector Passport is a private-first, collector-authored set of collection
highlights. It is not proof of ownership, a catalog, a valuation, an offer to
sell, or a public copy of the portfolio.

This canonical method is paired with the meaning bridge
[`the-collector-passport.md`](../connections/the-collector-passport.md) and
applies [substrate honesty](../principles/substrate-honesty.md) plus
[transparency](../principles/transparency.md) at the publication boundary.

## Why the Passport is separate from the portfolio

`portfolio_cards` is a private working ledger. One row can contain quantity,
condition, acquisition cost and date, notes, valuation inputs and display
metadata resolved from the internal catalog mirror. Those fields have
different privacy and source-rights histories. A public profile choice cannot
turn the whole row into publishable data.

The Passport therefore projects none of that row. The owner first chooses a
portfolio row as a private draft, then writes a separate public label and an
optional story in their own words. Those two bounded text fields are the only
collection content that can enter the public Passport response.

## Publication receipt

Publication is per item and requires all of the following:

1. The caller is signed in and owns the linked portfolio row.
2. Their profile is currently public.
3. They supply a non-empty collector-authored label and optional bounded story.
4. They accept the exact current notice version.
5. Fewer than twelve current Passport items are already published.

The transition locks the relevant account and draft rows, records the current
notice version and time, and appends a private publication receipt. Existing
showcase rows were not grandfathered or copied into public fields.

Withdrawal is immediate and is never rate-limited. A new publication after a
withdrawal receives a new random public item id, reducing linkability across
the withdrawn period. Making the whole profile private atomically withdraws
every Passport item. Making it public again does not resurrect them; each item
must be published again from the current notice.

## Public response

The exact-handle route publishes:

- the chosen public username;
- one random public item id;
- the collector-authored label and optional story;
- display order, first publication time and current text/order update time;
- `self_attested_unverified` status;
- the current-display, correction and withdrawal notices.

It does not publish separate structured or automatically copied SKU, catalog,
holding, image, acquisition, private-note, valuation, P&L, internal-id or social
graph fields, or a proof-of-ownership claim. A collector may mention a card in
their own label or story; that text remains self-attested and unverified.

The database query used by the public boundary cannot select those excluded
fields. The projection then constructs every output property explicitly; it
does not spread a database row into the response.

There is no collector directory, browse route, bulk dump or Passport search.
Unknown handles, private profiles, suspended profiles, profiles with no current
receipts and fully-withdrawn Passports all return the same 404 response.

## Reuse boundary

Public technical access is not a reuse grant. Responses are no-store,
`NOASSERTION`, noindex, nofollow and noarchive. The collector has permitted
Cambridge TCG to show their submitted words while publication remains current;
Cambridge TCG does not grant a downstream party ownership of those words.

The API allows cross-origin GET so a collector can show a current response in a
tool they choose. That CORS header removes a browser transport restriction; it
does not grant mirroring, indexing, training, profiling or resale rights.
Downstream tools should fetch current state, keep the unverified status and
correction path visible, and stop displaying an item when it disappears.

## Images

The first Passport is text-first. It deliberately does not hotlink or publish
catalog images. A separate Collector Media Vault can accept owner-only photos
only after dedicated private storage, image normalization, quotas, retention
and deletion are configured together. Vault media is not a Passport-public
field in this release.

## Private portability

The signed-in owner can download a private JSON archive. It includes the
Cambridge SKU, condition, quantity, legacy recorded acquisition amount/date, private notes and
collector-authored Passport text. Each field class carries a plain-language
lineage statement. The legacy amount is explicitly currency-unknown and may be
a derived cost-basis estimate. Catalog-resolved card/set names, numbers, rarity, images and
valuation are excluded because the portfolio row does not retain affirmative
field-level redistribution lineage for them. The download is private,
no-store, noindex and is not a public catalog dataset.

## Retention

The active draft fields remain until the owner edits or deletes the showcase
row or account. The publication log stores no label, story, card data, cost,
value or image. It records the action, random public id, notice version and time.
Authenticated publication/withdrawal paths also record the acting account id;
a database-only cascade fallback leaves the actor unknown rather than guessing.
The actor id is redacted after 180 days or account
deletion; the pseudonymised receipt is deleted after two years.

## Code paths

- Schema and receipt: `apps/storefront/drizzle/0120_collector_passport.sql`
- Atomic transitions: `apps/storefront/src/lib/collector-passport/db.ts`
- Strict public projection: `apps/storefront/src/lib/collector-passport/public.ts`
- Owner API: `apps/storefront/src/app/api/account/collector-passport/route.ts`
- Owner archive: `apps/storefront/src/app/api/account/collector-passport/export/route.ts`
- Public exact-handle API: `apps/storefront/src/app/api/v1/collectors/[username]/passport/route.ts`

## Limits of the claim

The platform does not verify that a highlighted item exists, is authentic, is
owned by the collector, or matches a known card. “Self-attested, unverified” is
not a temporary caveat hidden in documentation; it is part of the response.
