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

The colours and type are the site's own "collector's desk" look (`src/app/themes.css`, from the
2026-09-29 refresh): plum ink `#2c1836` on ivory `#fbf7f1`, rust `#9b3b12` for the mark, mandarin
`#ec7838` as the highlight, and the name in Inter SemiBold. On dark grounds the mark is apricot
`#ffb078` and the name cream `#fff6e9` on midnight `#1d1425`, as the dark theme draws them.

The older navy and cyan bolt (`public/images/logo.png`, the old `favicon.ico` and the old share
images) is not used. An agent made that call on 2026-10-20, under Yu's word that agents decide pending
choices; Yu has not chosen it. The bolt stays in git history, and `brand.json` rebuilds this kit
around any other mark.

`themes.css` stays the source for UI colours. The kit's `colour/tokens.css` derives a palette from
three colours; its dark `--primary-ui` is `#CA6540`, not the site's apricot.

## Rebuild

The kit was first built on 2026-10-22 with vectorcraft-cli 0.13.1 and the artcraft-brand skill
(generator 1.5). It was rebuilt in place on 2026-10-27 with vectorcraft-cli 0.17.0 and generator
1.8, from the same `brand.json` and marks. Every image, icon and the share card came out byte for
byte the same, so the copies in `public/` did not change. What the rebuild changed:

- the files that record the build: `kit.json`, `BRAND.md`, `verify.json`, `.brandkit-fingerprint`
  and `index.html`;
- the two PDFs, whose creation date is now fixed at 2026-10-27 09:43:02 UTC (`source_date_epoch`
  in `kit.json`) and kept across in-place rebuilds;
- `brand.vectorcraft`, which vectorcraft-cli 0.17.0 saves as compact JSON on one line (3.2 MB down
  to 0.7 MB), so any later change rewrites it whole;
- `web/head-snippet.html`, which gained `<meta name="color-scheme" content="light dark">` and moved
  the Organization JSON-LD into the new `web/head-home.html` (see "On the site").

Fonts (checked 2026-10-22 on vectorcraft-cli 0.13.1 and 0.14.0; the 0.17.0 rebuild drew the same
bytes):
- The wordmark, the lockups and the share card's title use the Inter SemiBold built into
  vectorcraft-cli (Inter 4.001, SIL Open Font License). All 12 glyph outlines match it and not the
  copy installed on the Studio, so they come out the same on any Mac.
- The share card's subtitle and footer are in Inter Light, which vectorcraft-cli does not bundle.
  They come from the copy installed on the Studio, so another Mac needs Inter Light installed and
  may draw them slightly differently; `--rebuild-check` will show it.

From this folder:

```sh
python3 ~/.kingdom/tools/artcraft-brand/scripts/brandkit.py brand.json --out kit --rebuild-check
python3 marketplaces/build.py
```

Exit 0 means every check passed: 269 on 2026-10-27, with 0 warnings (265 on 2026-10-22).
`--rebuild-check` builds the kit a second time in a temp folder and compares every file, the PDFs
included. The previous kit goes to the Trash; where `trash` is missing or `ARTCRAFT_NO_TRASH=1`
is set it is kept at `kit/.replaced/` instead, which git does not ignore, so leave it out of a
commit. `marketplaces/build.py` is deterministic, so a rebuild leaves the same bytes.

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
    today #fbf7f1 in a light scheme and #1d1425 in a dark one, the same pair as
    `kit/web/head-snippet.html`) and `color-scheme: light dark`;
  - a saved theme (Light, Dark, Terminal or High contrast): that theme's page ground as one colour,
    and its own scheme, because a saved theme can disagree with the device. The kit's pair alone
    would give Dark on a light phone an ivory bar; that is why the pages set no theme-color until
    2026-10-27.

  The Nav's lights switch changes the theme without a reload, so `src/lib/wardrobe/flip.ts`
  rewrites the same tags when it flips. `<html>` keeps the flip across client navigations, but
  Next's router cache brings back a route's head as it was rendered (Back, Forward), so the Nav
  also holds the tags to the theme `<html>` wears whenever they change. An agent chose this
  cookie-aware form on 2026-10-27 while wiring the kit (Yu: "yes, go ahead and wire the kits into
  the sites"); the plain pair is the simpler alternative. The manifest's `theme_color` (#FBF7F1)
  only colours an installed app window, which `"display": "browser"` never opens.
- The older files (`public/images/logo.png`, `logo.svg`, `icon.png`, `icon-square.svg`,
  `og-image.png`, `twitter-image.png`) are no longer referenced here. They stay because other sites
  or caches may still link to them.
