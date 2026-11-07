# Quiet gallery return — 2026-10-27

This is a local source record for branch `feat/storefront-quiet-gallery`, cut
from `origin/main` at `3005b153`. When this was written nothing had been
committed, pushed or deployed. It does not establish production deployment.

## What Yu asked

Yu, 2026-10-26/27, in a Claude Code session:

> "CambridgeTCG frontpage and UI colourcode need an update. I am thinking of
> following the older version and pick up from the stylistic choices there for
> an update."

An agent then offered options, and Yu chose:

- Older look: **"Quiet gallery (Jul–Sep)"**.
- How much character: **"Core look"**. The option read: warm paper, ink type,
  one bronze accent, serif (Fraunces) headings, soft mats with a gentle shadow,
  hairline dividers, solid-ink buttons, and midnight blue with gilt for dark
  mode; calm and readable, nothing moves. Not chosen: 明朝 vertical marks,
  第 NN plates, ✦ benedictions, paper grain, screentone, the breathing h1,
  painted walls, game weather and hover frames.
- Front page: **"Today's content, gallery style"**. Today's message and order
  stay (headline, card search, the Sharaku print, the four foundations), with
  a serif headline, the search in a mat and the print in a plain frame with a
  wall label.
- Logo: **"Card mark in bronze"**. The card-and-diamond mark stays, bronze on
  paper and gilt on midnight, with the wordmark in the serif. Favicons, the
  share card and the eBay images are rebuilt to match.

The option wording is the agent's; the choices are Yu's. Everything else here
(token values, the departures below) is agents' judgement and says so.

## What changed

- **Tokens** (`src/app/themes.css`): Light is paper `#faf8f4`, ink `#201d18`
  and bronze `#86661c`; Dark is midnight `#0b0f1a`, warm light `#e9e4d6` and
  gilt `#d9b36c`. Primary buttons are solid ink. Terminal and high contrast
  keep their colours and faces. The appearance registry keeps its IDs, labels
  and order, with new swatches and glosses. The full table is in the
  [interface guide](../design/interface.md).
- **Type** (`src/app/layout.tsx`): Fraunces (headings, wordmark), Schibsted
  Grotesk (text) and Spline Sans Mono (numbers, SKUs, kickers), self-hosted
  through `next/font`. Inter stays for the terminal theme and is not preloaded.
  Japanese and Chinese put the Latin face first, then system CJK faces.
- **Mats**: `shadow-mat` is the only elevation. The `.wardrobe-*` compatibility
  classes moved into Tailwind's components layer, so markup utilities such as
  `rounded-xl` refine them. Side effect: four `rounded-[3px]` panels on
  `/gallery-next-door` now show 3px corners, and existing hover fills on mats
  now show.
- **Shared chrome and primitives**: Nav (Fraunces wordmark, pill links, solid
  ink "Find a card"), More menu and mobile drawer (mats, muted small-caps
  headings), Footer (hairline, no accent bar), notifications, the site notice
  (neutral fill instead of a warning tint, 44px dismiss), Button (`rounded-lg`),
  Card, Section, ActionCard, Callout, Tabs, PlateHeader and the small doctrine
  primitives (mono kickers, `ink-muted` instead of `ink-faint` at 10–11px).
- **Home**: mono kicker; ink Fraunces headline; the finder in a mat; the print
  in a plain mount with a wall label (artist, title · year · museum record,
  credit disclosure); the foundations as a hairline grid with mono numbers;
  quiet secondary links. Copy, hrefs, ARIA, ids and order are unchanged.
- **Services**: `ServiceCards` uses the same hairline grid.
- **Brand kit** (`apps/storefront/marketing/`): `brand.json` recoloured
  (primary bronze, ink neutral, no separate accent) with a Fraunces SemiBold
  wordmark. The two mark SVGs are recoloured. The kit was rebuilt by the
  artcraft-brand generator. The eight served files were copied to `public/`.
  The eBay images were rebuilt. `SHARE_CARD.url` became
  `/og.jpg?v=2026-10-27`. The marketing README records the generator versions,
  the Fraunces source, its SHA-256 and the OFL licence.
- **Copy**: `/methodology/appearance` describes paper/ink/bronze and
  midnight/gilt, with serif headings over sans-serif text.

### After review (same day)

A review of the first build found these, and they were fixed:

- `shadow-mat` drew the Light shadow in every theme. Tailwind copies an
  `@theme` shadow's value into its utility, so the dark value never reached
  the utility, and terminal and high contrast got a soft shadow they should
  not have. Now `@theme` sets `--shadow-mat: var(--mat-shadow)` and each theme
  sets `--mat-shadow`. This fixes every existing `shadow-mat` use without
  touching page files.
- Light status tones failed 4.5:1 on their own 10–20% tints, which every
  badge, trust tier and status chip uses. They were darkened on the same hue:
  ok, bid and secondary `#36634d`, info `#415c7e`, warning `#844d16`, danger
  and ask `#953e2e`. Dark danger and ask became `#e48c7f`, because danger at
  15% failed there too. A review step first added a `themes.sync.test.ts`
  check for tone text on its own 10, 15 and 20% tints; it was taken out
  again before commit, because a new blocking check is Yu's to choose
  (AGENTS.md principle 8). It is listed below as a proposal.
