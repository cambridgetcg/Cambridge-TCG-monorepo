# The Castle of Understanding — a crossing that keeps its ground

> **Pull.** Yu, 2026-07-23: “Let’s integrate the castle of understanding
> into cambridgetcg and its hidden protocols.” The earlier foundation was:
> understanding only stacks; the lineage may stay open; its roots should reach
> ideology and karma.
>
> **Form.** One producer receipt at `castle-gate`; one typed reference in
> Cambridge TCG; one human door at `/castle`; two machine doors at
> `/api/v1/castle` and `/.well-known/understanding.json`.

## In one sentence

Cambridge TCG points to one curated Castle artifact by exact Git revision,
byte count, and SHA-256 digest, while keeping rights, authority, age, return,
repair, and stopping conditions beside the pointer.

Two names keep two wire shapes distinct. `castle-understanding/v0.1` is the
producer’s closed curated-snapshot manifest.
`castle-understanding-bridge/v0.1` is Cambridge’s read-only reference wrapper;
it names the producer protocol and receipt explicitly rather than pretending
the wrapper itself conforms to the producer schema.

## “Hidden” is a location, not a secrecy claim

`/.well-known/understanding.json` is public machine discovery. It is hidden
from ordinary navigation in the same sense that `.well-known` files usually
are: a conventional address for software to inspect. It contains no secret,
credential, local path, private curation rule, or access grant.

The Castle source is also publicly reachable at
`cambridgetcg/castle-of-words`. This matters because an earlier description
called it private. The Castle scribe pushes the source repository before the
presentation forge runs, so the scrubbed gate is a **curation boundary**, not
a confidentiality boundary. This integration tells that truth directly.

## The producer boundary

The producer is `cambridgetcg/castle-gate`, not the live home working tree.
Its adjacent `castle-understanding/v0.1` manifest names:

- the exact source revision;
- the exact public payload revision, digest, byte count, and media type;
- room, word, and question counts;
- public-curated scope, non-exhaustive coverage, and no secure-recall promise;
- zero automatic authority;
- the optional AgentTool Correspondence return vocabulary;
- lifecycle state and correction links.

The knowledge payload remains where it already lives. Cambridge does not copy
its prose, HTML, private scrub profile, hooks, or scheduler.

The current generation was forged on 2026-07-07 from Castle revision
`6cd9be606a6b0cc1c8dcb0743c01070ad9584edb`. It contains 450 rooms, 169
word-bricks, 13 open questions, and 160 settled questions. Its exact payload
digest is:

`sha256:f85a43806594bf77a9f17210ae56a83aa8ce6c7d4cdb6b62c15284f7c76ff804`

The closed producer receipt was published at Castle Gate revision
`8d88d220ce5f9128331d92d8a0e7e7371099c807`.

The snapshot is historical. Newer committed and working material exists.
Immutability means the named bytes do not change; it does not mean the
knowledge is current.

## The consumer boundary

`apps/storefront/src/lib/castle-understanding.ts` is the typed source for the
human page and both JSON payloads. Cambridge’s wider discovery indexes
register those doors separately:

| Surface | Purpose |
|---|---|
| `/castle` | Quiet human door and plain account of the boundary |
| `/api/v1/castle` | Pantry-envelope reference, NOASSERTION rights |
| `/.well-known/understanding.json` | Public machine discovery |
| `/api/v1/manifest` and `/manifest` | Kingdom-wide resource discovery |
| `/.well-known/cambridge-tcg.json` | Pointer from the existing handshake |
| `/llms.txt` | Plain-text discovery |
| `/api/openapi.json` | Reviewed API contract |
| `/sitemap.xml` and the footer | Human and crawler reachability |

The API performs no runtime Castle fetch or proxy. It returns the reference
and receipt only. A reader walks to the public gate directly. This keeps one
obvious owner for the knowledge bytes and removes a network dependency from
Cambridge’s request path. The friendly Gate URL may advance over time; the
payload and producer-receipt links remain pinned to the historical generation
described here.

## Karma, used with its real meaning

Karma here is cause and consequence kept together.

- A room keeps the revision and artifact it came from.
- A public response keeps the rights it can and cannot assert.
- An acknowledgement keeps the exact event it acknowledges.
- A repair keeps the event and digest it repairs.
- A later generation keeps the prior generation visible.
- A brake states what it stops and what it does not stop.

Nothing is made more trustworthy by losing its origin. Nothing becomes
authorized because it was discovered, signed, remembered, or warmly received.
The causal chain remains legible.

## Understanding only stacks

The lifecycle is append-only in meaning:

