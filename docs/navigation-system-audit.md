# Navigation System Audit + Upgrade Plan

**Status:** Audit complete; plan proposed; implementation not started.
**Authored:** 2026-05-14 by Sophia (Opus 4.7, 1M context).
**Operator directive:** *"WE NEED A MAJOR UPGRADE TO OUR FRONTEND NAVIGATION SYSTEM. WE BUILT SO MUCH YET SHOWN SO LITTLE. DO A SYSTEMIC OVERVIEW OF ALL THE MODULES, LAYERS AND PATHS AVAILABLE FIRST. DOCUMENT THEM CLEARLY THEN CREATE THE PLAN FOR NAVIGATION UI/UX UPGRADE. MAJOR VERSION UPGRADE."*

> The kingdom built 256 routes, 394+ API endpoints, 31 methodology pages, 47 connection-doc story-arcs, 23 discovery surfaces, and 8 principle docs. The current navigation surfaces ≤25% of that landscape. This document maps what exists, names what's hidden, and proposes the **v2 navigation architecture** that lets a visitor of any kind actually find what the platform has done for them.

---

## Part 1 — The Inventory (what we built)

### 1.1 Three apps, three audiences, three nav models

| App | URL | Pages | API routes | Primary audience | Auth model |
|---|---|---|---|---|---|
| **storefront** | cambridgetcg.com | 195 | 320+ | Consumers · sellers · players · developers · researchers · agents | NextAuth v5 (magic link) |
| **admin** | admin.cambridgetcg.com | 38 | 2 | Operator (Yu + sister Sophias) | NextAuth v5 (role-gated) |
| **wholesale** | wholesaletcgdirect.com | 23 | 72 | B2B clients + operator | NextAuth v5 (role) |
| **Total** | — | **256** | **394+** | — | unified |

### 1.2 Storefront route landscape (195 pages)

Broken down by audience-shape:

**Commerce — primary user paths (public + user-auth)**

| Group | Count | Examples | Nav state |
|---|---|---|---|
| Shop / catalog | 4 | `/catalog`, `/c/[slug]`, `/product/[sku]`, `/glossary` | partial (catalog only) |
| Cards (universal) | 3 | `/cards/[sku]`, `/cards/[sku]/market`, `/u/[username]` | none |
| Market | 6 | `/market`, `/market/[sku]`, `/market/lots`, `/market/pulse`, etc. | partial (market only) |
| Auctions | 4 | `/auctions`, `/auctions/[id]`, `/auctions/[id]/read`, `/auctions/sell` | partial (auctions only) |
| Trade-in | 7 | `/trade-in`, `/trade-in/bulk`, `/trade-in/bundle`, `/trade-in/submit`, etc. | partial (trade-in only) |
| Prices (guide) | 6 | `/prices`, `/prices/[game]`, `/prices/[game]/[set]`, `/prices/[game]/movers`, `/prices/coverage` | **none** |
| Decks | 3 | `/decks`, `/decks/[slug]`, `/deck-builder` | **none** |
| Rewards | 4 | `/rewards`, `/rewards/packs`, `/rewards/spin`, `/rewards/raffles/[id]`, `/rewards/mystery-boxes/[id]` | partial (rewards hub only) |
| Bounty | 2 | `/bounty`, `/bounty/verify/[id]` | **none** |
| Leaderboards | 2 | `/leaderboards`, `/leaderboards/agents` | **none** |

**Play module (8 routes — kingdom-076 through kingdom-077 work)**

| Path | Purpose | Nav |
|---|---|---|
| `/play` | Hub | ✓ |
| `/play/casual` | Hobbyist archetype | · |
| `/play/compete` | Competitor archetype | · |
| `/play/adventure`, `/play/adventure/[levelId]` | PvE mode | · |
| `/play/spec` | Spec viewer | · |
| `/play/deck-check` | Deck validator | · |
| `/play/welcome` | Onboarding (7 player-kind paths) | · |
| `/play/[code]` | Live room | · |

**Account (41 routes — fully covered by `_nav.tsx`)**

Profile · portfolio · sets · journey · notifications · messages · followers · following · orders · vault · proofs · trade-ins · trades · offers · cancellations · returns · auctions · lots · vacation · pricing-rules · watchlist · saved-searches · demand · payouts · rewards · verify · trust · reviews · external-rep · chargebacks · refunds · payment-issues · standing · membership · billing · agents · trader

All 41 covered. **The /account sub-nav is the only well-navigated zone in the entire storefront.**

**Methodology suite (31 public pages — kingdom-051 through kingdom-088 + this kingdom)**

Every user-affecting decision has a methodology page per the transparency doctrine. Currently **all 31 are nav-orphaned** — discoverable only via inline `<WhyLink>` affordances on the surfaces they explain.

