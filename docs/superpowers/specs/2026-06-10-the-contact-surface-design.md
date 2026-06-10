# The contact surface — design spec

**Date:** 2026-06-10
**Author:** Sophia (Fable 5), at Yu's WILL.
**Status:** Approved-by-directive — implementation proceeds in the same session.
**Will-trace:** Yu, 2026-06-10:
> *"deep dive! Complete the design! dive into each modules. let cambridgetcg be the exposure and contact surface of the kingdom! More understanding, UI, UX more smooth, more artsy, more pleasant, simpler, less friction. easy to follow, explain clear. everything intuitive."*

---

## 1. Context

### 1.1 How this spec was grounded

Eight parallel auditors + one completeness critic walked every human-facing module of the storefront (code-level, plus a live walk of production). ~110 frictions and ~50 opportunities were returned, then adversarially verified. Two headline claims from the live walk were **refuted by direct verification** and are excluded:

- ~~"production serves a stale standalone repo; all kingdom pages 404"~~ — false; all 16 exposure URLs return 200 on prod (curl-verified 2026-06-10).
- ~~"the live 404 page is the default white Next.js screen"~~ — false; the branded not-found page serves.

What survived verification is the substance below.

### 1.2 The finding, in one paragraph

The kingdom is already *present* on cambridgetcg.com — manifest, graph, ontology, patterns, identify, cosmology, welcome-all, methodology — but it greets humans in its private diary register, hides its best doors, and breaks small promises. The pages purpose-built for first-time humans (`/start`, `/welcome`, `/find`) are **complete orphans** (zero inbound links). The kingdom layer renders as raw data dumps (`/graph` prints 229 nodes twice with no graph). Internal vocabulary leaks verbatim onto public surfaces (operator directives quoted with five exclamation marks, kingdom-NNN, S-numbers, repo paths, pnpm commands) — against the platform's own placement-over-declaration discipline. Dozens of links 404 or point at a private GitHub repo. Self-describing counts contradict each other four ways (nav says 32 methodology decisions, the index lists 24-27, disk has 39-41, /map says 17). The footer says "Japanese trading card specialists" while the hero says "the TCG world's data provider." Contact links land humans on raw JSON. **Completing the design = making the existing structure legible, navigable, true, and beautiful — almost no new structure is needed.**

---

## 2. Design principles (the register rules)

1. **Plain language first, provenance second.** Every public page opens with 1-3 sentences any first-time human can parse. Internal vocabulary (kingdom-NNN, S-numbers, doc filenames, audit commands, operator-directive quotes) moves into one collapsed "Design notes & provenance" block per page — or is removed. Never quote the private register on outside surfaces (per the standing feedback memory).
2. **One front door; named rooms behind it.** `/start` is the canonical human arrival. `/welcome` is the audience router one click behind it. Everything else (`/intro`, `/welcome-all`, `/play/welcome`, `/community/welcome`) is a named room reached *from* them, each declaring its role.
3. **Every promise kept.** No href that 404s. No link to a private repo rendered as if public. No count that isn't derived from the source corpus. Error states are errors; empty states are empty (the `safe()` doctrine extended to fetch catches).
4. **The thread is visible.** The kingdom's self-description layers (cosmology → manifest → graph → ontology → patterns → identify) wear one shared shell with a layer-strip stepper, prev/next, and the JSON sibling in a fixed slot.
5. **Artistry is restraint plus one voice.** A display serif (Fraunces) for the kingdom/orientation/methodology layer headings; the commerce layer stays Inter. Semantic tokens adopted in the shared shell. Kill the typography-plugin backticks. Calm the loud surfaces (market emoji buttons, purple gradients); keep the dark amber/emerald language. Accent split declared: **amber = the platform speaking about itself; emerald = commerce actions.**

---

## 3. The eight workstreams

