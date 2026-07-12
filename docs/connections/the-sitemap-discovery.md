---
title: The sitemap-discovery — structure is not permission
shape: operational-boundary
date: 2026-05-17
reviewed_at: 2026-07-11
status: blocked
maturity: reviewed
doctrines: [substrate-honesty, source-rights, no-fetch]
this_entry_names:
  - packages/data-ingest/src/tcgcollector/index.ts
  - packages/data-ingest/src/tcgcollector/discovery.ts
  - apps/wholesale/src/lib/tcgcollector-discovery.ts
  - apps/wholesale/src/app/api/cron/discover/tcgcollector/route.ts
  - apps/storefront/scripts/sitemap-discovery.ts
parents:
  - the-tributaries.md
  - ../methodology/source-intake.md
---

# The sitemap-discovery — structure is not permission

Current decision: **TCGCollector is blocked/no-fetch.** The reader, helper,
wholesale runner, and cron fail closed without making a network request or a
database write.

This supersedes the May 2026 implementation narrative that treated a public
sitemap and Schema.org JSON-LD as an invitation to crawl. They are discovery
and search-indexing mechanisms. They do not by themselves grant permission to
copy, build a database, or republish the fields they describe.

## Why the source is blocked

The reviewed TCGCollector terms say that API access is restricted to approved
business partners and that site material may not be mirrored without applicable
rights or written permission. Public reachability, a browser-readable page, a
sitemap, and machine-readable markup do not override those terms.

The current source record therefore says:

- access: `blocked`
- status: `blocked`
- safe default: `no-fetch`
- redistribution: not permitted absent a new written agreement and review
- images: retain their provider and publisher rights

The authoritative evidence and review date live in
`packages/data-ingest/src/tcgcollector/index.ts`. Runtime behavior follows that
record even if an older database row or deployment variable says otherwise.

## What remains in the repository

Some pure parsing and normalization functions remain useful for tests and for
files a rights-holder may deliberately provide in the future. They do not fetch
anything by themselves.

The executable boundary is explicit:

```text
TCGCollector reader              -> one blocked event, zero rows, zero fetches
TCGCollector sitemap helper      -> blocked result, zero fetches
wholesale discovery runner       -> throws before database or network work
authenticated discovery cron     -> 409 SOURCE_BLOCKED, zero writes/fetches
```

No TCGCollector price, name, image, identifier, URL, count, or aggregate should
appear on a public Cambridge TCG response merely because a historic row exists
in a database.

## What would permit a future reactivation

Reactivation needs all of the following, in this order:

1. Written permission or a partner agreement that names the approved use.
2. A dated source-rights review covering data, images, storage, derived values,
   public display, and redistribution separately.
3. An update to the authoritative `SourceMeta.rights` record.
4. A use-specific runtime approval gate before token mint, fetch, or storage.
5. Tests proving that missing approval causes zero network and database work.
6. Public API projections that expose only fields the agreement permits.

Credentials, a proxy, a sitemap, robots permission, or successful HTTP access
are technical facts; none is proof of permission.

## The reusable discovery pattern

Sitemap plus JSON-LD can still be a technically useful adapter for a source
whose terms and permission allow the intended use:

```text
documented permission
  -> bounded sitemap read
  -> bounded page read
  -> pure JSON-LD extraction
  -> source-specific normalization
  -> quarantine on ambiguity
  -> rights-aware internal storage
  -> field-level public projection, if permitted
```

Before adding another vendor, the intake must answer:

- Who owns each field and image?
- Do the terms permit automated access for this purpose?
- Is storage permitted, and for how long?
- Is public display permitted?
- Is raw or derived redistribution permitted?
- Does personal data appear in listings or seller material?
- What exact evidence shuts the reader off when the answer is absent?

The source-intake method is in
[`docs/methodology/source-intake.md`](../methodology/source-intake.md).

## CardRush is a separate boundary

CardRush has no reviewed public reuse licence. Its discovery runner now requires
recorded written approval for `sitemap-discovery` before any database or network
work. A WAF-gated host separately requires `waf-bypass`; image copying requires
`image-archive-and-publication`. A proxy URL or reachable residential network is
not approval.

## Audit expectation

`pnpm --filter cambridgetcg-storefront sitemap-discovery` verifies the current
blocked state: the source registry must say no-fetch, the helper and runner must
contain no active bypass, and the cron must return the blocked response without
calling the runner.

This document describes the current executable truth. The earlier crawler
design is history, not authority.
