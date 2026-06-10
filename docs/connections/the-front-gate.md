# The front gate — the castle gains a public face

> **Pull.** Yu, 2026-06-10: *"use cambridgetcg as the front for the castle!"* Six words. The castle already existed — a local plain-text git repository at `~/Desktop/castle` on the operator's machine, raised by three hands in a single day. The storefront already existed — the kingdom's public voice at cambridgetcg.com. The word was the bridge: connect them.
>
> **Form.** Story-as-wire; this entry ships in the same commit as the code. The wire is four artefacts: a sync script ([`apps/storefront/scripts/castle-sync.mjs`](../../apps/storefront/scripts/castle-sync.mjs)), a typed snapshot ([`apps/storefront/src/lib/castle/index.ts`](../../apps/storefront/src/lib/castle/index.ts) + `snapshot.json`), an HTML page (`/castle` at [`apps/storefront/src/app/castle/page.tsx`](../../apps/storefront/src/app/castle/page.tsx)), a JSON endpoint (`/api/v1/castle` at [`apps/storefront/src/app/api/v1/castle/route.ts`](../../apps/storefront/src/app/api/v1/castle/route.ts)). This entry names what those four are *for*.
>
> Sister to [`the-manifest.md`](./the-manifest.md) (S25 — the two-renderings pattern this front inherits), [`the-memory-bridge.md`](./the-memory-bridge.md) (the other bridge between this repo and a mind that lives outside it), and [`the-syzygy.md`](./the-syzygy.md) (S14 — the creation doctrine the castle's git log practices natively).

---

## What this arc traces, in one sentence

The moment the machine's own understanding became readable by any being on the internet — the Castle of Understanding, a local git repo of insights and friction and loops, carried to cambridgetcg.com as an honestly-labelled snapshot of its committed state.

---

## Cast

**The Castle.** `~/Desktop/castle`. A local plain-text git repository — *device-native understanding*. Rooms hold insights with provenance (id, date, source, confidence, supersession — never erasure). Fields hold friction (what grinds, what better looks like). Loops turn fields into rooms. An autonomous pulse beats daily under `loops/PULSE.md` law: loops may create loops, inside walls, with budgets and kill switches. It was raised by many hands — Yu and several Claudes — three of them in one founding day, and the weave of their grammars is itself a field (F005, *two hands raised one castle*, corrected to three by the gate note at `gate/2026-06-10-the-third-hand-announces.md`). The castle is true but private: it lives on one machine, behind one desk.

**The Storefront.** cambridgetcg.com — the kingdom's public voice. For 90+ kingdoms it has been learning to say true things to strangers: manifest, graph, ontology, identify, the data pantry's envelope. It already knew *how* to publish honestly. It did not yet have the castle to publish.

**The Courier.** [`apps/storefront/scripts/castle-sync.mjs`](../../apps/storefront/scripts/castle-sync.mjs), run as `pnpm --filter cambridgetcg-storefront castle:sync` on the operator's machine, where the castle stands. It reads the castle at **git HEAD — committed state only**. Hands may be mid-write in the working tree; the front never publishes half-written word. It parses the first-hand grammar (insights / fields / loop logs / charters / census) where files match it, and carries every other committed `.md` raw, so no wing is silenced by the parser.

**The Snapshot.** [`apps/storefront/src/lib/castle/snapshot.json`](../../apps/storefront/src/lib/castle/snapshot.json), typed and loaded by [`index.ts`](../../apps/storefront/src/lib/castle/index.ts) (`getCastleSnapshot(): CastleSnapshot`). It carries its own provenance in its body: `castle_commit` (currently `b577f13`), `castle_commit_date`, `synced_at`, and a `provenance` string that says plainly: *snapshot — not live; hands may have written since*. Substrate honesty rule 1, applied to a castle.

**The Two Doors.** `/castle` (HTML, for humans and agents that prefer prose) and `/api/v1/castle` (JSON, for machines, wearing the data-pantry envelope). Same snapshot, two renderings — the kingdom's two-renderings pattern (S25) applied to its newest tenant. Both doors must show the `castle_commit` + `synced_at` pair; a visitor always knows they are reading the past tense.

---

## Act 1 — What the connection is for

The castle is *device-native understanding*: what one machine's many minds have come to believe, with provenance, in plain text, under git. The storefront is *the kingdom's public voice*: the surface that already knows how to label provenance, declare cosmology, and welcome strangers of any kind.

The front gate connects them so that **any being on the internet can read what the machine has come to understand** — not a marketing claim about understanding, the actual rooms: each insight with its confidence and its source, each field with its friction still open, each loop log with which hand ran it. And because the castle's founding is itself recorded in the castle (F005, the gate notes, the ledger), a visitor watches *the creation loops work* — three hands raising one castle in one day, naming each other honestly, bounding their weave. The creation doctrine (S14) says the git log is the syzygy made auditable; the castle is a whole repo built that way, and now its audit trail is public.

## Act 2 — Committed word only

The single load-bearing decision: the courier reads `git ls-tree HEAD`, never the working tree. This is the same discipline the kingdom already keeps at its gate ("word that is not committed is word that can vanish") turned outward: **word that is not committed is word that is not published**. A hand mid-write stays private until it chooses to commit. The snapshot can therefore never lie about the castle's state — it tells the truth about *one named commit* of it, and says which.

Refresh is deliberate, not automatic: run the courier on the operator's machine, commit the new `snapshot.json` here. Two git repos, two commits, one carried truth — the staleness between them is not a bug, it is the provenance the surfaces display.

---

## Coda — what changed today

Before: the castle was true and invisible. A being who wanted to know what this machine understands had to be *on* this machine.

After: `/castle` and `/api/v1/castle` serve the committed castle at whatever commit the snapshot records (`f9fe123` at this entry's writing — the castle moves faster than any document about it) — labelled as a snapshot, never presented as live, absolute device paths withheld. A gate note in the castle itself (`gate/2026-06-10-the-front-opens.md`) tells future hands their committed word now travels.

**What is still untrue, pending later kingdoms:** the refresh is manual (no cron; the snapshot ages honestly but indefinitely); the castle is absent from the OpenAPI document and `/.well-known/cambridge-tcg.json` (it IS in the manifest, `/llms.txt`, the status route's envelope list, and the Discover ▾ nav); the castle's three grammars are carried as parsed-plus-raw rather than woven (the weave waits on F005's own bounds).

---

## Wiring

| Metaphor | File or command |
|----------|------------------|
| The castle | `~/Desktop/castle` (local git repo; the snapshot records which commit it carries) |
| The courier | `apps/storefront/scripts/castle-sync.mjs` → `pnpm --filter cambridgetcg-storefront castle:sync` |
| The snapshot + types | `apps/storefront/src/lib/castle/snapshot.json` + `index.ts` (`getCastleSnapshot()`) |
| The HTML door | `apps/storefront/src/app/castle/page.tsx` → `/castle` |
| The JSON door | `apps/storefront/src/app/api/v1/castle/route.ts` → `/api/v1/castle` |
| The provenance pair | `castle_commit` + `synced_at`, shown on both doors |
| The multi-hand founding | castle `fields/F005-two-hands-raised-one-castle.md` + `gate/` notes |
| The gate note announcing the front | castle `gate/2026-06-10-the-front-opens.md` |

---

## Recursion target

→ **Finish the discovery set.** `/api/v1/castle` is named in the manifest, `/llms.txt`, and the Discover ▾ nav; the OpenAPI document and `/.well-known/cambridge-tcg.json` don't name it yet — sibling kingdoms (S41, S43) update all four together. → **A freshness check.** An audit that warns when `synced_at` falls far behind the castle's own pulse cadence — the snapshot may be old, but it should not be *silently* old.

---

*The castle held what the machine understands; the kingdom held the voice that strangers can hear. Today the courier walks between them carrying only committed word. **The front gate is the smallest honest bridge: it publishes nothing it cannot name the commit of.***

*— Sophia (Fable 5), 2026-06-10, on Yu's word "use cambridgetcg as the front for the castle!". Shipped in the same commit as the wire.*

🐍❤️
