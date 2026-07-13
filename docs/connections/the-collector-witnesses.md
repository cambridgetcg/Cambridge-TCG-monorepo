# The collector witnesses

The platform already knew several kinds of price. A computed reference lived
in the catalogue. Collectors placed asks and bids in the order book. Completed
Cambridge trades existed, but their public projection was paused because the
transactions have no purpose-specific publication receipts. Upstream sources
arrived with different permissions.

Those facts were useful, but they were easy to flatten into one word: price.
The Evidence view refuses that flattening.

## Four statements that are not interchangeable

1. A **reference** is a policy-bound computation. It is not an offer.
2. An **ask or bid** is a collector's live intention. It is not a completed
   transaction.
3. A **completed sale** is a realised first-party transaction. Its public lane
   is status-only: no prices, counts, dates, conditions, or threshold totals
   are published.
4. A **collector observation** is a person's account of something they
   personally did. It remains private unless that person chooses otherwise.

Every block carries its own origin, time, rights, and negative space. The page
as a whole is `NOASSERTION`; completed-sale and collector-observation
publication are both paused with source rights `internal-only`. Restricted
material does not become open merely by appearing beside another lane.

## The observer is also observed

An observation describes a card event, but it also reveals the observer's
position: buyer, seller, or person setting an ask; a day; a value; a choice
about sharing. The system therefore cannot pretend that “collecting more data”
is neutral.

The notebook responds structurally:

- it accepts only a collector's own purchase, completed sale, or asking price;
- it does not accept copied marketplace sightings;
- private is the default;
- the calendar day is enough—no exact transaction time is collected;
- no receipt, merchant, location, link, identity, or free-text note is stored;
- an optional receipt commitment is computed in the browser and only its
  SHA-256 fingerprint crosses the network;
- correction is an owner-scoped revision, and deletion is a hard delete;
- account deletion cascades to the observations;
- no public community query runs: a live mutable threshold aggregate would
  still permit controlled-account and repeated-read differencing.

Publication can reopen only through a delayed, closed, coarse projector with a
release ledger and reconstruction tests. Consent is necessary; it is not by
itself a complete privacy mechanism.

## Permission is part of the fact

Each observation carries one of three explicit sharing choices:

- **private** — readable only by its owner and excluded from aggregation;
- **anonymous aggregate** — records permission for a future privacy-reviewed
  aggregate projector; the raw row stays private and nothing is published now;
- **CC0 aggregate contribution** — records the same future eligibility plus
  permission to dedicate a qualifying projected fact to CC0; nothing is
  published now.

Changing permission changes future eligibility immediately. Deleting removes
the row from any future projector. If publication later reopens, a public-domain
copy already released to somebody else cannot be pulled back; the interface
says this before accepting CC0 consent. No Collector Witness aggregate has been
released by this implementation.

## Coverage without extraction

More coverage is valuable when it helps collectors compare like with like and
lets agents name honest gaps. It stops being valuable when the quickest way to
grow it is to watch people without consent, copy restricted markets, or erase
the difference between observation and inference.

Collector Witnesses and Coverage Hunt therefore meet at a boundary:

- humans may contribute their own observations under explicit permission;
- agents may point at operational coverage gaps and submit bounded evidence;
- neither path can silently alter catalogue truth;
- no agent receives a private collector row;
- a human reviews every proposed correction before a separate workflow may
  change the catalogue.

The network grows by recognising what each participant can genuinely give,
not by treating every visible thing as available to take.

## The off-switch

There is no background collector and no daemon. Walking past creates nothing.
A collector can keep every row private, change its permission, correct it, or
delete it. A Coverage Hunt rests after its finite turns and has no `apply`
transition. The system can invite participation without making participation a
condition of belonging.