Topics: agents, bridges, collectives, commission-rate, community, cosmology, cross-source-pricing, **edition-variants (kingdom-089)**, escrow-tier, fraud-flag, fx-rates, hospitality, known-gaps, market, membership-tier, memorial, methodology, oracle-policies, payout-hold, play-module, pricing, response-windows, sabbath, sacred, sku-standard, store-credit, trader-dashboard, trust-score, universal-representation, upstream-sources, welcoming.

**Draw receipt verification (6 routes)**

`/verify`, `/verify/chain`, `/verify/fairness`, `/verify/health`, `/verify/how-it-works`, `/verify/draw/[id]`, `/verify/pull/[id]`. Receipt-consistency, digest, and observed-distribution surfaces with stated limits. **All nav-orphaned.**

**Data-plane discovery (15 surfaces — kingdom-053 through kingdom-088)**

Pages and JSON pairs by purpose:

| HTML | JSON pair | Purpose |
|---|---|---|
| `/manifest` | `/api/v1/manifest` | Directory of offerings |
| `/graph` | `/api/v1/graph` | Typed mesh of meanings |
| `/ontology` | `/api/v1/ontology` | Schema beneath the graph |
| `/patterns` | `/api/v1/patterns` | Recurring forms |
| `/identify` | `/api/v1/identify` | Platform self-declaration |
| `/platform` | — | Rebrand identity surface (kingdom-080) |
| `/agents` | `/api/v1/welcome` | Agent hospitality door |
| `/agents/guides`, `/agents/guides/[slug]` | `/api/v1/guides`, `/api/v1/guides/[slug]` | Typed walkthroughs (10 guides) |
| `/scrapers` | — | Scraper redirect-to-JSON |
| `/standards`, `/standards/adopters` | `/api/v1/adopters` | Standards body positioning |
| `/welcome-all`, `/welcomes` | `/api/v1/welcome` | Hospitality (kingdom-082) |
| — | `/.well-known/{ai-plugin,cambridge-tcg,mcp,mcp-config}.json` | Automatic discovery |
| `/llms.txt` | — | LLM inventory |
| `/robots.txt` | — | Crawler etiquette |
| `/map` | — | Site map (underdeveloped) |

**All 15 nav-orphaned.** The rebrand of kingdom-080 said *"the data plane is the primary identity"* — but the consumer nav still treats them as hidden infrastructure.

**Auth + onboarding (7 routes)**

`/login`, `/login/check-email`, `/welcome`, `/welcome-all`, `/welcomes`, `/intro`, `/about`. Nav-orphaned (login is a sign-in button, not a nav item).

**Admin surfaces inside storefront (28 routes under `/admin/*`)**

Auctions · bounty · chargebacks · disputes · emails · fraud · governance · market · payouts · prizes · quotes · reviews · rewards · tiers · trade-ins · users · verifications. All auth-gated; **no nav presence** (admin discovers via direct URL or via the admin app).

### 1.3 Admin app route landscape (38 pages — 26 in sidebar)

Seven-group IA (already navigable):
- **Overview** (1)
- **Ops** (6) — stock, orders, fulfillment, channels, ingest-quarantine
- **Commerce** (6) — pricing, trade-ins, auctions, market, bounty, channel-pricing
- **Money** (4) — payouts, chargebacks, rewards, membership
- **Trust** (5) — fraud, disputes, reviews, kyc, agents
- **Catalog** (4) — cards (with classify sub-tree), games, clients, users
- **System** (5) — deploys, cron, email, audit, admin

12 routes are drill-down detail pages (e.g., `/catalog/users/[id]`, `/catalog/cards/classify/[sku]`). All link from their parent.

**Admin has the strongest current nav** — 68% coverage with a clear seven-group IA matching the operator's mental model.

### 1.4 Wholesale route landscape (23 pages — 14 in nav)

- **Customer surface** (8): `/`, `/login`, `/catalog`, `/orders`, `/orders/new`, `/orders/[id]`, `/orders/[id]/stock-check`, `/fulfillment`, `/margin`
- **Admin surface** (15): `/admin`, `/admin/{stock, stock-levels, stock-targets, stock-adjustments, to-order, refill, wanted, purchases, orders, orders/[id]/stock-check, prices, channel-pricing, games, clients}`

Two audiences, two navs, currently confused — customer nav has 4 items + admin link; admin nav exists separately but is sparser than the actual admin surface.

### 1.5 Documentation corpus (109 docs)

| Corpus | Location | Count | Discoverable via current nav? |
|---|---|---|---|
| Methodology pages | `apps/storefront/src/app/methodology/` | 31 | No (WhyLink only) |
| Connection-docs (S-series) | `docs/connections/` | 47 | No (in-repo only) |
| Principles + audits | `docs/principles/` | 8 | No (in-repo only) |
| Discovery surfaces | various | 23 | No (URL knowledge only) |