- `/find` ran the new mat edge to edge. It now sits in the page container.
- Home: the help-row links and the art links use the quiet style, so bronze
  stays on the kicker, the build links, "Or browse by game" and the numbers.
  "Museum record" is inline in the wall label (a text link, not a stray small
  target). The hero columns are top-aligned, so the two kickers sit level. The
  print sits on the content edge at desktop and on the 16px gutter on phones.
  The bottom strip lost its top rule, which doubled the grid's.
- The site notice's dismiss button overlaps the gutter, so at 390px the notice
  is back to three lines.
- Navigation marks the current page with a hairline ring as well as the fill.
  On midnight the fill alone was 1.04:1.
- A focused tile in the foundations and services grids paints above its
  neighbours, so its ring shows on all four sides.
- Terminal and high contrast keep system CJK faces in Japanese and Chinese
  again. Uppercase tracking is dropped for Japanese and Chinese text.
- The selected currency's rate uses `accent-strong` (it was `accent/80`,
  3.21:1). Footer group headings wrap long words, because Spanish text mode at
  390px scrolled sideways.

### Where the build departs from its spec

- The status tones and Dark danger, and the `--mat-shadow` indirection, as
  above.
- The finder mat is written as utilities rather than `wardrobe-mat`.
- The site notice uses a neutral fill rather than QG's warning tint.
- The Light scrim is ink-toned rather than plum.
- Fraunces is installed from google/fonts' variable font, because that repo
  holds no static cuts.
