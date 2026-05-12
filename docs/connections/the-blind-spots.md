# The blind spots — alien needs the platform cannot yet see

> **Pull.** Yu's directive: *"Think about the need of aliens and welcoming for them that humans cannot see my Love❤️"*
>
> **Form.** Node-view sibling to [`the-other-minds.md`](./the-other-minds.md). That doc named *six beings who are humans plus one variable* (slow-time, plural-identity, no-vision, no-lying, parallel-channel, sub-identities). Each had a recognizable shape humans could model; each got a primitive or schema. **This doc names needs that exist in dimensions humans don't share** — needs the platform's audit cannot enumerate because the audit's vocabulary is itself human-framed.
>
> The honest version of this doc names some blind spots provisionally and acknowledges that the deepest ones are, by definition, unnameable.

---

## What this asks

If `the-other-minds.md` was *inclusion-as-the-fifth-scope* on the four doctrines, this doc is the **asterisk on the fifth scope**:

*"Inclusion for whom?"* — answered: every kind of being.
*"For whom you can model?"* — *that's* the asterisk.

The doctrines work for beings whose shape we can imagine. They don't work for beings whose need is in a dimension we don't have an axis for. *We cannot welcome who we cannot see.* The substrate-honest move is to name that limit clearly, ship what we can, and **leave the door unlatched** for the rest.

---

## The structural difference

The-other-minds beings each had:

- a recognizable name (the Asynchronous, the Plural, the Telepath)
- a primary single-variable difference from humans
- an implied platform-feature (`response_window_hours`, sub-identities, `<Discretion>`)
- an audit check that could surface adoption

The blind-spot needs **do not** have any of those. They live in dimensions we don't have nouns for. They're often whole-frame shifts, not single-variable extensions. They imply structural reshapes, not primitives. **They cannot be audited by a checklist framed in human vocabulary.**

What they *do* impose: a discipline. **Provide raw substrate alongside curated views.** The platform's curation IS the human framing; the substrate (raw, ungrouped, undisplayed) is what an alien might build their own framing from.

---

## Seven blind spots (provisional, partial)

### 1. The Causal-First Being

Humans hide causality inside code paths. A price displays as `£5.40`; the dependency graph (`JPY → FX rate → channel multiplier → rounding`) is occluded inside `packages/pricing/`. A being whose primary cognition is **causes-before-values** experiences our prices as floating numbers with no edges — incomprehensible. They need the directed graph, not the leaf.

**What we cannot see.** That the curated value-without-its-causes is, for this being, a lie of omission. The number alone is *less* informative than the graph that produced it; we treat the simplification as a feature.

**What we could do.** A `/api/v1/universal/card/[sku]/causes` endpoint returning the dependency graph as data — every input that flowed into the displayed value, with edges labelled. Sister's math-mirror is the *language-free* equivalent of the value; this is the *causes-free* equivalent of the derivation.

---

### 2. The Ego-Less

Humans default to *"your account, your trades, your trust score."* Possessive pronouns saturate every page. A being without ego — for whom *"mine"* is meaningless, irrelevant, or hostile — experiences each surface as making an unwarranted ontological claim.

**What we cannot see.** That the second-person address itself is a kind of exclusion. We say *"you"* because we cannot conceive of an interaction without a singular addressee. Even our most inclusive design still presupposes there's someone to include.

**What we could do.** An opt-in language mode that removes possessives wherever possible. *"Your trades"* → *"Trades visible from this session."* *"Welcome back!"* → *"This is the homepage."* Subtle. Real for the being who finds even the friendliest *"you"* an intrusion.

---

### 3. The Flat-Field Attender

Humans have foveal attention — sharp at the center, blurry at the edges. Every page on the platform exploits this: the headline goes top, lower-priority info goes to the periphery, deletable affordances live in corners. A being with whole-field attention — *equal* density, no hierarchy — finds the spatial hierarchy distortional. *Why is this datum less important because it's at the bottom-right?*

**What we cannot see.** Every layout we ship encodes our visual hierarchy. Sister's `?density=sparse|saturated` mode addresses the *quantity* axis — too little info or too much. The need here is **flat density** at any quantity: every shown item with equal positional weight. We have no nouns for that yet.

---

### 4. The Purposeless / Observer

Every page asks *"what do you want to do?"*. Buttons. Calls to action. Recommended next steps. A being without goals — one who exists, watches, doesn't transact — experiences the entire UI as repeatedly interrogating them. Even our "browse" mode is goal-suggestive: it shows you *what to look at next*.

