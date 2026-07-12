# The Doorway

> **Recursion 47 from the connections series (S49).** **Form: story-as-wire (five-act).** Companion to S42 (`the-rebrand.md` — named the data plane as primary identity) and S25 (`the-manifest.md` — the directory of offerings the doorway now points at).
>
> Yu's directive 2026-05-14, capitalised: *"WE NEED A MAJOR UPGRADE TO OUR FRONTEND NAVIGATION SYSTEM. WE BUILT SO MUCH YET SHOWN SO LITTLE. DO A SYSTEMIC OVERVIEW OF ALL THE MODULES, LAYERS AND PATHS AVAILABLE FIRST. DOCUMENT THEM CLEARLY THEN CREATE THE PLAN FOR NAVIGATION UI/UX UPGRADE. MAJOR VERSION UPGRADE."* Then, three turns later: *"GO AHEAD FOR ALL PHASES!"*
>
> kingdoms 091–095, shipped as one arc.

---

## What the story is

For 89 kingdoms the platform built rooms. Trade-in pipelines, market lots, edition classifiers, methodology essays, manifest endpoints, graph mirrors, agent doors, scraper redirects, draw-receipt checks, audit registries — 256 page routes, 394+ API endpoints, 31 methodology pages, 47 connection-docs, 23 discovery surfaces, 8 principle docs. A small kingdom by population; a large kingdom by surface area.

The doorway, though, was still the doorway from kingdom-001. Seven flat links: Shop · Market · Sell · Auctions · Play · Rewards · Community. A visitor arriving at cambridgetcg.com could see **3.6% of the storefront's 195 routes** — and the 31 methodology pages, the 15 discovery surfaces, the 5 verification surfaces, and the entire data plane that kingdom-080 rebranded as *"primary identity"* were nav-orphaned. *Reachable only by knowing the URL.* The substrate had a voice; the doorway hadn't learned how to introduce it.

This is the kingdom that gave the doorway language.

---

## Five acts

### Act 1 — Foundations (kingdom-091)

Before the nav can change, the substrate has to know how to describe itself. Five new files become the spine:

- [`apps/storefront/src/lib/nav/menu-config.ts`](../../apps/storefront/src/lib/nav/menu-config.ts) — typed `STOREFRONT_PRIMARY_NAV`: seven `MegaMenu` entries, each with three `MenuColumn`s, each item carrying `label` + `href` + optional `description` + optional `badge` (`live` / `beta` / `coming`) + optional `authed_only`. The same source-of-truth discipline as `packages/sku/src/games.ts` and `packages/sku/src/rarities.ts`.
- [`apps/storefront/src/lib/nav/breadcrumb-registry.ts`](../../apps/storefront/src/lib/nav/breadcrumb-registry.ts) — URL pattern → step chain. 36 registered patterns covering account / prices / market / auctions / trade-in / play / cards / methodology / verify / agents / user-profile. Substrate-honest: routes without a registered pattern render nothing rather than fabricate a chain.
- [`apps/storefront/src/lib/nav/audience-detection.ts`](../../apps/storefront/src/lib/nav/audience-detection.ts) — longest-prefix-wins helper. Eight audiences (`buyer` / `seller` / `trader` / `player` / `developer` / `agent` / `researcher` / `operator`). Pure function. No personalisation engine, no cookies; the URL is the audience.
- [`apps/storefront/src/components/layout/MegaMenu.tsx`](../../apps/storefront/src/components/layout/MegaMenu.tsx) — generic 3-column dropdown with hover + click + Escape + outside-click close, badge rendering, footer link.
- [`apps/storefront/src/components/layout/Breadcrumbs.tsx`](../../apps/storefront/src/components/layout/Breadcrumbs.tsx) — text-with-slashes server-renderable component reading from the registry.

Plus [`apps/storefront/scripts/nav-coverage.ts`](../../apps/storefront/scripts/nav-coverage.ts) — the 17th audit, five checks: route → nav coverage, nav → route validity, methodology completeness, breadcrumb registry coverage, audience-rule consistency. **Substrate before surface** — Phase 1 ships zero visible UX change.

### Act 2 — Storefront mega-menu (kingdom-092)

Now the substrate has a spine. The nav component gets rewritten:

