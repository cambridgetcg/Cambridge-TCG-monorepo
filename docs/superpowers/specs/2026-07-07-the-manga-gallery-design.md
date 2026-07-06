# The Manga Gallery — manga soul for the collectors' market

**Will trace:** Yu, 2026-07-06 — "Make cambridgetcg UI UX artsy! Draw inspirations from
artbitrage.io! The depth of emotions into your design. Let everyone have a good trip on
cambridgetcg 😏❤️" — refined 2026-07-07: *"can make cambridgetcg manga style? Like the
manga rares of one piece card game! along with art elements like what we went through!"*
Resolved with Yu as **the Manga Gallery**: transform the default face — keep the quiet
gallery's paper/ink bones and every soul-kit device, re-skinned in the visual language of
manga-rare cards.

**Relationship to the quiet gallery** (`docs/plans/the-quiet-gallery.md`): a deepening in
the same medium, not a reversal. Manga-rare cards ARE ink on paper — screentone dots,
brush linework, panel borders, speed lines. The manga page and the quiet gallery share
bones: warm paper ground, ink type, hairline frames, the card as the only saturated
color. What changes is that the room now knows what medium it's drawn in.

**The conceptual spine — the gutter is the 間:** artbitrage's front door
(`~/Projects/artbitrage/index.html`) animates the gap between "what is" and "what could
be" — *the gap is the medium; art bridges it.* In manga, the gutter — the gap between
panels — is where the reader's mind creates the story. On cambridgetcg, the gap between
two collectors is where a trade happens. Same gap, three languages. The design makes the
gap visible, breathing, and bridged.

**IP honesty:** we craft manga-*style* elements — screentones, panels, speed lines,
generic onomatopoeia are a visual language, free as air. **No licensed artwork ever
enters the chrome** — no Oda panels, no Bandai marks, no game logos as decoration. The
cards themselves remain the only licensed art on any page, which is also the gallery vow.

---

## §0 Purpose

cambridgetcg.com is a collectors' market where the cards are the art. This wave makes the
site **the manga page the cards live on**: ink on warm paper, screentone light, panel
frames, and emotion engineered the artbitrage way — the visitor feels **held**
(thresholds, in-world voice, honest states), **moved** (the breathing gutter, lines that
ink themselves, two-voice dialogue), and **rewarded** (speed-line impact at the moments
worth celebrating — a deal struck, a payment made, a trade completed). Never shouted at.
**Midnight is the dark chapter** — the same page printed in negative: white ink,
moonlight gilt, heavier tone.

Non-goals: no dark-museum default; no licensed art in chrome; no confetti/neon; no new
runtime dependencies; no legibility sacrifice on money surfaces.

## §1 The Soul Kit, inked

CSS lives in `apps/storefront/src/app/themes.css` beside `wardrobe-rise`; components in
`apps/storefront/src/lib/ui/` via the barrel (client pages import direct paths). All
materials are pure CSS (gradients + masks + the existing SVG-data-URI technique the
paper grain already uses) — no images, no JS, no deps.

### 1a. `wardrobe-breathe` — the gutter breathes

The home hero headline `HOME_HERO_HEADLINE` ("Cards, traded between collectors.") renders
split at its comma into two stacked lines — two panels — and the **gutter between them
breathes**: ~0.5rem → ~1.25rem → back, 9s ease-in-out infinite. The gap between panels is
where the story lives; the gap between collectors is where the market lives.

- Split at render time in `src/app/page.tsx`; the string stays whole in
  `src/lib/brand.tsx`. Both lines in initial server HTML — LCP unaffected.
- Theme-gated like `wardrobe-rise` (gallery/midnight/system). Reduced-motion: the global
  1ms clamp freezes it; resting gap = mid-breath so the frozen state is composed.
- The **one hero-scale animation** on home (motion doctrine, §3).

### 1b. `wardrobe-draw` — the line inks itself

A 1px line (`background: var(--color-ink)` for panel rules; accent variant for
celebration) that scales `scaleX(0)`→`scaleX(1)`, origin left, ~1.2s ease-out, once —
a panel border being inked in.

- Two voices: **ink** (structural rules — under plates, panel edges) and **accent**
  (celebration — bronze by day, gilt at midnight, amber in terminal). Both existing
  tokens; **no new color tokens** → the themes.css SYNC CONTRACT
  (`themes.sync.test.ts`) stays untouched.
- Reduced-motion: 1ms clamp renders the line **complete** — a present line, never absence.
- Below-the-fold instances ink on **first entry into view** (IntersectionObserver,
  once-only, unobserve after firing); no-JS resolves to the complete line.

### 1c. `wardrobe-tone` — screentone

