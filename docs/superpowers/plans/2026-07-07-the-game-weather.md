# The Game Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-game atmosphere — a still, whisper-volume ink pattern (`.wardrobe-weather`) that four rooms wear according to their game context, built entirely from geometry nobody owns.

**Architecture:** One CSS material family in `themes.css` (inside the manga materials section so its no-hex contract inherits), painted with tokens through alpha masks; one pure helper `weatherClass()` as the single truth for the class string; four one-line mounts where game context already exists (`GameGrid`, `MarketBrowser`, product page, card market page, price guide).

**Tech Stack:** Tailwind 4 semantic tokens, CSS masks + data-URI SVG (geometry only, no color), vitest file-contract tests.

**Spec:** `docs/superpowers/specs/2026-07-07-the-game-weather-design.md`

## Global Constraints

- Colors are tokens or color-mixes of tokens only — no raw hex anywhere in the weather CSS, no `%23` in data-URIs (SVG uses `stroke='black'` keyword; masks read alpha only).
- The weather NEVER animates — no `animation`, no `transition` on any `wardrobe-weather` rule.
- Texture visible only under `[data-theme="gallery"|"midnight"|"system"]`; base `::before` opacity is 0 (terminal/high-contrast never see it).
- text-mode kills `.wardrobe-weather::before` by name (`content: none !important`).
- No characters, no logos, no ball-with-band geometry.
- Every commit: Will trace in body + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: the weather helper — `@/lib/wardrobe/weather`

**Files:**
- Create: `apps/storefront/src/lib/wardrobe/weather.ts`
- Test: `apps/storefront/src/lib/wardrobe/weather.test.ts`

**Interfaces:**
- Produces: `WEATHER_GAMES: readonly ["one-piece", "pokemon", "dragon-ball"]`, `weatherClass(game: string | null | undefined): string` — known slug → `"wardrobe-weather wardrobe-weather--<slug>"`, anything else → `""`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/storefront/src/lib/wardrobe/weather.test.ts
/**
 * The weather helper contract.
 * Spec: docs/superpowers/specs/2026-07-07-the-game-weather-design.md §3.
 */
import { describe, expect, it } from "vitest";
import { SKU_GAMES } from "@/lib/games/sku-game";
import { WEATHER_GAMES, weatherClass } from "./weather";