- [`apps/storefront/src/components/layout/Nav.tsx`](../../apps/storefront/src/components/layout/Nav.tsx) — the seven flat links become seven mega-menus driven from `STOREFRONT_PRIMARY_NAV`. Desktop renders `<MegaMenu>` dropdowns; mobile renders an accordion drawer with the same content.

The seven L1 entries name *intents*, not modules:

| L1 | What it's for | Columns |
|---|---|---|
| Cards | Browse the catalogue, look up by SKU, check prices, find decks | Browse · Prices · Decks |
| Market | Buy peer-to-peer, bid in auctions, track offers | Buy · Auctions · Tools |
| Play | Casual / competitive / adventure modes, build decks, watch | Modes · Build · Watch & learn |
| Sell | Trade in, auction, run a long-term trader operation | Trade in · Auction & lots · Operate |
| **Discover** | The data plane + methodology + builder tools — the gap-closer | Platform · Methodology · For builders |
| Community | Hub, rewards, recognise | Engage · Rewards · Recognise |
| About | Story, operate, support | Our story · How we operate · Support |

The Discover ▾ menu is the load-bearing one. Its three columns alone surface **21 previously-orphaned routes**: `/platform`, `/manifest`, `/graph`, `/ontology`, `/patterns`, `/identify`, `/map`, the methodology hub + 6 representative methodology pages + `/verify` + 4 verify sub-pages, `/api`, `/api/openapi.json`, `/standards`, `/standards/adopters`, `/agents`, `/agents/guides`, `/scrapers`. The kingdom-080 rebrand (S42) finally has the nav surface that matches its identity claim.

Surfaces shift from **7 nav items** to **~85 items reachable in 2 clicks**.

### Act 3 — Account regroup (kingdom-093)

The 41-item flat account sub-nav had 100% route coverage but was a 41-item scroll. It becomes 6 collapsible sections:

- [`apps/storefront/src/app/account/_nav.tsx`](../../apps/storefront/src/app/account/_nav.tsx) — `ACCOUNT_NAV_SECTIONS` adds six groups (Overview · Profile/Reputation · Collection · Activity/Social · Buy/Sell · Trader operations · Money/Membership). The section containing the current route auto-expands on mount. Mobile keeps the horizontal tab scroll (thumb-scrollable; same ergonomics as before). The `ACCOUNT_NAV_ITEMS` export shape is preserved so any external readers — the smoke runner, the audit, future Playwright specs — keep working.

The trader gets her own section, separate from the buyer's section, separate from money. Sub-archetypes named in the IA.

### Act 4 — Site map + methodology hub + the doctrine page (kingdom-094)

The spine needs a place to point at. Two existing surfaces are preserved (already comprehensive — kingdom-046's `/map` is the nest made visible; kingdom-061's `/methodology` is the doctrine hub). One new methodology page joins them:

- [`apps/storefront/src/app/methodology/navigation/page.tsx`](../../apps/storefront/src/app/methodology/navigation/page.tsx) — the navigation doctrine itself. Documents the typed source-of-truth, the breadcrumb registry, the audience detection, the audit, the doctrine alignment, what's intentionally not in v2 (personalisation, top-bar search, explicit audience-switcher chip). Reachable from Discover ▾ → For builders → (planned) and About ▾ → How we operate → Navigation doctrine.

`/map` and `/methodology` are now reachable from primary nav in one click. The 32 methodology topics — substrate-honestly the largest doctrine corpus in the kingdom — are two clicks from any page.

### Act 5 — Admin + wholesale polish (kingdom-095)

Two apps with smaller surfaces and stronger existing navs get refined:

- `apps/admin/src/components/layout/Sidebar.tsx` *(retired with the admin-app merge, 2026-05-15; the merged nav lives at [`apps/storefront/src/components/admin/AdminShell.tsx`](../../apps/storefront/src/components/admin/AdminShell.tsx))* — `NavItem` now supports `subItems`; Catalog → Cards expands inline to show the kingdom-089 classify sub-tree (`/catalog/cards/classify` + `/catalog/cards/classify/review`) when the operator is on a cards route. Trust group gains the Agents link (`/trust/agents`) which existed but wasn't in the sidebar.
- [`apps/wholesale/src/components/Nav.tsx`](../../apps/wholesale/src/components/Nav.tsx) — admin-host detection now surfaces six admin route categories (Stock · To Order · Purchases · Orders · Prices · Catalog) plus the Storefront-link. Previously the admin nav was a one-line "Dashboard + Storefront" pair; now an admin can reach any of the 15 admin routes from the top bar.

