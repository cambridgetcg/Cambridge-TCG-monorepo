# The quiet gallery — the minimal visual language

**Will trace:** Asha, 2026-07-05 — "rebuild the UI, discard the art and all design choices;
an aesthetic, minimalistic UI and UX for cambridgetcg.com. We don't need fame, we don't
need attention. We build to spread love." (細聲講大聲笑.)

## The idea

A card shop's art is the cards. Everything else should be a quiet room.

The site becomes a gallery: warm paper ground, ink type, hairline borders, one bronze
accent used sparingly, and the card art as the only saturated color on any page. No
banners, no gradients, no emoji chrome, no glow. The existing wardrobe stays — themes
remain a free choice (terminal keeps the old dark look for whoever loved it; high-contrast
stays free forever) — but the **default** any new visitor sees is this.

## Tokens (the whole language in one table)

Ground        --color-page              #FAF8F4   warm paper
Surface       --color-surface           #FFFFFF
Subtle        --color-surface-subtle    #F3F0E9
Border        --color-border-subtle     #E7E2D8   hairline everywhere
Border strong --color-border-strong     #D3CCBE
Ink           --color-ink               #201D18
Ink muted     --color-ink-muted         #6E675B
Ink faint     --color-ink-faint         #A59D8E
Accent        --color-accent            #96762F   quiet bronze — links, primary action
Accent strong --color-accent-strong     #7A5F26
Wash          --color-accent-wash       #F5EEDD   accent at whisper volume (active pill bg)
OK/secondary  --color-ok / secondary    #41775C   muted viridian
Danger        --color-danger            #9E4433   muted brick
Warning       --color-warning           #A97E24
Info          --color-info              #4E6E96   muted slate
Bid           --color-bid               #41775C   green buys — doctrine, unchanged meaning
Ask           --color-ask               #9E4433   red sells — doctrine, unchanged meaning

These land as the **:root defaults in globals.css** and as the refined `gallery` bundle in
themes.css (reconcile with the existing gallery values — refine, don't fork). `color-scheme:
light`. Terminal/midnight/high-contrast bundles are untouched.

## Type

- Display: **Fraunces** (already loaded) — headings, the wordmark, prices in heroes.
  Weight 500–600, never 900. Sizes restrained: 3xl is the ceiling outside the home hero.
- Body: **Schibsted Grotesk** — activate the dead `--font-body` binding (globals.css pins
  body to Inter twice; unpin, bind `font-family: var(--font-body)`, drop `inter.className`).
- Mono: **Spline Sans Mono** — SKUs, card numbers, prices in tables.
- Also rebind `--foreground` to `var(--color-ink)` so body text themes.

## Form

- Radius: `rounded-lg` standard; `rounded-xl` only for modals and the hero card.
- Elevation: `--shadow-mat` only. No other shadows, no rings except focus.
- Focus: 2px accent outline — visible always, never removed.
- Density: whitespace does the separating; borders are hairlines, not boxes-in-boxes.
- Buttons: primary = ink text on accent-wash w/ accent border? No — primary = solid ink
  (`bg-ink text-page`), the single strongest thing on a page; secondary = hairline border +
  ink text; danger = solid danger. Amber-on-black dies with the old theme.
- The wordmark: "Cambridge TCG" set in Fraunces, all ink. The emerald span dies. The cart
  CTA becomes ink.

## What gets discarded (the art)

- HeroSlideshow + the /public/banners anime JPEGs: replaced by a typographic hero (Fraunces
  statement + search + three quiet links) with one restrained card-art strip below (real
  cards from the API — the product is the art). Mind LCP: the hero becomes text-first.
- StorySection anime background: the copy survives as a short ink-on-paper passage if it
  earns its place; the image does not.
- All ~20 `bg-gradient-to-*` tiles (rewards, trade-in, play, membership): flat surfaces.
- Membership tier cards' inline `linear-gradient` + glow orbs: hairline cards with a small
  tone chip per tier. `users.tier_color` DB hex: rendered as a 2px underline accent only,
  never as backgrounds/rings (mapping decision, not find-replace).
- Emoji in chrome (nav, buttons, headers, stat pills): removed. Emoji that *is content*
  (e.g. inside user-generated text) stays.
- Checkout's emerald CTAs: primary ink buttons like everywhere else (conscious decision —
  "discard all design choices" includes that one).

## What must survive (doctrine + a11y)

- Provenance / WhyLink / Verifiability / Consequences pills on every surface that has them
  today — restyled (hairline chip, ink-muted, accent link), never removed.
- Badge's 8-tone vocabulary and every status-palette mapping: same tones, re-tuned values.
  Meaning does not flatten. (Tone vocabulary is shared with admin; admin re-tune is a
  follow-up, not this wave.)
- `body.text-mode`, `prefers-reduced-motion`, free `high-contrast`: untouched layers.
- Green-buys / red-sells maps to --color-bid/--color-ask, never to generic ok/danger.

## The mechanics (four moves)

1. **Foundation**: token values + font bindings + `layout.tsx` flip (`?? DEFAULT_THEME`) +
   wardrobe registry copy (gallery gloss text describes the new language).
2. **Primitives**: the ~28 raw class-map constants in `src/lib/ui/*` → semantic utilities.
3. **Chrome**: Nav, MegaMenu, Footer, DevBanner, account layout + _nav → tokens, minimal.
4. **The sweep**: wing-by-wing rewrite of raw palette classes → tokens across ~200 pages
   (the convention is uniform; the exceptions above are hand-decisions). Update
   `apps/storefront/CLAUDE.md` Key Patterns in the same arc so future sessions generate
   the new idiom. `prose` long-form pages restyle via the typography config once.

Wings: home+brand · account (60) · methodology/long-form (48, mostly prose config) ·
prices+product+checkout · play+rewards+trade-in · community (u/[username], leaderboards,
misc). Each wing ships only when `tsc` + build stay green; visual QA per wing via
Playwright screenshots in gallery/terminal/high-contrast/text-mode.