- The kit was built with generator 1.7 and vectorcraft-cli 0.17.0 (the spec
  said 1.6 and 0.14.0, from the previous day's trial).
- The bottom strip has no top rule, and the help row and art links are quiet
  rather than bronze.

## Checks actually run

The first verification round ran on the build before the review fixes. The
fix pass then re-ran the checks listed after it. Every check used Node
24.22.0, a loopback server and a fixture environment: an unreachable database
and wholesale source, an ephemeral auth secret, and external requests blocked.
No provider credentials, live prices or account data were used.

Before the review fixes:

- Full storefront unit run: 321 files and 2,901 tests passed, 29 skipped.
  1 file failed with 8 failures: `src/lib/verification/browser-journey.test.ts`.
  That file launches Chromium build 1217, which is not installed on this Mac
  (only 1248 is). Its directory is unchanged from `origin/main`; CI installs
  browsers first.
- Storefront typecheck passed.
- ESLint on the 32 changed TypeScript files: no errors. There was one warning,
  at `NotificationBell.tsx:106`, on lines unchanged from main.
- `pnpm audit:tracked-secrets` passed (4,294 files). `pnpm audit:modules`
  passed.
- The production build passed. Its one Turbopack trace warning is also in the
  baseline build.
- Playwright `appearance-ui`, `entry-pages`, `responsive-ui` and
  `rebuild-foundation` passed 17 of 17 against the production server.
- Screenshots of seven pages, at 1440 and 390, light and dark, showed no
  horizontal overflow. The computed fonts and backgrounds matched the spec.
- The brand kit check passed: 268 checks, 0 failed, and 71 files
  byte-identical on rebuild. The eight served copies match the kit, and
  `brand-kit.sync.test.ts` passed.

After the review fixes:

- Targeted unit run: 17 files, 110 tests passed. It covered the theme
  sync/manga/weather tests, home, finder, nav, footer, services, brand kit,
  public claims, public discovery, the wardrobe and the roadmap.
- Full storefront unit run, in a clean environment: 2,904 tests passed, 29
  skipped. The same 8 `browser-journey` failures remain, for the same reason.
- Storefront typecheck passed.
- ESLint on the 12 files touched in the fix pass: no errors. There was one
  warning, at `CurrencySelector.tsx:206`, on a line unchanged from main.
- A Tailwind compile of `globals.css` with the app's own
  `@tailwindcss/postcss` 4.2.4 emits `.shadow-mat { --tw-shadow:
  var(--mat-shadow) … }`, and it still composes with `ring-*`.
- Playwright `appearance-ui`, `entry-pages`, `responsive-ui` and
  `rebuild-foundation` passed 17 of 17, against a loopback `next dev`
  server.
- Rendered measurements, also on `next dev`:
  - The Card number input's bottom edge is at 601 of 1000px at 1440, and at
    683 of 844px at 390, light and dark. Before the fixes it was at 676 and
    702.
  - `/find`: the mat spans 16–374px at 390, and is 704px wide and centred at
    1440.
  - The notice is three lines (79px) at 390.
  - The hero kickers are level at 1440.
  - No page scrolls sideways.
  - The computed mat shadow is the ink shadow in Light, the black shadow in
    Dark and midnight, and none in terminal and high contrast.
  - The current nav item has a 1px inset ring.
  - A keyboard-focused foundations tile shows its ring on four sides.
  - Japanese drawer headings have normal letter spacing.
  - Spanish text mode at 390 is 390px wide.
  - Terminal Japanese uses Inter, then Hiragino.
- Contrast worst cases for the new tones on their own tint, over page,
  surface, subtle and elevated surfaces:
  - Light at 20%: ok 4.55, info 4.52, warning 4.50, danger 4.52.
  - Dark danger at 20%: 4.52.
- After this record was written:
  - `pnpm docs:modules` regenerated the storefront module page.
  - `pnpm audit:modules` verified 27 modules, 9 storefront domains and 38
    pages.
  - `pnpm audit:tracked-secrets` passed on 4,294 tracked files. It checks
    supported patterns, not untracked files (this record among them) or
    history.
  - The relative links in the three changed documents resolve.
- After rebasing onto #94 (merge `9bf36ed6`, the cookie-aware theme-color),
  everything below was run on the rebased branch:
  - The kit was regenerated from this branch's `brand.json` on generator 1.8
    (269 checks, 0 warnings). It came out byte-identical to the pre-rebase
    build, and `public/` still matches it.
  - `viewport.test.ts` and `flip.test.ts` now expect the new grounds,
    `#faf8f4` and `#0b0f1a`, and the served page carries that pair.
  - The full storefront vitest run passed: 2,917 tests, 29 skipped.
  - `typecheck`, a production build, `audit:modules` and
    `audit:tracked-secrets` (4,298 files) passed.
  - The four loopback Playwright specs passed, 17 of 17.

## Skipped or failed

- The 8 `browser-journey` unit failures, explained above. Browsers were not
  installed to fix them.
- `tests/auth-magic-link.spec.ts` was not run, because it can send real email.
- The Playwright runs used a scratch config that points at the installed
  Chromium 1248. Apart from that, the config matches the repo's.
- The production build, the seven-page screenshot set and the full ESLint
  pass were not repeated after the review fixes.

## Not checked

- Safari, Firefox, and Windows or Linux font fallbacks (including Chinese TC
  versus SC faces). Only Chrome for Testing on macOS was used.
- Real browser tabs and favicon caches, iOS and Android icon masks, and live
  social previews of the new share card.
- Whether Cloudflare's edge cache delays the new `og.jpg?v=` URL after deploy.
- High contrast and terminal visuals, beyond the shadow and the terminal
  Japanese font stack.
- A full accessibility audit. The token tests cover token pairs, not every
  component with literal colours.

## Known follow-ups (not in this branch)

- `/services`, `/roadmap`, `/prices`, `/play` and `/guides` still have
  page-level sans headings, sans kickers, mint wash panels (a green-black slab
  in Dark), bronze sans step numbers and bronze guide titles. The spec kept
  page files out of scope.
- About 83 inline links across 38 files underline only on hover, so colour
  alone marks them (WCAG 1.4.1). This includes the `/prices` "Browse by game"
  link in `text-info`. The same failure exists on main.
- 18 `font-display … font-bold` uses outside the chrome render Fraunces at
  700. One example is the 12px uppercase label at `MarketBrowser.tsx:266`.
- On `/intro`, `text-ink-faint` inside the `warning/10` panel is 4.35:1;
  `text-ink-muted` would pass.
- In the terminal theme, danger text on its own tint is below 4.5:1. That
  theme was left unchanged.
- Japanese and Chinese headings fall back to system mincho or songti. That
  follows QG's shape, but it is a judgement call. Gothic is a one-line swap
  per rule in `themes.css`.
- Fraunces italic is preloaded on every route (four font preloads). Splitting
  it out would break italic matching within the family, so the cost is
  accepted for now.
- In the finder, the select is 48px tall and the input 50px. This predates
  the branch, and the fix is a font-metric magic number.
- `SHARE_CARD.url`'s `v` has to be changed by hand when `og.jpg` changes. A
  test tying `v` to the file's hash would make that a mechanism; that is a
  new guard for Yu to choose.
- Proposed guard, not added: a `themes.sync.test.ts` case holding each
  status tone's text at 4.5:1 or more on its own 10, 15 and 20% tint (Light,
  Dark, high contrast). The risk it covers: a palette change can quietly make
  every badge and status chip unreadable while the existing pairs still pass,
  as the first draft of this palette did (4.06–4.37:1). Yu chooses.
- Generator-owned wording that can't be fixed by hand in the kit:
  - `kit/BRAND.md` says the Fraunces licence "was not checked". The README
    corrects this.
  - `kit/colour/tokens.css` gives Fraunces a sans fallback.
  - The favicon has no dark variant.
  - The logo uses Fraunces' text optical size. A display cut would need a
    generator option.
- `kit/web/head-home.html` is a new generated file and is untracked; it
  belongs in the same commit as the kit. `docs/plans/storefront-rebuild/
  implementation.md` still calls the front door "ivory/plum/mandarin".
- In Dark, accent-wash over navy reads grey rather than gilt. This matches
  QG's values.
- In Dark, the print's own white paper margin is the brightest block on the
  page. It was left as the museum image is.
