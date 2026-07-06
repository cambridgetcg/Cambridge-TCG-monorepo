# The Living Gallery — soul kit + emotional arc

**Will trace:** Yu, 2026-07-06 — "Make cambridgetcg UI UX artsy! Draw inspirations from
artbitrage.io! The depth of emotions into your design. Let everyone have a good trip on
cambridgetcg 😏❤️" — resolved with Yu (2026-07-07) as **quiet room, living soul**: the
quiet gallery stays the ground; artbitrage's emotional engineering pours into it.

**Relationship to the quiet gallery** (`docs/plans/the-quiet-gallery.md`): this spec is a
*deepening*, not a reversal. Everything here obeys the gallery's vows — warm paper, ink,
hairlines, one bronze accent, the card as the only saturated thing. What it adds is what
artbitrage.io proves compatible with restraint: negative space that breathes, a line that
draws itself once, thresholds, two typographic voices in dialogue, and celebration at the
moments that are truly worth celebrating.

**Source study:** `~/Projects/artbitrage` — its front door (`index.html`, the 間 system)
is itself a quiet museum: sumi ink, ONE cinnabar accent, hairline borders, a 9s breathing
gap, a 1px self-drawing bridge-line, mono wall-labels against light italic serif, in-world
failure states, and the doctrine *"the further from the front door, the deeper the trip."*
Its era system (`era.css`) is architecturally the Wardrobe's sibling: one skeleton,
re-souled per page by ~7 custom properties. We import the craft, not the darkness.

---

## §0 Purpose

cambridgetcg.com is a collectors' market where the cards are the art. The quiet gallery
gave it a room; this wave gives the room a soul. "A good trip" means: the visitor feels
**held** (thresholds, in-world voice, honest states), **moved** (breath, drawn lines,
two-voice dialogue), and **rewarded** (quiet-luxe celebration at real moments — a deal
struck, a payment made, a trade completed). Never shouted at. Depth of feeling escalates
with distance from the front door; **midnight is the night register** — the same soul,
lights off, gilt instead of bronze.

Non-goals: no reversal of the 2026-07-05 gallery flip; no dark-museum default; no
particle fields, confetti, or neon in the gallery register; no new runtime dependencies.

## §1 The Soul Kit

New primitives. CSS lives in `apps/storefront/src/app/themes.css` beside `wardrobe-rise`;
components live in `apps/storefront/src/lib/ui/` and export through the barrel (server/
client import discipline preserved — client pages import direct paths).

### 1a. `wardrobe-breathe` — negative space that breathes

The home hero headline `HOME_HERO_HEADLINE` ("Cards, traded between collectors.") renders
split at its comma into two stacked lines — *"Cards,"* / *"traded between collectors."* —
inside a flex column whose **gap breathes**: ~0.5rem → ~1.25rem → back, 9s ease-in-out
infinite. The gap between collectors is the medium; the market bridges it — thesis as
motion, before words.

- Split happens at render time in `src/app/page.tsx`; the string itself stays in
  `src/lib/brand.tsx` (single source of truth unchanged). Both lines are in the initial
  server HTML — LCP unaffected.
- Keyframe `wardrobe-breathe` is theme-gated exactly like `wardrobe-rise`
  (gallery/midnight/system only).
- `prefers-reduced-motion`: the global 1ms clamp (globals.css) freezes it; declare the
  resting gap = the mid-breath value so the frozen state is composed, not collapsed.
- This is the **one hero-scale animation** the home page gets (motion doctrine, §3).

### 1b. `wardrobe-draw` — the line that draws itself

A 1px hairline (`background: var(--color-accent)`) that scales from `scaleX(0)` to
`scaleX(1)`, `transform-origin: left`, ~1.2s ease-out, **once per page load**, no loop.
artbitrage's bridge-line, in daylight.

- Color is `var(--color-accent)` — bronze in gallery, moonlight gilt in midnight, amber
  in terminal. **No new color tokens** → the themes.css SYNC CONTRACT (midnight ↔ system
  dark duplicate, guarded by `themes.sync.test.ts`) is never touched.
- Reduced-motion: the 1ms clamp renders the line **complete** — it degrades to a present
  line, never to absence.