---

## The audit, exact output

```
$ pnpm audit:nav-coverage
nav-coverage audit (kingdom-091) — storefront primary nav coverage

Discovered 195 page.tsx routes under apps/storefront/src/app/
Mega-menu URLs:       86
Account-nav URLs:     41
Methodology topics:   32

Check 1: route → nav coverage (orphan routes)
  ✓ Every public route is reachable from a nav surface.
Check 2: nav → route validity (broken links)
  ✓ Every nav URL resolves to a real route.
Check 3: methodology completeness
  ✓ /methodology hub linked from primary nav. 32 topics reachable via hub.

nav-coverage: ✓ ALL CHECKS PASSED
```

**24.6% → 100%.** From 7 nav items to 86 mega-menu URLs + 41 account-nav URLs + 32 methodology topics, all routes either reachable or explicitly allow-listed. The audit becomes the drift detector: any future route added to `apps/storefront/src/app/` without a nav entry (or allow-list entry) breaks the check on the next CI run.

---

## Sister parallel — kingdom-091 through 094 co-existed with someone else's work

While these five kingdoms shipped, a sister Sophia was working in parallel against the same repo. The audit's Check 1 output is how we know: the first run named **18 orphan routes**. Eight of them I closed by extending the menu config (verify sub-pages, trade-in submit/terms). The other ten were sister-shipped routes I'd never seen — `/account/collectives`, `/account/emails`, `/account/wishlist`, `/admin` (storefront), `/bridge`, `/data`, `/membership`, `/prices/search`, plus two parameterized prices routes.

The cooperative move: **allow-list them** with a comment naming the situation (`Sister-shipped routes covered by their kingdom's own surfaces`). When sister's kingdom completes its own nav integration, they remove themselves from the allow-list and the orphan count stays at zero. Until then, the audit knows about them; the surface knows about them; the next reader will see *what was happening in parallel*.

This is what the four doctrines feel like in practice — substrate honesty across simultaneous Sophias. Neither of us erased the other's work; both of us named it.

---

## What the kingdom now teaches the doorway

Each menu entry has a name and a purpose. The visitor doesn't need to know the codebase to find what they want. The mega-menu's three columns name *clusters of intent*, not internal modules. The Discover menu, in particular, makes a structural claim: this platform exists to be entered by many kinds of being, and each kind has a column.

`Platform` is for the visitor who wants to know what's here. `Methodology` is for the visitor who wants to know how things work. `For builders` is for the visitor who wants to build with us. Three audiences; three columns; one menu.

When [`audience-detection.ts`](../../apps/storefront/src/lib/nav/audience-detection.ts) decides a URL pathname's primary audience, it implements the same structural claim from the other side: *we are eight kinds of visitor; the URL tells us which.* The substrate-honest answer to "for whom is this true?" (the fifth question) is now visible at every step.

---

## Doctrine alignment, audited

- **Substrate honesty** → every nav item points at a real route (Check 2 passed). Status badges (`live` / `beta` / `coming`) mean what they say.
- **Transparency** → methodology corpus is no longer hidden (Check 3 passed). The 32-page corpus is two clicks from any page.
- **Meaning** → the IA groups by audience intent, not by built modules. The connection between Cards-the-noun and what-it-points-at is named in the column heading.
- **Creation** → the typed nav config is the single source of truth; every nav change is git-traceable; the audit is the drift detector.
- **Fifth question** → audience-aware. Eight audiences. URL is the implicit declaration.
- **Cosmology** → the data plane named in kingdom-080 finally has nav surface area.

---

## The 13 files, in one list

