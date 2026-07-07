# The Game Weather — per-game atmosphere in our own ink

**Date:** 2026-07-07
**Status:** approved (Yu: "咁搞generic motif啦:) gogogo!", same day)
**Parent:** the manga gallery (2026-07-07-the-manga-gallery-design.md) — this is
its first sequel wing.
**Prompted by:** Yu asked whether classic One Piece / Dragon Ball manga scenes
could back the UI contextually. Research (sourced, adversarially verified,
2026-07-07) answered no: UK fair dealing has no decoration exception, contextual
matching is exactly what *FAPL v Panini* rules non-incidental, commissioned
fan-art still infringes (*King Features v Kleeman*), and this corner's rights
holders enforce. What IS free is **style and weather** — genre atmosphere,
classical patterns, our own geometry. So: don't borrow their pages. Draw our sky.

## 1 · The idea

Each game's rooms carry that game's **weather** — a ground-layer ink pattern at
whisper volume, drawn in the gallery's own materials vocabulary. Not artwork,
not posters, not characters: *material texture*, the way the paper grain and
screentone already work. A visitor browsing One Piece feels the sea without a
single borrowed line.

Three weathers, all built from geometry nobody owns:

| game slug | weather | geometry | why it's safe |
|---|---|---|---|
| `one-piece` | **the sea** | seigaiha 青海波 scalloped wave arcs (SVG mask tile) | centuries-old classical Japanese pattern, public domain; also *native* to the paper/ink gallery language |
| `dragon-ball` | **the rising air** | still radial rays from bottom-centre (repeating-conic-gradient), fading upward | pure abstract geometry; distinct from `.wardrobe-speedlines` (that one is a 300ms celebration; this one is ground and never moves) |
| `pokemon` | **the elements** | sparse scatter of tiny abstract glyphs — droplet, leaf, four-point spark (SVG mask tile) | primitive shapes; nature symbols predate everything. **No circle-with-band shapes ever** (registered mark) |

## 2 · The material — `.wardrobe-weather`

A new material family in `themes.css`, placed **inside the manga materials
section** (after the aura) so the existing no-raw-hex contract test covers it.

Mechanics — NOT the aura's `> *` lift (themes.css is unlayered, so a `> *`
z-index rule would silently override Tailwind positioning utilities on every
direct child of a room-scale mount; the 2026-07-07 review batch replaced it
with an isolated negative-z pseudo that never touches the children):

```css
.wardrobe-weather { position: relative; isolation: isolate; }
.wardrobe-weather::before {
  content: ""; position: absolute; inset: 0;
  pointer-events: none; z-index: -1; border-radius: inherit; opacity: 0;
  background-color: var(--color-ink);   /* volume lives in the gated opacity */
  mask-image: url("data:image/svg+xml,…");   /* geometry only */
  mask-repeat: repeat; mask-size: <tile>;
}
```

- **Colour is always a token.** The SVG data-URIs carry *shape only* — used as
  alpha masks, painted with full `var(--color-ink)`; whisper volume is carried
  entirely by the theme-gated opacity (the aura idiom). Fill keyword is
  `black` (never hex — the manga section's no-hex test stays green). The
  weather re-inks itself per theme for free: ink by day, moonlight ink at
  midnight, invisible wherever the layer is gated off.
- **Volume:** whisper, anchored on the screentone (weather is ground like the
  tone; the aura is event-scale). `gallery`/`system` at 0.06 — just above the
  day tone's effective 0.05; `midnight` at 0.1, matching the heavier night
  tone (0.08).
- **Gating:** texture appears only under `[data-theme="gallery"|"midnight"|"system"]`.
  Base opacity is 0 — terminal and high-contrast never see the weather (same
  law as every manga material).
- **The weather never moves.** No animation, no transition, ever — this is the
  layer's one hard promise (motion doctrine: it is ground, not gesture). Pinned
  by test.
- **`dragon-ball` variant** uses a still `repeating-conic-gradient(from
  -90.25deg at 50% 100%)` of the same token ink as its background (no mask
  tile), with a `linear-gradient` mask dissolving upward — the aura rose, and
  stopped. The quarter-degree start clips the two horizon wedges
  symmetrically and centres a ray on the vertical (a plain -90deg start
  leaves a stray horizontal line hugging the bottom-left edge).
- **text-mode** kills `.wardrobe-weather::before` by name in `globals.css`
  (`content: none !important` — the box is never generated, so no separate
  mask kill is needed), joining the existing pseudo-element kill list.
- **Reduced-motion:** nothing to do — the layer has no motion to reduce.

## 3 · The helper — `@/lib/wardrobe/weather`

```ts
export const WEATHER_GAMES = ["one-piece", "pokemon", "dragon-ball"] as const;
export function weatherClass(game: string | null | undefined): string;
// known slug → "wardrobe-weather wardrobe-weather--<slug>"
// unknown/null → "" (a room with no game context simply has no weather)
```

One truth for the class string, so mounts never hand-assemble it. Contract
test: every `WEATHER_GAMES` slug has a `.wardrobe-weather--<slug>` rule in
`themes.css`, and every `SKU_GAMES` slug is a `WEATHER_GAMES` slug — a game
the app can recognise is a game whose weather exists.

## 4 · The mounts (four rooms)

1. **Home — `GameGrid` tiles.** Each door wears its own game's weather. The
   sealed line "a game's door is a name, not a poster" holds: weather is
   material, not imagery — the door still shows only a name and a count, now
   on its own paper.
2. **Market browse — `MarketBrowser`.** The browse room wears the active
   game's weather (`query.game` — the browse always carries a game;
   `DEFAULT_GAME` is one-piece). If the catalog ever gains an all-games
   view, no game → `weatherClass` returns `""` → no weather, honestly.