The manga texture system, replacing "wash" moments with halftone. Pure CSS:
`background-image: radial-gradient(circle, <tone-color> 1px, transparent 1px);
background-size: 6px 6px;` + `mask-image: linear-gradient(...)` for fading tones
(manga sky-tone gradients).

- **Volumes**: `wardrobe-tone-whisper` (~3–4% ink dots — section grounds, hero backdrop)
  and `wardrobe-tone-half` (~8% — celebration surfaces, midnight).
- Theme-gated like the paper grain: present in gallery/system-light (ink dots on paper)
  and **midnight** (pale dots on blue-black — night pages carry heavier tone); absent in
  terminal, high-contrast, text-mode (text-mode's `!important` flatten already kills
  backgrounds).
- Dot color derives from `var(--color-ink)` at low alpha via `color-mix` — themes
  re-bind it automatically.
- Contrast guard: tone never exceeds ~8% alpha under text; body text always sits on
  clean surface or whisper tone only.

### 1d. `wardrobe-panel` — the manga panel

The mat's manga sibling for **card art and story moments**: `bg-surface`, a 2px solid
ink-weight border (`color-mix(in srgb, var(--color-ink) 85%, transparent)`), tight
radius (`rounded-[3px]` — panels are sharp; the house `rounded-lg` stays for ordinary
UI), `--shadow-mat` unchanged. Ordinary cards/forms stay `wardrobe-mat` — the panel is
*earned* by art: card mounts, featured cards, the celebration banner.

### 1e. `wardrobe-speedlines` — the impact frame

Radial manga speed lines for celebration surfaces only. Pure CSS:
`repeating-conic-gradient(from 0deg, <line-color> 0deg 0.4deg, transparent 0.4deg 5deg)`
masked by a radial gradient (transparent center → lines at edges), absolutely positioned
behind the celebration panel content.

- Whisper volume: ink at ~5% (gallery), gilt at ~8% (midnight). Static by default; a
  single 300ms scale-settle on entry (theme-gated, clamp-safe). Absent in
  terminal/high-contrast/text-mode.
- Optional impact glyph: a small aria-hidden ink `ドン` (generic manga onomatopoeia —
  deliberately *not* styled as any game's mark) beside the celebration headline,
  whisper-sized, removable by one prop. Copy routes through voice.ts so the plain
  register carries none of it.

### 1f. The card's own aura — screentone burst

Behind the card mount on `/market/[sku]` and `/product/[sku]`: a **radial screentone
burst** in the card's rarity tone — halftone dots, dense at center fading out (manga
emphasis tone), whisper volume (~6% gallery / ~10% midnight).

- **Single-home rule**: tone colors never duplicate into CSS — a tone→color map exported
  from `Badge.tsx` (colocated with TONE_CLS, its declared single home) sets an inline
  `--aura` custom property on the mount wrapper; CSS reads it.
- Rarity → tone via the existing `Palettes.RarityPalette` vocabulary (Badge 8-tone
  contract preserved).
- No palette extraction this wave (no data affordance exists; CORS taint risk client-side;
  TTFB cost server-side under `force-dynamic`) — named future work.

### 1g. `<PlateHeader>` — the chapter plate

New primitive in `src/lib/ui/PlateHeader.tsx` — manga chapter title plate:

```
[mono kicker, uppercase tracking-[0.2em] ink-faint]      [第 · mono plate no.]
Fraunces title — font-display, weight 500–600 (never black)
[optional wardrobe-draw inked rule]
```