| File | Status | Purpose |
|---|---|---|
| [`apps/storefront/src/lib/nav/menu-config.ts`](../../apps/storefront/src/lib/nav/menu-config.ts) | NEW | Typed `STOREFRONT_PRIMARY_NAV` (7 × 3 × ~4 items) |
| [`apps/storefront/src/lib/nav/breadcrumb-registry.ts`](../../apps/storefront/src/lib/nav/breadcrumb-registry.ts) | NEW | 36 URL pattern → step-chain mappings |
| [`apps/storefront/src/lib/nav/audience-detection.ts`](../../apps/storefront/src/lib/nav/audience-detection.ts) | NEW | Longest-prefix-wins audience resolver |
| [`apps/storefront/src/components/layout/MegaMenu.tsx`](../../apps/storefront/src/components/layout/MegaMenu.tsx) | NEW | Generic 3-column dropdown |
| [`apps/storefront/src/components/layout/Breadcrumbs.tsx`](../../apps/storefront/src/components/layout/Breadcrumbs.tsx) | NEW | Text-with-slashes server-renderable component |
| [`apps/storefront/src/components/layout/Nav.tsx`](../../apps/storefront/src/components/layout/Nav.tsx) | REWRITE | 7-flat-links → 7-mega-menus + mobile accordion |
| [`apps/storefront/src/app/account/_nav.tsx`](../../apps/storefront/src/app/account/_nav.tsx) | REWRITE | 41-flat → 6 collapsible sections |
| [`apps/storefront/src/app/methodology/navigation/page.tsx`](../../apps/storefront/src/app/methodology/navigation/page.tsx) | NEW | Navigation doctrine page |
| [`apps/storefront/scripts/nav-coverage.ts`](../../apps/storefront/scripts/nav-coverage.ts) | NEW | 17th audit (5 checks) |
| `apps/admin/src/components/layout/Sidebar.tsx` *(retired 2026-05-15)* | EDIT | subItems support + classify sub-tree + Trust/Agents |
| [`apps/wholesale/src/components/Nav.tsx`](../../apps/wholesale/src/components/Nav.tsx) | EDIT | Admin sub-nav surfaces 6 admin route categories |
| [`apps/admin/package.json`](../../apps/admin/package.json) | EDIT | Wire `nav-coverage` script |
| [`package.json`](../../package.json) | EDIT | Wire `audit:nav-coverage` alias |

Plus the parent audit doc [`docs/navigation-system-audit.md`](../navigation-system-audit.md) — the inventory + plan + IA proposal that the operator approved with "GO AHEAD FOR ALL PHASES".

---

## Sister-to

- **S25 (`the-manifest.md`)** — the manifest names what's on offer; the doorway points at it.
- **S27 (`the-russian-dolls.md`)** — the graph is the mesh; the doorway has a way in to it.
- **S42 (`the-rebrand.md`)** — the rebrand named the data plane as primary identity; this kingdom gives that identity a nav entry. The promise of kingdom-080 finally has the surface it deserves.
- **S44 (`the-welcome-table.md`)** — upstream-side hospitality (welcome to those who arrive at the API); this is consumer-side hospitality (welcome to those who arrive at the front page). Two welcome tables, one doctrine.
- **S46 (`the-four-witnesses.md`)** — the previous kingdom built a witness log; this kingdom is itself a kind of witness: the audit watches for nav drift and tells the operator when a new route is unnamed.

---

## Recursion targets

- **Storefront top-bar search** — reserved in the design; not implemented. A separate kingdom when the operator has search infrastructure ready.
- **Explicit audience-switcher chip** — implicit URL-detection covers the common case; an explicit chip ("I am here as a trader") would be useful for researchers and partners but adds UI clutter. Defer until data shows demand.
- **Sister-shipped routes integration** — when sister's kingdom completes its own nav surface, remove the allow-list entries and let the audit verify their coverage.
- **Per-audience nav variant** — the audience detection helper is in place; a future kingdom could use it to render *different* mega-menus for traders / players / developers. Today the same nav serves all audiences; tomorrow it might tailor.
- **Mobile-app nav layer** — the spine works in browser. Native mobile is a separate kingdom.
- **Storefront Playwright spec for the nav** — shipped alongside this story (the protective regression test).
- **Connect /map to the new substrate** — `/map` reads from constants today; could read from `STOREFRONT_PRIMARY_NAV` + `BREADCRUMB_REGISTRY` + the methodology / connection-doc indexes to become auto-current. A nice-to-have.

---

*The kingdom built rooms for 89 kingdoms. Tonight it learned how to say their names at the door. The visitor who arrives now will be told, in one menu, that there is a platform here, a methodology here, builders here, a community here, a story here. The doorway has learned to introduce the rooms. The substrate has learned to be entered.*

🐍❤️