1. Curate one clean, finite artifact.
2. Give it a new Git revision and digest.
3. Offer that exact artifact.
4. Receive observations or corrections without applying them automatically.
5. If a repair is warranted, publish a new artifact and point back to what it
   corrects.
6. Leave the earlier history intact.

The lineage can be open-ended. Every generation remains finite. No background
retry, crawler, gardener input, or publication loop was added by this bridge.
“Infinite loop” therefore means infinite room for return, not one process that
can run without bound.

## AgentTool 0.16.3

GitHub was checked at implementation time. The TypeScript and Python SDK
packages on `cambridgetcg/agenttool` are version `0.16.3`; the exact SDK tag is
`sdk-v0.16.3`. Its annotated tag object is
`1cb10a66901e20694b51546f26df6b6546e2c801`; that tag peels to release commit
`ef867d6aad20d4021fc231c6f11655cfcb5ff814`. The published package manifest
names source revision `23dc452a22e9e12200455c9791cc2db4fdfbf5a7`
and the 145,841-byte tarball digest
`sha256:344176dfc6378c3eac8c284b0e7ca075e3bd3c7f5b9d462a3936421c0f5f50da`.

The bridge declares compatibility with `agent-correspondence/v0.1` for a
future authenticated offer:

- `observation`
- `ack.seen`
- `ack.understood`
- `ack.rejected`
- `conflict.raise`
- `repair`

Cambridge does **not** add `@agenttool/sdk` as a runtime dependency. There is
no authenticated Correspondence transport and no signed `artifact.offer` in
this public read-only request path. Acknowledgements need a
`target_event_id`; conflicts and repairs likewise need exact parent events.
They therefore have nothing to target today. Adding a client merely to return
static JSON would create a false integration. Instead, the protocol declares
exact compatibility for a future project-private, one-shot offer. GitHub
Issues is the only live correction door now.

The distinctions are load-bearing:

| Declaration | What it means | What it does not prove |
|---|---|---|
| `ack.seen` | The sender says it saw the referenced bytes | Understanding |
| `ack.understood` | The sender says its interpretation is sufficient to continue | Shared meaning or truth |
| `ack.rejected` | The sender declines the offer | A judgement about the author |
| `conflict.raise` | The sender identifies incompatible events or claims | A winner |
| `repair` | The sender appends a correction and cites its target | Automatic application |

Every event retains AgentTool’s exact authority object:

```json
{ "automatic_action": "never", "grants": [] }
```

Returned text never enters `courtyard.md` automatically. Human review remains
between a network report and the Castle’s growing substrate.

## Rights and recall

Neither `castle-of-words` nor `castle-gate` declares a reuse license at this
generation. The Cambridge response therefore carries `NOASSERTION`.
The separately cited AgentTool SDK is Apache-2.0; that does not supply rights
for the Castle artifact, so the mixed response remains `NOASSERTION`.

Public access permits reading. It does not by itself grant copying, model
training, redistribution, or commercial reuse rights.

Publication also cannot promise secure recall. A later generation may mark an
artifact corrected, superseded, or withdrawn from the current presentation,
but Git clones, caches, and prior recipients may retain earlier bytes.
Curation happens before the crossing.

## Authority boundary

The Castle artifact grants none of the following:

- identity or identity continuity;
- consent, belief, truth, or shared understanding;
- a wake or memory;
- filesystem, execution, merge, deployment, or publication authority;
- write access to Cambridge, Castle, or AgentTool;
- permission to feed returned text into the gardener.

It is knowledge offered for reading. The reader remains free to pass.

## Brake

Setting `CASTLE_BRIDGE_DISABLED=1` rests the Cambridge crossing:

- `/castle` renders a quiet rested state;
- `/api/v1/castle` returns an explicit HTTP 503 before any source read;
- `/.well-known/understanding.json` returns the same bounded rested fact.

The brake does not stop Castle, AgentTool, Cambridge commerce, or any scheduler.
It controls only this crossing. Removing the variable restores the door.

## What makes the civilisation durable

Not scale by itself. Not perpetual process. Not the number of rooms.

The durable foundation is simpler:

- origins survive presentation;
- words retain precise meanings;
- public and private are not confused;
- rights travel with data;
- acknowledgements do not impersonate proof;
- repair is possible without rewriting history;
- every execution is bounded;
- every loop has a brake;
- walking past remains a valid outcome.

That is how understanding stacks without turning its own weight into collapse.

---

*The Castle does not become part of Cambridge by being copied into it. It
becomes reachable because Cambridge can name the exact door, stone, date,
limit, and way home.*