- Below-the-fold instances draw on **first entry into view** (IntersectionObserver,
  once-only, unobserve after firing — artbitrage's `.rise` discipline); no-JS and
  reduced-motion both resolve to the complete line.
- Usage: under the home hero, inside `<PlateHeader rule>`, celebration surfaces.

### 1c. `wardrobe-mat-gilt` — the celebration mat

A variant of `.wardrobe-mat` for celebration surfaces only: same surface + shadow-mat
grammar, hairline border in `color-mix(in srgb, var(--color-accent) 40%, transparent)`,
plus a 2px `wardrobe-draw` top line. Flat in terminal/high-contrast exactly as
`--shadow-mat` already is.

### 1d. The card's own aura — rarity-keyed whisper wash

Behind the card mount on `/market/[sku]` (CardMarketClient mount, the `wardrobe-mat
rounded-lg p-2` div) and `/product/[sku]` (server page image block): a pure-CSS radial
wash in the card's **rarity tone**, whisper volume.

- Rarity → tone via the existing `Palettes.RarityPalette` vocabulary (Badge 8-tone
  contract). **Single-home rule**: tone colors are never duplicated into CSS — a
  tone→color map exported from `Badge.tsx` (colocated with TONE_CLS, its declared single
  home) sets an inline `--aura` custom property on the mount wrapper; the CSS wash reads
  `radial-gradient(ellipse at center, var(--aura) → transparent 70%)` with theme-gated
  alpha.
- Alpha ~6% in gallery, ~10% in midnight (deeper night register), **absent** in
  terminal, high-contrast, and text-mode — gated per `[data-theme]` like the paper grain.
- No JavaScript, no palette extraction. True dominant-color extraction is a named future
  wave (no palette data exists in `CatalogIdentity`; client canvas sampling risks CORS
  taint; server extraction costs TTFB under `force-dynamic`).

### 1e. `<PlateHeader>` — the museum wall label

New primitive in `src/lib/ui/PlateHeader.tsx`:

```
[mono kicker, uppercase tracking-[0.2em] text-ink-faint]   [optional mono plate no.]
Fraunces title — font-display, weight 500–600 (never black)
[optional wardrobe-draw hairline rule]
```

Props: `kicker?`, `title`, `plateNumber?`, `rule?`, `action?` (slot, like PageHeader's).
Adopters in this wave: the 5 home shelf headings (GameGrid "Browse by Game",
PriceGuideStrip, SetGrid, FeaturedCards, KingdomStrip kicker), `/market` h1 (**fixing the
existing `font-black` violation** of the Fraunces 500–600 house rule), PulseCard headings
(one edit → all five sections), the `/market/[sku]` identity block (§2).

### 1f. `<Benediction>` — the closing line

New primitive in `src/lib/ui/Benediction.tsx`: centered Fraunces italic line +
`✦` ornament in accent + optional mono sub-line. Generalizes the pattern that already
exists at the bottom of root `error.tsx` (✦ + WELCOME_STATEMENT_COMPACT footer card) —
that instance refactors to use the primitive.

### 1g. Voice expansion — in-world strings

All new state copy goes through `src/lib/wardrobe/voice.ts` STRINGS (typed keys; **both
`standard` and `plain` registers required** — audience-side tone choice survives; facts
never change between registers). New keys:

| Key | standard | plain |
|---|---|---|
| `market.loading.catalog` | "The gallery is being hung…" | "Loading cards…" |
| `market.pulse.loading` | "Taking the room's pulse…" | "Loading market data…" |
| `market.card.trades.empty` | "No trades yet — the tape is blank." | "No trades yet." |
| `market.card.history.empty` | "No price history yet — this wall is new." | "No trade history yet." |
| `trades.paid.title` | "Payment sent — the escrow desk takes it from here." | "Payment sent." |
| `trades.completed.benediction` | "The card changes hands; the story continues." | "Trade complete." |
| `login.checkEmail` | "An envelope is crossing the room to you." | "Check your email for the sign-in link." |

(Exact copy is draft-final: wording may be polished during implementation; keys and the
two-register rule are binding. Surfaces outside a WardrobeProvider — e.g. server pages
like `/product/[sku]` — keep strings server-side or gain the wardrobe wrapper.)

### 1h. Two-voice codification

Added to `apps/storefront/CLAUDE.md` Key Patterns: **Spline Mono is the apparatus voice**
(SKUs, plate numbers, provenance, deadlines, counts, dates — the museum's registrar);
**Fraunces italic is the curator's whisper** (subtitles, benedictions, empty-state
titles, doctrine captions). Emphasis is chromatic and typographic, never loud. The
existing reference-price stack on `/product/[sku]` (~lines 171–182: Fraunces number /
mono provenance / faint doctrine caption) is the canonical example.

## §2 The Arc — surface by surface

### Home (`src/app/page.tsx` + `src/components/home/*`)

1. Hero: breathing split headline (§1a) + `wardrobe-draw` hairline under the hero block.
2. A quiet threshold hint at the hero's foot, before CardFinderHero: mono, ink-faint,
   `↓ enter the gallery` — a slow 2s bob (translateY 0→6px), theme-gated; the *only*
   looping motion on the page besides the breath.
3. Sections adopt the **dormant** `wardrobe-rise` (defined in themes.css, currently used
   by zero components) — top-level sections get `className="wardrobe-rise"`, inheriting
   the existing 60ms nth-child stagger.
4. The 5 shelf headings → `<PlateHeader>` (§1e).
5. After FeaturedCards, before Footer (the currently-empty benediction slot):
   `<Benediction>` — line sourced from/added to `brand.tsx` (e.g. *"Every card here is
   somebody's treasure."*).
6. LCP guard: hero remains SSR text; no new images; animations are CSS-only.

### Market browse (`src/app/market/page.tsx`, `MarketBrowser.tsx`)

1. Header → `<PlateHeader>` (fixes `font-black`).
2. `CatalogSkeleton` gains a voiced caption (`market.loading.catalog`) — visible line +
   the existing aria-busy/sr-only discipline; skeleton stays shape-mirroring (no fake
   spinners — substrate honesty).
3. Grid cells: on hover, add a whisper `accent-wash` halo alongside the existing
   `scale-[1.02]` — CSS only, 24 cells/page paint-cheap.
4. No structural change to MarketBrowser's URL/history contract, threaded server-rendered
   Provenance nodes, or the text-mode SSR bypass path.

### Card page (`src/app/market/[sku]/CardMarketClient.tsx`) — skin-only

1. **The wall label**: `identity.rarity`, `set_name`, `set_code`, `card_number` are
   seeded into client state and **never rendered** today. The identity block under the
   mount becomes a museum plate: Fraunces name (existing h1) + mono
   `set_code · card_number` + rarity Badge via `Palettes.RarityPalette`. Zero new data.
2. Rarity aura (§1d) behind the mount.
3. Doctrine captions promoted from `title=` tooltips to visible faint mono lines on
   ReferencePricePanel and the cold-tape fair-value tile ("reference · catalogue, not
   p2p tape" — substrate honesty made visible).
4. Immediate-match result box (~line 1232): `wardrobe-mat-gilt` + drawn hairline +
   benediction *"A deal is struck."* — existing facts (trade link, payment deadline via
   `formatDateTime`) unchanged.
5. Unvoiced states routed through voice keys (§1g): trades tape, sparkline fallback,
   order-book error strip.
6. The component's own line-89 contract holds: **skin only; fetches, polls, and the
   prefill/history machinery untouched.**

### Trade flow + celebration (the biggest gap)

1. **NEW: payment-return acknowledgment** on `/account/trades` — the Stripe
   `success_url` lands on `?paid=<id>` (and lots on `?paidLot=`) and **nothing reads
   them today** (grep-confirmed). Reading the param (server or client, per the page's
   existing architecture) renders a `wardrobe-mat-gilt` banner: drawn hairline, Fraunces
   italic `trades.paid.title`, mono trade reference. **Honesty rule**: the param proves return-from-Stripe, not
   webhook settlement — copy says "payment sent", and the escrow status Badge remains
   the source of truth. If the trade fetch fails, degrade to a neutral (non-gilt)
   "Payment sent" line.
2. Trade-completed banner (`/account/trades/[id]` ~line 1158): benediction line +
   drawn hairline; **payout amount, hold days, and the payout-hold WhyLink stay exactly
   as they are** (transparency Ring 2).
3. EscrowTimeline: completed steps' connector becomes a thin accent line that draws in
   (CSS transition; reduced-motion → instant-complete).
4. Review-submitted state (`/account/trades/[id]/review`): closing
   `<Benediction>` — the last beat of the trade arc.
5. Legacy `/order-confirmation`: drawn hairline under "Order Confirmed!" + benediction
   under the thank-you. The defensive `recordOrderFromStripeSession`, the unpaid
   redirect guard, GoogleAdsConversion, and the mono order reference all untouched.
6. `/checkout` (the retired till): one Fraunces italic epitaph line added to the
   existing two-paragraph structure: *"The shop became a market."*

### Pulse + login + chrome

1. `/market/pulse`: loading state (currently a bare `Loading...` `<p>`) → voiced caption
   + shape-mirroring skeleton + aria-busy (copying the catalog/prices discipline);
   PulseCard heading → `<PlateHeader>`; failure line voiced. (Known gaps recorded, not
   fixed this wave: client-only rendering/no-JS inclusion gap, missing metadata export,
   interval fetches without AbortController.)
2. `/login`: drawn hairline under the title; `/login/check-email`: `login.checkEmail`
   voiced line. Form mechanics untouched.
3. Footer: static `<Benediction>` (no animation — chrome repeats on every page and must
   not compete with page heroes). Nav wordmark: **no animation** (same reason).

## §3 Motion doctrine + must-survive contract

**Motion doctrine** (added to CLAUDE.md): at most **one hero-scale animation per page**
(home: the breath; celebration pages: the drawn line), plus entrance rises, plus hover
transitions. Loops are for breath and threshold-bob only, and only on the surface that
owns them. Nothing else moves.

**Must survive, verified present** (from the 2026-07-07 arc map): Provenance / WhyLink /
Verifiability / Consequences pills · Badge 8-tone vocabulary (TONE_CLS is the single
home; shared contract with admin) · `text-bid`/`text-ask` doctrine-narrow tokens (never
generic ok/danger) · escrow-terms-from-snapshot · payment-deadline honesty · reference
price "ref · not an offer" labelling · `:focus-visible` 2px accent ring · free
high-contrast · `body.text-mode` flattening (**new animation classes join its kill
list**) · reduced-motion clamp semantics (1ms, not 0) · shape-mirroring skeletons ·
plain voice register for every key · barrel/client import split · **no new runtime
deps** (no framer-motion; everything is CSS + existing primitives).

## §4 Verification & shipping order

Five wings, each independently green before the next starts:

1. **Kit** — themes.css keyframes + PlateHeader + Benediction + mat-gilt + voice keys.
2. **Home** — breath, threshold, rises, plates, benediction.
3. **Market + card page** — plates, aura, skin fixes, voiced states.
4. **Trade celebrations** — paid-return banner, completed/review beats, order-confirmation,
   checkout epitaph.
5. **Pulse / login / chrome.**

Per wing: `pnpm verify` (typecheck × apps + four audits + admin vitest) · storefront
`npx tsc --noEmit` · e2e smoke (`pnpm --filter cambridgetcg-storefront test:e2e:smoke`) ·
visual pass in **gallery / midnight / terminal / high-contrast / text-mode /
reduced-motion** (the six-way matrix; Playwright screenshots per the quiet-gallery QA
pattern) · home LCP spot-check. Commits carry the Will trace and
`Co-Authored-By: Claude <model-tag>` per the creation doctrine.

## §5 Out of scope (named, not forgotten)

- Legacy `/product/[sku]` fold-into-market decision (it duplicates the card page with
  diverging idioms + two token violations; restyle-vs-fold is its own decision record).
- True dominant-color aura extraction (server-side palette + caching).
- Midnight-only ambient dust (artbitrage's particle drift, after-dark register) — a
  possible future flourish, deliberately not in the quiet wave.
- `trader-terse` / `storyteller` voice registers (queued in the wardrobe spec).
- The full ~200-page sweep (account wings, methodology prose); they inherit the
  primitives as they migrate.
- Pulse page architectural fixes (server shell, metadata, AbortController).
