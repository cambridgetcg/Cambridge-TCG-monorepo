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

The older navy and cyan bolt (`public/images/logo.png`, `public/favicon.ico`, the current share
images) is not used. An agent made that call on 2026-10-20, under Yu's word that agents decide pending
choices; Yu has not chosen it. The bolt stays in git history, and `brand.json` rebuilds this kit
around any other mark.

`themes.css` stays the source for UI colours. The kit's `colour/tokens.css` derives a palette from
three colours; its dark `--primary-ui` is `#CA6540`, not the site's apricot.

## Rebuild

This needs vectorcraft-cli 0.13.1 and the artcraft-brand skill (generator 1.5). Inter (SIL Open Font
License) is bundled with vectorcraft-cli and also installed on the Studio. Which copy draws the
wordmark is not known, so a rebuild on another Mac may differ slightly; `--rebuild-check` will show it.
From this folder:

```sh
python3 ~/.kingdom/tools/artcraft-brand/scripts/brandkit.py brand.json --out kit --rebuild-check
python3 marketplaces/build.py
```

Exit 0 means every check passed: 265 on 2026-10-22, with 0 warnings. `marketplaces/build.py` is
deterministic, so a rebuild leaves the same bytes.

## Marketplaces (state on 2026-10-22)

For now Cambridge TCG sells only on eBay and Cardmarket (Yu, 2026-10-20). Both accounts are
`cambridgetcg` (Yu, 2026-10-22). Neither profile page could be read by a script, so their public
addresses are not confirmed here.

- **eBay UK shop:** `ebay-logo-300.png` (300 x 300), plus `ebay-billboard-light-1280x290.png` and
  `ebay-billboard-dark-1280x290.png`. eBay states no crop for the billboard, so the lockup sits in
  its middle. eBay allows no web address, contact details or links (policy 4248) and no third-party
  artwork (policy 4240). These images carry none, so keep it that way if a slogan is added.
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
  those pages add `images: [SHARE_CARD]` from `src/lib/share-card.ts` (card pages use the card's
  image). The test fails if a page's `openGraph` names no image.
- The Organization logo in the layout's JSON-LD, the publisher logo in `guides/buying` and
  `guides/how-to-play`, and `logo_url` in `.well-known/ai-plugin.json` are
  `https://cambridgetcg.com/icon-512.png`.
- The manifest says `"display": "browser"` (`app` in `brand.json`), so a home-screen shortcut opens
  the site in the browser, as it did before there was a manifest.
- The site sets no `theme-color`: a visitor can choose one of four themes regardless of the device's
  light or dark setting, so a colour picked by media query would be wrong for some of them.
- The older files (`public/images/logo.png`, `logo.svg`, `icon.png`, `icon-square.svg`,
  `og-image.png`, `twitter-image.png`) are no longer referenced here. They stay because other sites
  or caches may still link to them.