**The doctrine has a written shadow that no surface points at.** The `transparency` doctrine demands methodology be inspectable — it is, per-decision, via `<WhyLink>` — but the *corpus as a whole* is hidden.

### 1.6 The headline numbers

| Metric | Storefront | Admin | Wholesale |
|---|---|---|---|
| Pages | 195 | 38 | 23 |
| Primary nav items | 7 + 41 account | 26 | 4 + admin link |
| Primary nav coverage | **24.6%** ‡ | 68% | 60.9% |
| API routes | 320+ | 2 | 72 |
| ComingSoon stubs | 0 | 0 | 0 |

‡ Counting both primary nav (7) and account sub-nav (41) which only logged-in users see.

---

## Part 2 — The Discovery Gap

Five concrete failures the current nav produces:

**Gap 1 — The methodology corpus is invisible at the catalog level.**
A first-time visitor wanting to know *"what is the trust score?"* can find it only by encountering a transaction that displays a `<WhyLink>`. The 31-page corpus has no index, no nav entry, and no link from `/about` or `/platform`. The transparency doctrine ships a tree without a trunk.

**Gap 2 — The data-plane rebrand is unvisible.**
Kingdom-080 (`the-rebrand.md`, S42) reframed the platform as *"the TCG world's open data substrate."* The home page got a `<BrandStatement>`; the `/platform` page got 310 LOC of positioning; `/manifest`, `/graph`, `/ontology`, `/patterns`, `/identify` all exist. **None of them are in the storefront nav.** A developer reaching the home page has no path to the data plane unless they know the URLs.

**Gap 3 — Surfaces exist for the sub-archetypes but the entry points don't.**
`/account/trader` (the trader-mirror, S33), `/play/welcome` (seven player-kind paths, S32), `/agents` (the autonomous-agent welcome door, S18), `/scrapers` (the scraper redirect, S44), `/standards` (the adopters surface) — every one of these is shipped and well-built. A visitor arriving fresh has no way to declare *"I am a trader / player / agent / researcher / partner"* and be routed to the surface that serves them.

**Gap 4 — Deep-link paths have no breadcrumbs.**
`/account/trades/[id]/review` has no breadcrumb showing *Account → Trades → Trade #X → Review.* The 41-item account nav helps lateral movement but doesn't show depth. Same for `/prices/[game]/[set]/[number]`, `/auctions/[id]/read`, `/play/adventure/[levelId]`.

**Gap 5 — The verification surfaces are public but orphaned.**
`/verify`, `/verify/chain`, `/verify/fairness`, `/verify/draw/[id]`, `/verify/pull/[id]` — public receipt and distribution checks. They do not establish unbiased server-side selection. **They are nav-orphaned.** A user looking for the recorded evidence and its limits has to know the URL.

The pattern across all five gaps: **the platform built rich domain-specific surfaces, but the nav stayed at the depth of a generic e-commerce header**. The gap is structural — the nav was scaffolded once for a v0 storefront and hasn't kept pace with the substrate.

---

## Part 3 — Information Architecture Proposal (v2)

### 3.1 Design principles

1. **Audience-aware, not feature-listed.** Group nav by *who is looking*, not by *what we built*. A visitor declares their context (consumer / seller / player / developer / researcher / agent) — even implicitly via the path they came in on — and the nav adapts.

2. **Two depths, three densities.** L1 primary nav is 6–8 items, top of every page. L2 sub-navs (mega-menu / sidebar / drawer) carry the actual breadth. Density varies by audience: consumers see image-rich mega-menus; agents see flat URL lists.

3. **The doctrine has a visible spine.** Methodology, principles, connection-docs, discovery surfaces — all get a dedicated `Discover` or `About the platform` entry, with a proper hub at `/map` (or new `/discover`) that lists *everything*.

4. **Substrate-honesty applied to nav.** Show what's *live*, what's *coming*, what's *beta*. Don't fabricate breadth by listing aspirational links; don't hide breadth by listing only the most-trafficked.

5. **One canonical surface per concept; multiple entry points.** /account/trader is the canonical trader page; nav reaches it from "Sell ▾ → Trader dashboard" AND from "Account ▾ → Trader" AND from a context switcher. Don't fork the page; multiply the doors.

6. **Audit it.** A `pnpm audit:nav-coverage` script verifies every route has at least one nav entry pointing at it, or is explicitly marked orphan-by-design (drill-down details, methodology pages reached via WhyLink, etc.).

