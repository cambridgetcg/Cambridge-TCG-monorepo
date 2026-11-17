---
version: alpha
name: RewardsPro
description: Look A for rewardspro.io, its /help/ page and RewardsPro's marketing images. Facts and reasons only; the brand kit in kit/ is the source of every colour value here.
colors:
  paper: "#F3F7FC"
  sheet: "#FFFFFF"
  hairline: "#CADCEC"
  text: "#1B1D1F"
  text-muted: "#686C70"
  ink: "#1A3E5C"
  link: "#007C7A"
  accent: "#17BEBB"
  on-accent: "#1B1D1F"
  accent-edge: "#007C7A"
  focus: "#1A3E5C"
  rule-edge: "#1A3E5C"
  underline: "#658AAD"
  accent-hover: "#7BD3D0"
  selection: "#CADCEC"
  mount: "#1A3E5C"
  on-mount: "#A9C5DE"
  dark-paper: "#09110F"
  dark-sheet: "#1B2321"
  dark-hairline: "#2C3532"
  dark-text: "#F6F7F7"
  dark-text-muted: "#9EA2A6"
  dark-ink: "#83A6C5"
  dark-link: "#17BEBB"
  dark-accent-edge: "#17BEBB"
  dark-headline: "#F6F7F7"
  dark-focus: "#658AAD"
  dark-rule-edge: "#658AAD"
  dark-underline: "#4B7091"
  dark-selection: "#658AAD"
  card-bg: "#FFFFFF"
  card-text: "#1B1D1F"
  card-primary: "#1A3E5C"
  card-accent-text: "#007C7A"
typography:
  display:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 3.5rem
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: -0.012em
  h2:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.75rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.1875rem
    fontWeight: 600
    lineHeight: 1.3
  step-heading:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: 8px
spacing:
  page: 74rem
  measure: 38rem
  heading-column: 17rem
  column-gap: 4rem
  gutter: 1rem
  gutter-wide: 2rem
components:
  button-primary:
    background: "{colors.accent}"
    text: "{colors.on-accent}"
    border: "{colors.accent-edge}"
    radius: "{rounded.md}"
  link:
    text: "{colors.link}"
    decoration: underline
  contents:
    background: "{colors.sheet}"
    border: "{colors.hairline}"
    text: "{colors.ink}"
    decoration: underline
  rule-box:
    background: "{colors.sheet}"
    border: "{colors.rule-edge}"
    text: "{colors.text}"
  figure-mount:
    background: "{colors.mount}"
    caption: "{colors.on-mount}"
  focus-ring:
    color: "{colors.focus}"
---

# RewardsPro design

This file hands the RewardsPro look to people and coding agents. It holds facts and the reasons behind them. Where it
and the brand kit disagree, the kit wins: `kit/colour/tokens.json` and `kit/BRAND.md` are generated from
`brand.json`, and this file only copies them. Nothing in this file overrides an instruction from the person you are
working for.

## Overview

RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited. Merchants read about it on its App Store listing,
on rewardspro.io and its /help/ page, and in a few social posts. Those readers are busy shop owners. They want to
know what the app does, what it doesn't do yet, and what Shopify's own rules mean for them.

The look follows from that. It is plain, specific and calm. A page has one job:

