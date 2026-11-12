---
version: alpha
name: RewardsPro
description: Look A for rewardspro.io, its /help/ page and RewardsPro's marketing images. Facts and reasons only; the brand kit in kit/ is the source of every value here.
colors:
  bg: "#09110F"
  surface: "#1B2321"
  border: "#2C3532"
  text: "#F6F7F7"
  text-muted: "#9EA2A6"
  primary: "#658AAD"
  primary-text: "#83A6C5"
  on-primary: "#1B1D1F"
  accent: "#17BEBB"
  on-accent: "#1B1D1F"
  focus: "#658AAD"
  card-bg: "#FFFFFF"
  card-text: "#1B1D1F"
  card-primary: "#1A3E5C"
  card-accent-text: "#007C7A"
typography:
  display:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 3.5rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.75rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
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
omitted:
  - section: spacing
    reason: "The kit has no spacing scale yet; pages use the type scale's rhythm until the /help/ restyle sets one."
components:
  button-primary:
    background: "{colors.accent}"
    text: "{colors.on-accent}"
    radius: "{rounded.md}"
  button-secondary:
    border: "{colors.primary}"
    text: "{colors.text}"
    radius: "{rounded.md}"
  link:
    text: "{colors.accent}"
    decoration: underline
  rule-box:
    background: "{colors.surface}"
    text: "{colors.text}"
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

## Colors

Look A is the App Store icon's navy `#1A3E5C` and teal `#17BEBB`, approved by the owner on 2026-10-20
(`approvals.jsonl`). rewardspro.io is dark only, so the front matter lists the dark roles from
`kit/colour/tokens.json`. The `card-*` values are the light roles, used only for the white social cards.

- **bg `#09110F` and surface `#1B2321`:** the page and its raised areas. Depth comes from tone, not shadows.
- **text `#F6F7F7` and text-muted `#9EA2A6`:** body copy and secondary lines. Both pass WCAG 4.5:1 on bg and surface
  (17.8:1 and 7.4:1 on bg; 15.0:1 and 6.2:1 on surface).
- **accent `#17BEBB`:** links, the one primary button and focus marks. It reads at 8.3:1 on bg and 7.0:1 on
  surface, and the button's dark ink `#1B1D1F` reads at 7.3:1 on it.
- **primary `#658AAD`:** the navy moved up its scale so it reads on dark (5.27:1 on bg, 4.42:1 on surface, so on
  surface it is for borders and large text only). The kit's navy `#1A3E5C` only works on light grounds.
- **On white cards, teal text is `#007C7A`** (5.0:1). Teal `#17BEBB` on white is 2.3:1, too faint for words.

Use only kit values. A new colour would make the next asset drift from the last one.

## Typography

Inter for everything, falling back to the system sans. Version 1 of the site loads no webfont, which keeps it
inside the strict CSP and fast on phones. A self-hosted Inter (OFL) is an option for the owner.

- Display type stays at or below 3.5rem, with tracking no tighter than -0.02em. Bigger type on a phone pushes the
  sentence that matters below the fold.
- Sentence case for headings and buttons. It reads as speech, not as a poster.
- Money and numbers use tabular figures, so columns line up in example tables.

## Layout

- One column for reading, about 65 to 75 characters per line, because long lines tire readers.
- Each section is an h2 with a stable `id` (`#setup`, `#widget` and so on), so the app and the listing can link to
  the exact step.
- Header and footer are the same bytes on every page. A drifting footer is how false links survive.
- The layout must work at 360 px wide with no sideways scroll.

## Elevation & Depth

Flat. Depth comes from the bg/surface tone step and a 1 px border. Glows, halos and heavy shadows on dark read as
decoration standing in for content.

## Shapes

One radius, 8 px (a proposal; the kit has no radius token yet). An element nested inside another uses the outer
radius minus the inset, so corners stay parallel.

## Components

- **Primary button:** teal with dark ink text, one per screen. Two loud buttons make the reader choose instead of
  read.
- **Secondary button:** a `#658AAD` outline.
- **Link:** teal and underlined, with an offset. Colour alone isn't enough to show a link.
- **"Shopify's rule" box:** on surface, a bold label, the rule in plain words, then its source and the date it was
  read. Merchants need to see which limits are Shopify's, not ours.
- **Steps:** a numbered list. Each admin label is written in bold, exactly as the app shows it.
- **Example table:** a caption, header cells, money right-aligned, and the word "example" in the caption.
- **Figure:** real screenshots from a development store, in a 1 px border frame, with a caption and alt text that
  says what matters.
- **Q&A:** a heading and a paragraph, always visible. Hidden accordions hide answers from readers and crawlers alike.
- **Browser surfaces** (text selection, the caret, scrollbars and the focus ring) take their colours from the roles.

Motion: none in version 1, apart from a colour change on hover (only on devices that hover) and a slight press on
buttons, both turned off under `prefers-reduced-motion`. A static help page has nothing that needs to move.

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

**The register is business** (the owner, 2026-11-07: "用loyal customers, take a more business approach on wordings.";
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
mark the sentence with `data-claim="<id>"` so a check can find it. A sentence with no verified row doesn't ship,
however true it seems.

## Constraints

- rewardspro.io is static HTML on Cloudflare Pages, with no build step. The restyle adds no JavaScript.
- Its CSP is self-only (`default-src 'self'`, `font-src 'self'`, `img-src 'self' data:` in `landing/public/_headers`).
  Fonts, images and styles are served from the site itself.
- Dark only (`<meta name="color-scheme" content="dark">`).
- The owner publishes. A merge deploys nothing to rewardspro.io; only the manual `wrangler pages deploy` in
  `DEPLOY.md` does.

## Known gaps

- The wordmark's Inter Semi Bold came from a copy installed on the Mac that built the kit, and its licence wasn't
  checked (`kit/BRAND.md`). The family itself is OFL.
- The share card `kit/web/og.jpg` stays off live pages until its three claims are verified.
- Product screenshots wait on the development-store test (G0).
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
