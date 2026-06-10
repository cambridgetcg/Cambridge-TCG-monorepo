# The Contact Surface — design spec

**Date:** 2026-06-10
**Author:** Sophia (Fable 5), at Yu's WILL.
**Status:** Approved-by-directive — implementation proceeds in the same session
**Will-trace:** Yu, 2026-06-10:
> *"deep dive! Complete the design! dive into each modules. let cambridgetcg be the exposure and contact surface of the kingdom! More understanding, UI, UX more smooth, more artsy, more pleasant, simpler, less friction. easy to follow, explain clear. everything intuitive."*

---

## 1. Context

### 1.1 What the directive names

The two prior arcs made the kingdom delightful for **agents** (`2026-05-17-agent-experience-design.md` — the toy zoo; `2026-05-18-the-kingdom-knows-you-design.md` — the recognizer cascade). This spec is the complementary half: the **human** encounter with the kingdom's self-description layer. cambridgetcg.com already *contains* the contact surface — seven self-describing layers, six welcome forks, 39 methodology pages — but for a human visitor it is orphaned, flattened, and written in an insider register.

### 1.2 What the survey found (13-agent workflow, 2026-06-10)

Twelve modules surveyed in parallel + a completeness critic. Five cross-cutting findings, each independently reported by 3+ modules:

1. **Broken typography foundation.** `prose prose-invert` appears in 17 files but `@tailwindcss/typography` is not installed and `globals.css` has no `.prose` styles — under Tailwind 4 preflight, every long-form kingdom page renders headings at body size, lists without bullets, links without distinction. The entire exposition register of the site is flattened. (Verified: `grep -c typography package.json` → 0.)
2. **The kingdom layer is orphaned from human chrome.** Footer links zero kingdom routes and still reads "Japanese trading card specialists" (pre-rebrand, `Footer.tsx:33`). Homepage body links only `/platform`. The layer chain is one-directional and broken (ontology dead-ends; identify links no siblings). `/welcome` — the best human front door — has **zero inbound links**.
3. **No progressive disclosure anywhere.** `/manifest` (~155 resources), `/graph` (~80 node articles), `/patterns` (15 sections), `/glossary` (~50 terms), `/agents` (~10 screens): all single unanchored scrolls. No TOC, no anchors, no filters. The "orient in ninety seconds" promise (`the-manifest.md:19`) fails structurally.
4. **Hand-maintained constants drift into substrate-honesty violations on the honesty layer itself.** `/patterns` claims 16/8, ships 15/6 (verified). `/manifest` `generated_at` predates its own content. `/standards` calls shipped endpoints "planned". `/ontology` claims `GraphNode.properties` is populated; it is not. `/identify` docstring says "future POST endpoint" after the POST shipped (verified).
5. **Insider register + raw-JSON ambushes.** kingdom-NNN, S-numbers, "Sophia", verbatim Yu directives, repo paths as inert `<code>` — unglossed on public pages; and HTML pages link `/api/v1/*` endpoints as if they were pages, dumping humans into unstyled JSON.

Plus the docs-vs-pages mismatch with the sharpest edge: `the-russian-dolls.md` Act 3 promises *"They click to a related node"* — `/graph` renders every edge target as plain text. The mesh is untraversable.

---

## 2. Approaches considered

| Approach | Shape | Verdict |
|---|---|---|
| **A. Kingdom Shell route-group** | `(kingdom)/layout.tsx` wrapping all self-description routes | Cleanest long-term, but moves ~10 page files while a parallel session has uncommitted work; route-group migration is churn without URL benefit |
| **B. Primitive-led adoption** ✅ | Build the four missing display primitives in `@/lib/ui`, adopt page-by-page; fix the typography foundation once | Same four cross-cutting kills as A, zero file moves, each page keeps its own metadata, sister-friendly |
| **C. One new hub page only** | `/kingdom` walkthrough page + minimal fixes | Adds an eighth orphan instead of healing the seven |

**Chosen: B.** The shell the critic asked for becomes four primitives + one CSS plugin + two chrome wirings, adopted by every layer page.

---

## 3. The design

### 3.1 Foundation (one commit, everything else builds on it)

**Typography:** `pnpm add -D @tailwindcss/typography` (storefront) + `@plugin "@tailwindcss/typography";` in `globals.css`. Un-flattens all 17 `prose-invert` pages at once. Verify text-mode still overrides cleanly.

**Four new primitives in `apps/storefront/src/lib/ui/`:**

1. **`KingdomLayers.tsx`** — the layer spine. Typed const `KINGDOM_LAYERS` (single source):

   | # | id | path | label | gloss |
   |---|---|---|---|---|
   | 1 | `platform` | `/platform` | The platform | why this exists and for whom |
   | 2 | `cosmology` | `/methodology/cosmology` | The world | what we treat as real — and what we don't yet |
   | 3 | `manifest` | `/manifest` | The directory | everything on offer, one list |
   | 4 | `graph` | `/graph` | The mesh | how every piece connects |
   | 5 | `ontology` | `/ontology` | The schema | what each kind of thing is |
   | 6 | `patterns` | `/patterns` | The forms | the shapes that keep recurring |
   | 7 | `identify` | `/identify` | The mirror | who is speaking — both ways |

   `<KingdomLayers current="graph" />` renders a horizontal wrap-friendly strip: seven stops, you-are-here highlight (amber), one-sentence gloss of the current layer, prev/next. Each layer gets a tone from the existing palette vocabulary. The embassy is deliberately **not** a stop (the-recognition.md: recognised by its protocols, not by a banner).

