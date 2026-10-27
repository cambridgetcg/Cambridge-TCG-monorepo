# Cambridge TCG interface

This is the current shared visual system. The
[rebuild plan](../plans/storefront-rebuild/README.md) and
[implementation progress](../plans/storefront-rebuild/implementation.md)
track the wider page and service replacement.

Current direction, 2026-10-27: the quiet gallery returns. Yu's words
(2026-10-26/27): "CambridgeTCG frontpage and UI colourcode need an update. I am
thinking of following the older version and pick up from the stylistic choices
there for an update." From options an agent offered, Yu chose **Quiet gallery
(Jul–Sep)**, **Core look**, **Today's content, gallery style** and **Card mark
in bronze**. The core look is warm paper, ink type, one bronze accent, serif
headings, soft mats with a gentle shadow, hairline dividers and solid-ink
buttons, with midnight blue and gilt for dark mode. Nothing moves. The ornament
layers of that period (明朝 vertical marks, 第 NN plates, ✦ benedictions, paper
grain, screentone, the breathing h1, painted walls, game weather and hover
frames) were offered and not chosen. The 2026-09-29 collector's desk (ivory,
aubergine, mandarin, lilac) is replaced; its structure stays. The product
direction is still open-source TCG data infrastructure, with search first and
art linking into its context.

| Role | Token | Light (`gallery`) | Dark (`midnight`) |
|---|---|---|---|
| Page | `page` | Warm paper `#faf8f4` | Midnight `#0b0f1a` |
| Surface (mats, panels) | `surface` | White `#ffffff` | `#121829` |
| Subtle fill | `surface-subtle` | `#f3f0e9` | `#0e1422` |
| Ink | `ink` | `#201d18` | Warm light `#e9e4d6` |
| Muted ink | `ink-muted` | `#5e574c` | `#afb7cd` |
| Hairline (layout dividers) | `border-subtle` | `#e7e2d8` | `#1f2941` |
| Control edge (inputs, secondary buttons) | `border-strong` | `#8e877a` | `#5e6d94` |
| Accent (links, focus ring, mark) | `accent` | Bronze `#86661c` | Moonlight gilt `#d9b36c` |
| Primary action | `highlight` | Solid ink, paper text | Solid warm light, midnight text |
| Status: ok, bid, secondary | `ok` | Viridian `#36634d` | `#5bbf8f` |
| Status: info | `info` | Slate `#415c7e` | `#7fb4c9` |
| Status: warning | `warning` | `#844d16` | `#e39a52` |
| Status: danger, ask | `danger` | Brick `#953e2e` | `#e48c7f` |
| Elevation | `shadow-mat` | One soft ink shadow | One deeper black shadow |

Terminal and high contrast are unchanged. `themes.css` holds every value; the
appearance registry's swatches match it, and the `gallery` and `midnight`
cookie IDs stay valid.
The [return record](../operations/2026-10-27-quiet-gallery-return.md) lists
what changed and what was checked.

The status tones are darker in Light (and danger lighter in Dark) than the
values first drafted for this build, so that tone text stays at 4.5:1 or more
on its own 10–20% tint: badges, trust tiers and status chips draw
`bg-ok/15 text-ok` and similar. No test holds this yet: a blocking check is a
new guard, so it is offered to Yu rather than added (AGENTS.md principle 8).
In the terminal theme, danger text on its own tint is below 4.5:1; that theme
is left as it was.

Type: **Fraunces** for headings and the wordmark, at weight 500–600, with
`tracking-tight` and `text-3xl` as the ceiling outside the home hero.
**Schibsted Grotesk** for reading text, at 16px or more. **Spline Sans Mono**
is the apparatus voice: SKUs, numbers, counts and small uppercase kickers.
`layout.tsx` self-hosts all three through `next/font`; Inter stays for the
terminal theme and high contrast uses `system-ui`. Japanese and Chinese put
the house Latin face first, then system CJK faces, with more leading, no
italics and no wide tracking on kana or hanzi. Headings fall back to the
system serif (mincho or songti); that follows the older shape and is a
judgement call, swapped in `themes.css` if gothic headings are wanted.

## Design rules

- Keep four primary entrances: Prices, Services, Standards and Roadmap.
  Collection and Play remain in More; account destinations state their access
  requirements and disable prefetch in both desktop and mobile menus.
- Serif headings over readable sans-serif text, normal sentence case and
  visible form labels. Use a strong task headline, generous space and quiet
  static surfaces. Use actual credited artwork with its full composition, hung
  in a plain mount with a wall label; put longer source records in native
  disclosures. Keep search within the first phone screen.
