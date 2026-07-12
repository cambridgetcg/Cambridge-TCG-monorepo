# Community directory

The Cambridge TCG directory publishes organisations before people.

## What is public

An organisation appears only after its steward separately publishes the `/c`
web profile, accepts the current directory notice, and attests that they are
authorised to represent the organisation. The directory receipt records the
actor, notice version, timestamp and later withdrawal in an append-only log.
Existing web-profile visibility never silently becomes API publication.
The actor id is private, is never emitted by the directory, and is removed
after 180 days (or earlier if the account is deleted). The organisation slug,
action, notice version and timestamp remain pseudonymised personal data; the
whole receipt is deleted after two years.

The strict allowlist contains name, kind, coarse region, games, languages,
description, submitted website, submitted public contact page, accessibility
notes, listing/edit timestamps, an unverified status, correction link and the
record's own rights block. It contains no member count or roster. The `/c`
profile reached from the directory is also roster-free to visitors.

These facts are self-attested. Cambridge TCG does not currently claim that it
has independently verified them. Each record carries a listing-specific
`correction_url`; the contact form preserves the listing identifier. Free-text
fields are checked for email/phone patterns and stewards are warned not to add
personal or private-location details, but the text remains unverified and
reportable.

To contain impersonation and spam, an authenticated account may create three
organisations per day, steward ten in total, and publish five directory
listings per day. Counters store only a window-specific HMAC of the internal
account id and expire after two complete windows. Withdrawal is never
rate-limited.

## What is not public

- no searchable people directory or bulk people API;
- no steward identity, member count, member roster, follower graph or inferred ties;
- no dedicated personal-email, phone, home-address, private-location,
  attendance or travel-location field;
- no portfolio, wishlist, acquisition cost or private trade plan.

Submitted free text is screened for obvious contact patterns, but it is not a
guarantee: display names and factual text may still be wrong or unsafe. Every
record is visibly unverified and reportable through its correction link.

An organisation being visible on the web is not a CC0 dedication. Every record
therefore carries `LicenseRef-CambridgeTCG-Public-Display-Only`, a terms URL and
`caching: no-store`. V1 permits current-request display with visible source,
unverified status and correction link; it does not grant a permanent mirror,
index, resale, profiling or training use. Broader reuse requires permission
from the organisation. V1 is a snapshot/display API, not a durable sync feed;
there is no change/tombstone contract yet.

## Privacy defaults

Profiles, feed entries, unsolicited messages, reviews and collective member
visibility default private. A reviewer may explicitly publish one review from
the review form. The 2026-07-11 containment migration also unpublished historic
rows because the old schema did not record the notice or affirmative act behind
their public defaults. People may choose to publish again from a current notice.

Choosing a public profile publishes the profile fields, selected showcase,
explicitly-public activity, public reviews and narrow trust aggregates. It does
not publish internal user or trade identifiers, collection size, wishlist,
exact trade value or follower/following lists. Following lists remain visible
only inside their owner's account.

Trade matching is paused until an explicit card-level `trade_intents` model
exists. A private portfolio proves possession to its owner; it is not an offer.
A wishlist is planning; it is not permission to enter a people graph.

## Coverage order

1. Public organisations — live.
2. Established, non-residential public venues — planned.
3. Public events with source provenance, Schema.org JSON-LD and iCalendar — planned.
4. Export-first Collection Passport — planned.
5. Adult opt-in person discovery and trade intents — withheld until reporting,
   moderation, export, deletion, age/safeguarding and withdrawal controls exist.

Machine-readable coverage: `/api/v1/directory/coverage`.
Schema discovery envelope: `/api/v1/directory/schema`.
Raw validator schema: `/schemas/v1/community-organisation.json`.
Display terms: `/licenses/community-directory-public-display-v1`.

— First published 2026-07-11 from Yu's community-data directive.