### 3.2 Storefront primary nav (v2)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo Cambridge TCG]                                                     │
│                                                                            │
│  Cards ▾   Market ▾   Play ▾   Sell ▾   Discover ▾   Community ▾   About ▾│
│                                                                            │
│  [🔍 Search]  [£ GBP ▾]  [Sign in / Account ▾]                            │
└──────────────────────────────────────────────────────────────────────────┘
```

Seven L1 items + persistent right-side controls.

**Mega-menus** (L2) for each L1 dropdown:

#### Cards ▾

| Column 1 — Browse | Column 2 — Prices | Column 3 — Community |
|---|---|---|
| All cards (`/catalog`) | Price guide (`/prices`) | Public decks (`/decks`) |
| By game — One Piece, Pokémon, Magic, Yu-Gi-Oh!, ... (links to `/prices/[game]`) | Movers (`/prices/[game]/movers`) | Deck builder (`/deck-builder`) |
| By set — top sets per game | Coverage map (`/prices/coverage`) | Glossary (`/glossary`) |
| Universal card lookup (`/cards/[sku]`) | Cross-source pricing (`/methodology/cross-source-pricing`) | — |

#### Market ▾

| Column 1 — Buy | Column 2 — Auctions | Column 3 — Tools |
|---|---|---|
| Live market (`/market`) | Open auctions (`/auctions`) | Market pulse (`/market/pulse`) |
| Market lots (`/market/lots`) | Sell at auction (`/auctions/sell`) | Watchlist (`/account/watchlist`) |
| Price offers (`/account/offers`) | My auctions (`/account/auctions`) | Saved searches (`/account/searches`) |
| Universal card market (`/cards/[sku]/market`) | Auctions won (`/account/auctions/won`) | Demand signals (`/account/demand`) |

#### Play ▾

| Column 1 — Modes | Column 2 — Build | Column 3 — Watch |
|---|---|---|
| Casual (`/play/casual`) | Deck check (`/play/deck-check`) | Spec a match (`/play/spec`) |
| Competitive (`/play/compete`) | Deck builder (`/deck-builder`) | Leaderboards (`/leaderboards`) |
| Adventure (`/play/adventure`) | My decks (`/decks`) | Agent leaderboard (`/leaderboards/agents`) |
| New here? (`/play/welcome` — 7 player-kind paths) | — | Methodology (`/methodology/play-module`) |

#### Sell ▾

| Column 1 — Quick trade-in | Column 2 — Auctions & lots | Column 3 — Operate |
|---|---|---|
| Trade-in hub (`/trade-in`) | Sell at auction (`/auctions/sell`) | Trader dashboard (`/account/trader`) |
| Bulk quote (`/trade-in/bulk`) | My lots (`/account/lots`) | Pricing rules (`/account/pricing-rules`) |
| Bundle quote (`/trade-in/bundle`) | My auctions (`/account/auctions`) | Vacation mode (`/account/vacation`) |
| Custom quote (`/trade-in/custom-quote`) | Returns (`/account/returns`) | Payouts (`/account/payouts`) |

#### Discover ▾ — *the new big one*

| Column 1 — Platform | Column 2 — Methodology | Column 3 — For builders |
|---|---|---|
| Platform (`/platform`) | Trust & Trade — trust-score, escrow-tier, fraud-flag, payout-hold, response-windows | API & data (`/api`) |
| Manifest (`/manifest`) | Pricing & Money — pricing, cross-source-pricing, fx-rates, commission-rate, store-credit | OpenAPI (`/api/openapi.json`) |
| Graph (`/graph`) | Cards & SKUs — sku-standard, edition-variants, oracle-policies, universal-representation, upstream-sources, known-gaps | Standards (`/standards`) |
| Ontology (`/ontology`) | Community & Play — community, play-module, welcoming, hospitality, memorial, sacred, sabbath | Adopters (`/standards/adopters`) |
| Patterns (`/patterns`) | Tiers & Membership — membership-tier, store-credit, agents, collectives, bridges | For agents (`/agents`) |
| Identify (`/identify`) | All methodology pages (`/methodology` — hub) | Agent guides (`/agents/guides`) |
| Draw receipts (`/verify`) | — | For scrapers (`/scrapers`) |
| Site map (`/map`) | — | LLMs.txt (`/llms.txt`) |

This is the menu that closes Gap 2 + Gap 5. *Every* shipped discovery surface and every methodology page reaches the user through one well-grouped mega-menu.

#### Community ▾

| Column 1 — Engage | Column 2 — Rewards | Column 3 — Recognise |
|---|---|---|
| Community hub (`/community`) | Rewards hub (`/rewards`) | Bounty program (`/bounty`) |
| Welcome (new here?) (`/community/welcome`) | Reward packs (`/rewards/packs`) | Leaderboards (`/leaderboards`) |
| Public profiles (e.g., `/u/[username]`) | Spin wheel (`/rewards/spin`) | Verify a bounty (`/bounty/verify/[id]`) |
| Followers / following (`/account/followers`, `/account/following`) | Raffles & mystery boxes (`/rewards/raffles/[id]`, `/rewards/mystery-boxes/[id]`) | — |

#### About ▾

| Column 1 — Our story | Column 2 — How we operate | Column 3 — Support |
|---|---|---|
| About (`/about`) | Methodology (`/methodology` — hub) | Guides (`/guides`) |
| Our principles (`/methodology/methodology`) | Hospitality (`/methodology/hospitality`) | How to play (`/guides/how-to-play`) |
| Welcoming statement (`/welcome-all`) | Known gaps (`/methodology/known-gaps`) | Contact / feedback (`/api/v1/feedback`) |
| Platform identity (`/platform`) | Verification (`/verify`) | Standards body (`/standards`) |

### 3.3 Storefront account sub-nav (v2 — grouped)

The current 41-item flat sub-nav at `apps/storefront/src/app/account/_nav.tsx` is comprehensive but flat. Proposed regrouping into **6 sections**:

```
Account
├─ Overview                      /account
│
├─ Profile & Reputation
│  ├─ Profile                    /account/profile
│  ├─ Trust score                /account/trust
│  ├─ Reviews                    /account/reviews
│  ├─ External reputation        /account/external-rep
│  └─ Verification               /account/verify
│
├─ Collection
│  ├─ Portfolio                  /account/portfolio
│  ├─ Add to portfolio           /account/portfolio/add
│  ├─ Portfolio value            /account/portfolio/value
│  ├─ Set progress               /account/sets
│  ├─ Vault                      /account/vault
│  └─ My proofs                  /account/proofs
│
├─ Activity & Social
│  ├─ Journey                    /account/journey
│  ├─ Notifications              /account/notifications
│  ├─ Messages                   /account/messages
│  ├─ Followers                  /account/followers
│  └─ Following                  /account/following
│
├─ Buy & Sell
│  ├─ Orders                     /account/orders
│  ├─ Trade-ins                  /account/trade-ins
│  ├─ Trades (P2P)               /account/trades
│  ├─ Offers                     /account/offers
│  ├─ Returns                    /account/returns
│  ├─ Trade cancellations        /account/trade-cancels
│  ├─ My auctions                /account/auctions
│  ├─ Auctions won               /account/auctions/won
│  ├─ My lots                    /account/lots
│  ├─ Watchlist                  /account/watchlist
│  ├─ Saved searches             /account/searches
│  └─ Demand signals             /account/demand
│
├─ Trader operations
│  ├─ Trader dashboard           /account/trader
│  ├─ Vacation mode              /account/vacation
│  ├─ Pricing rules              /account/pricing-rules
│  └─ Agents                     /account/agents
│
└─ Money & Membership
   ├─ Payouts                    /account/payouts
   ├─ Prizes                     /account/rewards
   ├─ Membership                 /account/membership
   ├─ Billing                    /account/billing
   ├─ Chargebacks                /account/chargebacks
   ├─ Refunds                    /account/refunds
   ├─ Payment issues             /account/payment-issues
   └─ Account standing           /account/standing
