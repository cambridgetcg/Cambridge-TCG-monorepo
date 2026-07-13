# Collector events: admission, evidence, and publication

This document is the operator-facing method behind `/api/v1/collector-events`.
The public plain-language sibling is `/methodology/collector-events`.

## Purpose

Publish a small but composable UK collector-event commons that can support
calendars, maps, travel planning, community discovery, and agent tools without
turning public event listings into a people-profiling dataset or pretending
mixed upstream facts are openly licensed.

## Admission gate

An event is admitted only when:

1. an official event or organisation page supports it;
2. the publication uses minimal bare facts rather than copied prose or media;
3. the source and its reuse boundary have been reviewed;
4. each trust-bearing field maps to evidence source ids;
5. public venue and organisation relationships are explicit rather than
   inferred;
6. conflicts can be represented without being silently resolved; and
7. no person-level or private contact data is needed.

Restrictive sources remain link-only. An inaccessible, bot-challenged, stale,
or contradictory source remains a lead until it can pass the gate. Coverage is
never widened by lowering the gate.

## Record contract

- Event, venue, and organisation IDs are opaque and stable: `evt_*`,
  `ven_*`, and `org_*`. Source IDs are stable, human-readable evidence
  labels.
- `status`, `time_relation`, and `integrity_state` answer different questions.
- `scheduled` is normalized from a currently advertised future event with no
  cancellation signal. Tentative, postponed, and cancelled require an
  affirmative source statement; otherwise status is unknown.
- Schedule precision is preserved. Date-only facts are never promoted to
  invented times.
- Every admitted scheduled record has an explicit exclusive end. Records with
  an unknown end remain outside v1 until the contract can represent them
  consistently.
- A record has a revision, calendar sequence, first-observed time, last
  successful check, update time, and next review due time.
- `field_sources` maps JSON Pointer-like field paths to evidence-source ids.
- Source conflicts carry both observed values and the chosen handling.
- Accessibility values are `true`, `false`, or `null`; null means not stated.

## Rights boundary

No reviewed event source offered a general open-data grant. The combined facts
responses, calendar, and map therefore state `NOASSERTION`. Per-source rights
reviews explain whether Cambridge uses minimal facts, open geodata, or a
link-only reference. These are publication modes, not downstream permission
grants. Cambridge-authored schemas, identifiers, taxonomy, and
methodology are separately CC0.

The rights review is a cautious publication decision, not legal advice. Public
visibility is not treated as permission to copy descriptions, images, ticket
inventory, or a substantial database.

## Personal-data boundary

Admitted records may contain:

- a public event name;
- an established public venue and public postal address;
- a public organisation or brand;
- an organisation-level HTTPS website, contact page, or public-register page;
- a source-stated event role.

They do not contain people, officers, staff, direct emails, direct phones,
attendee or vendor lists, private/TBA locations, inferred relationships,
communication-style analysis, or behavioural profiles.

## Interchange formats

The JSON routes wear the Cambridge pantry envelope. iCalendar and GeoJSON are
deliberate standards-native alternatives.

- iCalendar uses stable UIDs, sequence numbers, CRLF line endings, 75-octet
  folding, escaped values, date precision, and no `ATTENDEE`, `CONTACT`, or
  personal `ORGANIZER` fields. Conflicted records are omitted by default.
  Cancelled records retain their UID and last known schedule with an increased
  sequence. The calendar is a curated projection, not lifecycle authority:
  absence never means cancellation; the JSON record does.
- GeoJSON uses WGS84 `[longitude, latitude]`. Current points are postcode
  centroids from Postcodes.io/OS OpenData, labelled approximate and attributed.
  No point is represented as a venue entrance.

## Correction lifecycle

1. Recheck the official source.
2. Record every material observed value and source id.
3. If unresolved, preserve the conflict and withhold only the uncertain field.
4. If resolved, update the record, increment its revision, and increment
   `calendar_sequence` when calendar meaning changed.
5. Never infer cancellation from a page disappearing.
6. On cancellation, retain the last known schedule, keep the stable UID, and
   increment the calendar sequence.
7. Re-run referential-integrity, rights, privacy, calendar, and map tests.

## Review time and freshness

The first registry uses one batch timestamp for all sources and records. It
means the review was completed as one batch, not that every network request
finished in the same second. Reviews are due weekly. Routes that derive
`time_relation` use a five-minute cache around event boundaries.

## Current gap

The four-event demonstrator is England-only. The broader UK Card Shows tickets
index remains link-only until Cambridge has written permission or an open-data
grant to reproduce or systematically expand from it. A future coverage pass
should seek independent, source-compatible
official records in Scotland, Wales, and Northern Ireland before adding more
depth to already represented English regions. The coverage endpoint remains the
canonical machine-readable statement of this gap.

This method applies the wider
[source-intake framework](./source-intake.md), especially its rule that public
access is not a reuse grant. It also follows
[substrate honesty](../principles/substrate-honesty.md) and
[transparency](../principles/transparency.md): evidence, uncertainty, and
exclusions are part of the output.