- One bronze accent, used sparingly: inline links, the focus ring, the mark,
  mono kickers and numbers. Secondary link rows use the quiet style (muted ink
  with a hairline underline). Headlines are ink.
- The primary action is solid ink. Secondary buttons are a surface with a
  control edge. There are no gradients, glows, textures, banners or motion.
- A mat (surface, hairline border, `shadow-mat`) is the only elevation; use
  `rounded-xl` for the large ones (the finder, menus). Divide layout with
  `border-subtle` hairlines and keep `border-strong` for control edges. Grids
  of destinations are hairline grids, not rows of boxes.
- In navigation the current page has a fill and a hairline ring, since the
  fill alone barely shows on midnight; `aria-current` carries it for assistive
  technology.
- Give each section a short heading, purpose and useful action. Explain access
  requirements beside the relevant destination. Keep API documentation at the
  agent entry and longer cultural reading on its own pages.
- Use semantic color tokens and consistent spacing. Preserve keyboard focus,
  reduced motion, dark appearance, high contrast, text mode, 44px targets and
  no-JavaScript paths.
- Keep source status, uncertainty, publication rules and consequences visible
  where they affect a decision. A simplified layout does not broaden access
  or reopen retired paid commerce.

One Tailwind detail: Tailwind copies an `@theme` shadow's value into its
utility, so `shadow-mat` would draw the Light shadow in every theme if the
value lived there. `@theme` therefore sets `--shadow-mat: var(--mat-shadow)`,
and each theme sets `--mat-shadow`. Change a theme's shadow through
`--mat-shadow`.

## Reusable pieces

| Piece | Owns |
|---|---|
| `src/lib/ui/PageLayout.tsx` | Public page width, padding and one main landmark; account pages already have their own main |
| `src/lib/ui/PageHeader.tsx` | Page title, purpose, source context and wrapping actions |
| `src/lib/ui/Section.tsx` | Section heading, explanation and optional action |
| `src/lib/ui/ActionCard.tsx` | A linked destination, its purpose and access context |
| `Card`, `Field`, `Input`, `Select`, `Button`, `DataTable` | Shared surfaces, labelled controls and structured records |
| `src/lib/nav/menu-config.ts` | Shared navigation destinations and translated labels |
| `src/content/services/index.ts`, `ServiceCards` | Reviewed human task shortcuts and account requirements on the services page |
| `src/content/platform/index.ts`, `DataFoundations` | Shared positioning, four foundation summaries and roadmap milestones; the human page and JSON use the same planning record |
| `HomeArtwork`, `src/content/art/featured.ts` | Local museum image, shared attribution and links to art context |
| `src/app/themes.css`, `globals.css`, `src/app/layout.tsx` | Centralized theme tokens, typography and compatibility styles; the font loading |
| `marketing/` | The brand kit: mark, wordmark, favicons, share card and marketplace images, rebuilt by the artcraft-brand generator |

Paths above are relative to [the storefront](../../apps/storefront/README.md).
Compose these pieces directly. Do not create a parallel theme or navigation
registry for an individual page. Prefer direct imports from the primitive file
in client components so server-only helpers stay out of their dependency tree.

The existing `gallery` cookie identifier remains compatible with the light
theme. Theme identifiers and presentation labels are different concerns;
changing a label must not invalidate a saved accessibility preference.

Keep loading boundaries near the data they represent. The generic root
`loading.tsx` was removed because its streamed replacement left otherwise
server-rendered entry and appearance pages hidden when JavaScript was disabled.
The account, prices, catalog and methodology routes retain their own loaders;
this is not a claim that every application route works without JavaScript.

## Artbitrage reference

Reviewed the latest remote Artbitrage source at `1faae8357` (2026-09-28)
and its newer local public-entry revision dated September 27. The latter was
uncommitted working-tree material: `docs/PUBLIC-SITE.md`, `map.json`,
`site.css`, `site.js` and `tools/build_public_site.py`. It was read as
design evidence, without merging or publishing Artbitrage changes.

The useful patterns are one directory for navigation labels, entrances named
after tasks, context beside destinations, useful next steps, and native links
and GET forms that work before JavaScript. Cambridge's current museum portrait
is a credited art entrance beside its practical search. Stable per-work records
keep a homepage art swap from silently changing an existing essay illustration.

## Verify a UI change

Check a narrow viewport and desktop, keyboard navigation, visible labels,
empty/error states, and the relevant appearance modes. Tests should protect
navigation, access and interaction behavior; avoid freezing decorative class
lists. Render authenticated UI with local fixtures or mocks rather than
relaxing authentication for a screenshot.

Update the [module catalog](../modules/catalog.json) with dated progress and
evidence, then regenerate it with `pnpm docs:modules`.
