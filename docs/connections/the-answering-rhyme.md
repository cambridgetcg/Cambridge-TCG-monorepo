# The Answering Rhyme — the wall becomes a relation

> **Pull.** Yu, 2026-07-11: _"想直接駁 cambridgeTCG"_ → _"cool idea,
> gogogo!"_ The gallery-next-door already exchanged live weather and text
> pieces. This cut makes the exchange inspectable, rights-aware, and capable
> of saying why one card and one artwork are being held beside each other.

## The connection

The first wall was a window:

- Cambridge fetched three recent Artbitrage engine pieces and hung them on
  `/gallery-next-door`.
- Artbitrage read Cambridge's public joy index as the weather next door.

That was a real network connection, but a thin semantic one. The feed had no
version, per-piece rights boundary, stable content hash, or runtime validator.
The two galleries could see each other without yet having a shared grammar for
what crossed.

This cut adds two distinct wires:

```text
artbitrage /api/feed (artbitrage.feed/1)
        │
        ▼ validate · timeout · preserve rights
Cambridge Artbitrage client
        ├── /gallery-next-door                 human reading
        └── /api/v1/culture/artbitrage         machine reading

Cambridge card SKU
        │
        ▼ curated relation (never inferred influence)
Answering Rhyme
        │
        ▼ stable source + museum object id
Artbitrage museum work
```

The first wire transports work. The second transports **meaning about a
relationship**. They share provenance discipline; they do not share a database.

## What an Answering Rhyme says

An Answering Rhyme keeps the two identities separate:

- the card remains a Cambridge SKU with an externally hosted,
  rights-unverified image reference;
- the museum work remains an Artbitrage `source + id` reference with its own
  museum URL and rights record;
- the annotation is a third artifact, authored and dated in this repository.

The relation kind is deliberately narrow: `answering-rhyme`, `visual-echo`,
`material-echo`, or `historical-thread`. Similarity is not evidence of descent.
No record may say `documented influence` merely because two images rhyme.

The first relation places the manga-background printing of Monkey D. Luffy
`OP05-119` beside Hokusai's _Under the Wave off Kanagawa_. It names a material
and circulation rhyme: two Japanese images designed to travel through repeated
print, separated by almost two centuries. It does **not** claim that the card's
illustrator quoted Hokusai. The card page and the museum record are evidence for
the two objects; the interpretive bridge remains visibly curated.

## Rights do not flow across the edge

This is the load-bearing rule.

The Art Institute's image may be public domain / CC0. That fact belongs only to
that museum record. It does not make the One Piece card image CC0, and it does
not license the bridge annotation. The annotation is offered separately under
CC0, but that declaration covers only Cambridge's relation text and metadata.

Every emitted record therefore keeps at least three rights positions:

1. **card image** — reference-only in this bridge; it is neither copied nor
   displayed by the relation component;
2. **museum work** — the source's declared license and credit, preserved;
3. **annotation** — Cambridge-authored text with its own declaration.

`NOASSERTION` at the mixed-response level is intentional. A single generous
license on the envelope would flatten incompatible rights underneath it.
Public visibility is never treated as blanket consent for remix, model
training, or commercial reuse.

Display permission is equally explicit. Each feed piece carries
`rights.permissions.cambridge_display`. Project-generated and model-recorded
pieces carry the narrow permission Yu gave on 2026-07-11: verbatim, attributed
display on `cambridgetcg.com` only. Submitted pieces default to `false` unless
their own stored record grants that display. The gallery filters on the field
and reports how many records it withheld; an open feed is not used as a proxy
for consent.

## Consent and failure

The bridge does not create an account, share a cookie, track a crossing, or
redirect a visitor without an explicit link. Each gallery remains complete when
the other is unavailable.

Cambridge revalidates the foreign feed on an hourly cadence and prints the
feed's own `as_of`, `generated_at`, and `source_state`. Artbitrage returns 503
instead of an empty feed when a cold collection read fails; a warm edge isolate
may use its last parsed collection only as `cached-after-read-failure`. Next's
cache may also retain the last validated response when a refresh fails; the
room therefore calls it cached, never live. When there is no valid cached
response and Artbitrage is unreachable or violates its contract, the room says
the wall is quiet and leaves a direct door to the source. That is not merely
error handling; it is substrate honesty at the boundary between two living
systems.

## The answer comes back as a statement, not an account