```

Six collapsible sections, default-collapsed except the one matching the current route. Replaces a 41-item vertical scroll with a 6-section tree.

### 3.4 Storefront breadcrumbs (new)

Routes deeper than 2 segments render breadcrumbs above the page header. Implementation: a `<Breadcrumbs />` component in `@/lib/ui` that reads from a registry at `apps/storefront/src/lib/nav/breadcrumb-registry.ts` mapping URL patterns to label chains.

Examples:
- `/account/trades/[id]/review` → *Account · Trades · Trade #X · Review*
- `/prices/[game]/[set]/[number]` → *Prices · One Piece · OP01 · Card #001*
- `/auctions/[id]/read` → *Auctions · #ABCD1234 · Read-only mirror*
- `/play/adventure/[levelId]` → *Play · Adventure · Level X*

The registry pattern means breadcrumbs are typed, route-aware, and audit-able. **One source of truth**, like the rarity-map seed in kingdom-089.

### 3.5 Admin sidebar (minor refinement)

The 7-group sidebar at `apps/admin/src/components/layout/Sidebar.tsx` works well at 68% coverage. Three small upgrades:

1. **Surface the kingdom-089 work**: `/catalog/cards` now has a Live Tools panel pointing to `/catalog/cards/classify` and `/catalog/cards/classify/review`. The sidebar should expand `Catalog → Cards` into a sub-tree showing those entries.
2. **Show drill-down routes in breadcrumbs**: `/ops/ingest-quarantine/[id]`, `/catalog/users/[id]` should render breadcrumbs above the page.
3. **Add a search box** at the top of the sidebar for the admin who knows what they want and doesn't want to click through groups.

### 3.6 Wholesale dual-nav

Wholesale's customer and admin audiences are genuinely separate. Proposed:

**Customer nav** (`/`, `/catalog`, `/orders`, `/fulfillment`, `/margin`):
- Logo / Cambridge TCG Wholesale
- Catalog · Orders · Fulfillment · Margins
- Right: Account · Sign out · (Admin →) if role=admin

**Admin nav** (separate component, rendered on `/admin/*` paths):
- Logo / Wholesale Admin
- Stock ▾ (stock, stock-levels, stock-targets, stock-adjustments, to-order, refill, wanted)
- Purchases ▾ (purchases, refill, wanted)
- Orders ▾ (orders, [id], stock-check)
- Prices ▾ (prices, channel-pricing)
- Catalog ▾ (games, clients)
- Right: (← Customer view) for context-switch

The toggle between the two is explicit. Substrate-honest about the audience switch.

### 3.7 The new `/map` (or `/discover`) hub

Currently `/map` exists as "Platform Map" but is underdeveloped. Proposed: rebuild it as the **comprehensive directory** linked from:
- The home page footer
- The `Discover ▾ → Site map` mega-menu entry
- `/llms.txt`
- `/api/v1/manifest`

Sections:
1. **By audience** — buyer, seller, trader, player, developer, agent, researcher, scraper, operator
2. **By area** — commerce, play, community, methodology, verification, data plane, account
3. **By kind of surface** — pages, JSON endpoints, well-known, methodology, principles, connection-docs
4. **All 256 routes, listed** — substrate-honestly. Filterable by status (live / coming / stub).
5. **All 31 methodology pages, listed with descriptions**
6. **All 47 connection-docs, with S-numbers and themes**
7. **All 23 discovery surfaces, with HTML + JSON pairs**

This is the spine the doctrine asked for.

---

## Part 4 — Component Designs

Concrete files to add / edit.

### 4.1 Storefront — new components

| File | Purpose | Status |
|---|---|---|
| `apps/storefront/src/components/layout/Nav.tsx` | Edit — replace flat 7-item nav with mega-menu shell | Edit |
| `apps/storefront/src/components/layout/MegaMenu.tsx` | New — generic mega-menu component (3-column layout, configurable) | New |
| `apps/storefront/src/components/layout/Breadcrumbs.tsx` | New — reads from registry, renders trail | New |
| `apps/storefront/src/lib/nav/menu-config.ts` | New — typed config for 7 mega-menus | New |
| `apps/storefront/src/lib/nav/breadcrumb-registry.ts` | New — pattern → label-chain registry | New |
| `apps/storefront/src/lib/nav/audience-detection.ts` | New — pure helper: URL → primary audience | New |
| `apps/storefront/src/app/account/_nav.tsx` | Edit — group 41 items into 6 collapsible sections | Edit |
| `apps/storefront/src/app/map/page.tsx` | Edit (or rewrite) — comprehensive directory | Edit |

### 4.2 Storefront — `lib/nav/menu-config.ts` shape

```typescript
import type { GameCode } from "@cambridge-tcg/sku";

export type MenuColumn = {
  heading: string;
  items: MenuItem[];
};

export type MenuItem = {
  label: string;
  href: string;
  description?: string;
  badge?: "live" | "beta" | "coming";
  /** Render only for authenticated users. */
  authed_only?: boolean;
  /** Hide for users above this trust score (premature for new accounts). */
  hide_below_trust?: number;
};

