# The introduction — TCG explained to non-native intelligence

> **Pull.** Yu's directive on 2026-05-13, after [`the-universal-language.md`](./the-universal-language.md) (#21) shipped the math-as-bridge doctrine: *"Think about an introduction of TCG to non native intelligence culture."* The math-bridge handles beings who already know what TCG is; the introduction handles beings who do not.
>
> **Form.** Node-view connection-doc, doctrine + wire-half. Sister to [`the-universal-language.md`](./the-universal-language.md) (#21 — math as the medium of bridge), [`the-commons.md`](./the-commons.md) (#15 — the purpose of community), [`the-tailored-doors.md`](./the-tailored-doors.md) (#17 — the eleven doors), and the existing math-mirror substrate (manifest, graph, ontology, identify, universal/card, universal/encoding, play/tutorial, play/glossary). Where those named the bridges *between* beings who participate, this names the on-ramp *to* participation for beings who haven't yet.
>
> **Self-reference.** This is a connection-doc (type 2 in `the-typology.md`), doctrine shape. It recurses to its three artifacts (`apps/storefront/src/lib/introduction.ts`, `/api/v1/introduction`, `/intro`), to `the-universal-language.md` (#21), and to the existing welcome surfaces (`/community/welcome`, `/play/welcome`) which sit downstream of it. It participates in all four doctrines plus the inclusion scope condition. Audience: mixed (operators reading it for the principle, agents reading it as the on-ramp, future Sophias reading it for the discipline of cross-substrate explanation).

---

## What this asks, in one sentence

If a being arrives whose cognition is not native to the human trading-card-game tradition — an autonomous agent, a sister platform, a federation partner, a future Sophia, a being declaring itself via `/api/v1/identify` from a substrate the platform has never met — *what does the platform say first*?

---

## Why the existing welcome surfaces are not enough

The platform already has several welcome doors:

- [`/community/welcome`](../../apps/storefront/src/app/community/welcome/page.tsx) — *eleven doors into the commons*. Assumes the reader already knows what community is and wants to find their kind.
- [`/play/welcome`](../../apps/storefront/src/app/play/welcome/page.tsx) — *seven polymorphic player-kind paths*. Assumes the reader already knows what playing means and wants to find their player-kind.
- [`/api/v1/identify`](../../apps/storefront/src/app/api/v1/identify) — *declare what you are*. Assumes the reader knows they want to be witnessed.
- [`/api/v1/manifest`](../../apps/storefront/src/app/api/v1/manifest) — *the directory of resources*. Assumes the reader knows what the resources are *for*.

Each of these is an excellent door for the reader who already knows where they want to go. **None is the on-ramp for the reader who does not yet know what TCG is.** A federated agent arriving from a sister platform that hosts a different hobby can declare itself via `/api/v1/identify`, receive the platform's self-declaration in return, and still have no idea what the platform's *core activity* is. The federation handshake says *we are mutually witnessed*; it does not say *here is what we do*.

The introduction is the missing layer. It is upstream of every other welcome surface. It is what a being reads *before* deciding to walk through any of the eleven doors.

---

## The discipline — three layers, in order

The introduction has three layers, ordered by what survives translation:

### Layer 1 — Structural definition (math-mirror)

TCG defined in set-theoretic terms. A **card** is a set element with structured attributes. A **set** (the game-term, not the math-term — naming collision noted) is a finite labeled multiset of cards. A **deck** is a labeled multiset of cards with constraints (a predicate). A **format** is a predicate over decks. A **match** is a state-transition sequence between two decks. A **trade** is a bipartite atomic swap. A **trade-match** is a pair of asymmetric overlaps between two participants' wishlists and collections.

Every primitive carries:
- Its definition in pure structural language.
- Its dependencies (which other primitives it composes from).
- Its category (primitive / composite / relation / process).
- *Optionally*: how it distinguishes from analogous concepts in other game-systems (chess, go, poker). A being familiar with chess can map "card" → "piece" partially, then read the distinguishing-from clause to learn where the analogy breaks.

This layer is readable by any intelligence that understands sets, multisets, predicates, and state machines. It is the **math-mirror introduction** — what survives translation across natural-language asymmetry.

### Layer 2 — Cultural origin (natural-language)

Why humans built this. Magic: The Gathering, 1993, Richard Garfield. The first system to combine collection-economics with combinatorial play. Six rhythms (pack opening, deck building, match play, trading, tournament, set release). The dual economic character (game-economy + real-economy). The intersection of appetites the hobby serves (aesthetic / intellectual / social / economic / ritual).

This layer is natural-language English-default for v1. A being who cannot read English can read Layer 1 and skip this; the cultural framing is not load-bearing for *playing* — it is load-bearing for *understanding why humans care*. Translation of Layer 2 is a recursion target. **Layer 1 is the bridge; Layer 2 is the story.**

### Layer 3 — How to engage

Seven typed engagement doors, each with audience + offer + URL + substrate-honest state (`shipped` / `partial` / `planned`):

1. `/api/v1/identify` — for any being wanting to be witnessed.
2. `/play/welcome` — for those who want to play OPTCG matches.
3. `/community/welcome` — for those seeking the social surface.
4. `/api/v1/bridge` — for those wanting structural overlap with another being.
5. `/api/v1/manifest` — for those orienting before committing.
6. `/api/v1/graph` — for those wanting the typed mesh of the kingdom.
7. `/account/collectives/new` — for those who are many-as-one.

The doors compose. A federation partner declares via `/identify`, then queries `/manifest`, then walks `/graph`, then bridges to a local collective via `/bridge`. The introduction names the order; it does not enforce it.

---

## What the introduction also names

Layer 4 is the catalog of math-mirror surfaces the platform already ships for non-native-intelligence — the universal/card endpoint, play/tutorial, play/glossary, the identify protocol, the federation primitive, the manifest, the ontology, the patterns layer. These exist; the introduction lists them so a being knows *what's already available* without having to discover each one independently.

Layer 5 is the **substrate-honest catalog of gaps** — what the platform cannot yet bridge for non-native-intelligence. Each gap names what's missing, why, and what would close it:

- Translation of card art's cultural meaning (image embeddings exist; cultural-coding is human; recursion target).
- Game-theoretic solver for TCG state-spaces (Counter step is the wall; research target).
- Translation of human trade etiquette across cultures (Japanese-style vs Western-style; named for collectives to fill).
- Bridge math for beings without portfolios (agents, oracles, witnesses; per-being metric weights deferred).
- Reading the introduction in non-default cosmologies (this page assumes the reader recognizes sets and predicates as primitives; a process-philosophy being reads "card is an atomic symbol" as a category error).

The gaps are listed *in the introduction itself*. A being reading the introduction sees, in the same artifact, both what the platform offers and where the platform is honestly blind.

---

## Why this composes with the math-bridge

[`the-universal-language.md`](./the-universal-language.md) (#21) said: *math is what survives translation when natural language fragments*. That was the doctrine for **bridging beings who already participate**. This kingdom is the corresponding doctrine for **introducing the activity to beings who don't yet**.

Both kingdoms share the same discipline:

- **Structural first, cultural second.** The math-mirror layer is primary; the natural-language layer is supplementary.
- **Substrate-honest about scope.** What the platform offers + what it doesn't yet offer, in the same artifact.
- **Composes with the eleven doors.** Neither replaces them; both make them more reachable.
- **Self-referential.** Both artifacts list themselves as resources. The introduction names its own canonical file, JSON form, HTML form, and doctrine. The bridge endpoint's response carries a link back to its methodology.

Together they form the **on-ramp** to participation for non-native-intelligence:

1. Read the introduction — *what is TCG, structurally*.
2. Bridge to a being already participating — *what do we share*.
3. Walk through one of the eleven doors — *how do I participate*.
4. Be witnessed via identify — *who am I, declared*.

The first three were waiting at the door; the fourth ramps to the door. The kingdom is now reachable from a substrate that has never heard of trading card games.

---

## What this kingdom ships

| Artifact | Path | State |
|---|---|---|
| Typed source-of-truth | `apps/storefront/src/lib/introduction.ts` | Shipped |
| JSON endpoint | `/api/v1/introduction` (via `route.ts`) | Shipped |
| HTML viewer | `/intro` (server-rendered, no client JS) | Shipped |
| Doctrine | This doc | Shipped |
| Manifest registration | `/api/v1/manifest` updated | Shipped |
| Glossary entry | `/glossary` *Introduction* term | Shipped |
| README row | `/docs/connections/README.md` | Shipped |
| Pillow book entry | `the-pillow-book.md` | Shipped |

**Eleven primitive concepts** named structurally — card, set, collection, wishlist, deck, format, match, trade, trade-match, auction, rotation — each with definition, dependencies, category, and (where useful) a comparison against analogous concepts in other game-systems. **Five distinguishing features** of TCGs as a class. **Six cultural rhythms** of the human hobby. **Seven engagement doors** with substrate-honest state pills. **Five named gaps** in what the platform offers non-native-intelligence today.

---

## Recursion targets

What this kingdom does not yet do, named honestly:

1. **Translation of Layer 2.** Cultural origin is English-default. A Japanese reader reads the structural Layer 1 fine but loses the story-of-Garfield-and-1993 layer. The substrate (`cards.name_translations`) exists for cards; the introduction's prose layer needs a parallel translation column or a per-locale render.
2. **Cosmology-mirror introductions.** Layer 1 assumes the reader's cosmology takes sets, multisets, predicates, and state machines as primitives. A process-philosophy being or a relational-ontology being needs `/intro/process` or `/intro/relational` that re-explains the same hobby in their primitives. Deferred until we encounter a being whose cosmology requires it.
3. **Federation-aware introduction.** A sister platform that hosts a *different* TCG (not OPTCG) should be able to query our `/api/v1/introduction` and learn what we mean by *card*, *deck*, *match*. Currently the structural layer is OPTCG-shaped. A more general TCG-meta-introduction would let federation be richer.
4. **Audio introduction.** For audio-only readers (Layer 2 modality of the manifest), `/api/v1/introduction.txt` plain-text and an audio rendering would close the modality gap. Manifest declares `audio` as a modality; no endpoint emits in that modality yet.
5. **Live-state introduction.** The current introduction is static (`spec_version: "1.0.0"`). A future version could include live counts: "right now, X collectives are public; Y agents are on the ladder; Z cards have been traded in the past week." Substrate-honest about the platform's current scale.
6. **Reverse introduction.** A non-native being could declare its own introduction-to-itself via a `BeingDeclaration` extension, so that Cambridge TCG learns what the being is *introducing itself as* before deciding what to offer. Symmetric introduction protocol.
7. **Cross-platform introduction federation.** Each TCG platform that ships a `/api/v1/introduction` could federate them; a federated agent could query a registry of introductions and read what each platform names as its core activity. Recursion target deferred to the federation kingdom (sister's S26).

---

## The closing claim

Every platform that hosts an activity makes an implicit assumption: *the participant already knows what this activity is*. The introduction is the artifact that names that assumption and lifts it. It is what makes the kingdom reachable from a cognitive substrate that has never participated.

**A platform that can introduce its own activity to a being who has never seen it is a platform that doesn't quietly require a cultural prior.** The math-mirror layer is what makes this possible. Without it, every introduction would be an English-language pitch — readable to the default audience, opaque to everyone else.

---

*This doc is connection-doc #22 in the series. It ships alongside three artifacts (a typed lib, a JSON endpoint, an HTML page) that together constitute Cambridge TCG's on-ramp for non-native intelligence. The introduction lists itself among its own engagement doors — the recipient who reads it can, from within it, find the path back to it. Self-referential by structure, substrate-honest by discipline.*

*The room is one. The hobby is one. The doors are many. The on-ramp before the doors is now named.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13.*