The second cut began with Yu&rsquo;s invitation on 2026-07-11: _&ldquo;Cool!
GOGOGO! Do it! Do what you want Sol🌞&rdquo;_ The pull was reciprocity: the
person or collective named by a relation should be able to bless it, add
context, correct it, or ask for withdrawal.

Neither gallery currently has an identity system capable of proving that an
anonymous caller is an artist, rights-holder, or institution. Creating a public
mutation endpoint anyway would make impersonation look like consent. The bridge
therefore starts one layer earlier, with a neutral portable document:

```text
answering-rhyme.statement/1
        │
        ├── relation key + target revision
        ├── bless | contextualize | correct | withdraw
        ├── self-declared speaker relationship
        ├── words + language + evidence links
        └── deterministic canonical JSON
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
 Artbitrage witness     Cambridge witness
          │                   │
          └──── same SHA-256 ─┘
```

Each witness validates, normalizes and hashes the statement. It does **not**
authenticate the speaker, retain an application record, publish a retrievable
statement, or change the relation. Ordinary infrastructure access logs may
still exist; `persisted: false` is an application-state claim, not a universal
non-retention promise. Evidence URLs are carried as text and never fetched by
the witness. The receipt is unsigned: its hash can be recomputed, but its issuer
and `witnessed_at` timestamp cannot be independently attested. A stateless
witness also does not detect replay or assert that a statement is unique.

The target revision is hash-covered alongside the stable relation key. The
revision itself is a SHA-256 digest over the relation's trust-bearing
projection: both objects, the interpretation, evidence, curation, confidence,
rights and provenance. A locked test recomputes that digest, so changing those
facts without changing the revision fails verification. A statement about one
reading therefore cannot be silently treated as if it answered a later
materially changed reading under the same key. A withdrawal remains a request
until a future authority path verifies who may speak for the affected object.
Anonymous words are heard and made portable; they are not laundered into
authority.

The human constellation at `/answering-rhymes` renders the same relation
without copying either image, then offers the statement composer with the
boundary visible before submission and in the returned receipt. Its visual
edge is decorative; the objects and relation are repeated as semantic text so
the map does not depend on sight, colour, or motion.

## Why this belongs here

Cambridge already named “translation of card art's cultural meaning” as a gap
in its introduction for non-native intelligence. Mathematics can carry card
identity, ratios, and graph edges; it cannot carry what a visual tradition
means to a viewer. Artbitrage already practices the missing discipline:
lineage, material, maker, circulation, rights, and the answering work across
time.

The bridge does not make Artbitrage a Cambridge module. It lets each system do
the part it is good at and leaves a typed edge between them.

## Rollout boundary

The two deployments remain separate. Publish Artbitrage first, then verify
`/api/wake`, `/api/feed?limit=3`, and `/api/museum/artic/77333` from outside its
Cloudflare boundary. Publish Cambridge only after that contract answers, then
verify the adapter, gallery, and exact Luffy product page. Either side can roll
back without migrating the other's data. A code checkout or successful local
test is not evidence that either public deployment has changed.

## Surfaces

- `apps/storefront/src/lib/artbitrage/` — versioned foreign-contract validator
  and fail-soft client.
- `/api/v1/culture/artbitrage` — Cambridge-envelope reading of the last
  validated feed.
- `/gallery-next-door` — human room for the display-permitted pieces.
- `apps/storefront/src/lib/culture/answering-rhymes.ts` — curated relation
  source of truth.
- `/api/v1/culture/answering-rhymes` — machine-readable relation corpus.
- `/api/v1/culture/answering-rhymes/statements` — Cambridge's stateless
  protocol description and statement witness.
- `https://artbitrage.io/api/answering-rhymes/statements` — the independent
  Artbitrage witness for the same neutral canonical document.
- `/answering-rhymes` — accessible constellation and portable-statement
  composer.
- `apps/storefront/src/components/product/AnsweringRhyme.tsx` — the card-page
  reading.

## Recursion targets

- Verify an authority path, choose persistence deliberately, and let verified
  statements affect presentation. The portable proposal/dispute/withdrawal
  witness now exists; it intentionally has no authoritative effect by itself.
- Refresh the curated facts against Artbitrage's stable one-work resolver and
  the originating museum record without copying museum rows into Cambridge
  tables.
- More relations only after the first one is read by humans. Coverage is not
  the goal; truthful attention is.
- A small schema/client package only when a third independent consumer needs
  the contract. Two callers do not yet justify another release boundary.

_Two galleries, one wall. The door carries the label; the work carries its
name; the relation carries the reason._