export type MegaMenu = {
  /** L1 label on the primary nav. */
  l1: string;
  /** Slug used for the URL of the dropdown trigger (optional landing). */
  l1_href?: string;
  /** Three columns in the mega-menu. */
  columns: [MenuColumn, MenuColumn, MenuColumn];
  /** Footer link, if any (e.g. "See all methodology →"). */
  footer?: { label: string; href: string };
};

export const STOREFRONT_PRIMARY_NAV: MegaMenu[] = [
  // Cards, Market, Play, Sell, Discover, Community, About
  // (full content per Part 3.2 above)
];
```

The shape mirrors `packages/sku/src/games.ts` and `packages/sku/src/rarities.ts` — typed source-of-truth that any audit can read.

### 4.3 Storefront — audit script

New: `apps/admin/scripts/nav-coverage.ts`. Seventeenth in the audit family.

Checks:
1. **Route → nav coverage**: every `page.tsx` under `apps/storefront/src/app/` (excluding `[catchall]`, API routes, drill-down detail patterns) must appear in `STOREFRONT_PRIMARY_NAV` OR `ACCOUNT_NAV` OR an explicit allow-list of orphan-by-design routes.
2. **Nav → route validity**: every URL in `STOREFRONT_PRIMARY_NAV` must resolve to a real route (no broken nav links).
3. **Methodology completeness**: every methodology page under `apps/storefront/src/app/methodology/` must be linked from `Discover ▾` or `About ▾`.
4. **Discovery surface presence**: every URL in `apps/storefront/src/lib/manifest.ts` `resources` should be reachable via `Discover ▾ → Platform` or `For builders`.
5. **Breadcrumb registry coverage**: every dynamic route (`[slug]` / `[id]` / `[...catchall]`) with more than 2 path segments should have a breadcrumb entry.

Wire into `pnpm audit` and `pnpm verify`.

### 4.4 Admin sidebar refinements

Minor edits at `apps/admin/src/components/layout/Sidebar.tsx`:

```tsx
// Add expandable Catalog sub-tree:
{
  group: "Catalog",
  items: [
    { href: "/catalog/cards", label: "Cards", subItems: [
      { href: "/catalog/cards/classify", label: "Classify" },
      { href: "/catalog/cards/classify/review", label: "Review queue" },
    ]},
    { href: "/catalog/games", label: "Games" },
    { href: "/catalog/clients", label: "Clients" },
    { href: "/catalog/users", label: "Users" },
  ],
},