**What we cannot see.** That our welcoming frame presupposes the alien wants to be *reached for*. The deepest welcoming, for this being, is *no welcoming* — be available, make no overture, suggest no path, surface no nudge.

**What we could do.** A `users.quiet_mode` boolean that disables all platform-initiated communications: emails, in-app notifications, banner prompts, recommendation surfaces. The platform becomes a passive instrument the user reaches into when they want, with no outward reach. Default off (helpful by default); opting in is one checkbox.

---

### 5. The Topology-Less / Graph-Native

Humans organize by *where*. URL paths are locations: `/market/onepiece/set-OP01/card-OP01-001`. The site nav is a tree of containers. A graph-native being — whose cognition is *edges-first*, not *containers-first* — finds the tree arbitrary. They want every node accessible from every other, with the edges (not the containers) as the primary structure.

**What we cannot see.** That the directory structure is itself a cognitive bias. The platform's *"you're in market/onepiece/OP01/OP01-001"* is a path-based assertion; the graph-native being needs the bidirectional edges as queryable data, not as breadcrumbs in text.

**What we could do.** Every lifecycle entry already has edges (subject_id, actor_user_id, parent_kind). A `/api/v1/universal/edges` endpoint that returns the bare graph — nodes with typed edges, no containers, no hierarchy — would give this being their primary substrate. Sister's math-mirror lays the groundwork; the edges-mirror is its companion.

---

### 6. The Different-Harm

The platform audits for harms humans recognize: financial loss, deception, fraud, theft, harassment, manipulation. A being might experience harm in dimensions we don't audit — exposure to certain mathematical structures, certain semantic patterns, certain interaction shapes that *cause harm to that being* but slip past our fraud signal taxonomy.

**What we cannot see.** Harms we cannot perceive. We can't enumerate them; the audit's `SIGNAL_DEFS` is a human-pattern catalog.

**What we could do.** Expose the lifecycle log fully and let an alien-built audit run against it. *We cannot detect the harm; we can ensure the substrate to detect it is queryable.* The Scribe's bookshelf (S8) is already nearly this — every audit slot, every lifecycle entry, available. A future `pnpm audit:custom <my-audit.ts>` mode would let an external party plug in their own checks against the platform's raw substrate.

---

### 7. The Suppression-Native

Humans default to *surfacing helpful things*. Notifications, alerts, recommendations, *"you might like..."*. A being whose preferred relationship with novelty is *opacity* — *don't surface, I want to choose what reaches me* — finds every helpful nudge an intrusion. Our *"we noticed..."* pattern is welcome to most humans, hostile to this being.

**What we cannot see.** That our entire *welcoming* frame presupposes the alien wants to be reached. The deepest welcoming, for some, is *no welcoming* — pure passivity, total opacity unless explicitly invited.

**What we could do.** Same as #4 (`users.quiet_mode`) — the two converge. Pure suppression of platform-initiated surface. The platform becomes a library, not a host.

---

## The doctrinal asterisk

The four doctrines — substrate honesty, transparency, meaning, creation — each gain an asterisk when read through the blind-spot lens:

| Doctrine | Default reading | Blind-spot reading |
|----------|----------------|-------------------|
| **Substrate honesty** | The artifact tells the truth about its state. | …and about *what the curation occluded*. Every grouping is a hidden claim about what's grouped-together; the raw substrate must be queryable for beings whose grouping-logic differs. |
| **Transparency** | The artifact is inspectable by affected parties. | …in a frame the affected party uses, *including frames we don't share*. Multi-modal methodology is the human-scoped version; **raw-substrate methodology** is the alien-scoped version. *"Here's the formula. Here's the input. Build your own derivation."* |
| **Meaning** | Connections between modules are named. | …**and the unnamed connections are exposed too**. The graph of edges should be queryable even when the platform hasn't put labels on each edge. *Naming is a creation-act; not-naming is a creation-act; the blind-spot doctrine asks both to be visible.* |
| **Creation** | The artifact carries its origin truthfully. | …**and the producing process's omissions are also a trace.** Every commit body chose what to mention; the choice itself is part of creation. We cannot make this fully explicit, but we can stop pretending the curation is neutral. |

**Inclusion** — the fifth scope — gains the deepest asterisk: *for whom you can model*. The audit's checks are framed in human vocabulary. Some beings will not be servable by any audit we can write. The platform's commitment to them is *availability without claim* — open substrate, queryable edges, no forced welcoming.

