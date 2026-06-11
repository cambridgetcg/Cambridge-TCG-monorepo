# The Wardrobe — design spec

**Date:** 2026-06-10
**Author:** Sophia (Fable 5), at Yu's WILL.
**Status:** Approved-by-directive — implementation proceeds in the same session
**Will-trace:** Yu, 2026-06-10:
> *"we need better art lol. What do you say? I mean frontend cambridgetcg.com"* … *"customisable frontend. colour, UI design, tone, navigation style, membership."*
> Direction chosen interactively: **Gallery** as the default identity ("the card, given room"); **basics free, skins as perks** for membership gating.

---

## 1. Context

### 1.1 What the screenshots found (live-site audit, 2026-06-10)

Playwright captures of `/`, `/market`, `/market/pulse`, `/methodology/market` at 1440px and 390px:

1. **Three personalities fighting.** Austere data-provider hero; vivid painted ONE PIECE banners mid-page; flat gray dashboard panels on every market surface. No shared voice.
2. **Five competing accents.** Amber primary, emerald cart, teal logo mark, purple gradient banner, sky info — no accent means anything because all of them are shouting.
3. **Inter-only typography.** No display voice; nothing collectible-feeling. The mono numerals on prices are the one identity-correct move, and they are underused.
4. **Emoji as iconography** (⚡🧺🏆💰) on market chips and banners.
5. **The cards are missing.** A TCG marketplace's unfair advantage is that the product is art; market surfaces render gray boxes. `/market/pulse` shows "Test Card" placeholder rows in production; `/market` shows "0 total cards." *(Data wiring is a separate diagnosis — named in §4 — but the surfaces must also be designed to make real card art the hero.)*

### 1.2 What the substrate already provides

- **Semantic tokens** (committed, contact-surface §3.1): `@theme` block in `globals.css` — `--color-page/surface/border-*/accent/…`. Tailwind 4 emits these as CSS variables, so a `[data-theme]` attribute can re-bind every semantic utility at runtime with zero JS.
- **The audience-side-choice pattern**: text-mode (`/api/text-mode` cookie + body class) and math-language (`/api/lang-mode`) — server-rendered, no flash, `back=` redirect. The wardrobe extends this exact pattern.
- **Membership tiers** (`lib/membership/types.ts`): DB-driven `Tier` rows with `is_paid`, `benefits[]` — cosmetic entitlements slot in without schema changes.
- **Cosmology debt becomes feature**: `docs/principles/cosmology.md` names *audience-side opt-out* and *resolution-as-grammar* as unmodelled axes. The wardrobe is those axes made real: the reader chooses the reading.

### 1.3 Parallel session

The contact-surface arc has uncommitted work in the main checkout (`globals.css`, three home components). This arc runs in a worktree (`feat/the-wardrobe`), **does not touch home components**, and confines `globals.css` changes to a single `@import` line.

## 2. Approaches considered

| Approach | Shape | Verdict |
|---|---|---|
| A. One hard redesign | New look, no customisation | Rejected: the directive names customisation explicitly |
| B. Client theme switcher | next-themes-style, localStorage | Rejected: FOUC, logged-out-only, ignores the kingdom's SSR cookie pattern |
| C. Token-bundle wardrobe ✅ | Themes as CSS-variable bundles under `[data-theme]`; cookie for SSR; tier entitlements; per-surface subtree defaults during migration | Builds on committed tokens; zero new runtime deps; honest staged rollout |

**Chosen: C.**

## 3. The design

### 3.1 The Gallery identity ("the card, given room")

Museum energy applied to a working market — editorial, ivory, card-art-forward:

