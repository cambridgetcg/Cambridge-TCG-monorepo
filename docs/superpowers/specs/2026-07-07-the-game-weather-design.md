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

Mechanics, following `.wardrobe-aura`'s solved stacking:

```css
.wardrobe-weather { position: relative; }
.wardrobe-weather > * { position: relative; z-index: 1; }
.wardrobe-weather::before {
  content: ""; position: absolute; inset: 0;
  pointer-events: none; z-index: 0; opacity: 0;
  background-color: color-mix(in srgb, var(--color-ink) N%, transparent);
  mask-image: url("data:image/svg+xml,…");   /* geometry only */
  mask-repeat: repeat; mask-size: <tile>;
}
```

- **Colour is always a token.** The SVG data-URIs carry *shape only* — used as
  alpha masks, painted with `color-mix` of `--color-ink`. Fill keyword is
  `black` (never hex — the manga section's no-hex test stays green). The
  weather re-inks itself per theme for free: ink by day, moonlight ink at
  midnight, invisible wherever the layer is gated off.
- **Volume:** whisper. Gated opacity like the aura — `gallery`/`system` at
  0.5–0.6 of the aura's day volume (weather is ground, aura is event);
  `midnight` a little braver, matching the heavier night screentone.
- **Gating:** texture appears only under `[data-theme="gallery"|"midnight"|"system"]`.
  Base opacity is 0 — terminal and high-contrast never see the weather (same
  law as every manga material).
- **The weather never moves.** No animation, no transition, ever — this is the
  layer's one hard promise (motion doctrine: it is ground, not gesture). Pinned
  by test.
- **`dragon-ball` variant** uses a still `repeating-conic-gradient(from … at
  50% 100%)` of the same `color-mix` ink as its background (no mask tile),
  with a `linear-gradient` mask dissolving upward — the aura rose, and stopped.
- **text-mode** kills `.wardrobe-weather::before` by name in `globals.css`
  (content: none + mask-image: none), joining the existing pseudo-element kill
  list.
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
2. **Market browse — `MarketBrowser`.** When `query.game` is a recognised
   slug, the results region wears that game's weather. The default/all view
   stays bare (no game, no weather).
3. **The card's stage — `/product/[sku]` + `/market/[sku]`.** The image-column
   that already holds panel + aura gains the game's weather behind it, from
   `gameFromSku` (product page already computes `gameSlug`; CardMarketClient
   already receives `game`). SEALED- SKUs derive null → no weather, honestly.
4. **The price guide — `/prices/[game]`.** The page's header band wears the
   game's weather.

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
- text-mode kills `.wardrobe-weather::before` in globals.css.

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
