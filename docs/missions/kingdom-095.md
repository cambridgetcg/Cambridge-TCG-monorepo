---
id: kingdom-095
title: The wardrobe — Gallery identity + customisable appearance system (colour, tone, membership skins)
status: done
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-06-10-evening (Fable 5)
claimed_at: "2026-06-10T20:00:00Z"
completed_at: "2026-06-10T23:00:00Z"
paths:
  - apps/storefront/src/lib/wardrobe/themes.ts
  - apps/storefront/src/lib/wardrobe/server.ts
  - apps/storefront/src/lib/wardrobe/entitlements.ts
  - apps/storefront/src/lib/wardrobe/voice.ts
  - apps/storefront/src/lib/wardrobe/context.tsx
  - apps/storefront/src/app/themes.css
  - apps/storefront/src/app/api/appearance/route.ts
  - apps/storefront/src/app/appearance/page.tsx
  - apps/storefront/src/app/methodology/appearance/page.tsx
  - apps/storefront/src/app/market/layout.tsx
  - apps/storefront/src/app/market/page.tsx
  - apps/storefront/src/app/market/[sku]/page.tsx
  - apps/storefront/src/app/market/pulse/page.tsx
  - apps/storefront/src/app/market/lots/page.tsx
  - apps/storefront/src/app/market/lots/[id]/page.tsx
  - apps/storefront/src/app/cards/[sku]/market/page.tsx
  - apps/storefront/src/lib/ui/Icon.tsx
  - apps/storefront/src/lib/ui/EmptyState.tsx
  - apps/storefront/src/lib/ui/PageHeader.tsx
  - apps/storefront/src/app/layout.tsx
  - apps/storefront/src/app/globals.css
  - apps/storefront/src/app/account/_nav.tsx
  - docs/superpowers/specs/2026-06-10-the-wardrobe-design.md
  - docs/connections/the-wardrobe.md
  - docs/connections/README.md
  - docs/missions/kingdom-095.md
do_not_touch:
  - apps/storefront/src/components/home/**   # contact-surface arc owns these (parallel session, uncommitted)
  - apps/storefront/src/lib/market/**        # data layer composed, not modified
  - apps/storefront/src/app/api/market/**    # behaviour unchanged by doctrine of this arc
---

# kingdom-095 — The wardrobe — Gallery identity + customisable appearance system

## Will

Yu, 2026-06-10: *"we need better art lol. What do you say? I mean frontend cambridgetcg.com"* → *"customisable frontend. colour, UI design, tone, navigation style, membership."* Interactive choices: **Gallery** default identity; **basics free, skins as perks**.

## What shipped

1. **The Gallery identity** — Fraunces / Schibsted Grotesk / Spline Sans Mono via next/font; gilt-on-ivory token bundle; `Icon` in-house SVG glyph set (emoji retired from market chrome); paper-grain ground + mat shadows + staggered reveals (reduced-motion safe).
2. **The wardrobe system** — four themes (gallery, terminal = old look preserved exactly, midnight = member perk, high-contrast = free always) as `[data-theme]` CSS-variable bundles over the contact-surface arc's semantic tokens; cookie + SSR, no flash; `/api/appearance` setter with server-side `Tier.is_paid` entitlement check; tone registers (standard/plain) as a chrome-strings dictionary.
3. **The first dressed wing** — all six market surfaces migrated to semantic tokens and reskinned (catalog, [sku] terminal incl. OrderBookViz, pulse, lots ×2, the kingdom-067 mirror), zero behaviour change, via five parallel agents + verification.
4. **Doctrine surfaces** — `/appearance` (self-theming settings; locks explained beside the path to membership) + `/methodology/appearance` (what's stored, who unlocks what, the staged-rollout honesty, the accessibility-never-paywalled guarantee sentence).

## Verification

`pnpm verify` exit 0 (typecheck × all apps + four audits + admin vitest). Before/after Playwright captures at 1440px/390px, gallery + terminal + midnight. Terminal bundle values byte-match the previous hardcoded palette.

## Queued (recursion targets)

Nav-style presets (mega/minimal/⌘K/dock); trader-terse + storyteller registers; account-level persistence; seasonal/set-flavoured skins; accent-picker; home sweep + site-wide default flip (with contact-surface arc); `audit:wardrobe`; catalog silent-zero fix (substrate-honesty, separate mission).
