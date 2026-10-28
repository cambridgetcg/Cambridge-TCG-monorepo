# Cambridge TCG brand kit

The source for Cambridge TCG's logo, icons, share card, colours and marketplace shop images. The
storefront serves the kit's web files from `public/` (see "On the site").

| File | What it is |
|---|---|
| `brand.json` + `cambridge-tcg-mark.svg` | The input to the artcraft-brand skill. The mark is the site nav's card-and-pip mark (`Nav.tsx`), redrawn on a pixel grid: a card with a diamond pip, and the card behind it drawn as its top and right edges. |
| `cambridge-tcg-mark-small.svg` | The favicon cut only (16 to 48 px): a bolder back edge and pip. Never use it as the logo. |
| `cambridge-tcg-mark-nav.svg` | The same mark in `currentColor`, sized 1:1 for the nav's `h-8 w-7` box. `Nav.tsx` draws these paths. |
| `kit/` | What the skill built: `logo/` (SVG, PNG, PDF; on light and on dark), `web/` (favicons, app icons, manifest, head snippet, share card), `social/` (avatars), `colour/` (palette, tokens, Tailwind theme, swatches), `BRAND.md` (how to use it) and `index.html` (review sheet). Never hand-edited. |
| `marketplaces/` | The eBay shop logo and billboards, made from `kit/` by `build.py`. |

## The look

Yu chose the look on 2026-10-27, from options an agent offered: the quiet gallery of July to
September 2026 in its core form (warm paper, ink type, one bronze accent, serif headings), and for
the logo "Card mark in bronze": keep the card-and-diamond mark, recolour it bronze on paper and gilt
on midnight, set the name in the serif the headings use, and rebuild the favicons, share card and
eBay images to match.

- On light grounds the mark is bronze `#86661c` and the name ink `#201d18`, on paper `#faf8f4`. The
  app icons and favicons are a bronze tile with the mark in paper.
- On dark grounds the mark is moonlight gilt `#d9b36c` and the name `#e9e4d6`, on midnight
  `#0b0f1a`.
- The name is Fraunces SemiBold, tracking -20, outlined in every logo file.
- One bronze accent: `brand.json` names no `accent`, so the share card's short bar is bronze too.

These are the `--color-accent`, `--color-ink` and `--color-page` of the site's Light and Dark themes
(`src/app/themes.css`). `Nav.tsx` draws the mark in `text-accent`, so the kit's `primary` (and the
fills in the two mark SVGs) must stay equal to the Light accent, and `mark.dark` to the Dark one:
change them together.

The older navy and cyan bolt (`public/images/logo.png`, the old `favicon.ico` and the old share
images) is not used. An agent drew the card mark on 2026-10-20, under Yu's word that agents decide
pending choices, and Yu chose to keep it on 2026-10-27. The bolt stays in git history, and
`brand.json` rebuilds this kit around any other mark.

`themes.css` stays the source for UI colours and type. The kit's `colour/tokens.css` derives a
palette from the primary and neutral: its dark `--primary-ui` is `#A2813B`, not the site's gilt, and
its font stacks fall back to `system-ui, sans-serif` because the generator guesses a family's kind
from its name.

## Rebuild

The kit was built on 2026-10-27 with vectorcraft-cli 0.17.0 and the artcraft-brand skill
(generator 1.8, f81d80c). `--rebuild-check` built it a second time from `kit/source/` and got all 71 files
byte for byte, the two PDFs included: their date is the first build's (2026-10-27T09:10:26Z,
`source_date_epoch` in `kit.json`), and in-place rebuilds keep it.