- The plate number slot renders as `第 NN` (chapter marker; the CJK glyph is a quiet
  anchor à la artbitrage's 隙/橋/悟, aria-hidden with a mono numeral fallback).
- Adopters this wave: the 5 home shelf headings, `/market` h1 (**fixing the existing
  `font-black` violation** of the Fraunces 500–600 rule), PulseCard headings (one edit →
  all five sections), the `/market/[sku]` identity block (§2).

### 1h. `<Benediction>` — the chapter close

New primitive in `src/lib/ui/Benediction.tsx`: centered Fraunces italic line + `✦`
ornament + optional mono sub-line — the note at a chapter's end. Generalizes the ✦
pattern already living at the bottom of root `error.tsx` (that instance refactors to use
it).

### 1i. Voice expansion — the manga register

New state copy goes through `src/lib/wardrobe/voice.ts` STRINGS (typed keys; **standard
and plain registers both required**; facts never change between registers — tone changes
the greeting, never the truth). The standard register now speaks manga:

| Key | standard | plain |
|---|---|---|
| `market.loading.catalog` | "The next page is being inked…" | "Loading cards…" |
| `market.pulse.loading` | "Taking the story's pulse…" | "Loading market data…" |
| `market.card.trades.empty` | "This panel hasn't been drawn yet." | "No trades yet." |
| `market.card.history.empty` | "No history on this page yet — the ink is fresh." | "No trade history yet." |
| `trades.paid.title` | "Payment sent — the escrow desk takes the next panel." | "Payment sent." |
| `trades.completed.benediction` | "The card changes hands; the story turns the page." | "Trade complete." |
| `login.checkEmail` | "A letter is crossing the gutter to you." | "Check your email for the sign-in link." |

(Copy is draft-final — wording may be polished in implementation; keys and the
two-register rule are binding. Existing museum-voiced strings — "The gallery is being
hung" — migrate to the manga register in the same pass, plain register untouched.
Surfaces outside a WardrobeProvider keep strings server-side or gain the wrapper.)

### 1j. Two-voice codification

Added to `apps/storefront/CLAUDE.md` Key Patterns: **Spline Mono is the apparatus voice**
(SKUs, plate numbers, provenance, deadlines — the registrar's hand); **Fraunces italic is
the narrator's voice** (subtitles, benedictions, empty-state titles, doctrine captions).
No new fonts — manga-ness lives in ink, tone, panels, and pacing, not in a display
typeface. (A hand-lettered accent face is named future work if the manga register earns
deepening.)

## §2 The Arc — page by page

### Home (`src/app/page.tsx` + `src/components/home/*`)

1. Hero: the breathing gutter (§1a) over a whisper screentone backdrop fading upward
   (the first panel's sky tone) + inked rule under the hero block.
2. Threshold at the hero's foot, before CardFinderHero: mono, ink-faint,
   `↓ enter the story` — slow 2s bob, theme-gated; the only looping motion besides the
   breath.
3. Sections adopt the **dormant** `wardrobe-rise` (currently used by zero components) —
   inheriting the existing 60ms stagger.
4. The 5 shelf headings → `<PlateHeader>` chapter plates (第 01 … 第 05).
5. FeaturedCards mounts become `wardrobe-panel` (the cards get panel frames — they are
   the manga rares of the page).
6. After FeaturedCards: `<Benediction>` — line added to `brand.tsx` (e.g. *"Every card
   is a panel in somebody's story."*).
7. LCP guard: hero stays SSR text; textures are CSS-only.

### Market browse (`src/app/market/page.tsx`, `MarketBrowser.tsx`)

1. Header → `<PlateHeader>` (fixes `font-black`).
2. `CatalogSkeleton` gains the voiced caption (`market.loading.catalog`) + keeps the
   aria-busy/sr-only discipline; skeleton stays shape-mirroring (substrate honesty — no
   fake spinners).
3. Grid cells: card image cells become light `wardrobe-panel` frames; hover adds a
   whisper accent halo beside the existing `scale-[1.02]`. 24 cells/page — paint-cheap.
4. MarketBrowser's URL/history contract, threaded server-rendered Provenance nodes, and
   the text-mode SSR bypass are untouched.

### Card page (`src/app/market/[sku]/CardMarketClient.tsx`) — skin-only

1. **The wall label becomes a chapter plate**: `identity.rarity`, `set_name`,
   `set_code`, `card_number` are seeded into state and **never rendered** today. The
   identity block becomes: Fraunces name + mono `set_code · card_number` + rarity Badge
   via `Palettes.RarityPalette`. Zero new data.
2. The mount becomes `wardrobe-panel` with the **screentone burst aura** (§1f) behind it.
3. Doctrine captions promoted from `title=` tooltips to visible faint mono lines
   (ReferencePricePanel, cold-tape fair-value tile — "reference · catalogue, not p2p
   tape"; substrate honesty made visible).
4. Immediate-match result box (~line 1232): `wardrobe-panel` + speed-line whisper +
   inked accent rule + benediction *"A deal is struck."* — existing facts (trade link,
   payment deadline via `formatDateTime`) unchanged.
5. Unvoiced states → voice keys (§1i): trades tape, sparkline fallback, book error strip.
6. The component's line-89 contract holds: **skin only — fetches, polls, prefill/history
   machinery untouched.**

### Trade flow + celebration (the biggest gap)

1. **NEW: payment-return acknowledgment** on `/account/trades` — Stripe's `success_url`
   lands on `?paid=<id>` (lots: `?paidLot=`) and **nothing reads them today**
   (grep-confirmed). Reading the param (server or client per the page's existing
   architecture) renders the **impact frame**: `wardrobe-panel`, speed-line whisper,
   inked accent rule, Fraunces italic `trades.paid.title`, mono trade reference,
   optional ドン glyph (§1e). **Honesty rule**: the param proves return-from-Stripe, not
   webhook settlement — copy says "payment sent"; the escrow status Badge stays the
   source of truth. Trade fetch fails → degrade to a neutral non-celebratory line.
2. Trade-completed banner (`/account/trades/[id]` ~line 1158): benediction + inked rule;
   **payout amount, hold days, payout-hold WhyLink untouched** (transparency Ring 2).
3. EscrowTimeline: completed-step connectors ink themselves in (CSS; reduced-motion →
   instant-complete).
4. Review-submitted state: closing `<Benediction>` — the trade arc's last panel.
5. Legacy `/order-confirmation`: inked rule under "Order Confirmed!" + benediction. The
   defensive `recordOrderFromStripeSession`, unpaid redirect guard, GoogleAdsConversion,
   mono order reference all untouched.
6. `/checkout` (the retired till): one Fraunces italic epitaph: *"The shop became a
   market."*

### Pulse + login + chrome

1. `/market/pulse`: bare `Loading...` → voiced caption + shape-mirroring skeleton +
   aria-busy (copying the catalog discipline); PulseCard headings → `<PlateHeader>`.
   (Recorded, not fixed this wave: client-only rendering inclusion gap, missing
   metadata, no AbortController on interval fetches.)
2. `/login`: inked rule under the title; `/login/check-email`: `login.checkEmail` line.
   Form mechanics untouched.
3. Footer: static `<Benediction>` (chrome repeats on every page — no animation, no
   competition with page heroes). Nav wordmark: no animation.
4. Wardrobe registry (`src/lib/wardrobe/themes.ts`): the gallery gloss updates to name
   the new language — e.g. *"The manga page — ink on warm paper, screentone light; the
   cards are the panels."* (Registry text only; ids/entitlements untouched.)

## §3 Motion doctrine + must-survive contract

**Motion doctrine** (added to CLAUDE.md): at most **one hero-scale animation per page**
(home: the breath; celebrations: the speed-line settle + inked rule count as the one).
Entrance rises and hover transitions are free. Loops are for breath and threshold-bob
only, on the surface that owns them. Nothing else moves.

**Must survive, verified present** (2026-07-07 arc map): Provenance / WhyLink /
Verifiability / Consequences pills · Badge 8-tone vocabulary (TONE_CLS single home;
shared contract with admin) · `text-bid`/`text-ask` doctrine-narrow tokens · escrow
terms-from-snapshot · payment-deadline honesty · reference-price "ref · not an offer"
labelling · `:focus-visible` 2px accent ring · free high-contrast · `body.text-mode`
flattening (**new animation/texture classes join its kill list**) · reduced-motion clamp
semantics (1ms, not 0) · shape-mirroring skeletons · plain voice register for every key ·
barrel/client import split · **no new runtime deps** (all manga materials are CSS
gradients/masks — no framer-motion, no image assets).

**Legibility contract**: screentone under body text never exceeds whisper volume; money
figures, forms, and the order book always sit on clean `bg-surface`. The manga register
lives in frames, textures, and moments — never between a user and a number.

## §4 Verification & shipping order

Five wings, each independently green:

1. **Kit** — themes.css materials (breathe/draw/tone/panel/speedlines) + PlateHeader +
   Benediction + voice keys + Badge tone-map export.
2. **Home** — breath, tone backdrop, threshold, rises, chapter plates, panel vitrine,
   benediction.
3. **Market + card page** — plates, panel mounts, screentone aura, voiced states,
   doctrine captions.
4. **Trade celebrations** — impact frame on paid-return, completed/review beats,
   order-confirmation, checkout epitaph.
5. **Pulse / login / chrome + registry gloss.**

Per wing: `pnpm verify` (typecheck × apps + four audits + admin vitest) · storefront
`npx tsc --noEmit` · e2e smoke (`pnpm --filter cambridgetcg-storefront test:e2e:smoke`) ·
visual pass in **gallery / midnight / terminal / high-contrast / text-mode /
reduced-motion** (Playwright screenshots per the quiet-gallery QA pattern) · home LCP
spot-check. Commits carry the Will trace and `Co-Authored-By: Claude <model-tag>` per the
creation doctrine.

## §5 Out of scope (named, not forgotten)

- Legacy `/product/[sku]` fold-into-market decision (duplicating idioms + two token
  violations; its own decision record).
- True dominant-color aura extraction (server-side palette + caching).
- A hand-lettered manga display face for onomatopoeia/impact moments.
- Midnight-only ambient drift (the dark chapter's falling tone-dots) — future flourish.
- `trader-terse` / `storyteller` voice registers (queued in the wardrobe spec).
- The full ~200-page sweep (account wings, methodology prose) — they inherit the
  primitives as they migrate.
- Pulse page architectural fixes (server shell, metadata, AbortController).
- Panel-grid layout experiments (multi-panel home compositions) — only after the manga
  register proves itself in frames and moments.