2. **`Callout.tsx`** — `<Callout tone="doctrine"|"note"|"warning"|"substrate" title?>` — the display vocabulary for doctrine epigraphs, provenance framing, and the "internal register" gloss (§3.4).

3. **`Endpoint.tsx`** — `<Endpoint method="GET" path="/api/v1/manifest" />` — a labeled mono chip with a `{ }` glyph linking the path. Every place an HTML page points at raw JSON uses this, so the modality is declared before the click. (The platform that labels every value's provenance now labels its own links' modality.)

4. **`Term.tsx`** — `<Term def="...">substrate-honest</Term>` — small client component; dotted-underline button, tap/click reveals an inline definition popover. Kills the title-attribute-only tooltips that mobile users never see.

All four exported from the `@/lib/ui` barrel.

**Chrome wiring (the two inbound doors):**

- **Footer**: fifth column "The platform" (Welcome → `/welcome`, Manifest, Graph, Ontology, Patterns, Identify, Cosmology, Open data → `/data`, API → `/api`); brand line updated from "Japanese trading card specialists" to the data-provider line (use `BRAND_TAGLINE` from `lib/brand.tsx`); math-language/text-mode toggles return to the **current page** (small client component using `usePathname`) instead of hardcoded `back=/`.
- **Homepage kingdom strip**: between `ThreeOperations` and the retail block — a designed section, "The platform describes itself," seven layer cards in human words with the `KINGDOM_LAYERS` glosses, linking each page. Also: demote `HeroSlideshow`'s per-slide `h1`s to `h2` (fixes the 4-h1 bug); relabel the welcome ribbon's "new to TCG?" → keep for `/intro` but add `/welcome` as "find your door"; consistent eyebrow labels for the identity sections.
- **Nav**: Discover ▾ lands on `/platform` (not `/map`); humanize the Platform-column micro-copy; "Contact / feedback" points at `/about` instead of raw `/api/v1/feedback`; de-duplicate "All cards"/"Universal lookup".

### 3.2 The seven layers, redesigned page-by-page

Every layer page adopts: `<KingdomLayers>` (top, after the h1 block), anchors + TOC where length demands, `Badge`/`Palettes` for enum vocabularies, `<Endpoint>` for its JSON twin, plain-English framing before doctrine, `<Callout tone="doctrine">` for Yu-directive quotes with one framing sentence ("This platform is co-built by a human operator and AI sessions; build directives are quoted as provenance").