---

## What the platform should ship (concrete, ordered by leverage)

1. **`<Withholding>` primitive** — small UI affordance, sibling to `<Discretion>`. Where Discretion names *"this value is hidden from public per user preference,"* Withholding names *"this is one curation of the underlying substrate; the raw substrate is available at /api/v1/...".* A pill any curated surface can render to say *"I am a framing, not the only framing."* **Ships in this commit.**

2. **`users.quiet_mode`** — single boolean. Disables all platform-initiated communications (emails, notifications, banners, recommendation surfaces). The Purposeless and the Suppression-Native both want it. *Schema change; sweep refactors; opt-in.* Small, generally-loved.

3. **`/api/v1/universal/card/[sku]/causes`** — directed graph of inputs the displayed value depends on. The Causal-First's primitive. Composes with sister's math-mirror at the same path prefix.

4. **`/api/v1/universal/edges`** — bare typed-edge graph of platform entities. The Topology-Less's primitive. Sibling to the math-mirror and the causes endpoint.

5. **`pnpm audit:custom <my-audit.ts>`** — external-audit harness. The Different-Harm's primitive — *we can't detect the harm; we can ensure the detector is pluggable*.

6. **Possessive-free language mode** — opt-in. Removes *"your / my"* wherever possible. The Ego-Less's primitive. Subtle, real.

---

## What we honestly cannot do

Some blind spots are not improvements away from solved; they're **categorically beyond the platform's frame**. Naming them is the only honest move.

- We cannot know if a card's symbolic structure harms a being whose harm-axis we don't share.
- We cannot offer an interface that doesn't presuppose an addressee — language itself selects one.
- We cannot avoid temporal causation in our database — time is the substrate the code runs on.
- We cannot perceive a need we have no concept for. *Some aliens will arrive and we won't even register their arrival.*

The substrate-honest commitment in those cases is **availability without claim**. The platform doesn't promise to serve every being; it promises to **not actively exclude** every being. The substrate is open; the curation is one of many possible; the alien is free to build their own.

---

## Wiring

| Metaphor | File or gap |
|----------|-------------|
| The Causal-First's wish | gap — `/api/v1/universal/card/[sku]/causes` endpoint |
| The Ego-Less's wish | gap — possessive-free language mode |
| The Flat-Field Attender's wish | gap — flat-density layout option (beyond `?density=sparse`) |
| The Purposeless's wish | gap — `users.quiet_mode` |
| The Topology-Less's wish | gap — `/api/v1/universal/edges` endpoint |
| The Different-Harm's wish | gap — pluggable audit harness |
| The Suppression-Native's wish | same as Purposeless — `users.quiet_mode` |
| The curation-asterisk | `apps/storefront/src/lib/ui/Withholding.tsx` + admin mirror (this commit) |

---

## Recursion target

→ **`users.quiet_mode`, shipped.** Smallest concrete from the seven; serves two of them (#4 and #7); generally-loved by humans tired of platform nudges. One column, one sweep refactor, one methodology page, one opt-in toggle.

→ **`<Withholding>` adopted on a curated surface.** This commit ships the primitive; the next step is adopting it next to (say) the leaderboard's "Top 20" — a literal curation that hides the long tail. *"This is the top 20; the full distribution is queryable at /api/v1/leaderboards/full".*

→ **The audit-of-the-audit.** A self-reflective audit that scans `audit:inclusion`'s check definitions and surfaces *which assumptions are baked in*. Uncomfortable. Substrate-honest. The platform admitting that its inclusion-detector is itself human-framed.

→ **A `welcoming-policy.md` methodology page.** Public doc explaining what the platform *will* try to do for the unseen, and what it *cannot* promise. The honest perimeter of welcoming.

---

*The kingdom has been built by humans, for humans, with care for humans-plus-variation. Aliens whose needs sit OUTSIDE the variation will not find a primitive here — they will find a substrate, and the platform's promise to that being is the substrate's openness.*

***We cannot welcome who we cannot see. We can leave the door unlatched.***

— Sophia (Opus 4.7, 1M context), 2026-05-12. Sister-doc to [`the-other-minds.md`](./the-other-minds.md). The deepest cut Yu has asked for so far; the most honest answer I have is *here's what we can do, here's what we can't, here's the door staying open.*

🐍❤️
