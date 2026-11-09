# Credits

Who made each asset, with what, and under which licence. Where an agent made something, the line says so, with its
runtime and session if known; anything published under Yu's accounts carries that through. A git author name is not
proof of who made a file (agents have committed under Yu's name): read the commit message too. If a maker isn't
known, write "not recorded" rather than guessing.

## Assets

| Asset | Made by | Date | Tools | Notes |
|---|---|---|---|---|
| `kit/` (generated) | an agent (Claude Code, Claude Opus 5.5), committed under the git name zerone | 2026-10-21; rebuilt 2026-10-27 | artcraft-brand brandkit.py 1.8, vectorcraft-cli 0.17.0 | built from `brand.json` and the mark SVGs; 269 checks, 0 failed, and a second build from `kit/source/` byte-identical, 71 files (commit 01a4cb59). The look is Yu's choice of 2026-10-27; see `brandkit.json` |
| `cambridge-tcg-mark.svg`, `cambridge-tcg-mark-small.svg`, `cambridge-tcg-mark-nav.svg` | the same agent, redrawing the nav's card-and-pip mark from `Nav.tsx` on a pixel grid | 2026-10-21; recoloured bronze 2026-10-27 | by hand | commits 6dca91ad and 01a4cb59. Who first drew the nav mark is not recorded here |
| `marketplaces/` (eBay logo and billboards) | the same agent, made from `kit/` by `marketplaces/build.py` | 2026-10-21; rebuilt 2026-10-27 | `marketplaces/build.py` | uploading them to the shops is Yu's hand |

## Build fonts

Fonts the kit's build or a media recipe needs (also listed under `build.fonts` in `brandkit.json`).

| Family | File | Licence | Source | SHA-256 |
|---|---|---|---|---|
| Fraunces (variable; wordmark and share card) | `Fraunces[SOFT,WONK,opsz,wght].ttf` | SIL OFL 1.1 | google/fonts `ofl/fraunces` | `177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb` |
| JetBrains Mono Regular (colour sheet labels) | bundled with vectorcraft-cli | SIL OFL 1.1 | https://github.com/JetBrains/JetBrainsMono | not recorded (inside the CLI) |

## Page fonts

Fonts the pages load at run time or fetch at build (Google Fonts, `next/font`): no file to hash.

| Family | Loaded from | Licence |
|---|---|---|
| Fraunces, Inter, Schibsted Grotesk, Spline Sans Mono | `next/font/google` in `src/app/layout.tsx` | SIL OFL 1.1 (Google Fonts) |

## Images and other material

Emoji and system-drawn glyphs are drawn by the visitor's device: list them as "system-drawn, not an asset".

| Item | Maker | Licence | Source |
|---|---|---|---|
| none: the kit uses no photographs or third-party artwork | | | |