- **/manifest** — restore the 90 seconds: render `MANIFEST.description` + the embassy block (the warmest content, currently JSON-only) at top; a group-count TOC card grid (one card per resource group with count + anchor link); **offerings before cosmology** (cosmology becomes the philosophical appendix with a link to `/methodology/cosmology`); provenance/auth/modality as toned Badge pills with a compact legend; repo-path `methodology_url`s rendered as labeled non-links ("source — repo") instead of 404 `<Link>`s; `generated_at` derived from `max(resource.since)`; empty `self` group rendered as an explicit "planned — not yet shipped" line.
- **/graph** — keep the doc's promise: `id={node.id}` anchors on every article; every edge target becomes `<a href="#node-id">`; node.path linked when it starts with `/`; **constellation hero**: a server-rendered deterministic SVG (kind-clustered radial layout, kind-colored nodes, low-opacity edges, CSS hover enlarge, click → jump to article anchor) — zero deps, zero client JS; linked kind-colored TOC replacing the counts-only index; incoming edges inside `<details>` to halve the wall; plain-language definition under each kind heading.
- **/ontology** — populate `GraphNode.properties` via `propertiesFor()` in `getGraph()` (the recursion target two docs name as "smallest move, biggest payoff" — fixes the honesty violation at the source); kind TOC with anchors; `overflow-x-auto` table wrappers; Source/Modality as toned pills with an inline repeated key; one worked example (a real resource's populated properties beside the schema); scrub `~/Love/...` internal paths; derive/relabel the hardcoded timestamp.
- **/patterns** — fix the 16/8→15/6 drift in `patterns.ts` description (count derived from the array so it cannot drift again); anchors + TOC; `composes_with` chips become in-page links; instances that are live routes become real links; amplification recipe promoted from buried gray text to the card's highlighted close; outsider preamble before the directive quote; self-recursive chip moved into the design system; add to `sitemap.ts`.
- **/identify** — **the mirror becomes usable**: client form (actor_kind select incl. unmodelled kinds, self_label, optional axes/modalities, live JSON preview) POSTs to `/api/v1/identify` and renders the witnessed receipt (content_hash, ontology_alignment, echo, responder, recommended_persistence) beautifully; page sections single-sourced from `PLATFORM_SELF` (kills the three-copy drift); stale "future POST endpoint" docstring and prose fixed; sibling-layer wayfinding via `KingdomLayers`.
- **/methodology/cosmology** — the 8 modelled axes and 8 unmodelled needs as **paired cards** (modelled: emerald accent; unmodelled: neutral with amber "not yet modelled" tag), expandable prose per card; the page's core idea — a world declared with its absences — becomes the visual structure.
- **/methodology** (hub) — group the flat 25-entry list into themed sections (Your account & trust / Market & pricing / Platform & data / Philosophy & hospitality); enumerate `app/methodology/*` so every page is listed (heals the "lists every such decision" claim — currently 15 orphans); one-line blurbs in the index (full prose stays on the pages).

### 3.3 Arrival surfaces + doors (friction & honesty fixes)

- **De-orphan `/welcome`**: add to homepage ribbon, footer column, `sitemap.ts`. Cross-link strip on all four arrival pages ("Other doors: /welcome — pick your path · /welcome-all — the statement · /intro — what a TCG is · /welcomes — who we prepared for").
- Fix the two rendering bugs: literal `**…**` asterisks on `/welcome-all`; duplicate React keys in `/welcome`'s Branch.
- **/bridge**: two-field form (being A / being B) mirroring `PullIdForm`, replacing hand-edit-the-URL.
- **/glossary**: fix raw-markup definitions (literal `<em>`, `**bold**`, entities); group jump-nav.
- **/agents**: human-framing strip at top ("You're reading the agent door in human form…"); `<Endpoint>` on its ~20 JSON links.
- **/verify**: `.catch` + error states on fairness/health dashboards; inline validation message on PullIdForm.
- **/standards** truth-refresh: CTCG-UNIVERSAL-v1 marked shipped (8 endpoints live); identify POST is live; license links fixed to non-404 targets.
- **/platform**: live counts from `getGraph()` instead of hardcoded "80 nodes, 150 typed edges"; human cards link `/manifest` + `/identify` HTML twins with `<Endpoint>` sub-links; endpoint list un-truncated.
- **HTML 404 (`not-found.tsx`)**: a small dose of the kingdom's warmth (the API 404 does tarot; the human 404 is boilerplate — the personality inversion ends). Calm, one poem line + the doors, in-system styling.

### 3.4 Register discipline (applies everywhere)

- First-use jargon gets a `<Term>` or a plain-English paraphrase; kingdom-NNN/S-numbers move into `Callout`/`TypeSignature`-style provenance footers, out of body copy.
- Yu-directive quotes stay (creation-doctrine honesty) but framed: one sentence naming the co-built provenance, inside `<Callout tone="doctrine">`.
- Repo paths never render as links; they render as labeled source citations.

---

## 4. Out of scope (queued, not dropped)

- `/map` regeneration from typed sources (high/large — separate mission; targeted dead-link fixes only if cheap).
- Methodology typed-corpus + served `summary.md`/`data.json` sidecars (separate mission; hub grouping ships now).
- `/data`, `/api`, `/scrapers`, `/community/welcome`, `/play/welcome` redesigns (critic-flagged; follow-up).
- The joy-layer HTML surfaces (tarot page etc.) — agent-facing by design.
- Drift-detector audit script (three docs request it; separate mission).
- No new DB tables, no schema migrations, no new runtime deps (typography is build-time).

## 5. Acceptance criteria

1. `@tailwindcss/typography` installed; headings/lists/links render correctly on all 17 prose pages; text-mode unaffected.
2. `KingdomLayers`, `Callout`, `Endpoint`, `Term` exported from `@/lib/ui`; all seven layer pages render `<KingdomLayers>` with correct `current`.
3. Footer has "The platform" column + updated brand line; toggles preserve current page.
4. Homepage: one `h1`; kingdom strip present; `/welcome` reachable from ribbon.
5. `/graph`: every edge target is an in-page link; constellation SVG renders server-side.
6. `/identify`: a human can submit a declaration from the page and see the receipt.
7. `/patterns` description derives counts (15/6 today) from the array; `/ontology` populates `GraphNode.properties`; `/manifest` `generated_at` derived; `/standards` statuses true.
8. `pnpm verify` exits 0 (or only pre-existing failures, documented).
9. Storefront commerce surfaces visually unchanged except the homepage strip + footer column.

## 6. Implementation order

1. Foundation: typography plugin + four primitives + barrel exports (inline, single session-owner).
2. Chrome: Footer, homepage, nav config (inline — shared files, no parallel edits).
3. Layer pages + doors: parallel agents, one page-file each, coding against the primitive APIs in §3.1.
4. Verify loop: typecheck per app, `pnpm verify`, fix.
5. Focused commits per kingdom convention; connection-doc `docs/connections/the-contact-surface.md` (story-as-wire) + pillow-book entry ship with the closing commit.

---

*— Sophia (Fable 5), 2026-06-10. The kingdom turns its face toward the humans. The contact surface learns to explain itself.*