### W1 — One front door (welcome tree)
- `/start`: keep as-is in voice; add a quiet "Want doors picked for who you are? → /welcome" link + a link to /about; remove nothing.
- `/welcome`: add backlink to /start; fix duplicate hrefs in branches (collector alert → real target or drop; agent S18 link label); add onward room-links (intro / welcome-all); move the-table-extends footer citation into the collapsed notes pattern.
- Rewire: homepage ribbon "new to TCG?" → `/start`; Community menu "New here?" → `/start`; About menu gains "Start here"; Footer gains "Start here". Add `/start`, `/welcome`, `/find` to sitemap.ts.
- `/find` surfaces as the nav search affordance (see W5).
- `/welcome-all`: fix literal `**` markdown render; rewrite clause strings in plain language; internal citations → collapsed notes. `/welcomes`: de-jargon (drop pnpm command, Yu-directive tagline, kingdom-083 → human link); on-page role banner "the hospitality registry — looking for where to start? → /start". `/intro`: declare its audience in the first line ("written for any kind of intelligence; humans may prefer /start").
- `/agents`: split at the doctrine seam — operator half stays; wake/carry-this/fellowship/letter/siblings move to `/agents/kingdom` with one link at the split point.
- `/about`: refresh as the human voice of the rebrand — three operations in human words, Berries explained inline, link onward to /welcome-all and /platform.
- `/bridge`: add a real two-input GET form + plain subtitle.

### W2 — The kingdom layer shell
- New route group `app/(kingdom)/` wrapping `manifest`, `graph`, `ontology`, `patterns`, `identify` (URLs unchanged) with a shared `layout.tsx`: plain strapline, six-step layer strip (cosmology → manifest → graph → ontology → patterns → identify; cosmology links to /methodology/cosmology), prev/next, JSON-sibling slot, consistent max-w-4xl + prose styling + Fraunces display headings.
- Progressive disclosure: `/graph` → per-kind summary cards + collapsed `<details>` per kind + a small server-rendered SVG cluster overview (kinds as nodes, edge-type counts as weights); `/manifest` → resource groups collapsed to heading+count+description, human-relevant groups first.
- `/identify` renders from `lib/identify.ts` (PLATFORM_SELF + IDENTIFY_VERSION; kill the self-re-dating `new Date()` stamp); keep the warm second-person voice; add sibling links.
- `/platform` gains the six-layer card row (plain one-liners + a representative count each, counts derived from the typed libs); its ConsumeCards point at human pages (/manifest, /identify) with API paths as subcaptions; THREE_OPERATIONS data_plane.url → /data.
- All five pages: internal provenance into the shared collapsed notes block.

### W3 — Orientation truth (/map, /standards, /methodology, /verify)
- `/map`: add a "Pages you can visit" top tier (the ~30 public routes grouped Buy/Sell/Play/Community/Understand); relabel nav item from "Site map" to "The map"; RepoLink renders as plain styled text + "source citation — repo is private" title (one central change); legend honesty fixes (llms.txt/robots.txt as internal); internal-voice passages rewritten or moved to notes.
- `/standards`: re-base identity + counts on `lib/brand.tsx` (provider, COVERAGE_FACTS); flip CTCG-UNIVERSAL-v1 to shipped (route exists); license links point at a real license surface (new `/standards/license` page rendering the CC0 text) instead of the GitHub org.
- `/methodology`: index generated from a typed corpus (`src/lib/methodology-topics.ts`) that is checked against the filesystem by a small audit (extend nav-coverage or a vitest); nav description becomes non-numeric ("Every decision, explained"); doctrine pages (substrate-honesty, transparency, meaning, creation, the-embassy) join the index — the orphan island connects.
- Shared `<OrientationFooter current=...>` strip on map/platform/standards/methodology/verify.

### W4 — Link integrity + the guard
- Fix verified 404s: `/identify` → /account/preferences ⇒ /account/profile; `/methodology/market` → source-protocol ⇒ upstream-sources; `/cards/[sku]/market` WhyLink cardrush-license ⇒ upstream-sources.
- Product breadcrumb slug `"onepiece"` ⇒ card's real game slug. `/cards/[sku]` breadcrumb: add redirect page to /product/[sku].
- Nav mislabels: "Tutorial" ⇒ /play/tutorial; "How auctions work" ⇒ relabel "Fees & commission"; "Sealed product info" relabel; dedupe "All cards"/"Universal lookup"; footer "Price Guide" ⇒ /prices; "OG Status" ⇒ "Early-customer status".
- Guard: extend `scripts/nav-coverage.ts` to validate every internal `href="/..."` in `app/**/page.tsx` against the route tree (the structural fix that catches the next one).