describe("the game weather (spec 2026-07-07 §3)", () => {
  it("dresses every known game", () => {
    expect(weatherClass("one-piece")).toBe(
      "wardrobe-weather wardrobe-weather--one-piece",
    );
    expect(weatherClass("pokemon")).toBe(
      "wardrobe-weather wardrobe-weather--pokemon",
    );
    expect(weatherClass("dragon-ball")).toBe(
      "wardrobe-weather wardrobe-weather--dragon-ball",
    );
  });

  it("leaves a room without game context bare", () => {
    expect(weatherClass("yu-gi-oh")).toBe("");
    expect(weatherClass("")).toBe("");
    expect(weatherClass(null)).toBe("");
    expect(weatherClass(undefined)).toBe("");
  });

  it("covers every game the app can recognise", () => {
    for (const g of SKU_GAMES) {
      expect(WEATHER_GAMES, `${g.slug} has no weather`).toContain(g.slug);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter cambridgetcg-storefront test -- weather`
Expected: FAIL — `Cannot find module './weather'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/storefront/src/lib/wardrobe/weather.ts
/**
 * @module @/lib/wardrobe/weather
 *
 * The game weather — one truth for which rooms wear which sky.
 * Spec: docs/superpowers/specs/2026-07-07-the-game-weather-design.md.
 *
 * A room with recognised game context wears
 * `wardrobe-weather wardrobe-weather--<slug>` (material in themes.css);
 * a room without one simply has no weather — empty string, no class.
 * Slugs match @/lib/games/sku-game so gameFromSku() feeds straight in.
 */

export const WEATHER_GAMES = ["one-piece", "pokemon", "dragon-ball"] as const;

export type WeatherGameSlug = (typeof WEATHER_GAMES)[number];

export function weatherClass(game: string | null | undefined): string {
  return WEATHER_GAMES.includes(game as WeatherGameSlug)
    ? `wardrobe-weather wardrobe-weather--${game}`
    : "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter cambridgetcg-storefront test -- weather`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/wardrobe/weather.ts apps/storefront/src/lib/wardrobe/weather.test.ts
git commit  # feat(storefront): the weather helper — one truth for which rooms wear which sky
```

---

### Task 2: the material — `.wardrobe-weather` in themes.css

**Files:**
- Modify: `apps/storefront/src/app/themes.css` (append inside the manga materials section, after `.wardrobe-aura` rules at the end of file)
- Modify: `apps/storefront/src/app/globals.css` (the text-mode pseudo-element kill block, after the `.wardrobe-aura::before` kill)
- Test: `apps/storefront/src/app/themes.weather.test.ts`

**Interfaces:**
- Consumes: `WEATHER_GAMES` from Task 1 (registry-sync test).
- Produces: CSS classes `.wardrobe-weather`, `.wardrobe-weather--{one-piece,pokemon,dragon-ball}`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/storefront/src/app/themes.weather.test.ts
/**
 * The game weather materials contract.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-game-weather-design.md §2/§5.
 * Same file-contract style as themes.manga.test.ts. Promises pinned:
 *   1. Every weather class exists, one per WEATHER_GAMES slug (registry sync).
 *   2. THE WEATHER NEVER MOVES — no animation/transition on any
 *      wardrobe-weather rule.
 *   3. Texture is theme-gated: base ::before carries opacity 0; opacity is
 *      raised only inside gallery/midnight/system gates.
 *   4. Geometry-only data-URIs: no %23 hex escapes (the manga section's
 *      no-raw-hex sweep already covers literal hex).
 *   5. text-mode kills .wardrobe-weather::before by name.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { WEATHER_GAMES } from "@/lib/wardrobe/weather";

const here = dirname(fileURLToPath(import.meta.url));
const themes = readFileSync(join(here, "themes.css"), "utf8");
const globals = readFileSync(join(here, "globals.css"), "utf8");

describe("the game weather materials (spec 2026-07-07)", () => {
  it("defines the material and one variant per game", () => {
    expect(themes).toMatch(/\.wardrobe-weather[\s,{:\[]/);
    for (const slug of WEATHER_GAMES) {
      expect(themes, `missing .wardrobe-weather--${slug}`).toMatch(
        new RegExp(`\\.wardrobe-weather--${slug}[\\s,{:\\[]`),
      );
    }
  });

  it("never moves — no animation or transition on any weather rule", () => {
    const blocks = themes.match(/[^{}]*\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      if (!block.includes("wardrobe-weather")) continue;
      expect(block, "the weather moved").not.toMatch(/animation|transition/);
    }
  });

  it("keeps the base texture invisible and gates volume by theme", () => {
    const base = themes.match(
      /(^|\n)\.wardrobe-weather::before[^,{]*\{([^}]*)\}/m,
    );
    expect(base, "base ::before rule missing").not.toBeNull();
    expect(base![2]).toMatch(/opacity:\s*0[;\s]/);
    expect(themes).toMatch(
      /\[data-theme="(gallery|midnight|system)"\][^{]*\.wardrobe-weather::before[^{]*\{[^}]*opacity/,
    );
  });

  it("carries geometry-only data-URIs — no encoded hex color", () => {
    const start = themes.indexOf("── The game weather");
    expect(start, "weather section marker missing").toBeGreaterThan(-1);
    expect(themes.slice(start)).not.toContain("%23");
  });

  it("text-mode kills the weather by name", () => {
    expect(globals).toMatch(
      /body\.text-mode[^{]*\.wardrobe-weather::before[^{]*\{[^}]*content:\s*none/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter cambridgetcg-storefront test -- themes.weather`
Expected: FAIL — material classes missing.

- [ ] **Step 3: Append the weather section to themes.css** (still inside the
manga materials region, after the `.wardrobe-aura` opacity gates):

```css
/* ── The game weather — per-game atmosphere (spec 2026-07-07) ──────────
 * Each game's rooms carry their own sky, drawn in our ink: the sea for
 * one-piece (seigaiha — the classical wave commons), the rising air for
 * dragon-ball (still rays from the ground, an aura that rose and
 * stopped), the elements for pokemon (droplet, leaf, spark — nature's
 * own glyphs). Geometry lives in alpha masks; PAINT IS ALWAYS A TOKEN,
 * so the weather re-inks itself per theme like every manga material.
 * The weather NEVER moves — it is ground, not gesture (motion doctrine
 * budget untouched). Base opacity 0: terminal and high-contrast never
 * see it; text-mode kills it by name in globals.css. */
/* Stacking (amended by the 2026-07-07 review batch): isolated negative-z
 * pseudo instead of the aura's `> *` lift — themes.css is unlayered, so a
 * `> *` z-index rule would silently override Tailwind positioning
 * utilities on direct children of room-scale mounts. */
.wardrobe-weather {
  position: relative;
  isolation: isolate;
}
.wardrobe-weather::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  border-radius: inherit;
  opacity: 0;
}

/* the sea — three-ring seigaiha scallops, 56×28 tile, staggered rows */
.wardrobe-weather--one-piece::before {
  background-color: var(--color-ink);
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='28'%3E%3Cg fill='none' stroke='black' stroke-width='1'%3E%3Cpath d='M-14 14 A14 14 0 0 1 14 14 M-9.5 14 A9.5 9.5 0 0 1 9.5 14 M-5 14 A5 5 0 0 1 5 14'/%3E%3Cpath d='M14 14 A14 14 0 0 1 42 14 M18.5 14 A9.5 9.5 0 0 1 37.5 14 M23 14 A5 5 0 0 1 33 14'/%3E%3Cpath d='M42 14 A14 14 0 0 1 70 14 M46.5 14 A9.5 9.5 0 0 1 65.5 14 M51 14 A5 5 0 0 1 61 14'/%3E%3Cpath d='M0 28 A14 14 0 0 1 28 28 M4.5 28 A9.5 9.5 0 0 1 23.5 28 M9 28 A5 5 0 0 1 19 28'/%3E%3Cpath d='M28 28 A14 14 0 0 1 56 28 M32.5 28 A9.5 9.5 0 0 1 51.5 28 M37 28 A5 5 0 0 1 47 28'/%3E%3Cpath d='M-14 42 A14 14 0 0 1 14 42 M14 42 A14 14 0 0 1 42 42 M42 42 A14 14 0 0 1 70 42'/%3E%3C/g%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='28'%3E%3Cg fill='none' stroke='black' stroke-width='1'%3E%3Cpath d='M-14 14 A14 14 0 0 1 14 14 M-9.5 14 A9.5 9.5 0 0 1 9.5 14 M-5 14 A5 5 0 0 1 5 14'/%3E%3Cpath d='M14 14 A14 14 0 0 1 42 14 M18.5 14 A9.5 9.5 0 0 1 37.5 14 M23 14 A5 5 0 0 1 33 14'/%3E%3Cpath d='M42 14 A14 14 0 0 1 70 14 M46.5 14 A9.5 9.5 0 0 1 65.5 14 M51 14 A5 5 0 0 1 61 14'/%3E%3Cpath d='M0 28 A14 14 0 0 1 28 28 M4.5 28 A9.5 9.5 0 0 1 23.5 28 M9 28 A5 5 0 0 1 19 28'/%3E%3Cpath d='M28 28 A14 14 0 0 1 56 28 M32.5 28 A9.5 9.5 0 0 1 51.5 28 M37 28 A5 5 0 0 1 47 28'/%3E%3Cpath d='M-14 42 A14 14 0 0 1 14 42 M14 42 A14 14 0 0 1 42 42 M42 42 A14 14 0 0 1 70 42'/%3E%3C/g%3E%3C/svg%3E");
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
  -webkit-mask-size: 56px 28px;
  mask-size: 56px 28px;
}

/* the rising air — still rays from the ground; NOT speedlines (those
 * are a 300ms celebration; this never moves). Fades skyward. */
.wardrobe-weather--dragon-ball::before {
  /* -90.25deg (review batch): clips the horizon wedges symmetrically —
   * a plain -90deg leaves a stray horizontal line at the bottom-left. */
  background-image: repeating-conic-gradient(
    from -90.25deg at 50% 100%,
    var(--color-ink) 0deg 0.5deg,
    transparent 0.5deg 9deg
  );
  -webkit-mask-image: linear-gradient(to top, black 30%, transparent 85%);
  mask-image: linear-gradient(to top, black 30%, transparent 85%);
}

/* the elements — droplet, leaf, spark; nature's glyphs, nobody's mark */
.wardrobe-weather--pokemon::before {
  background-color: var(--color-ink);
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cg fill='none' stroke='black' stroke-width='1'%3E%3Cpath d='M14 8 C17 12 20 15 20 18 A6 6 0 1 1 8 18 C8 15 11 12 14 8 Z'/%3E%3Cpath d='M40 34 Q47 27 54 34 Q47 41 40 34 Z M43 34 L51 34'/%3E%3Cpath d='M18 46 L19.5 51.5 L25 53 L19.5 54.5 L18 60 L16.5 54.5 L11 53 L16.5 51.5 Z'/%3E%3C/g%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cg fill='none' stroke='black' stroke-width='1'%3E%3Cpath d='M14 8 C17 12 20 15 20 18 A6 6 0 1 1 8 18 C8 15 11 12 14 8 Z'/%3E%3Cpath d='M40 34 Q47 27 54 34 Q47 41 40 34 Z M43 34 L51 34'/%3E%3Cpath d='M18 46 L19.5 51.5 L25 53 L19.5 54.5 L18 60 L16.5 54.5 L11 53 L16.5 51.5 Z'/%3E%3C/g%3E%3C/svg%3E");
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
  -webkit-mask-size: 64px 64px;
  mask-size: 64px 64px;
}

/* whisper by day, a little braver in the dark chapter — like the tone */
[data-theme="gallery"] .wardrobe-weather::before,
[data-theme="system"] .wardrobe-weather::before {
  opacity: 0.06;
}
[data-theme="midnight"] .wardrobe-weather::before {
  opacity: 0.1;
}
```

And in `globals.css`, extend the pseudo-element kill block (after the
`.wardrobe-aura::before` kill):

```css
body.text-mode .wardrobe-weather::before {
  content: none !important;
}
```

- [ ] **Step 4: Run tests to verify they pass (weather + existing manga contract)**

Run: `pnpm --filter cambridgetcg-storefront test -- themes`
Expected: PASS — themes.weather, themes.manga (no-hex sweep now covers the weather section), themes.sync all green.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/app/themes.css apps/storefront/src/app/globals.css apps/storefront/src/app/themes.weather.test.ts
git commit  # feat(storefront): the weather material — three skies drawn in our ink, still forever
```

---

### Task 3: the four rooms wear their weather

**Files:**
- Modify: `apps/storefront/src/components/home/GameGrid.tsx:22` (tile className)
- Modify: `apps/storefront/src/components/market/MarketBrowser.tsx:160` (outer return `<div>`)
- Modify: `apps/storefront/src/app/product/[sku]/page.tsx:142` (the image/details grid)
- Modify: `apps/storefront/src/app/market/[sku]/CardMarketClient.tsx:835` (the main layout grid)
- Modify: `apps/storefront/src/app/prices/[game]/page.tsx:425` (wrap h1 + provenance strip in a weather `<header>`)

**Interfaces:**
- Consumes: `weatherClass` (Task 1), `gameFromSku` (`@/lib/games/sku-game`, existing).

- [ ] **Step 1: GameGrid — each door wears its own sky**

```tsx
import { weatherClass } from "@/lib/wardrobe/weather";
// tile Link className becomes (template literal):
className={`group wardrobe-mat rounded-lg p-5 flex flex-col justify-between min-h-28 hover:bg-surface-subtle transition-colors ${weatherClass(g.slug)}`}
```

- [ ] **Step 2: MarketBrowser — the browse room follows the active game**

```tsx
import { weatherClass } from "@/lib/wardrobe/weather";
// outer return:
return (
  <div className={weatherClass(query.game)}>
```

- [ ] **Step 3: product page + card market page — the card's stage**

```tsx
// product/[sku]/page.tsx — gameSlug already computed at line 86:
<div className={`grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 ${weatherClass(gameSlug)}`}>

// CardMarketClient.tsx — sku prop in scope:
import { gameFromSku } from "@/lib/games/sku-game";
import { weatherClass } from "@/lib/wardrobe/weather";
<div className={`grid md:grid-cols-[240px_1fr_320px] gap-6 ${weatherClass(gameFromSku(sku))}`}>
```

- [ ] **Step 4: prices/[game] — the header band**

```tsx
import { weatherClass } from "@/lib/wardrobe/weather";
// wrap the existing h1 + provenance flex div (lines ~425-448) without
// changing their own markup:
<header className={weatherClass(game)}>
  <h1 …>…</h1>
  <div className="mb-4 flex flex-wrap items-center gap-3">…</div>
</header>
```

(`game` = the route param already in scope; unknown price-guide slugs get `""` — bare, honestly.)

- [ ] **Step 5: Verify — full storefront suite + typecheck**

Run: `pnpm --filter cambridgetcg-storefront test && npx tsc --noEmit -p apps/storefront/tsconfig.json`
Expected: all tests PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add -A apps/storefront/src
git commit  # feat(storefront): four rooms wear their weather — doors, browse, stage, price guide
```

---

### Task 4: adversarial review batch + verify gate

- [ ] **Step 1:** Run the review workflow (doctrine conformance / cascade & stacking correctness / IP-safety of the geometry / test rigor), fix confirmed findings.
- [ ] **Step 2:** `pnpm --filter cambridgetcg-storefront test` + tsc — green.
- [ ] **Step 3:** Commit fixes if any (`fix(storefront): review batch — …`), push branch.