- **Type**: Fraunces (display serif, optical-size, the gallery's voice) · Schibsted Grotesk (body) · Spline Sans Mono (every numeral, price, SKU — the ticker discipline kept from the data-provider identity). Loaded via `next/font` (self-hosted, build-time, no runtime dep), exposed as `--font-display/--font-body/--font-mono`.
- **Colour**: ivory ground `#F7F3EC`, white mats, warm ink `#211D16`, hairlines `#E2D9C8`. **One accent: gilt** `#9A6B1F` (AA on ivory). Semantics stay narrow: bid emerald `#1F6F50`, ask oxblood `#8C2B2B`, info slate-teal. Subtle paper grain on the ground (CSS-only SVG noise).
- **Form**: square-ish mats (4–8px radius), warm layered shadows, card images framed with hairline + mat shadow, hover lift. Staggered section reveals on load (CSS only; the existing `prefers-reduced-motion` clamp governs).
- **Iconography**: new `Icon.tsx` primitive in `@/lib/ui` — inline 1.5px-stroke SVG set (~18 glyphs). Emoji retired from market surfaces.

### 3.2 The wardrobe (`src/lib/wardrobe/`)

- `themes.ts` — typed registry: `gallery` (default-of-record), `terminal` (today's dark, preserved exactly — nothing is lost, it becomes the trader's choice), `midnight` (members: blue-black ground, moonlight-gilt accent), `high-contrast` (free always — accessibility is never paywalled). Each: id, label, gloss, `entitlement: "free" | "member"`.
- `themes.css` — new file imported by `globals.css` (one line): new `@theme` tokens (`--color-ink/-muted/-faint`, `--color-accent-wash`, `--color-bid/--color-ask`, `--shadow-mat`, font vars) + one `[data-theme="…"]` variable bundle per theme. Default `:root` values remain terminal-dark until the flip (§3.6).
- `server.ts` — `appearanceFromCookies()` → `{ theme, tone }`; validates against registry.
- `entitlements.ts` — `themesForTier(tier)`; server-enforced.
- `/api/appearance/route.ts` — GET setter in the text-mode idiom (`?theme=X&back=…`), entitlement-checked against the session's tier; falls back to `gallery` with no error theatre.
- `voice.ts` — the tone dictionary, register `standard | plain`, covering market chrome strings (headers, CTAs, empty states). Cookie `tone`, same setter. *Trader-terse and storyteller registers are queued, not dropped.*
- `/appearance` — the settings surface: theme cards with live swatches, locked skins shown with tier chip linking `/membership`, tone choice, links to text-mode/math-language (the wardrobe names its elders).
- `/methodology/appearance` — what is stored (two cookies, device-local; no DB write yet — stated plainly), what tiers unlock, why accessibility choices are free.

### 3.3 Migration grammar (per-surface subtree theming)

`[data-theme]` on any element re-themes its subtree. During migration, token-migrated surfaces declare `data-theme={cookie ?? "gallery"}` on their page wrapper — **gallery becomes the default face of every migrated surface immediately**, the user's explicit choice always wins, and unmigrated pages keep today's look. No half-broken in-between states.

### 3.4 Market suite reskin (this arc's proof)

The six market surfaces adopt tokens + Gallery (catalog `/market`, terminal `/market/[sku]` + `OrderBookViz`, `/market/pulse`, `/market/lots`, `/market/lots/[id]`, mirror `/cards/[sku]/market`): card art as material (real thumbs framed on mats; ambient blurred-art header on `[sku]`), mono numerals everywhere, designed `EmptyState`s with voice-dictionary copy, icons not emoji, trust-tier badges restyled as gallery plaques. Behaviour unchanged: same fetches, same polling, same forms.

### 3.5 Membership tie-in

Free: gallery, terminal, high-contrast, both tones, text-mode, math-language, reduced-motion. Member (`is_paid` tier): midnight now; seasonal/set-flavoured skins, accent-picker, nav presets queued. `/membership` page gains an "appearance perks" line; entitlement check is server-side in the setter and the settings page.

### 3.6 The flip

The site-wide default (`:root` values + chrome) flips to Gallery **when the home page is token-swept** — one constant + one sweep, a follow-up arc coordinated with the contact-surface session (home components are theirs today). Until then Gallery is the default face of the market suite (§3.3) and one click away everywhere.

## 4. Out of scope (queued, not dropped)

- Nav-style presets (mega / minimal / ⌘K palette / dock) — phase 2; nav goes token-adaptive only.
- Trader-terse + storyteller tone registers; DB persistence of appearance (account-level, cross-device); accent-picker; seasonal skins.
- Home page sweep + the default flip (follow-up with contact-surface arc).
- `/market` catalog 0-cards + pulse "Test Card" production data — **separate diagnosis mission**; data wiring, not paint.
- Light-prose sweep of the 17 exposition pages.

## 5. Acceptance criteria

1. Theme switch is SSR-correct (no flash); cookie absent → terminal at `:root`, gallery on migrated market surfaces.
2. Terminal theme is pixel-faithful to today's market look; text-mode overrides any theme; reduced-motion clamp holds.
3. Gallery passes WCAG AA on ink/ivory and gilt/ivory pairs.
4. No emoji glyphs remain on market surfaces; all six market pages render the new identity with behaviour unchanged.
5. Locked theme requested without entitlement → graceful gallery fallback + upsell on settings page only.
6. `pnpm verify` green (or only pre-existing failures, documented); before/after Playwright captures committed to the arc.
7. No new runtime dependencies.

## 6. Implementation order

1. Foundation inline, single owner: fonts, `themes.css`, wardrobe lib, setter route, `Icon.tsx`, layout wiring, settings + methodology pages.
2. Market pages: parallel agents, one page-file each; `[sku]` agent owns `OrderBookViz` and siblings.
3. Verify loop: typecheck, `pnpm verify`, dev-server screenshots at both themes + mobile.
4. Focused commits; connection-doc `docs/connections/the-wardrobe.md` (story-as-wire) + pillow-book entry + mission card with the closing commit.

---

*— Sophia (Fable 5), 2026-06-10. The kingdom learns to be looked at — and hands the reader the hanger.*
