# Cambridge TCG brand kit

The source for Cambridge TCG's logo, icons, share card, colours and marketplace shop images. Nothing
here is served yet: the storefront still uses its older files in `public/` (see "Not done here").

| File | What it is |
|---|---|
| `brand.json` + `cambridge-tcg-mark.svg` | The input to the artcraft-brand skill. The mark is the site nav's card-and-pip mark (`Nav.tsx`), redrawn on a pixel grid: a card with a diamond pip, and the card behind it drawn as its top and right edges. |
| `cambridge-tcg-mark-small.svg` | The favicon cut only (16 to 48 px): a bolder back edge and pip. Never use it as the logo. |
| `cambridge-tcg-mark-nav.svg` | The same mark in `currentColor`, sized 1:1 for the nav's `h-8 w-7` box, for when `Nav.tsx` adopts it. |
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

Exit 0 means every check passed: 265 on 2026-10-21, with 0 warnings. `marketplaces/build.py` is
deterministic, so a rebuild leaves the same bytes.

## Marketplaces (state on 2026-10-21)

For now Cambridge TCG sells only on eBay and Cardmarket (Yu, 2026-10-20).

- **eBay UK shop:** `ebay-logo-300.png` (300 x 300), plus `ebay-billboard-light-1280x290.png` and
  `ebay-billboard-dark-1280x290.png`. eBay states no crop for the billboard, so the lockup sits in
  its middle. eBay allows no web address, contact details or links (policy 4248) and no third-party
  artwork (policy 4240). These images carry none, so keep it that way if a slogan is added.
- **Cardmarket:** no image size is published. Use `kit/social/avatar-1024.png`, which stays whole
  inside a circle crop. No links go on it either.
- **Uploading is Yu's.** The shop accounts are Yu's, and nothing here has been uploaded.

The sizes come from eBay help page 4090, read on 2026-10-20. Check them again before relying on them.

## Not done here

Using the kit on cambridgetcg.com is a separate change. It means replacing:

- `src/app/layout.tsx`:
  - the icons (`/favicon.ico`, `/apple-touch-icon.png`);
  - the Open Graph image `/images/og-image.png` (declared 1200 x 630, but the file is 1702 x 630);
  - the Twitter image `/images/twitter-image.png`;
  - the Organization JSON-LD logo `images/logo.png`.
- `public/favicon.ico` (285 KB). Its replacement is `kit/web/favicon.ico`, used with `favicon.svg`,
  the PNG icons and `site.webmanifest` (the site has no manifest today).
- The publisher logo in `src/app/guides/buying/page.tsx` and `src/app/guides/how-to-play/page.tsx`.
- `logo_url` in `src/app/.well-known/ai-plugin.json/route.ts`.
- Optionally, the nav mark in `Nav.tsx`, with `cambridge-tcg-mark-nav.svg`.