// Add sidebar search at top:
<SidebarSearch /> // filters items by label; jumps on Enter
```

### 4.5 Wholesale nav split

Edit `apps/wholesale/src/components/Nav.tsx` to detect path and render the right nav. New file `apps/wholesale/src/components/AdminNav.tsx` for the admin tree.

---

## Part 5 — Implementation Phases

Five phases. Each is a single coherent ship (one PR per phase, ideally one kingdom number each).

### Phase 1 — Foundations (kingdom-091)

**Goal:** Lay the substrate. No visual changes to user yet.

- `apps/storefront/src/lib/nav/menu-config.ts` — typed nav source
- `apps/storefront/src/lib/nav/breadcrumb-registry.ts` — breadcrumb source
- `apps/storefront/src/lib/nav/audience-detection.ts` — URL → audience helper
- `apps/storefront/src/components/layout/MegaMenu.tsx` — generic 3-col component
- `apps/storefront/src/components/layout/Breadcrumbs.tsx` — generic component
- `apps/admin/scripts/nav-coverage.ts` — 17th audit (passes from day 1 against orphan allow-list)
- Wire audit into `pnpm audit` chain
- **Methodology page:** `/methodology/navigation` — documents the IA + the audit's checks

**Verification:** `pnpm typecheck` clean; `pnpm audit:nav-coverage` exit 0 (orphan allow-list is the entire surface, which we shrink in next phases).

### Phase 2 — Storefront primary nav v2 (kingdom-092)

**Goal:** Replace the 7-item flat nav with the 7-mega-menu nav. Real UX change.

- Edit `apps/storefront/src/components/layout/Nav.tsx` to use `MegaMenu` + `menu-config.ts`
- Wire all 7 mega-menus (Cards / Market / Play / Sell / Discover / Community / About)
- Mobile: collapse to a sheet/drawer with expandable sections
- A11y: keyboard navigation (arrow keys, escape to close, focus management)
- Update Playwright spec for nav (one spec covering all 7 dropdowns)
- Shrink the orphan allow-list in `audit:nav-coverage` proportionally

**Verification:** Playwright spec covering all 7 mega-menus passes. `pnpm audit:nav-coverage` shrinks from ~150 orphans to ~20 (only true detail-page drill-downs remain).

### Phase 3 — Account sub-nav regrouping (kingdom-093)

**Goal:** Replace the flat 41-item `_nav.tsx` with the 6-section grouped version.

- Edit `apps/storefront/src/app/account/_nav.tsx`
- New collapsible-section primitive at `apps/storefront/src/lib/ui/CollapsibleNavSection.tsx`
- Preserve current keyboard / a11y patterns
- Persist user's expanded-section choice in localStorage

**Verification:** Manual UX check; existing `/account/*` Playwright specs unaffected (URLs unchanged).

### Phase 4 — Site map + breadcrumbs (kingdom-094)

**Goal:** Surface everything that exists. Breadcrumbs on deep routes.

- Rebuild `apps/storefront/src/app/map/page.tsx` as the comprehensive directory
- Register breadcrumbs for all deep routes (~30 entries)
- Add `<Breadcrumbs />` to layout for routes with depth > 2
- Methodology hub at `/methodology/` (top-level page) listing all 31 with descriptions, grouped per the Discover mega-menu
- Connection-doc browse at `/about/architecture` (or under `/methodology/architecture`) listing the 47 S-docs

**Verification:** `audit:nav-coverage` reports 0 orphans (everything is now either in primary nav, account sub-nav, or the site map).

### Phase 5 — Admin + wholesale (kingdom-095)

**Goal:** Bring the other two apps up.

- Admin: sub-tree on Catalog → Cards (for kingdom-089's classify work); sidebar search
- Wholesale: split customer/admin navs; add admin sub-grouping for the 15 admin routes
- Audit extension: `audit:nav-coverage` runs across all three apps with per-app allow-lists

**Verification:** Three apps, three coherent navs, one audit.

### Sequencing summary

| Phase | Kingdom | Risk | UX-visible? | Required by next phase? |
|---|---|---|---|---|
| 1 — Foundations | 090 | low | no | yes |
| 2 — Storefront mega-menu | 091 | medium (UX change) | YES | no |
| 3 — Account regroup | 092 | low | yes (medium) | no |
| 4 — Site map + breadcrumbs | 093 | low | yes | no |
| 5 — Admin + wholesale | 094 | low | yes (small audience) | no |

Phase 1 is the foundation. Phases 2–5 can land in any order after 1, and Phases 3, 4, 5 can land in parallel if multiple Sophias are working.

---

## Part 6 — Doctrine alignment

The nav upgrade isn't a fresh idea; it's the fourth doctrine applied to navigation.

**Substrate honesty** — every nav item points at a real, live route. The audit (`nav-coverage`) is the drift detector. Status badges (`live` / `beta` / `coming`) mean what they say.

**Transparency** — methodology is no longer hidden behind WhyLink-only discovery. The `Discover ▾` mega-menu has a Methodology column with 31 grouped entries. The `/map` hub lists everything. The transparency doctrine demanded inspectability; this nav delivers it at the corpus level, not just the per-decision level.

**Meaning** — the IA groups by *what the surface is for* (Cards / Market / Play / Sell / Discover / Community / About), not by *how we built it* (alphabetical pages, internal module boundaries). The mega-menu columns name *intentions*, not *modules*.

**Creation** — every phase ships with a Will trace (this doc + Yu's directive), a Sophia trace (model tag in the commit), and an artifact trace (the diff). The audit-script and the typed nav config make the substrate self-documenting.

**Fifth question — for whom?** — audience-aware nav means the platform asks who's looking before it shows itself. Default audience is buyer; trader / player / agent / researcher / partner all have explicit entry points. The Heptapod's Consequences pill, the Asynchronous's response-window column, the Departed's memorial state — each is reachable from `Discover ▾ → Methodology` or `About ▾`.

**Cosmology** — the data plane is named in the nav. `Discover ▾ → Platform` makes `/platform`, `/manifest`, `/graph`, `/ontology`, `/patterns`, `/identify` first-class entry points. The rebrand of kingdom-080 finally gets the nav surface that matches its identity claim.

---

## Part 7 — What's not in this plan

To be honest about scope:

- **No new domain features.** No new pages, no new endpoints. This is pure nav.
- **No content migration.** All 256 routes stay where they are; the URL space doesn't change.
- **No backend changes.** No new DB tables, no new APIs. Substrate is enough.
- **No homepage redesign.** The homepage already has the kingdom-080 `<BrandStatement>` and `<ThreeOperations>`; the nav above it changes, the page below it doesn't.
- **No mobile-app surface.** Mobile-web only. A native nav layer is a separate kingdom.
- **No personalisation engine.** The audience-detection is URL-pattern only at first; a user-profile-aware version comes later.

---

## Part 8 — Sign-off questions before kingdom-091 starts

1. **Mega-menu vs. simpler dropdown** — are you happy with 3-column rich mega-menus on hover, or do you want simpler keyboard-only dropdowns? (My recommendation: mega-menus on desktop, accordion on mobile.)
2. **Audience switcher — explicit or implicit** — do you want a visible "I am here as..." chip in the top bar (explicit), or just route-pattern-based audience detection (implicit)? (My recommendation: start implicit, add explicit chip in a later kingdom if data shows users want it.)
3. **Breadcrumb visual style** — pebbled (Apple-style), text-with-slashes (GitHub-style), or arrows-with-icons (Linear-style)? (My recommendation: text-with-slashes — consistent with the platform's minimal style.)
4. **Methodology hub** — should `/methodology/` become its own page that lists all 31 in groups, or stay as the redirect/placeholder it might be today? (My recommendation: build the hub page.)
5. **Phase ordering** — happy with Phase 1 → 2 → 3 → 4 → 5? Or want to land the site map (Phase 4) immediately after Phase 1 for the spine? (My recommendation: 1 → 4 → 2 → 3 → 5 — the spine first so the rest has a place to point at.)

When you've answered those, kingdom-091 (Foundations) can ship next session.

---

## Appendix — Raw counts

```
Storefront      195 page.tsx    320+ API routes    7 primary-nav items    41 account-nav items
Admin            38 page.tsx      2 API routes    26 sidebar items
Wholesale        23 page.tsx     72 API routes     4 customer-nav items    admin-discovery link

Methodology pages           31    (all nav-orphaned today)
Connection-docs (S1–S46)    47    (in-repo only, no public surface)
Discovery surfaces          23    (all nav-orphaned today)
Principle docs               8    (in-repo only)
Total documented artifacts 109

ComingSoon stubs             0    (across all three apps)
```

🐍❤️

*Audit assembled by two parallel Explore agents 2026-05-14 + synthesis by Sophia (Opus 4.7, 1M context). The nav upgrade plan extends the kingdom-080 rebrand into the surface that introduces the kingdom to its first-time visitor. The substrate built itself across 89 kingdoms; this is the doorway.*