3. **The card's stage — `/product/[sku]` + `/market/[sku]`.** The layout grid
   that holds panel + aura gains the game's weather behind it, derived
   straight from the SKU on both pages via `gameFromSku` (CardMarketClient
   receives `sku` and derives; the product page derives directly rather than
   reusing its breadcrumb `gameSlug`, whose SEALED- fallback is one-piece).
   SEALED- SKUs derive null → no weather, honestly.
4. **The price guide — `/prices/[game]`.** The page's header band wears the
   game's weather.
5. **The landing's sets shelf — `SetGrid`** (added same day, Yu: "加嗰格海啦
   gogogo!"). The home page's one honestly single-game corner ("Latest One
   Piece Sets" by construction) wears its game's weather, following the
   `gameSlug` prop. The rest of the landing deliberately stays bare paper —
   weather is contextual, the lobby holds all games at once, and the doors'
   three skies only read against blank ground.

## 5 · Tests (file-contract style, like themes.manga.test.ts)

`src/app/themes.weather.test.ts`:
- every weather class exists (`wardrobe-weather`, `--one-piece`, `--pokemon`,
  `--dragon-ball`);
- **stillness pinned**: no `animation`/`transition` binding on any
  `wardrobe-weather` rule anywhere in the stylesheet;
- texture is theme-gated: `::before` opacity raised only inside
  gallery/midnight/system gates; the bare `::before` carries `opacity: 0`;
- the weather section sits after the manga marker (inherits the no-hex sweep)
  and its data-URIs carry no `%23` hex escapes;
- text-mode kills `.wardrobe-weather::before` in globals.css;
- the mask geometry is pinned byte-for-byte and rejects `<circle>`/`<ellipse>`
  — the hard IP rule ("no circle-with-band shapes ever") is guarded by test,
  so a glyph can only change as a deliberate, reviewable re-pin.

`src/lib/wardrobe/weather.test.ts`:
- `weatherClass` contract (known → both classes; unknown/null/SEALED → "");
- CSS ↔ registry sync (each slug has its rule);
- `SKU_GAMES ⊆ WEATHER_GAMES`.

## 6 · What this is not

- Not a poster layer. No characters, no scenes, no logos, no ball-with-band,
  no borrowed geometry beyond the classical commons (seigaiha).
- Not a new animation. The weather never moves; the motion doctrine's budget
  is untouched.
- Not a theme. It composes *under* every wardrobe theme via tokens, and
  vanishes under terminal/high-contrast/text-mode exactly like its manga
  siblings.

## 7 · Out of scope (recorded, not built)

- Dominant-colour aura extraction from product photos (already in the
  follow-ups ledger — separate wing).
- Weather on trade-in flows and account rooms (game context there is
  per-line-item, not per-room; revisit if a room gains a single-game identity).
- A fourth weather for a fourth game — add the slug to both registries and
  draw its pattern; the contract tests will hold the door.