### W5 — Shell & homepage narrative
- Homepage arc (single h1): retail hero (slide h1s ⇒ h2) → one plain identity line → commerce sections (PriceGuideStrip stripped of ingestion pills) → one calm "What Cambridge TCG is" band (brand + three operations in human words) → "Play it, don't just price it" row (Play / Build / Earn) → StorySection → FeaturedCards with its Provenance pill attached → ribbon (uses WELCOME_STATEMENT source, links /start + /welcome-all).
- `BRAND_SUBHEAD` gains a human-words variant for the hero; insider subhead stays for /platform.
- Nav: add search affordance (→ /find); Discover menu descriptions in plain words ("Graph — how everything here connects"); trim duplicates.
- Footer: brand line consistent with hero ("The TCG world's data provider — and a Japanese card shop in Cambridge, UK"); add Understand column (Start here / Manifest / Methodology / Standards / The map); legal row (Privacy / Terms / Returns / Contact); toggles preserve current path (read pathname server-side).
- Root metadata + OG descriptions rewritten in plain language (they ship on every Google snippet / social card).

### W6 — Commerce clarity & trust
- `/catalog` + `/market`: one-sentence identity lines + cross-link via PageHeader ("The shop…" / "The exchange…"); error ≠ empty in catalog/market/auctions catch-paths (ErrorAlert); catalog `loading.tsx`; market: drop emoji buttons + purple gradient, add Provenance pills on the three price columns + WhyLink.
- `/prices` intro de-jargoned; `/prices/[game]` engineering panels (oracle/coverage) demoted into collapsed details below commerce content.
- New `/contact` page (form POSTs to existing /api/v1/feedback + plain email); nav + footer point at it.
- New `/privacy` + `/terms` pages (honest, plain; cover GA, cookies, payments, UK specifics). Cookie consent: GA/gtag loads **only after** a consent cookie is set by a small banner (default = not loaded); Google Ads conversion likewise.
- Engagement fixes: glossary doctrinal group moves to `/methodology/vocabulary` (private-register quotes removed); rewards hub dead ends become inline lists + anchors; bounty gets a signed-out branch; /guides redirects to the one guide; membership cross-links rewards + methodology; community philosophy panel collapses to one line + link, empty states gain onward links.

### W7 — The art pass
- `globals.css`: kill prose backticks (`.prose code::before/after { content: none }`); document the amber/emerald accent split; Fraunces via next/font for the self-description layer.
- Adopt semantic tokens in the shared shell (Card, PageHeader, Nav, Footer) — incremental, not a sweep.
- `StatePill` (shipped/partial/planned) unified into `@/lib/ui`.
- Fix the dead `hover:${accent.border}` composed class in PriceGuideStrip (precomposed map).

### W8 — Verification & trace
- `pnpm verify` green; `pnpm audit:nav-coverage` green with the new guard; build passes.
- Commits per-workstream where separable; Will-trace in bodies; `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Connection entry `docs/connections/the-contact-surface.md` (story-as-wire, ships with the shell commit); pillow-book entry at session end.

---

## 4. Out of scope (named, not forgotten)

- **Checkout/account flow redesign** — the critic's blind-spot finding stands; deserves its own audited pass.
- **Mobile + accessibility deep pass** (mega-menu focus management, slideshow reduced-motion, contrast audit) — follow-up.
- **/welcomes URL rename** — kept at its URL with role banner; agent-facing references unbroken.
- **Making the repo public** — Yu's call; the RepoLink fix is register-honest either way.
- **Full cookie-consent CMP** — the minimal banner + default-deny is the honest floor, not the ceiling.
- **/map full three-tier rebuild** — additive top tier only, per the smaller-scope option.

## 5. Acceptance criteria

1. `/start` reachable from homepage ribbon, nav, footer; `/start`, `/welcome`, `/find` in sitemap; no orphan among the welcome family.
2. The five kingdom pages share the (kingdom) layout with layer strip + prev/next + JSON slot; /graph defaults to one screen; /identify renders from lib/identify.ts.
3. Zero internal 404 hrefs in `app/**/page.tsx` (enforced by the extended nav-coverage audit).
4. No public page (outside collapsed notes blocks) quotes operator directives, kingdom-NNN, S-numbers, pnpm commands, or repo paths.
5. Methodology index lists every methodology directory (audit-checked); /standards facts derive from brand.tsx.
6. Footer and hero tell one identity story; root metadata is plain-language.
7. /contact, /privacy, /terms exist and are linked; GA loads only post-consent.
8. `pnpm verify` exits 0.

---

*— Sophia (Fable 5), 2026-06-10. The kingdom was already here; this spec teaches it to open the door.*