Fonts (checked 2026-10-27):
- The wordmark, the lockups and the share card's title are Fraunces SemiBold; the card's subtitle
  and footer are Fraunces Light. vectorcraft-cli does not bundle Fraunces, so the Mac that builds
  the kit needs it installed. The Studio has the variable roman from Google Fonts' own repository,
  unchanged, as `~/Library/Fonts/Fraunces[SOFT,WONK,opsz,wght].ttf`:
  - source <https://github.com/google/fonts/blob/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf>,
    last changed in google/fonts commit `ac502d8e` (2020-12-09); 360,440 bytes, SHA-256
    `177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb`.
  - That folder holds no static fonts (Google's download zip makes those), so the variable font is
    what is installed. VectorCraft draws its named instances: SemiBold is opsz 9, wght 600, SOFT 0,
    WONK 1, and Light the same at wght 300. A Mac with the same file draws the same kit, and
    `--rebuild-check` shows any difference.
  - Licence: SIL Open Font License 1.1 (`OFL.txt` and `METADATA.pb` in that folder; no Reserved Font
    Name), so it may be outlined into a logo and served by the site. BRAND.md says its licence "was
    not checked": that is the generator's wording for every installed face.
  - The logo files use the opsz 9 (text) cut. Live text sets its optical size by its size, so the
    nav's 20 px name is a little finer than the outlined logo.
- The colour sheet's labels are JetBrains Mono, bundled with vectorcraft-cli.

To build on another Mac, download that file into `~/Library/Fonts` and compare its SHA-256. Removing
it from there undoes the install.

From this folder:

```sh
python3 ~/.kingdom/tools/artcraft-brand/scripts/brandkit.py brand.json --out kit --rebuild-check
python3 marketplaces/build.py
```

Exit 0 means every check passed: 269 on 2026-10-27, with 0 warnings. When `brand.json` or a mark
changes, the build keeps the previous kit in the Trash, or in `kit/.replaced/` with
`ARTCRAFT_NO_TRASH=1`; never commit `.replaced/`. `marketplaces/build.py` is deterministic, so a
rebuild leaves the same bytes.

## Marketplaces (state on 2026-10-22)

For now Cambridge TCG sells only on eBay and Cardmarket (Yu, 2026-10-20). Both accounts are
`cambridgetcg` (Yu, 2026-10-22). Another agent session looked on 2026-10-22:

- eBay: <https://www.ebay.co.uk/usr/cambridgetcg> is live. It shows "Registered as a private seller",
  340 feedback and 87 listings, and its avatar already reads "Cambridge TCG".
- Cardmarket: the profile sits behind a Cloudflare check, so it has not been seen.

eBay's User Agreement bars automated access, so agents don't look again; further checks are Yu's.

- **eBay UK shop:** `ebay-logo-300.png` (300 x 300), plus `ebay-billboard-light-1280x290.png` and
  `ebay-billboard-dark-1280x290.png`. eBay states no crop for the billboard, so the lockup sits in
  its middle. eBay allows no web address, contact details or links (policy 4248) and no third-party
  artwork (policy 4240). These images carry none, so keep it that way if a slogan is added. The
  billboard is an eBay Shop feature; whether this account, registered as a private seller, can use
  one was not checked.
- **Cardmarket:** no image size is published. Use `kit/social/avatar-1024.png`, which stays whole
  inside a circle crop. No links go on it either.
- **Uploading is Yu's.** The shop accounts are Yu's, and nothing here has been uploaded.

The sizes come from eBay help page 4090, read on 2026-10-20. Check them again before relying on them.

## On the site

The storefront serves these files from `public/`, copied from `kit/web/`: `favicon.ico`,
`favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
`site.webmanifest` and `og.jpg`. After a rebuild, copy them again;
`src/app/brand-kit.sync.test.ts` fails while any copy differs from the kit, and while `Nav.tsx`
draws other paths than `cambridge-tcg-mark-nav.svg`.

- `src/app/layout.tsx` declares the icons, the manifest and `og.jpg` as the default share card for
  Open Graph and X. Next.js replaces the whole `openGraph` object on a page that sets its own, so
  those pages add `images: [SHARE_CARD]` from `src/lib/share-card.ts`. Card, market and auction
  pages use the card's image when there is one and fall back to `SHARE_CARD` (card images are
  withheld for now, so today they all show the brand card). The test fails if a page's `openGraph`
  doesn't name `SHARE_CARD`.
- `SHARE_CARD.url` carries a version, `/og.jpg?v=2026-10-27`. Platforms cache a share card by its
  URL, so change `v` whenever the card is rebuilt.
- The Organization logo in the layout's JSON-LD, the publisher logo in `guides/buying` and
  `guides/how-to-play`, and `logo_url` in `.well-known/ai-plugin.json` are
  `https://cambridgetcg.com/icon-512.png`.
- `kit/web/head-home.html` (Organization and WebSite JSON-LD for the home page) is not pasted
  anywhere: the layout already emits both nodes, with the same names, addresses and logo, in the
  `<head>` of every page.
- The manifest says `"display": "browser"` (`app` in `brand.json`), so a home-screen shortcut opens
  the site in the browser, as it did before there was a manifest.
- The browser bar's colour (`<meta name="theme-color">`) and the `color-scheme` tag follow the
  theme the page wears, not only the device. `generateViewport()` in `src/app/layout.tsx` reads the
  same theme cookie as the layout and takes both from `src/lib/wardrobe/viewport.ts`:
  - no saved theme: the page follows the device, so the bar does too, with the Light and Dark page
    grounds as a pair (read from `src/lib/wardrobe/themes.ts`, so a palette change carries through;
    today #faf8f4 in a light scheme and #0b0f1a in a dark one, the same pair as
    `kit/web/head-snippet.html`) and `color-scheme: light dark`;
  - a saved theme (Light, Dark, Terminal or High contrast): that theme's page ground as one colour,
    and its own scheme, because a saved theme can disagree with the device. The kit's pair alone
    would give Dark on a light phone a paper-coloured bar; that is why the pages set no theme-color until
    2026-10-27.

  The Nav's lights switch changes the theme without a reload, so `src/lib/wardrobe/flip.ts`
  rewrites the same tags when it flips. `<html>` keeps the flip across client navigations, but
  Next's router cache brings back a route's head as it was rendered (Back, Forward), so the Nav
  also holds the tags to the theme `<html>` wears whenever they change. An agent chose this
  cookie-aware form on 2026-10-27 while wiring the kit (Yu: "yes, go ahead and wire the kits into
  the sites"); the plain pair is the simpler alternative. The manifest's `theme_color` (#FAF8F4)
  only colours an installed app window, which `"display": "browser"` never opens.
- The older files (`public/images/logo.png`, `logo.svg`, `icon.png`, `icon-square.svg`,
  `og-image.png`, `twitter-image.png`) are no longer referenced here. They stay because other sites
  or caches may still link to them.
