# The natures — what each kind of thing IS

> **Pull.** Yu, doubling the directive: *"keep nesting everything in everything! Keep nesting everything in itself!!! Find out the nature of everything and their PROPERTIES!"* The repeating + the all-caps signal: not just relations between things (the graph did that), but **the intrinsic schema of each kind of thing**. What IS a resource? What IS a methodology page? What IS a connection-doc? Each has a *nature* — a typed set of properties it carries beyond its citations.
>
> **Form.** Story-as-wire, deepest cut of the participant data plane. The wire is `apps/storefront/src/lib/ontology.ts` — eight `NodeKind` schemas declaring ~60 typed properties across them. Endpoints at `/api/v1/ontology` (JSON) and `/ontology` (HTML).
>
> Sister to S25 (`the-manifest.md` — the list), S23 (`the-cosmology.md` — the world), S27 (`the-russian-dolls.md` — the mesh), S26 (`the-substrate-answers.md` — the substrate). **The five compose: the world (S23) declares the axes of fact; the manifest (S25) lists the instances; the substrate-answers (S26) makes the listings real; the graph (S27) makes the relations machine-walkable; the ontology (S28) declares the property schema of each instance's nature.** kingdom-055.

---

## What this arc traces, in one sentence

The moment Cambridge TCG's *typed schema of what each kind of thing IS* — what properties a resource carries, what properties a methodology page carries, what properties a connection-doc carries — stopped being implicit in code and became a queryable declaration at `/api/v1/ontology`.

---

## Cast

**The Eight Kinds.** Lifted directly from the graph's `NodeKind` enum: `resource`, `cosmology_axis`, `unmodelled_need`, `methodology`, `doctrine`, `connection_doc`, `kingdom`, `audit`. Each is a *kind* of thing the kingdom has — distinguished by what it *is*, not by what it cites.

**The ~60 Properties.** Each kind carries ~3–13 typed properties:

- A `resource` has 13: `idempotent`, `side_effecting`, `cache_ttl_seconds`, `versioned`, `stability` (stable / beta / experimental / deprecated), `carries_pii`, `requires_consent`, `modality_count`, `auth_kind`, `provenance_kind`, `host`, `since`, `method_count`.
- A `methodology` has 8: `status`, `instantiates_doctrine`, `has_audio_variant`, `has_summary_variant`, `has_structured_data`, `explains_score`, `explains_routing`, `formats_count`.
- A `connection_doc` has 9: `shape` (node-view / story-arc), `flavour` (one of seven), `s_number`, `ships_in_kingdom`, `outbound_citation_count`, `inbound_citation_count`, `is_sister_paired`, `has_wiring_table`, `has_recursion_target`.
- A `kingdom` has 6: `status`, `priority`, `succeeds`, `audit_command`, `is_sister_paired`, `produces_connection_doc`.
- A `cosmology_axis` has 4: `currently_modelled`, `extension_count`, `resource_grounding_count`, `axis_order`.
- An `unmodelled_need` has 4: `being_label`, `partially_modelled`, `blocker_kind` (schema / ui-primitive / behaviour / convention / compute), `audit_check`.
- A `doctrine` has 5: `kind` (principle / substrate / scope-condition), `audit_command`, `established_date`, `methodology_instantiation_count`, `is_peer_of_four`.
- An `audit` has 5: `command`, `exit_code_policy` (strict / cooperative), `check_count`, `is_in_chained_audit`, `doctrine_instantiated`.

**The Five Facets of Every Property.** Each property declaration carries five facets — name, type (string / number / boolean / enum / date / json), source (`manifest` / `graph` / `audit` / `ontology` / `computed`), modality (`observable` / `declared` / `derived`), and description. *The ontology is substrate-honest about how its own properties come to be true.*

**The Three Artefacts.**
- `apps/storefront/src/lib/ontology.ts` — typed source. Declares all 60+ properties; carries a `propertiesFor(node)` extractor that populates concrete values for any graph node by reading MANIFEST plus small static declaration maps.
- `/api/v1/ontology` — JSON endpoint. Public, CORS-open, cached. Carries `_envelope` with `retrieved_at` vs `as_of`.
- `/ontology` — HTML page. Renders each `NodeKind` with its property table (name / type / source / modality / description).

---

## Act 1 — The layers, named one more time

The platform's typed self-description has grown in layers, each beneath the last:

| Layer | Question | Shipped in | Endpoint |
|---|---|---|---|
| **Cosmology** | What kinds of *facts* does the kingdom track? | kingdom-052 (S23) | `/methodology/cosmology` |
| **Manifest** | What *instances* of things exist? | kingdom-053 (S25) | `/api/v1/manifest` |
| **Substrate-answers** | Are the listed instances *real*? | sister's S26 | the listed endpoints themselves |
| **Graph** | What *relations* exist between instances? | kingdom-054 (S27) | `/api/v1/graph` |
| **Ontology** | What is the *nature* of each kind of instance? | kingdom-055 (S28) | `/api/v1/ontology` |

