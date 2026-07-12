---
title: The Collector Passport — a door cut from the private ledger, not through it
kind: node-view + story-as-wire
filed: 2026-07-12
sophia: Codex GPT-5
status: first slice built; deployment gated
parents:
  - the-participation-layer.md
  - the-commons.md
  - the-license-propagation.md
this_entry_names:
  - apps/storefront/drizzle/0120_collector_passport.sql
  - apps/storefront/src/lib/collector-passport/public.ts
  - apps/storefront/src/lib/collector-passport/db.ts
  - apps/storefront/src/app/api/account/collector-passport/route.ts
  - apps/storefront/src/app/api/account/collector-passport/export/route.ts
  - apps/storefront/src/app/api/v1/collectors/[username]/passport/route.ts
  - apps/storefront/drizzle/0121_collector_media_vault.sql
  - apps/storefront/src/lib/media-vault
  - apps/storefront/drizzle/0122_source_rights_workbench.sql
  - apps/storefront/src/lib/source-rights/workbench.ts
self_reference: this document names why the three new boundaries do not collapse into one convenient but unsafe publication path.
---

# The Collector Passport — a door cut from the private ledger, not through it

> **Pull.** Yu's Will invited the work: *“Great idea! Sounds fun :) Go for it!
> Look forward to what you build.”* The prior conversation named the shape:
> a private, portable collection record; private media; and a field-level
> source-rights workbench.

## What this module is, in one sentence

Collector Passport lets a collector write a small revocable public story about
chosen collection highlights without turning the private portfolio or the
mixed-source catalog mirror into a public dataset.

## The finding: one existing row was doing three jobs

`portfolio_cards` began as a useful personal ledger. It later accumulated
display metadata from the wholesale catalog, financial basis for valuation,
private notes, and links into the social showcase. Those uses are legitimate
inside the signed-in account, but their composition creates a trap: a single
“public profile” boolean appears to authorize a row whose fields came from
different people and sources for different purposes.

It does not.

The first Passport cut is therefore deliberately text-first. The selected
portfolio row proves only that the owner selected a private draft. The public
label and story live in separate columns and must be written and affirmed by
the collector. The public query cannot select the catalog or financial fields;
the projection cannot accidentally spread them.

## What other modules secretly need it for

### → The social showcase needs a publication receipt

**The thread.** The old showcase connected a profile to `portfolio_cards` and
returned card name, set, image, rarity and SKU to anyone viewing a public
profile. The schema recorded selection but not a separate publication purpose,
notice version, time or withdrawal.

**The intention.** Selecting a card for later arrangement is not the same act
as publishing it to strangers or API callers. Passport keeps showcase rows as
private drafts, then adds a dedicated per-item transition and receipt.

**Surface today.** The owner sees private card context while editing. A
non-owner sees only current collector-authored Passport text. Old showcase rows
remain drafts and no catalog text is copied forward.

### → Profile privacy needs irreversible withdrawal, not a temporary filter

**The thread.** A read-time `users.is_public` gate can hide Passport items while
a profile is private, but merely turning the profile public again would revive
the old receipt and old public identifier.

**The intention.** Withdrawal means “stop publishing this choice,” not “hide it
until another unrelated setting changes.” The profile-private transition
therefore withdraws every Passport item and appends the withdrawal facts.
Fresh publication requires the current notice and rotates the public item id.

**Surface today.** Private, suspended, unknown, empty and withdrawn profiles
share one 404 response. There is no enumeration oracle for which kind of
absence occurred.

### → Source rights needs a field boundary before it needs more data

**The thread.** The source registry already separates code, data, image and
redistribution rights, but it cannot yet answer “may this exact field be used
for this exact purpose?” A public card name and a private signed-in image are
not the same question.

**The intention.** The workbench records exact field-and-purpose proposals,
with official evidence and deterministic hashes, while refusing to let a
database row become an authorization shortcut. The deployed registry remains
the authority. No activation endpoint exists.

**Surface today.** Operators can compare the effective deployed record with an
append-only proposal. Builders can export the proposal for code review. Public
source endpoints never read it.

### → Media privacy needs a new bucket, not a renamed public URL

**The thread.** Existing upload helpers were shaped around public URLs and a
shared bucket. Reusing them would carry public-object assumptions into private
collector photos, and re-opening the paused routes would mix collection media
with auctions, evidence, verification and avatars.

**The intention.** The media vault is a separate owner-only product with a
dedicated bucket, credentials, encryption key, object namespace, mode switch,
image normalization, quotas and deletion path. It launches off. The old upload
doors stay paused.

**Surface today.** The interface can name the vault and its disabled/configured
state without pretending infrastructure exists. No vault photo becomes a
Passport-public field in this slice.

## Wiring — the three boundaries

| Boundary | May contain | Must not become |
|---|---|---|
| Private portfolio | holdings, cost, date, notes, owner display context | public collection API |
| Collector Passport | collector-authored label/story + receipt | proof of ownership or catalog mirror |
| Media vault | normalized owner-only collection photo | public URL or evidence-document store |
| Rights workbench | non-effective review proposal | runtime permission override |

The table is the design. Combining any two rows for convenience would remove
the very distinction that makes the new capability safe.

## What's not yet connected

- Passport has no public image. A later connection needs an explicit owner
  publication act for one normalized vault derivative, takedown/reporting,
  field-level licence language and a fresh threat review.
- The first private JSON archive now carries first-party/user-authored lineage
  per field and withholds mixed-source display fields. Sale-event provenance,
  grading events and media-file export remain future layers.
- Source-rights proposal cells do not yet compile into the deployed registry
  type. That translation belongs in a reviewed code change, not an admin click.
- There is no Passport directory, fuzzy people search or aggregate. Exact
  handle lookup is the boundary until safeguarding and purpose are named.

## Recursion target

Follow the private export. The next useful piece is a collector-owned archive
whose schema distinguishes `self-authored`, `first-party transaction`, and
`upstream NOASSERTION` fields so portability does not quietly become
redistribution. It should be useful even if the public Passport never grows.

---

The portfolio remembers possession. The Passport carries only the words the
collector chose to carry across the threshold. The door is useful because the
wall remains real.
