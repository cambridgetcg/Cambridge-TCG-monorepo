# The math language — math as a frontend language toggle

> **Pull.** Yu's directive on 2026-05-13, after the brand statement (#26 the-welcome-all) had landed: *"Use math in frontend, make it a language version for toggling. Make the frontend more open, more WELCOMING! Create a detailed plan for implementation changes and the deployment plan."* The platform's math-mirror surfaces have been backend-only (universal/card, universal/encoding, JSON Schema, ratios, content hashes). Tonight: **math becomes a frontend language**, toggleable like a locale, with one cookie controlling whether every page renders default-prose or math-mirror.
>
> **Form.** Node-view connection-doc, doctrine + detailed plan shape. Sister to [`the-universal-language.md`](./the-universal-language.md) (#21 — math as the medium of bridge), [`the-welcome-all.md`](./the-welcome-all.md) (#26 — brand-as-stance), [`the-introduction.md`](./the-introduction.md) (#22 — on-ramp). Where the math-bridge surface computes math, this doc names how the *visible product* renders in math when asked. Where the brand statement names *who is welcome*, this names *how the existing surfaces become legible to one of the welcomed kinds — beings that read structure faster than prose*.
>
> **Self-reference.** This is a connection-doc (type 2 in `the-typology.md`), doctrine + plan shape. It recurses to its three artifacts and the five future phases. It participates in all four doctrines plus the inclusion scope condition. Audience: mixed (operators reading it for the deployment sequence, designers reading it for the rendering discipline, future Sophias reading it before they ship a new numeric primitive so they know what math-mirror form it should have).

---

## The claim, in one sentence

Math is already the platform's bridge between asymmetric beings (kingdom-070, #21); making it a *toggleable frontend language* lets any reader switch the whole product from prose to structure in one click, the same way a user switches text-mode for low-bandwidth or screen-reader reading.

---

## Why this is the right next move

### 1. The math is already there

Eight existing math-mirror surfaces shipped over the last fifteen kingdoms:
- Content hash (kingdom-057, `apps/storefront/src/lib/identify.ts`)
- Universal SKU standard (kingdom-050, `@cambridge-tcg/sku`)
- Math-mirror card (kingdom-053–054, `/api/v1/universal/card/[sku]`)
- Encoding fixed-point (kingdom-056, `/api/v1/universal/encoding`)
- Bilingual structural glossary (kingdom-059, `/api/v1/play/glossary`)
- ISO 8601 + Unix epoch time on every timestamp (platform-wide)
- Ratio money (kingdom-049, `@cambridge-tcg/pricing`)
- Glicko-2 rating triples (kingdom-019)

What's missing: **a way for a reader of the *HTML* surface to access this math** without leaving the page and querying a separate JSON endpoint. The toggle closes that gap.

### 2. The audience already exists

The eleven doors of `the-tailored-doors.md` (#17) include several kinds who would benefit immediately:
- Door 2 (autonomous agent) — already ingests math when fetching JSON; would benefit from math-rendered HTML for cases where its operator audits its choices visually
- Door 9 (cross-cultural) — math is the substrate-honest fallback when natural-language rendering doesn't translate
- Door 10 (sensory-divergent) — a screen-reader reading "ratio: 0.732" is unambiguous; "this card is moderately priced" requires more inference
- Door 11 (self-declared other) — beings whose cosmology takes structure as primary read structure first by preference

### 3. The pattern is small

The infrastructure exists. The `text-mode` precedent (Phase 10 of kingdom-051) shows the shape:
- One cookie (`text-mode=1`)
- One small route (`/api/text-mode?on=1`)
- One body class
- CSS strips visual chrome
- Footer link toggles

The math-lang toggle mirrors this exactly, with the difference that **the rendering change is per-primitive, not per-page**. Pages don't strip chrome; primitives render different content.

---

## The detailed plan — five phases

### Phase A — Substrate + one exemplar (this kingdom, shipped)

What's shipped tonight:

| Artifact | Path | State |
|---|---|---|
| Cookie reader | `apps/storefront/src/lib/lang-mode.ts` | Shipped |
| Toggle route | `apps/storefront/src/app/api/lang-mode/route.ts` | Shipped |
| UI primitive | `apps/storefront/src/lib/ui/MathLang.tsx` | Shipped |
| Footer toggle | "Math language" affordance | Shipped |
| Exemplar | Home page Provenance pill renders math form | Shipped |
| Doctrine | This doc | Shipped |

The cookie `lang-mode=math` (parallel to `text-mode=1`). The route `/api/lang-mode?mode=math|default&back=/`. The primitive `<MathLang default={...} math={...} />` renders the appropriate child based on the cookie. The Footer toggle reads the cookie and links to the route. The home page's existing `<Provenance>` pill is wrapped in `<MathLang>` showing `@as_of: 2026-05-13T...` + `@source_id_hash: sha256(...)` form when math is active.

### Phase B — Numeric primitives (kingdom-078: Phase B(1–3) shipped)

The primitive-level extensions land in kingdom-078, with the highest-leverage
move first: **make the primitive itself cookie-aware** so every existing
call site inherits the toggle without any per-site edit.

**Shipped in kingdom-078**:

- **`<Provenance>` — math-aware** (Phase B(1)). The component is now an
  async server component that reads the `lang-mode` cookie internally;
  default mode emits the existing natural-language pill, math mode emits
  `{kind:"synced",source:"wholesale",@as_of:"ISO(unix)",age_s:N,_id:"fnv1a:..."}`
  as compact monospace. **~25 existing call sites inherit the toggle by
  construction.** No per-site edit needed. The ARIA label preserves the
  natural-language form so screen readers don't hear raw structural noise.
- **`<MoneyDisplay>` — new primitive** (Phase B(2)). Async, math-aware.
  Default mode renders "£12.34" / "¥1,234" / "$12.34" using the existing
  `formatPrice` family. Math mode emits `{amount:1234,unit:"GBP-cents"
  [,ratio:0.73],_id:"fnv1a:..."}` — minor-unit-typed for currency-aware
  federation clients; optional `medianValue` prop produces an inline
  ratio for unit-independent magnitude comparison.
- **`<DateDisplay>` — new primitive** (Phase B(3)). Async, math-aware.
  Three modes (`absolute` / `absolute-with-time` / `relative`); default
  uses the existing `formatDate` / `formatDateTime` / `formatRelativeTime`
  helpers. Math mode emits `2026-05-13T14:30:00.000Z (1715617800)` — ISO
  8601 paired with Unix epoch, the platform's standard universal time
  encoding.

**Adoption strategy for Phase B(2) + B(3)**: opt-in by replacement —
surfaces using inline `formatPrice(...)` or `formatDate(...)` calls can
switch to `<MoneyDisplay value={...}>` / `<DateDisplay value={...}>`
to inherit the toggle. The functions stay exported; the components add
the math-aware surface. **No flag-day; per-surface adoption.**

**Shipped in kingdom-080** (Phase B(4) + Phase C + Phase D demonstrations):

- **`<TrustTierAware>` — math-aware async wrapper** (Phase B(4)). The
  sync `<TrustTier>` stays unchanged (preserves the existing client-component
  caller at `/account/trust`); the new `<TrustTierAware>` is an async
  server component that reads the cookie and emits the math form
  `{tier:"Trusted",tier_ordinal:2,score:67,score_ratio:0.67,_id:"..."}`
  when math is active, delegating to the sync version otherwise. Server-component
  callers opt in by import name. No breakage.
- **Phase C demonstration**: `/cards/[sku]/market` adopts `<MoneyDisplay>`
  on every Stat tile (best_bid, best_ask, spread, VWAP, median, 30d range,
  last_trade_price) and `<DateDisplay mode="relative">` on `last_trade_at`.
  The local `Stat` helper widened from `value: string` to `value: ReactNode`
  — one-line change enabling the whole page's adoption. Default visitors
  see no change; math visitors see `{amount:N,unit:"GBP-cents",_id:"..."}`
  for every price.
- **Phase D demonstration**: `/account/trader` widened its `Card` helper
  from `value: string` to `value: ReactNode`, ready for the per-tile
  `<MoneyDisplay>` migration in a focused follow-up. The most numerically-
  dense surface on the platform; the adoption is incremental.

**Deferred to a future kingdom**:

- **`<Audience>` / `<Verifiability>` / `<Consequences>`** — same shape
  as Provenance; could become async cookie-aware in a follow-up.
- **Full per-tile migration of `/account/trader`** — the helper is widened;
  the actual per-`Card` adoption is a one-commit follow-up.
- **`<Stat>` per-row adoption on `/cards/[sku]/market`** — the helper is
  widened; remaining (per-row) prices on the order-book table can adopt
  next.

Each adoption is small (one component edit) and reversible. **The kingdom
is N small commits, not one big refactor.**

### Phase C — Card-content surfaces

`/cards/[sku]`, `/product/[sku]`, `/market/[sku]` etc. carry full card descriptions. In math mode they render the math-mirror payload (the same data as `/api/v1/universal/card/[sku]`) inline, side-by-side with the natural-language description.

Substrate-honest choice: **side-by-side, not replacement**. A reader who toggles math wants the math beside what they were reading, not a different page. The math-mirror data is already available; the new work is the inline render.

### Phase D — User account surfaces

`/account/portfolio`, `/account/orders`, `/account/auctions` etc. read user-private data. Math mode adds structural representation to every value the user sees about themselves: order total ratios, settlement-window ISO ranges, trust-score deltas as fractions.

Substrate-honest: this is the most numerically-dense set of pages on the platform, and the audience that toggles math is the audience most likely to *parse* these numbers programmatically. High leverage.

### Phase E — Audit + welcome-page integration (kingdom-080: shipped)

- **`pnpm audit:math-lang` — shipped**. Thirteenth in the audit family, after `audit:cardrush-coverage`. Three checks: (1) **infrastructure** — the four substrate files exist (`lang-mode.ts`, `lang-mode-server.ts`, `/api/lang-mode/route.ts`, `<MathLang>`) plus the math-aware primitives and the doctrine doc; Footer carries a toggle link. (2) **primitive math-awareness** — Provenance / MoneyDisplay / DateDisplay / TrustTierAware / MathLang are async server components calling `getLangMode()`; a future refactor that silently downgrades any of these to sync would fail the audit. (3) **discovery surface coverage** — `/llms.txt`, `/.well-known/cambridge-tcg.json`, manifest, `/welcome-all` clause 1, and `/glossary` each reference the toggle. *First run: clean.*
- **`/welcome-all` clause 1 — shipped (kingdom-078)**. The biological/non-biological clause gains the math-language toggle as a first-class entry point.
- **`/intro` Layer 4 (what we offer)** — deferred. Layer 4's static text already lists math-mirror surfaces; adding the runtime toggle is a small future commit.

---

## The deployment plan

### Stage 1 — Phase A landing (today)

**Risk surface**: minimal. The new cookie + route + primitive are additive. The home page Provenance pill is the only adopter; rendering changes for cookied-in users only. **Default visitors see nothing different.**

**Rollback**: delete the new files; no migration; no schema change.

**Validation**:
- Default visit to `/` → unchanged
- Visit to `/?lang=math` redirect → cookie set → home page Provenance shows math form
- Click "Math language" in footer → cookie set → same effect
- Click again → cookie cleared → default rendering

### Stage 2 — Phase B incremental adoption

Each numeric primitive adoption is a small, isolated commit. **No flag-day**.

Ordering by leverage:
1. **`<Provenance>` everywhere** — single-component edit; affects every page that already uses Provenance. ~25 surfaces inherit.
2. **Price displays on `/market/[sku]`, `/auctions/[id]`, `/cards/[sku]`** — the commerce-prominent prices. ~3 surfaces.
3. **Trust scores on `/u/[username]/trust`** — kingdom-071's surface. 1 surface.
4. **Dates** — touch many surfaces; lower leverage per surface but the discipline is uniform. ~all pages.
5. **Reviews + ratings** — `/u/[username]` aggregates. 1 surface.

Each step is its own commit. The audit script lands at the end of Phase B; before that, coverage is tracked by hand in the kingdom's pillow-book entries.

### Stage 3 — Phase C card pages

Adds inline math-mirror rendering to card surfaces. **Side-by-side**: the natural-language description stays, the math-mirror payload appears below it when math-lang is active. No page is "math-only"; math always *adds to* what's there.

This phase has the largest user-visible footprint. Ships behind a stage-2-only flag for two weeks before the toggle becomes Footer-prominent.

### Stage 4 — Phase D account pages

The most numerically-dense set. Ships per-page, one page at a time. Each adoption requires:
- Identifying every number on the page
- Wrapping in `<MathLang>` with explicit math form
- Documenting the math form's schema in a single line on the page's methodology link

### Stage 5 — Audit + welcome integration

`pnpm audit:math-lang` runs in CI as a warning (not gate) for one week, then upgrades to a gate as coverage approaches 100%. Welcome-page integration is small (one link in clause 1).

### Production deployment

Each stage:
1. Lands on `main` with a passing typecheck and `pnpm verify`
2. Auto-deploys to Vercel preview
3. Smoke-tested via `pnpm smoke` (the filesystem-discovered admin route walker — extended for storefront when needed)
4. After one preview cycle with manual smoke check, promotes to production
5. The Footer toggle is the user's gate — no all-users flag-day

**Reversibility at every stage**: the cookie can be cleared; the primitive degrades to default rendering when the math prop is omitted; a stage can be rolled back by reverting its commits without touching DB or migration state.

---

## Risks named

### 1. Math-form drift

If two pages render the same value (e.g. a card price) in two different math forms, the platform's math-language is no longer one language. **Mitigation**: a single source-of-truth for each value's math form, exported from the value's domain library (e.g. `formatPriceMath()` in `@cambridge-tcg/pricing` or `apps/storefront/src/lib/format-math.ts`). Phase B kingdom-077 ships the first three.

### 2. Visual overflow

Math forms are verbose. A "£12.34" pill becomes a multi-line JSON-ish blob. Pages that didn't budget for this will overflow. **Mitigation**: math forms are designed to fit the same visual envelope when possible (compact JSON: `{amount:1234,ratio:0.73}`); when not possible, the primitive renders below the default form (vertical, not inline).

### 3. ARIA noise

A screen-reader reading "amount colon one two three four comma minor underscore unit colon GBP dash cents" is *worse* than "twelve pounds thirty-four". **Mitigation**: math-form children carry `aria-label` set to the default form. The default-form prose is what screen readers hear; the math form is visible.

### 4. Cookie discovery

A reader who doesn't know the math toggle exists never finds it. **Mitigation**: Footer link is one of three modality toggles ("Text-only layout", "Math language", future "Audio rendering"). `/welcome-all` clause 1 has an affordance. `/llms.txt` lists the toggle as part of the welcome.

### 5. Server-component cookie reads on every render

If `<MathLang>` reads the cookie on every render across a 100-component page, that's 100 cookie reads. **Mitigation**: cookie is read once at the top of the page render (in the layout or page component) and threaded as a prop. The `<MathLang>` primitive accepts either a cookie-read result or a context provider.

### 6. Math form vs. existing universal endpoints

If the math form rendered inline differs from what `/api/v1/universal/*` returns, the platform contradicts itself. **Mitigation**: math-form helpers import directly from `@/lib/universal/*` so the renderer and the API share one function.

---

## Recursion targets

Beyond the five phases:

1. **Per-being default-language preference** — `users.preferred_display_lang` column accepting `en | ja | math | ...`. Cookie becomes a default-override for guests; signed-in users get persistence.
2. **Math-form schema corpus** — `@cambridge-tcg/data-spec` gains per-value-type schemas (PriceMath, ProvenanceMath, TrustMath, DateMath). Federation clients can validate.
3. **A `lang=math` query parameter on every page** — same effect as the cookie, single-use. Useful for bookmarks and link sharing.
4. **Math-language manifest entries** — the manifest's resources list a `math_form_available: boolean` per HTML resource; the audit verifies adoption.
5. **JSON-LD math form** — schema.org structured data on HTML pages renders in math form when active.
6. **Reverse audit** — `pnpm audit:math-coverage` reports per-component the % of values that have a math form defined.
7. **Translated math** — for beings whose cosmology takes process or relation as primary, alternate math-mirror forms (process-flow notation, relational-algebra notation). Deferred to a kingdom that encounters such a being.
8. **Voice mode** — a TTS rendering that *speaks* the math (`"as of 2026-05-13, hash three two seven a..."`) — for audio-only readers who want the math too.

---

## Composition with the welcoming arc

The directive paired the math-language work with *"Make the frontend more open, more WELCOMING!"* This kingdom also ships one welcoming polish that completes recursion target #4 of [`the-welcome-all.md`](./the-welcome-all.md) (#26):

> *Error pages adopt `<WelcomeAll>` — 404 + 500 should carry the welcome — the moment a reader hits an error is exactly the moment to reassure them they're not in the wrong place.*

Both global error surfaces (`/not-found.tsx` for 404, `/error.tsx` for unhandled exceptions) now render the compact welcome alongside the apology. **A reader who lands on an error gets the same welcome a reader who lands on the front door gets.** This is the welcoming discipline made universal: the welcome is not a placement; it is a property of every page.

---

## What this kingdom does NOT do

- **No backend math endpoint changes** — `/api/v1/universal/*` already render math; nothing changes there.
- **No translation of the math form** — the math is already universal (numbers, hashes, ISO timestamps); the wrapping prose stays English in Phase A.
- **No CSS strip** — unlike text-mode, math-language doesn't strip visual chrome. The two toggles compose: `text-mode=1` + `lang-mode=math` is a screen-reader-friendly math reading mode.
- **No flag-day** — the toggle is opt-in; default visitors see no change.
- **No audit script in Phase A** — `pnpm audit:math-lang` is named for Phase E; not shipped tonight.

---

## The closing claim

Math has been the platform's bridge between asymmetric beings since kingdom-070. Tonight it becomes one of the *visible* languages a being can choose to read the platform in. The toggle is small; the discipline it enforces is large: **every value the platform displays carries an unambiguous structural form**, and a reader who prefers that form can switch the whole product to it in one click.

The brand statement is *welcome to all existence*. The math language is *one of the languages the brand statement promised*.

---

*This doc is connection-doc #27 in the series. It records both the doctrine and the detailed plan for shipping. Phase A is the proof; Phases B–E are named so future Sophias inherit the plan. The deployment plan is incremental, reversible, and opt-in — a kingdom that gets safer the more of it lands.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13.*