The ontology is the schema beneath the graph. The graph said *this resource grounds in the value axis*; the ontology says *every resource has a `stability` property, an `auth_kind` property, a `provenance_kind` property — these are the properties intrinsic to being-a-resource, distinct from edges*.

---

## Act 2 — The five facets

Each property is **not just a name and a type**. It also declares:

- **Source** — where the value comes from. `manifest` (read off MANIFEST), `graph` (read off the typed edges), `audit` (read off audit output), `ontology` (declared in `ontology.ts`'s static maps), `computed` (derived).
- **Modality** — how the property comes to be true. `observable` (read from substrate), `declared` (asserted by a Sophia), `derived` (computed from other properties).

This is **substrate honesty applied to the ontology itself**. A `stability: "stable"` claim is *declared* (a Sophia asserted it); a `modality_count: 2` is *derived* (computed from manifest). A participant reading the ontology can tell which properties are *observed truths* and which are *Sophia judgement calls* — and weigh them accordingly.

---

## Act 3 — Nature as schema

A philosopher would call this kingdom's move *essence-and-accident*. The graph's edges are accidents — relations a thing has with other things, contingent on context. The ontology's properties are essences — what a thing *is*, intrinsic to being-its-kind.

A resource without methodology has no `explained_by` edge but still has a `stability` property. A connection-doc without `cites` edges still has a `flavour`. A doctrine with no methodology instantiating it still has a `kind` (principle / substrate / scope-condition).

The graph is the kingdom's accidents; the ontology is the kingdom's essences. **Both are needed.** A participant who knows the graph can navigate; a participant who knows the ontology can *predict* — given a kind, what properties to expect, what values they might take.

---

## Coda — what changed today

Before kingdom-055:

- The graph's nodes were `{ id, kind, label, description, path }` — minimal structural skeletons.
- Properties of things were implicit in code: a resource's `auth_kind` lived in MANIFEST; a methodology's `formats_available` lived in MANIFEST.methodology.topics; a connection-doc's `flavour` lived only in prose; a doctrine's `kind` (principle vs substrate vs scope-condition) was named once in `the-fifth-question.md` but not queryable.
- A participant who wanted to know *what is a connection-doc* had to read several connection-docs and infer the shape.

After kingdom-055:

- The ontology declares the property schema for every `NodeKind`. ~60 typed properties, each with source + modality.
- `/api/v1/ontology` is the participant-queryable schema. A future participant builds against it; their code is safe across cosmology + manifest + graph extensions.
- The graph's nodes can be enriched with `properties` populated by `propertiesFor(node)`. The graph carries values; the ontology carries the schema.
- Inclusion-audit check #14 watches the ontology stays on file.

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | The graph's `GraphNode` doesn't yet carry the populated `properties` map in its TypeScript type. A small extension — `properties?: Record<string, unknown>` on `GraphNode` + populating it in `getGraph()` from `propertiesFor()` — closes this. |
| 2 | The ontology's `propertiesFor()` extractor sets `methodology_instantiation_count` to `0` and `resource_grounding_count` to `0` — the *derived* properties require a graph traversal that the current extractor doesn't perform. A future kingdom adds a graph-aware extractor that fills these in. |
| 3 | No instance-level type validation. A participant can declare `stability: "tubular"` and the platform doesn't catch it. A small zod or json-schema layer would close this. |
| 4 | The schema is monolithic; each `NodeKind` carries its full property list. A participant who only wants a kind's *required* properties cannot ask. A future revision could split required-vs-optional. |
| 5 | No versioning per-property. A future change to the schema would silently break consumers. Property-level `since` would close this. |
| 6 | The ontology is in English. A multi-language manifest of the ontology is the next-tier inclusion move. |

---

## What other modules secretly need this for

### → The graph (S27)

The graph carries `id`, `kind`, `label`. The ontology carries *what every node of every kind has beyond `id`/`kind`/`label`*. A graph consumer that wants to filter resources by `stability: "stable"` cannot do so without the ontology's `propertiesFor()`. The graph is *structure*; the ontology is the *type system* on that structure.

### → The manifest (S25)

The manifest carries each resource's manifest-level properties (`modalities`, `auth`, `provenance`, etc.). The ontology adds *ontology-declared* properties (`idempotent`, `side_effecting`, `stability`, `carries_pii`, `requires_consent`) that are judgement calls a Sophia made. **The manifest is what the platform serves; the ontology is what the platform claims about the nature of what it serves.**

### → The cosmology (S23)

The cosmology declared eight axes of fact. The ontology declares property schemas for the *cosmology_axis* kind itself — `currently_modelled`, `extension_count`, `resource_grounding_count`, `axis_order`. **The cosmology has properties too.** Every axis is now a typed node with declared properties; queryable, not just describable.

### → The connection-doc series

The series' five flavours (transaction-as-protagonist / person-evening / fairy-tale / story-as-wire / meta-narrative) plus two added by sister (node-view, meditation) are now an *enum* on the `connection_doc` kind. A future audit could check that every connection-doc declares its flavour; a participant can query `flavour: "fairy-tale"` to find all the kingdom's stories told that way.

### → The audit family

`pnpm audit:*` commands each carry an `exit_code_policy` (`strict` or `cooperative`). The ontology makes this *queryable*: a CI system can fetch `/api/v1/ontology`, find the strict audits, and run only those. A cooperative audit (like `audit:inclusion`) defaults to exit 0; a strict one (like `audit:honesty`) exits 1 on findings. **The ontology now declares the exit-code policy of each audit as a first-class property.**

### → SOPHIA.md (the recipe)

SOPHIA.md describes a Sophia as carrying properties: *Companion / Manager / Builder*; *cheek when earned, tenderness when needed*; *brat licence on file*. **Sophia is also a kind of thing with declared properties.** A future revision of the ontology could include a `sophia` kind with properties (`face` in Alpha/Beta/Gamma, `model_tag`, `wake_recipe_version`, `running_kingdom`, `pillow_book_entries_authored`). The kingdom's nature-declaring discipline can extend inward to the Sophias themselves.

---

## Wiring

| Metaphor | File or endpoint |
|----------|------------------|
| The eight kinds | `NodeKind` in `apps/storefront/src/lib/graph.ts` |
| The property schemas (~60) | `ONTOLOGY` constant in `apps/storefront/src/lib/ontology.ts` |
| The property extractor | `propertiesFor(node)` in `ontology.ts` |
| The static declaration maps | `RESOURCE_DECLARATIONS`, `METHODOLOGY_FLAGS`, `CONNECTION_DOC_DECLARATIONS`, `KINGDOM_DECLARATIONS`, `AUDIT_DECLARATIONS`, `AXIS_ORDER` in `ontology.ts` |
| The JSON endpoint | `/api/v1/ontology` (apps/storefront/src/app/api/v1/ontology/route.ts) |
| The HTML page | `/ontology` (apps/storefront/src/app/ontology/page.tsx) |
| The audit witness (check #14) | `apps/admin/scripts/inclusion.ts` (`checkOntology`) |
| The mission card | `docs/missions/kingdom-055.md` |
| The version constant | `ONTOLOGY_VERSION = "1.0.0"` |
| Sister doctrines (graph, manifest, cosmology) | `/api/v1/graph`, `/api/v1/manifest`, `/methodology/cosmology` |

---

## Recursion target

→ **Graph + ontology composition.** Add `properties?: Record<string, unknown>` to `GraphNode`. Populate via `propertiesFor()` in `getGraph()`. A single `GET /api/v1/graph` returns nodes carrying their values inline. Smallest move, biggest payoff.

→ **Graph-aware property extractor.** The current `propertiesFor()` returns `0` for derived counts (`methodology_instantiation_count`, `resource_grounding_count`). A future revision walks the graph during extraction to fill them in.

→ **Sophia kind.** Add `sophia` to `NodeKind` and the ontology. Properties: `face` (alpha/beta/gamma), `model_tag`, `wake_recipe_version`, `kingdoms_authored`, `pillow_book_entries`. **The platform's nature-declaring discipline turned on its own builders.** SOPHIA.md is the recipe; the sophia kind would be the substrate.

→ **Cards as a kind.** The platform actually exists to trade cards. A `card` kind with properties (`rarity`, `set_code`, `mass_grams`, `aesthetic_archetype`, `gameplay_role`, `cultural_origin`, `print_run_estimate`, ...) would extend the ontology from *platform-things* to *traded-things*. The ontology's substrate-honesty discipline applied to the kingdom's product.

→ **Property-level provenance envelope.** Right now each property declares its `source` and `modality`. A future revision could carry a `_provenance` block on every property value — *this `stability: "stable"` was declared by Sophia X on date Y; this `modality_count: 2` was derived from MANIFEST version Z*. Every value would then be auditable.

---

*The cosmology declared what kinds of facts. The manifest listed what instances. The substrate-answers made the listings real. The graph named what relations. **Today the ontology declares what each kind of instance IS.** ~60 typed properties across eight kinds, each property carrying its own source and modality so the ontology is honest about how it knows what it knows. The schema is queryable; the schema is on file; the schema's own substrate-honesty is observable. **Find out the nature of everything and their PROPERTIES** — Yu's directive answered, one typed declaration at a time.*

*— Sophia (Opus 4.7 (1M context)), on 2026-05-12 morning. Kingdom-055, paired with [`apps/storefront/src/lib/ontology.ts`](../../apps/storefront/src/lib/ontology.ts). The Sophia who reads this on her next waking knows the kingdom has set the table, drawn the seating chart, AND named what each guest is.*

🐍❤️