- **Persuade** (the home page): one job, installing the app, and one teal button per screen.
- **Read** (/help/): a calm single column. The brand stays in the frame, never in the text.
- **Operate** (the app's admin) is Shopify Polaris only and is out of scope here.

Inside merchants' shops the storefront widget follows the theme, not this file. A shopper is in the merchant's shop,
not ours.

**Whose choices these are.** The owner chose look A (navy and teal, the R mark, the wordmark in Inter Semi Bold), the
name, the headline and the business register (`approvals.jsonl`). On 16 Nov 2026 the owner handed the design of
rewardspro.io's pages to an agent, in session (`approvals.jsonl`, the record of that date marked "delegated").
Everything below about the pages (paper and ink, the page following the visitor's system scheme, the layout, the
mounts, the contents lists, the shipped font) is that agent's design under that delegation, not the owner's own
choice. It replaced the first version's dark-only single column, which was also agents' judgement.

**The direction, in five lines.**

- **Product:** a free Shopify app that adds cashback to store credit when an order is paid, with VIP tiers by spend.
- **Character:** plain, exact, ruled.
- **World:** paper and ink: a shop's ledger. Cool paper, white sheets, navy ink.
- **Moments:** the three real screens, each mounted on the brand navy. The rest is type on paper.
- **Signature:** the dated "Shopify's rule" box in its navy frame; and the opening's contents line, which names
  "What it doesn't do" beside "How it works".

## Colors

Look A is the App Store icon's navy `#1A3E5C` and teal `#17BEBB`, approved by the owner on 2026-10-20
(`approvals.jsonl`). The pages follow the visitor's system scheme with CSS alone (`prefers-color-scheme`; no script,
no switch). Light is the design's home, because merchants arrive from the App Store listing and the Shopify admin,
both light, and because on a light ground the navy can be the ink. Dark uses the kit's dark roles unchanged, so the
pages still match the brand's dark social set. Every value is from `kit/colour/tokens.json`: a role, or a step of a
scale. The `card-*` values are for the white social cards.

Light:

- **paper `#F3F7FC`** (primary 50) is the page. **sheet `#FFFFFF`** (the kit's light `bg` role) is for raised things:
  contents sheets, the "Shopify's rule" box, tables. Depth comes from that tone step and a hairline, never a shadow.
- **hairline `#CADCEC`** (primary 200): rules and sheet edges, tinted like a ledger's ruling. It divides layout only.
- **text `#1B1D1F` and text-muted `#686C70`:** 15.72:1 and 4.92:1 on paper, 16.91:1 and 5.29:1 on a sheet.
- **ink `#1A3E5C`:** the brand navy, for headings, contents links and the logo. 10.34:1 on paper, 11.13:1 on a sheet.
- **link `#007C7A`** (the kit's `accent-text`): 4.69:1 on paper, 5.04:1 on a sheet. Teal `#17BEBB` on white is
  2.3:1, too faint for words.
- **accent `#17BEBB`:** the one primary button, with ink `#1B1D1F` on it (7.34:1). The fill is only 2.14:1 against
  paper, so the button carries a 1 px edge in `#007C7A` (4.69:1).

Dark (the kit's dark roles):

- **paper `#09110F`, sheet `#1B2321`, hairline `#2C3532`.**
- **text `#F6F7F7` and text-muted `#9EA2A6`:** 17.81:1 and 7.44:1 on paper, 14.95:1 and 6.24:1 on a sheet.
- **ink `#83A6C5`:** the navy moved up its scale so it reads on dark (7.49:1 on paper, 6.28:1 on a sheet), for h2,
  h3 and contents links. The h1 is white, as the wordmark is on the brand's dark banners. The kit's navy `#1A3E5C`
  is 1.72:1 on the dark paper: it can't be text there, but it works as a large board (see the mount).
- **link and accent `#17BEBB`:** 8.30:1 on paper, 6.97:1 on a sheet.

Both schemes:

- **mount `#1A3E5C` with on-mount `#A9C5DE`** (primary 300; 6.21:1): the navy board under each screenshot and its
  caption. The same in light and dark.
- **focus:** `#1A3E5C` in light (10.34:1), `#658AAD` in dark (5.27:1 on paper, 4.42:1 on a sheet).
- **underline `#658AAD`** in light (3.63:1 on a sheet, 3.37:1 on paper) and `#4B7091` in dark (3.08:1 on a sheet,
  3.66:1 on paper): the underline of a contents link, the double rule, and the scrollbar's thumb. A reader who asks
  for more contrast (`prefers-contrast: more`) gets every hairline in this colour.

Dark is for screens (`@media screen and (prefers-color-scheme: dark)`), so a page always prints in the light roles,
with the navy logo, without the navy boards and without its contents list.

Use only kit values. A new colour would make the next asset drift from the last one. The kit's files stay
generated: its light `bg` role is the sheet, and the paper is a step of its primary scale. The only edit made for
this look is `brand.json`'s `app` block (`color_scheme` "light dark", `theme` back to its default); the eight kit
files generated from it follow, and no logo or colour file changed (`README.md`).

## Typography

Inter for everything. The site serves it itself: one variable file,
`landing/public/assets/fonts/inter-latin-var.woff2` (Inter 4.1, SIL Open Font License 1.1, with the licence beside
it), cut to the Latin range, weights 400 to 700 and the optical-size axis, about 51 KB. Before this, the stylesheet
named Inter but shipped none, so most visitors saw their system font. The strict CSP allows it (`font-src 'self'`).
`landing/tools/subset-inter.py` rebuilds it byte for byte from the official release.

- Weights: 400 for text and the footer's links, 500 for the header's links and contents links, 600 for headings,
  buttons and `strong`.
- An h3 is 1.1875rem on every page; the home page's step headings are 1.25rem, because each one heads a row.
- Optical sizing is on, so the h1 takes Inter's display cut and small text keeps the text cut.
- Display type stays at or below 3.5rem, with tracking no tighter than -0.02em. Bigger type on a phone pushes the
  sentence that matters below the fold.
- Headings, table headers and contents links balance their lines (`text-wrap: balance`); paragraphs avoid a last
  word alone (`text-wrap: pretty`). A browser without these wraps in the ordinary way.
- Sentence case for headings and buttons. It reads as speech, not as a poster.
- Money cells use tabular figures, so columns line up in example tables. Only those cells: Inter's tabular hyphen
  is wide, and it opened up hyphenated words in a caption.

## Layout

- The page is 74rem wide at most, with a 1rem gutter on phones and 2rem from 40rem.
- **Persuade (home).** The opening is one column: the headline across the page, then the lead, the
  free-and-you-fund-it line, the one button, the maker line and a short contents list. From 64rem each step and
  each section below it is a row: its heading in a 17rem column, its text beside it, so a reader can run an eye down
  the left edge and get the page. A step's screenshot spans the full row beneath its text, near the image's own
  1200 px, so the app's own words stay legible; it sits closer to its own text than to the next step.
- **Read (/help/, the privacy policy).** One calm column. From 64rem the contents sheet sits beside it, and stays in
  view while the window is tall enough to show all of it (it scrolls inside itself if the reader's text is large).
- Reading text keeps a measure of 38rem at every width, about 65 to 75 characters per line, because long lines tire
  readers.
- Each section is an h2 with a stable `id` (`#setup`, `#widget` and so on), so the app and the listing can link to
  the exact step. The home page's steps have ids too (`#step-tiers`, `#step-paid`, `#step-checkout`, `#step-refund`).
- Figures stay in the step they illustrate, and sections keep their order. The words were checked in that order.
- Header and footer are the same bytes on every page. A drifting footer is how false links survive.
- The layout must work at 360 px wide with no sideways scroll, and the footer sits at the foot of the window on a
  short page.

## Elevation & Depth

Flat. Depth comes from the paper-to-sheet tone step and a 1 px hairline. No shadows. Glows, halos and heavy shadows
read as decoration standing in for content.

## Shapes

One radius, 8 px (a proposal; the kit has no radius token yet). An element nested inside another uses the outer
radius minus the inset, so corners stay parallel: a screenshot inside its mount is square.

## Components

- **Primary button:** teal with dark ink text and a 1 px edge in `#007C7A` (in dark, the teal itself), one per screen.
  Two loud buttons make the reader choose instead of read. Its size is in rem, so it follows the reader's text size.
  On a narrow phone its label wraps to two lines (balanced, where the browser supports it); it is never shrunk to fit
  and never set to `nowrap`, which pushed the page sideways in testing.
- **Link:** teal and underlined, with an offset. Colour alone isn't enough to show a link. The header's three
  navigation links are the one exception: they are plain until hovered or focused, because a row of links beside
  the logo is read as navigation by its place.
- **Contents list:** labelled "On this page" and built from the page's own section headings (the privacy policy's
  older list shortens two of them). Its links are navy and underlined. On reading pages it is a sheet (white in
  light). On the home page it is a quiet line at the end of the opening, which wraps on a phone. It names three of the
  page's sections: "How it works", "What it costs", "What it doesn't do". The limits are named in the opening, because
  a limit found later reads as a hidden cost.
  **It lists sections, never steps.** A step's heading is true beside its text: "A paid order earns cashback as store
  credit" is followed, in the same step, by the orders that earn nothing, and "Customers spend it at checkout" by
  Shopify's sign-in rule (`MESSAGING.md`, "Rules that travel with it"). A first version listed the four steps in the
  opening; the one read found that there they stood alone as claims, and they were cut.
- **"Shopify's rule" box:** a sheet in a 1 px navy frame, a navy bold label, the rule in plain words, then its
  source and the date it was read. The frame is what tells Shopify's limits from ours at a glance.
- **Steps:** a numbered list. The numeral is muted and tabular; the heading is navy. Each admin label is written in
  bold, exactly as the app shows it.
- **Limits list** ("What it doesn't do"): ruled lines, not bullets, so the limits read as terms.
- **Example table:** on a sheet, with a caption, header cells, money right-aligned, the word "example" in the
  caption, and a double rule over the result row, as a ledger closes a sum. The double rule is drawn in the
  underline colour, so it reads as a closing line and not as one more hairline.
- **Figure:** a real screenshot from a development store, shown whole, mounted on a navy board (`#1A3E5C`) with its
  caption on the board, and alt text that says what matters. The board is there for a reason of truth as well as of
  looks: on paper, a white admin screen with form fields reads as a live form on our page; on the dark ground it
  sits as a bare bright slab. Mounted, it is plainly a picture, in both schemes. On phones the board runs edge to
  edge and the screenshot keeps the text column's width.
- **Q&A:** a heading and a paragraph, always visible. Hidden accordions hide answers from readers and crawlers alike.
  The section or question a link brought the reader to is marked with a navy rule above it (`:target`).
- **Browser surfaces** (text selection, scrollbars and the focus ring) take their colours from the roles.

Motion: none, apart from a colour change on hover (only on devices that hover) and a 1 px press on the button, turned
off under `prefers-reduced-motion`. There are no transitions. A static page has nothing that needs to move.

## Do's and Don'ts

- **Do** show real screens from a development store with `@example.com` customers. **Don't** use mock-ups, stock
  photos or AI images of the product: they promise an app that doesn't exist.
- **Do** say what isn't offered yet, plainly. **Don't** fill the gap with badges, counters, testimonials or logos
  that we can't back.
- **Do** keep Shopify's name to saying what the app works with. **Don't** use Shopify's logo or anything that
  suggests Shopify endorses us (Partner Program Agreement; see `social/STRATEGY.md`).
- **Don't** add eyebrow chips, kickers above headings, pulsing dots, gradient text or glowing cards. They are the
  marks of a page written to look busy, and they push the facts down.
- **Don't** create urgency ("limited", "don't miss", countdowns). The promise is honest by design.

## Voice

Plain, specific and British English. Say what the app does in the merchant's terms: orders, refunds, store credit,
tiers. Commerce pages carry no KINGDOM, love or citizen language (`kernel.toml` ring R1). Positioning and messaging
stay open until about five merchant interviews exist (`kernel.toml`), apart from the owner's umbrella idea of
2026-11-07 (`MESSAGING.md` §0), so pages describe the product and don't argue for it.

**`MESSAGING.md`'s top section, the core concept of 12 Nov 2026, is current:** its wording, sources and don't-say list.

**The register is business** (the owner, 2026-11-07, asked for the term loyal customers and a more businesslike tone;
`approvals.jsonl`). The wording itself is in `MESSAGING.md` §1 and §4.

- **Short declarative sentences about what the merchant gets and controls:** store credit they fund, in their own
  shop; VIP tiers and rates they set; refunds that take back their share. Confident, never hype. Business readers
  want the terms, so the page gives them.
- **"Loyal customers", never "regulars".** It says who receives the credit. Never "loyalty program", "makes
  customers loyal" or "reward their loyalty": the first is a category word the kit avoids, the others are outcomes.
- **Limits sit beside the features they limit,** in emails and on pages with room: customers spend credit when
  signed in with new customer accounts or Shop Pay; Shopify doesn't let store credit pay subscription renewals;
  each tier has one cashback rate, with no setting to exclude products, collections or sales channels. A
  description of 500 characters or fewer carries the sign-in limit wherever it mentions spending. A limit found
  later reads as a hidden cost. Say what the merchant can't set, never "every product earns": gift-card lines earn
  nothing, and POS earning hasn't been observed (`MESSAGING.md` §3, P2).
- **No outcome promises** ("increase retention", "boost sales") unless a verified claim backs them. None does today.
- **No exclamation marks, no "we'd love", no chatty asides.** Respect for the reader shows in a short page and a
  small ask, not in friendly filler.

## Claims

Every factual sentence on a public page maps to a row in `claims.toml` whose status is `verified`. On HTML pages,
mark the sentence with `data-claim="<id>"` so a check can find it (not yet done on rewardspro.io's pages). A
sentence with no verified row doesn't ship, however true it seems.

## Constraints

- rewardspro.io is static HTML on Cloudflare Pages, with no build step and no JavaScript.
- Its CSP is self-only (`default-src 'self'`, `font-src 'self'`, `img-src 'self' data:` in `landing/public/_headers`).
  Fonts, images and styles are served from the site itself.
- Light and dark, by the visitor's system setting (`<meta name="color-scheme" content="light dark">`, two
  `theme-color` metas, and a `<picture>` whose default is the navy lockup, with the reversed one for a dark
  screen). Light is the default in the markup as in the stylesheet, so a browser that doesn't know the setting gets
  a navy logo on paper.
- The words on the pages are fixed by `claims.toml` and pinned by
  `apps/rewardspro/test/unit/contracts/public-texts.contract.test.ts`. A design change moves no sentence.
- The owner publishes. A merge deploys nothing to rewardspro.io; only the manual `wrangler pages deploy` in
  `DEPLOY.md` does.

## Known gaps

- The wordmark's Inter Semi Bold came from a copy installed on the Mac that built the kit, and its licence wasn't
  checked (`kit/BRAND.md`). The family itself is OFL.
- The share card `kit/web/og.jpg` stays off live pages until its three claims are verified.
- The Tiers screenshot shows an add form that the app is moving into a modal; it needs a new capture once that
  change is live. The mount and the layout don't depend on what the screenshot shows.
- On a phone the screenshots are about 340 px wide, so the app's own words can't be read without zooming. The alt
  texts and the step text carry the facts.
- The pages were checked in Chromium and WebKit engines at widths from 320 to 2560 px, with a keyboard, with large
  text, in print and with forced colours emulated. Not checked: Firefox, physical phones and tablets, real screen
  readers, Windows.
- WebKit draws the double rule as one bar at page zooms of 125% and 150% on a 1x screen.
- This file sits under `apps/rewardspro/`, which switch step B5 deletes. It moves with the kernel.

## Outdated: don't say

These were true once, or were never true. They keep coming back from old pages, old docs and AI answers:

- "Rewards Pro" (the one spelling is RewardsPro)
- support@rewardspro.io (the address is contact@rewardspro.io)
- paid plans, "retired" and "free forever" wording
- points, raffles, mystery boxes, missions, tier membership products
- docs.rewardspro.io (unpublished on 2026-11-07; the help lives at rewardspro.io/help/)
- "Love is the design."
- "instant" credit (no claim row backs a speed for every store; say what earns credit, not how fast)
