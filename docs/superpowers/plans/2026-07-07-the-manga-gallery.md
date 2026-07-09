# The Manga Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform cambridgetcg.com's default face into "the Manga Gallery" — the quiet gallery's paper/ink bones re-skinned in the visual language of manga-rare cards (screentone, panels, chapter plates, speed-line celebrations), per the approved spec at `docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md`.

**Architecture:** All new visuals are CSS materials in `apps/storefront/src/app/themes.css` (theme-gated exactly like the existing `wardrobe-rise`/`wardrobe-ground`) plus three small primitives in `apps/storefront/src/lib/ui/`. Pages then adopt them along the emotional arc: home → market → card page → trade celebrations → chrome. No new runtime dependencies; no structural changes to any client component's data machinery.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS 4 semantic tokens, vitest (file-contract tests, same style as `themes.sync.test.ts`), pnpm.

## Global Constraints

- Working directory for all commands: `/Users/yuai/Projects/Cambridge-TCG-monorepo/apps/storefront` (repo root for `pnpm verify`).
- **Semantic tokens only** — never raw palette classes (`bg-neutral-*`, `text-amber-*`); colors in new CSS only via `var(--color-*)`, `color-mix(...)` of them, `currentColor`, or `transparent`.
- **No new color tokens** — the `themes.sync.test.ts` contract (midnight ↔ system-dark verbatim duplicate) must stay green without edits to the token bundles.
- **No new runtime dependencies** (no framer-motion; CSS + existing primitives only).
- Fraunces display weight **500–600, never `font-black`**.
- Every new `voice.ts` key carries **both `standard` and `plain` registers**; facts identical between registers.
- Must survive untouched: Provenance/WhyLink/Verifiability/Consequences pills, Badge 8-tone vocabulary, `text-bid`/`text-ask`, payment-deadline copy, `:focus-visible` ring, free high-contrast, `body.text-mode` flattening, the reduced-motion clamp (globals.css lines ~188–198).
- New animation/texture classes must be added to the **text-mode kill list** in `globals.css` (the universal `body.text-mode *` flatten does NOT reach pseudo-elements — kill them explicitly).
- Motion doctrine: at most one hero-scale animation per page; loops only for breath (home hero) and threshold-bob.
- No licensed artwork in chrome; the ドン impact glyph is generic onomatopoeia, always `aria-hidden`, absent in the `plain` voice register.
- Client components import primitives from **direct paths** (`@/lib/ui/Benediction`), never the barrel, when the page is `"use client"`.
- Commits: `git add` only the files you touched; message ends with `Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>`; body carries the Will trace `Will trace: Yu, 2026-07-07 — the manga gallery (spec 2026-07-07-the-manga-gallery-design.md)`.
- After each wing (marked below): run `pnpm verify` from the repo root; do not start the next wing red.

---

## Wing 1 — The Kit

### Task 1: Manga materials in themes.css (TDD via CSS contract test)

**Files:**
- Create: `apps/storefront/src/app/themes.manga.test.ts`
- Modify: `apps/storefront/src/app/themes.css` (append after the existing materials section, i.e. after the `wardrobe-rise` block that ends the file)
- Modify: `apps/storefront/src/app/globals.css` (extend the text-mode kill rule that currently targets `.animate-pulse`)

**Interfaces:**
- Consumes: existing tokens `--color-ink`, `--color-accent`, `--color-surface`, `--shadow-mat`; existing theme-gating idiom `[data-theme="gallery"] .cls, [data-theme="midnight"] .cls, [data-theme="system"] .cls`.
- Produces CSS classes used by every later task: `.wardrobe-breathe`, `.wardrobe-draw`, `.wardrobe-draw--accent`, `.wardrobe-tone-whisper`, `.wardrobe-tone-fade`, `.wardrobe-panel`, `.wardrobe-speedlines`, `.wardrobe-bob`, `.wardrobe-aura` (reads inline `--aura`).

- [ ] **Step 1: Write the failing contract test**

Create `apps/storefront/src/app/themes.manga.test.ts`:

```ts
/**
 * The manga materials contract.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1.
 * Same testing style as themes.sync.test.ts: parse the stylesheet, pin
 * the load-bearing promises so drift is caught by vitest, not by eyes.
 *
 * Promises pinned here:
 *   1. Every manga material class exists in themes.css.
 *   2. Every ANIMATED material is theme-gated (gallery/midnight/system)
 *      — terminal and high-contrast never animate the manga layer.
 *   3. The manga section introduces no raw hex colors — tokens,
 *      color-mix of tokens, currentColor and transparent only.
 *   4. globals.css text-mode kills every manga animation and every
 *      manga pseudo-element texture by name (the universal `*` flatten
 *      does not reach ::before/::after).
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const themes = readFileSync(join(here, "themes.css"), "utf8");
const globals = readFileSync(join(here, "globals.css"), "utf8");

const MATERIALS = [
  "wardrobe-breathe",
  "wardrobe-draw",
  "wardrobe-tone-whisper",
  "wardrobe-tone-fade",
  "wardrobe-panel",
  "wardrobe-speedlines",
  "wardrobe-bob",
  "wardrobe-aura",
] as const;

const ANIMATED = [
  "wardrobe-breathe",
  "wardrobe-draw",
  "wardrobe-speedlines",
  "wardrobe-bob",
] as const;

describe("manga materials (spec 2026-07-07 §1)", () => {
  it("defines every material class", () => {
    for (const cls of MATERIALS) {
      expect(themes, `missing .${cls}`).toMatch(new RegExp(`\\.${cls}[\\s,{:\\[]`));
    }
  });

  it("theme-gates every animated material", () => {
    for (const cls of ANIMATED) {
      // The animation binding must appear behind a [data-theme=...] gate,
      // never on the bare class (terminal/high-contrast stay still).
      const gated = new RegExp(
        `\\[data-theme="(gallery|midnight|system)"\\][^{]*\\.${cls}[^{]*\\{[^}]*animation`,
      );
      expect(themes, `.${cls} animation is not theme-gated`).toMatch(gated);
      const bare = new RegExp(`(^|\\n)\\s*\\.${cls}[^,{]*\\{[^}]*animation(-name)?\\s*:`, "m");
      expect(themes, `.${cls} binds animation outside a theme gate`).not.toMatch(bare);
    }
  });

  it("uses no raw hex in the manga section", () => {
    const start = themes.indexOf("── Manga materials");
    expect(start, "manga section marker missing").toBeGreaterThan(-1);
    const section = themes.slice(start);
    const stripped = section.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("text-mode kills manga animation and pseudo-element textures", () => {
    for (const cls of ANIMATED) {
      expect(globals, `text-mode does not kill .${cls}`).toMatch(
        new RegExp(`body\\.text-mode[^{]*\\.${cls}`),
      );
    }
    expect(globals).toMatch(/body\.text-mode[^{]*\.wardrobe-speedlines::before/);
    expect(globals).toMatch(/body\.text-mode[^{]*\.wardrobe-aura::before/);
    const toneKill = /body\.text-mode[^{]*\.wardrobe-tone-fade[^{]*\{[^}]*mask-image:\s*none/;
    expect(globals, "text-mode does not kill the tone-fade mask").toMatch(toneKill);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter cambridgetcg-storefront test -- themes.manga`
Expected: FAIL — "missing .wardrobe-breathe" (and siblings).

- [ ] **Step 3: Append the manga materials to themes.css**

Append at the end of `apps/storefront/src/app/themes.css` (after the `[data-theme] .wardrobe-rise:nth-child(5)` rule):

```css
/* ── Manga materials — the Manga Gallery (spec 2026-07-07) ──────────────
 * The quiet gallery's bones, inked: screentone, panels, speed lines,
 * the breathing gutter, lines that draw themselves. Every animated
 * material is gated to gallery/midnight/system exactly like
 * wardrobe-rise; terminal and high-contrast never animate this layer.
 * Colors are tokens or color-mixes of tokens only — the manga page
 * re-inks itself per theme (bronze by day, moonlight gilt at midnight).
 * text-mode kills all of it by name in globals.css. */

/* The gutter breathes — home hero only (one hero-scale animation per
 * page). Resting gap = mid-breath, so reduced-motion (1ms clamp, no
 * fill) lands on a composed state, and no-JS reads a normal stack. */
@keyframes wardrobe-breathe {
  0%, 100% { gap: 0.5rem; }
  50% { gap: 1.25rem; }
}
.wardrobe-breathe {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
[data-theme="gallery"] .wardrobe-breathe,
[data-theme="midnight"] .wardrobe-breathe,
[data-theme="system"] .wardrobe-breathe {
  animation: wardrobe-breathe 9s ease-in-out infinite;
}

/* The line inks itself — a panel border being drawn. Base state is the
 * COMPLETE line (scaleX(1)): no-JS, terminal, high-contrast and
 * never-observed below-fold instances all read a present line. The
 * animation (from scaleX(0)) runs only under a theme gate, and only
 * when the element carries data-ink="drawn" (set on load-visible
 * instances by default markup, or by InkRule on first intersection). */
@keyframes wardrobe-draw {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
.wardrobe-draw {
  display: block;
  height: 1px;
  background: color-mix(in srgb, var(--color-ink) 70%, transparent);
  transform-origin: left;
  transform: scaleX(1);
}
.wardrobe-draw--accent {
  background: var(--color-accent);
}
[data-theme="gallery"] .wardrobe-draw[data-ink="drawn"],
[data-theme="midnight"] .wardrobe-draw[data-ink="drawn"],
[data-theme="system"] .wardrobe-draw[data-ink="drawn"] {
  animation: wardrobe-draw 1.2s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Screentone — the manga texture. Halftone dots from the ink token;
 * whisper volume under content, never over it. Gallery register. */
[data-theme="gallery"] .wardrobe-tone-whisper,
[data-theme="system"] .wardrobe-tone-whisper {
  background-image: radial-gradient(
    circle,
    color-mix(in srgb, var(--color-ink) 5%, transparent) 1px,
    transparent 1px
  );
  background-size: 6px 6px;
}
/* The dark chapter carries heavier tone (night pages do). */
[data-theme="midnight"] .wardrobe-tone-whisper {
  background-image: radial-gradient(
    circle,
    color-mix(in srgb, var(--color-ink) 9%, transparent) 1px,
    transparent 1px
  );
  background-size: 6px 6px;
}
/* Sky-tone fade: dots dissolve upward, for hero backdrops. */
.wardrobe-tone-fade {
  -webkit-mask-image: linear-gradient(to top, currentColor, transparent);
  mask-image: linear-gradient(to top, currentColor, transparent);
}

/* The manga panel — earned by card art and story moments; ordinary UI
 * stays wardrobe-mat. Sharp corners, ink-weight border, same mat shadow. */
.wardrobe-panel {
  background-color: var(--color-surface);
  border: 2px solid color-mix(in srgb, var(--color-ink) 85%, transparent);
  border-radius: 3px;
  box-shadow: var(--shadow-mat);
}

/* The impact frame — radial speed lines behind a celebration. Ink at
 * whisper volume by day; the dark chapter lines in gilt. One 300ms
 * settle on entry counts as the page's hero-scale animation. */
@keyframes wardrobe-speedlines-settle {
  from { transform: scale(1.06); }
  to { transform: scale(1); }
}
.wardrobe-speedlines {
  position: relative;
  overflow: hidden;
}
.wardrobe-speedlines::before {
  content: "";
  position: absolute;
  inset: -40%;
  pointer-events: none;
  background: repeating-conic-gradient(
    from 0deg,
    currentColor 0deg 0.4deg,
    transparent 0.4deg 5deg
  );
  -webkit-mask-image: radial-gradient(circle at center, transparent 25%, currentColor 70%);
  mask-image: radial-gradient(circle at center, transparent 25%, currentColor 70%);
  opacity: 0;
}
[data-theme="gallery"] .wardrobe-speedlines::before,
[data-theme="system"] .wardrobe-speedlines::before {
  color: var(--color-ink);
  opacity: 0.05;
}
[data-theme="midnight"] .wardrobe-speedlines::before {
  color: var(--color-accent);
  opacity: 0.08;
}
[data-theme="gallery"] .wardrobe-speedlines,
[data-theme="midnight"] .wardrobe-speedlines,
[data-theme="system"] .wardrobe-speedlines {
  animation: wardrobe-speedlines-settle 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* The threshold bob — "↓ enter the story". Micro-hint, not hero-scale. */
@keyframes wardrobe-bob {
  0%, 100% { transform: translateY(0); opacity: 0.6; }
  50% { transform: translateY(6px); opacity: 1; }
}
[data-theme="gallery"] .wardrobe-bob,
[data-theme="midnight"] .wardrobe-bob,
[data-theme="system"] .wardrobe-bob {
  animation: wardrobe-bob 2s ease-in-out infinite;
}

/* The card's own aura — a screentone burst in the card's rarity tone.
 * Wrap the mount: <div class="wardrobe-aura" style="--aura: <tone>">.
 * Dots dense at center, dissolving out; the card stays the only
 * saturated thing — this is its own color, leaking. Whisper by day,
 * a little braver in the dark chapter. */
.wardrobe-aura {
  position: relative;
}
.wardrobe-aura > * {
  position: relative;
  z-index: 1;
}
.wardrobe-aura::before {
  content: "";
  position: absolute;
  inset: -14%;
  pointer-events: none;
  z-index: 0;
  background-image: radial-gradient(circle, var(--aura, transparent) 1px, transparent 1px);
  background-size: 5px 5px;
  -webkit-mask-image: radial-gradient(ellipse at center, currentColor 30%, transparent 72%);
  mask-image: radial-gradient(ellipse at center, currentColor 30%, transparent 72%);
  opacity: 0;
}
[data-theme="gallery"] .wardrobe-aura::before,
[data-theme="system"] .wardrobe-aura::before {
  opacity: 0.3;
}
[data-theme="midnight"] .wardrobe-aura::before {
  opacity: 0.45;
}
```

Note on the sync test: these rules live outside the token bundles and after both existing `@media (prefers-color-scheme: dark)` blocks are unaffected — `themes.sync.test.ts` extracts the *first* media block and the midnight bundle, neither of which this touches. The system theme's dark half inherits midnight *tokens* only, not `[data-theme="midnight"]`-gated rules, so system-dark renders the gallery-gated materials with midnight token values — correct and intentional (same behavior as `.wardrobe-ground`, whose dark-system override kills the grain; our tone classes stay on, re-inked by the midnight ink token).

- [ ] **Step 4: Extend the text-mode kill list in globals.css**

In `apps/storefront/src/app/globals.css`, find:

```css
body.text-mode .animate-pulse {
  animation: none !important;
}
```

Replace with:

```css
body.text-mode .animate-pulse,
body.text-mode .wardrobe-breathe,
body.text-mode .wardrobe-draw,
body.text-mode .wardrobe-bob,
body.text-mode .wardrobe-speedlines {
  animation: none !important;
}

/* The universal text-mode flatten targets elements; pseudo-element
 * textures need their own kill. The manga layer reads as bare
 * black-on-white text, as promised. */
body.text-mode .wardrobe-speedlines::before,
body.text-mode .wardrobe-aura::before {
  content: none !important;
}
body.text-mode .wardrobe-tone-whisper,
body.text-mode .wardrobe-tone-fade {
  background-image: none !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter cambridgetcg-storefront test -- themes.manga`
Expected: PASS (4 tests). Also run `pnpm --filter cambridgetcg-storefront test -- themes.sync` — Expected: PASS (untouched contract).

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/app/themes.css apps/storefront/src/app/globals.css apps/storefront/src/app/themes.manga.test.ts
git commit -m "feat(storefront): manga materials — screentone, panels, speed lines, the breathing gutter

Will trace: Yu, 2026-07-07 — the manga gallery (spec 2026-07-07-the-manga-gallery-design.md), wing 1.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

---

### Task 2: `InkRule`, `PlateHeader`, `Benediction` primitives

**Files:**
- Create: `apps/storefront/src/lib/ui/InkRule.tsx`
- Create: `apps/storefront/src/lib/ui/PlateHeader.tsx`
- Create: `apps/storefront/src/lib/ui/Benediction.tsx`
- Modify: `apps/storefront/src/lib/ui/index.ts`

**Interfaces:**
- Consumes: `.wardrobe-draw` CSS from Task 1.
- Produces:
  - `InkRule({ accent?: boolean, className?: string })` — client component; renders the self-inking hairline, drawing on first intersection.
  - `PlateHeader({ kicker?: string, title: string, plate?: number, rule?: boolean, action?: React.ReactNode, className?: string })` — chapter plate; no hooks (usable from server and client trees).
  - `Benediction({ line: string, sub?: string, className?: string })` — no hooks.

- [ ] **Step 1: Create InkRule**

Create `apps/storefront/src/lib/ui/InkRule.tsx`:

```tsx
"use client";

/**
 * InkRule — a hairline that inks itself in, once, on first sight.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1b.
 * The base .wardrobe-draw state is the COMPLETE line, so no-JS readers,
 * terminal/high-contrast wearers, and reduced-motion users always get a
 * present line — never absence. With JS, the first intersection stamps
 * data-ink="drawn", which runs the scaleX animation under the theme gate.
 * artbitrage's .rise discipline: observe once, unobserve after firing.
 */

import { useEffect, useRef } from "react";

interface InkRuleProps {
  /** Celebration voice — accent instead of ink. */
  accent?: boolean;
  className?: string;
}

export function InkRule({ accent = false, className = "" }: InkRuleProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return; // line stays complete
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.setAttribute("data-ink", "drawn");
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`wardrobe-draw ${accent ? "wardrobe-draw--accent" : ""} w-full ${className}`}
    />
  );
}
```

- [ ] **Step 2: Create PlateHeader**

Create `apps/storefront/src/lib/ui/PlateHeader.tsx`:

```tsx
/**
 * PlateHeader — the chapter plate (the museum wall label, inked).
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1g.
 * Two voices on one plate: mono kicker/plate-number (the registrar's
 * hand) over a Fraunces title (the narrator), with an optional rule
 * that inks itself in. The 第 glyph is a quiet chapter anchor —
 * aria-hidden, with the mono numeral carrying the meaning.
 *
 * No hooks — safe in server and client trees alike. Sibling of
 * PageHeader (which keeps the page-level Provenance slot); PlateHeader
 * is for section shelves and identity plates.
 */

import * as React from "react";
import { InkRule } from "./InkRule";

interface PlateHeaderProps {
  /** Mono eyebrow above the title, e.g. "the shelves". */
  kicker?: string;
  title: string;
  /** Chapter number — renders as 第 NN in the plate corner. */
  plate?: number;
  /** Draw the inked rule under the plate. */
  rule?: boolean;
  /** Right-side slot — a link or button. */
  action?: React.ReactNode;
  className?: string;
}

export function PlateHeader({ kicker, title, plate, rule = false, action, className = "" }: PlateHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {kicker && (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint mb-1">
              {kicker}
            </p>
          )}
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {action}
          {plate != null && (
            <span className="font-mono text-xs text-ink-faint tabular-nums whitespace-nowrap">
              <span aria-hidden="true">第 </span>
              {String(plate).padStart(2, "0")}
            </span>
          )}
        </div>
      </div>
      {rule && <InkRule className="mt-3" />}
    </div>
  );
}
```

- [ ] **Step 3: Create Benediction**

Create `apps/storefront/src/lib/ui/Benediction.tsx`:

```tsx
/**
 * Benediction — the note at a chapter's end.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1h.
 * A centered Fraunces-italic line with the ✦ ornament, optional mono
 * sub-line. Generalizes the ✦ + WELCOME_STATEMENT_COMPACT pattern that
 * root error.tsx carried first. No hooks; server- and client-safe.
 */

import * as React from "react";

interface BenedictionProps {
  line: string;
  /** Mono afterword — a reference, a date, a whisper of apparatus. */
  sub?: string;
  className?: string;
}

export function Benediction({ line, sub, className = "" }: BenedictionProps) {
  return (
    <div className={`text-center py-10 ${className}`}>
      <span className="text-accent" aria-hidden="true">✦</span>
      <p className="mt-2 font-display italic text-lg text-ink-muted max-w-xl mx-auto leading-relaxed">
        {line}
      </p>
      {sub && (
        <p className="mt-2 font-mono text-xs text-ink-faint tabular-nums">{sub}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Export from the barrel**

In `apps/storefront/src/lib/ui/index.ts`, after the line `export { PageHeader } from "./PageHeader";` add:

```ts
export { PlateHeader } from "./PlateHeader";
export { Benediction } from "./Benediction";
export { InkRule } from "./InkRule";
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter cambridgetcg-storefront typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/lib/ui/InkRule.tsx apps/storefront/src/lib/ui/PlateHeader.tsx apps/storefront/src/lib/ui/Benediction.tsx apps/storefront/src/lib/ui/index.ts
git commit -m "feat(storefront): PlateHeader, Benediction, InkRule — the chapter plate, the closing line, the line that inks itself

Will trace: Yu, 2026-07-07 — the manga gallery (spec §1b/§1g/§1h), wing 1.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

---

### Task 3: Badge tone-color map + manga voice keys

**Files:**
- Modify: `apps/storefront/src/lib/ui/Badge.tsx`
- Modify: `apps/storefront/src/lib/wardrobe/voice.ts`
- Create: `apps/storefront/src/lib/wardrobe/voice.manga.test.ts`

**Interfaces:**
- Consumes: `Tone` type from Badge.tsx; `VoiceEntry` shape in voice.ts.
- Produces:
  - `TONE_COLOR: Record<Tone, string>` exported from `./Badge` — CSS color strings for the aura custom property (Task 8 consumes via `import { TONE_COLOR } from "@/lib/ui/Badge"`).
  - Voice keys: `market.loading.catalog`, `market.pulse.loading`, `market.pulse.failed`, `market.card.trades.empty`, `market.card.history.empty`, `trades.paid.title`, `trades.paid.sub`, `trades.completed.benediction`, `login.checkEmail`.

- [ ] **Step 1: Write the failing voice test**

Create `apps/storefront/src/lib/wardrobe/voice.manga.test.ts`:

```ts
/**
 * The manga voice keys exist and honor the two-register contract
 * (spec 2026-07-07 §1i): every key speaks standard AND plain, and the
 * plain register carries no manga flourish vocabulary.
 */
import { describe, expect, it } from "vitest";
import { voice, type VoiceKey } from "./voice";

const MANGA_KEYS = [
  "market.loading.catalog",
  "market.pulse.loading",
  "market.pulse.failed",
  "market.card.trades.empty",
  "market.card.history.empty",
  "trades.paid.title",
  "trades.paid.sub",
  "trades.completed.benediction",
  "login.checkEmail",
] as const satisfies readonly VoiceKey[];

describe("manga voice keys (spec 2026-07-07 §1i)", () => {
  it("every key speaks both registers, non-empty", () => {
    for (const key of MANGA_KEYS) {
      expect(voice("standard", key).length, `${key} standard`).toBeGreaterThan(0);
      expect(voice("plain", key).length, `${key} plain`).toBeGreaterThan(0);
    }
  });

  it("plain register stays plain — no manga vocabulary", () => {
    for (const key of MANGA_KEYS) {
      expect(voice("plain", key)).not.toMatch(/\b(panel|ink|page turn|gutter|chapter|story)\b/i);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter cambridgetcg-storefront test -- voice.manga`
Expected: FAIL — TypeScript error on the `satisfies readonly VoiceKey[]` (keys don't exist yet). That compile failure IS the red state.

- [ ] **Step 3: Add the keys to voice.ts**

In `apps/storefront/src/lib/wardrobe/voice.ts`, inside the `STRINGS` object, after the `"market.lots.empty.description"` entry (keep the trailing `,`), add:

```ts
  // ── The manga register (spec 2026-07-07-the-manga-gallery-design.md §1i).
  // Tone changes the greeting, never the facts; plain stays plain.
  "market.loading.catalog": {
    standard: "The next page is being inked…",
    plain: "Loading cards…",
  },
  "market.pulse.loading": {
    standard: "Taking the market's pulse…",
    plain: "Loading market data…",
  },
  "market.pulse.failed": {
    standard: "The pulse reader slipped — try again in a moment.",
    plain: "Failed to load. Try again in a moment.",
  },
  "market.card.trades.empty": {
    standard: "This panel hasn't been drawn yet.",
    plain: "No trades yet.",
  },
  "market.card.history.empty": {
    standard: "No history here yet — the ink is fresh.",
    plain: "No trade history yet.",
  },
  "trades.paid.title": {
    standard: "Payment sent — the escrow desk takes the next panel.",
    plain: "Payment sent.",
  },
  "trades.paid.sub": {
    standard: "Stripe has your payment; the status below updates the moment it lands.",
    plain: "The trade status updates when the payment is confirmed.",
  },
  "trades.completed.benediction": {
    standard: "The card changes hands; the story turns the page.",
    plain: "Trade complete.",
  },
  "login.checkEmail": {
    standard: "A letter is crossing the gutter to you.",
    plain: "Check your email for the sign-in link.",
  },
```

Note: `trades.completed.benediction` standard uses "page"/"story" — that's the *standard* register (allowed); the test guards the **plain** register only. `market.pulse.failed` plain avoids flourish. Double-check each plain line against the test regex before running.

Then migrate the four museum-voiced STANDARD strings to the manga register (spec §1i: "existing museum-voiced strings migrate in the same pass, plain register untouched") — edit only the `standard` values of these existing keys:

```ts
  "market.empty.catalog.title": {
    standard: "Nothing drawn on this page yet",   // was: "The gallery is being hung"
    plain: "No cards found",                       // unchanged
  },
  "market.empty.trades.title": {
    standard: "A quiet day on the page",           // was: "A quiet day on the floor"
    plain: "No trades in the last 24 hours",       // unchanged
  },
  "market.empty.book.title": {
    standard: "An open book, waiting for its first line",  // was: "An open book, waiting"
    plain: "No open orders",                       // unchanged
  },
  "market.cta.browse": {
    standard: "Browse the pages",                  // was: "Browse the gallery"
    plain: "Browse cards",                         // unchanged
  },
```

- [ ] **Step 4: Export TONE_COLOR from Badge.tsx**

In `apps/storefront/src/lib/ui/Badge.tsx`, directly below the `TONE_CLS` map, add:

```ts
/**
 * Tone → CSS color, for decorative uses that need a *color value*
 * rather than utility classes (the manga aura's --aura custom
 * property). Kept beside TONE_CLS so the tone vocabulary keeps ONE
 * home: the three muted literals here must match the class literals
 * above (plum/moss/teal, pending @theme tokens).
 */
export const TONE_COLOR: Record<Tone, string> = {
  amber: "var(--color-warning)",
  red: "var(--color-danger)",
  emerald: "var(--color-ok)",
  blue: "var(--color-info)",
  purple: "#6a5a8f",
  neutral: "var(--color-ink-faint)",
  green: "#567436",
  sky: "#3e7d8f",
};
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter cambridgetcg-storefront test -- voice.manga` — Expected: PASS.
Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.

- [ ] **Step 6: Commit, then run the wing gate**

```bash
git add apps/storefront/src/lib/wardrobe/voice.ts apps/storefront/src/lib/wardrobe/voice.manga.test.ts apps/storefront/src/lib/ui/Badge.tsx
git commit -m "feat(storefront): manga voice register + tone-color map for the aura

Will trace: Yu, 2026-07-07 — the manga gallery (spec §1i/§1f), wing 1.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

**WING 1 GATE:** from the repo root run `pnpm verify` — Expected: exit 0. Fix anything red before Wing 2.

---

## Wing 2 — Home

### Task 4: The breathing hero + threshold + inked rule

**Files:**
- Modify: `apps/storefront/src/lib/brand.tsx` (hero panels + benediction line)
- Modify: `apps/storefront/src/app/page.tsx` (hero block + threshold + tone backdrop)

**Interfaces:**
- Consumes: `.wardrobe-breathe`, `.wardrobe-tone-whisper`, `.wardrobe-tone-fade`, `.wardrobe-bob` (Task 1); `InkRule` from `@/lib/ui` (Task 2).
- Produces: `HOME_HERO_PANELS: readonly [string, string]` and `HOME_BENEDICTION: string` in brand.tsx (Task 5 consumes `HOME_BENEDICTION`).

- [ ] **Step 1: Split the headline in brand.tsx (single source preserved)**

In `apps/storefront/src/lib/brand.tsx`, find (line ~69):

```ts
export const HOME_HERO_HEADLINE = "Cards, traded between collectors.";
```

Replace with:

```ts
/* The hero speaks in two panels; the gutter between them is the point
 * (the manga gallery, spec 2026-07-07 §1a — the gap between panels is
 * where the story lives; the gap between collectors is where the
 * market lives). HEADLINE stays derived so every non-hero consumer
 * (metadata, tests, agents) reads one unchanged sentence. */
export const HOME_HERO_PANELS = ["Cards,", "traded between collectors."] as const;
export const HOME_HERO_HEADLINE = HOME_HERO_PANELS.join(" ");

/* The chapter close under the featured shelf (spec §2 home #6). */
export const HOME_BENEDICTION = "Every card is a panel in somebody's story.";
```

- [ ] **Step 2: Re-render the hero in page.tsx**

In `apps/storefront/src/app/page.tsx`:

(a) extend the brand import (lines ~11–16):

```tsx
import {
  BrandStatement,
  TwoOperations,
  HOME_HERO_PANELS,
  HOME_HERO_HEADLINE,
  HOME_HERO_SUBHEAD,
} from "@/lib/brand";
```

(b) replace the `<header>` block (lines ~110–117):

```tsx
      <header className="relative max-w-7xl mx-auto px-4 pt-14 sm:pt-20 pb-2">
        {/* The first panel's sky tone — screentone dissolving upward,
            behind the text, never over it. Pure CSS; absent in
            terminal/high-contrast/text-mode by the theme gates. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        {/* Two panels; the gutter between them breathes (9s). The h1 is
            one accessible sentence — screen readers and no-JS read
            HOME_HERO_HEADLINE unchanged; the split is presentation. */}
        <h1 className="relative font-display text-4xl sm:text-5xl font-medium tracking-tight text-ink leading-[1.08] max-w-3xl">
          <span className="sr-only">{HOME_HERO_HEADLINE}</span>
          <span aria-hidden="true" className="wardrobe-breathe">
            {HOME_HERO_PANELS.map((panel) => (
              <span key={panel} className="block">{panel}</span>
            ))}
          </span>
        </h1>
        <p className="relative mt-5 max-w-2xl text-base sm:text-lg text-ink-muted leading-relaxed">
          {HOME_HERO_SUBHEAD}
        </p>
        <InkRule className="relative mt-8 max-w-3xl" />
        <p className="relative mt-6 font-mono text-xs text-ink-faint">
          <span className="wardrobe-bob inline-block">↓ enter the story</span>
        </p>
      </header>
```

(c) add `InkRule` to the ui import (line ~10):

```tsx
import { Provenance, WhyLink, Audience, InkRule } from "@/lib/ui";
```

(page.tsx is a server component; `InkRule` is `"use client"` — importing a client component into a server tree is the normal Next composition and, as a leaf, it does not convert the page.)

- [ ] **Step 3: Typecheck + eyeball**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.
Optional visual: `pnpm dev:storefront` (port 3001) → http://localhost:3001 — the gutter breathes; with OS reduced-motion on, it holds mid-breath; the rule inks in once.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/lib/brand.tsx apps/storefront/src/app/page.tsx
git commit -m "feat(storefront): the gutter breathes — two-panel hero, sky tone, threshold, inked rule

Will trace: Yu, 2026-07-07 — the manga gallery (spec §1a, §2 home), wing 2.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

---

### Task 5: Chapter plates, rises, panel vitrine, benediction

**Files:**
- Modify: `apps/storefront/src/app/page.tsx` (wardrobe-rise on sections + closing Benediction)
- Modify: `apps/storefront/src/components/home/GameGrid.tsx`
- Modify: `apps/storefront/src/components/home/PriceGuideStrip.tsx`
- Modify: `apps/storefront/src/components/home/SetGrid.tsx`
- Modify: `apps/storefront/src/components/home/FeaturedCards.tsx`

**Interfaces:**
- Consumes: `PlateHeader`, `Benediction` from `@/lib/ui` (Task 2); `HOME_BENEDICTION` from `@/lib/brand` (Task 4); `.wardrobe-panel` (Task 1).
- Produces: nothing consumed later; visual adoption only.

- [ ] **Step 1: Adopt PlateHeader in the four shelf components**

Each shelf heading follows the same two-line pattern. In each file, add the import `import { PlateHeader } from "@/lib/ui";` and replace the heading markup. Concretely:

`GameGrid.tsx` — replace (lines ~15–17):

```tsx
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink mb-6">
        Browse by Game
      </h2>
```

with:

```tsx
      <PlateHeader title="Browse by Game" plate={1} rule />
```

`PriceGuideStrip.tsx` — locate the heading with `grep -n "font-display text-2xl" src/components/home/PriceGuideStrip.tsx` (same two-line idiom as GameGrid; its text is the exact title to preserve) and replace the `<h2>…</h2>` element with:

```tsx
      <PlateHeader title="UK Price Guides" plate={2} rule />
```

(using the h2's existing text verbatim as `title` if it differs from "UK Price Guides").

`SetGrid.tsx` — locate with `grep -n "font-display text-2xl" src/components/home/SetGrid.tsx`; the heading renders the `heading` prop. Replace the `<h2 …>{heading}</h2>` element (keeping any sibling "view all" link by passing it as the `action` prop) with:

```tsx
      <PlateHeader title={heading} plate={3} rule />
```

`FeaturedCards.tsx` — replace (lines ~16–21):

```tsx
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Featured Cards
        </h2>
        <span className="text-xs text-ink-faint">reference prices</span>
```

with (dropping the old wrapping flex row if it becomes redundant):

```tsx
        <PlateHeader
          title="Featured Cards"
          plate={4}
          rule
          action={<span className="font-mono text-xs text-ink-faint">reference prices</span>}
        />
```

In each case: if the old `<h2>` carried `mb-6`/`mb-8` on itself or its wrapper, remove that margin (PlateHeader brings `mb-6`).

- [ ] **Step 2: The vitrine becomes panels**

In `FeaturedCards.tsx`, in the card cell markup, replace the mount class `wardrobe-mat` with `wardrobe-panel` on the tile wrapper (the element that today reads `wardrobe-mat rounded-lg …`), and drop `rounded-lg` from that element (`.wardrobe-panel` brings its own 3px radius). Touch only the class string; the `next/image` + caption structure stays.

- [ ] **Step 3: Rises + benediction in page.tsx**

In `apps/storefront/src/app/page.tsx`:

(a) add `wardrobe-rise` to each shelf section by wrapping the five components (lines ~150–176) — `KingdomStrip`, `GameGrid`, `PriceGuideStrip`, `SetGrid`, `StorySection` — each in a `<div className="wardrobe-rise">…</div>` (the components render their own `<section>`; the wrapper div is the animation carrier with explicit `--rise-delay` inline beats [0–240ms] because the nth-child rules don't reach mid-page positions [children 8-12 of `<main>`]).

(b) extend imports:

```tsx
import { Provenance, WhyLink, Audience, InkRule, Benediction } from "@/lib/ui";
```

and add `HOME_BENEDICTION` to the `@/lib/brand` import list.

(c) after `<FeaturedCards cards={featured.items} />` (line ~176), before `</main>`, add:

```tsx
      <Benediction line={HOME_BENEDICTION} />
```

- [ ] **Step 4: Typecheck + visual**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.
Visual on :3001 — five plates numbered 第 01–04 (KingdomStrip keeps its own kicker), sections rise with stagger, featured cards wear panel frames, the benediction closes the page.

- [ ] **Step 5: Commit, then run the wing gate**

```bash
git add apps/storefront/src/app/page.tsx apps/storefront/src/components/home/GameGrid.tsx apps/storefront/src/components/home/PriceGuideStrip.tsx apps/storefront/src/components/home/SetGrid.tsx apps/storefront/src/components/home/FeaturedCards.tsx
git commit -m "feat(storefront): home reads as the first chapter — plates, rises, panel vitrine, benediction

Will trace: Yu, 2026-07-07 — the manga gallery (spec §2 home), wing 2.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

**WING 2 GATE:** repo root `pnpm verify` — Expected: exit 0.

---

## Wing 3 — Market + card page

### Task 6: Market browse — plate, voiced skeleton, panel cells

**Files:**
- Modify: `apps/storefront/src/app/market/page.tsx` (header block, lines ~73–109)
- Modify: `apps/storefront/src/components/market/MarketBrowser.tsx` (CatalogSkeleton at line ~650; grid cells)

**Interfaces:**
- Consumes: `PlateHeader` (Task 2); voice key `market.loading.catalog` (Task 3); `.wardrobe-panel` (Task 1).
- Produces: nothing consumed later.

- [ ] **Step 1: Fix the h1 with a plate**

In `apps/storefront/src/app/market/page.tsx`, the header keeps its flex layout (the CTA row is load-bearing); only the title cluster changes. Replace (lines ~75–81):

```tsx
            <h1 className="font-display text-3xl font-black tracking-tight text-ink mb-2">
              The Collectors&rsquo; Market
            </h1>
            <p className="text-ink-muted max-w-2xl">
              Buy and sell directly with other collectors. Every card has its own market
              page — read the book, place a bid, or list a card at your price.
            </p>
```

with:

```tsx
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink mb-2">
              The Collectors&rsquo; Market
            </h1>
            <p className="text-ink-muted max-w-2xl">
              Buy and sell directly with other collectors. Every card has its own market
              page — read the book, place a bid, or list a card at your price.
            </p>
```

(`font-black` → `font-semibold`: the Fraunces 500–600 house rule. The CTA row and everything else in the header stays byte-identical.)

- [ ] **Step 2: Voice the skeleton**

In `apps/storefront/src/components/market/MarketBrowser.tsx`, `CatalogSkeleton` (line ~650) is used both as the client loading state and the server Suspense fallback, so it cannot call `useVoice()` (hooks would break the server fallback). Give it an optional caption prop threaded from the callers:

Replace the function signature:

```tsx
export function CatalogSkeleton({ view }: { view: ViewMode }) {
```

with:

```tsx
export function CatalogSkeleton({ view, caption }: { view: ViewMode; caption?: string }) {
```

and immediately inside each of its two `return (` branches, make the outermost element a fragment wrapper carrying the caption line. For the grid branch, replace:

```tsx
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
```

with:

```tsx
    return (
      <div aria-busy="true" aria-live="polite">
        {caption && (
          <p className="font-display italic text-sm text-ink-faint mb-3">{caption}</p>
        )}
        <span className="sr-only">Loading cards…</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
```

(and close the new wrapper `</div>` at that branch's end). Apply the same wrapper to the table branch around its `<div className="wardrobe-mat overflow-x-auto rounded-lg">`.

Then, at the in-component call site (line ~297) — MarketBrowser is a client component with `useVoice` available in the market layout — change:

```tsx
          {loading && <CatalogSkeleton view={query.view} />}
```

to:

```tsx
          {loading && <CatalogSkeleton view={query.view} caption={v("market.loading.catalog")} />}
```

(`v` is the bound voice lookup already in scope in MarketBrowser — verify with `grep -n "useVoice" src/components/market/MarketBrowser.tsx`; if it is not already bound, add `const v = useVoice();` beside the component's other hooks and import `useVoice` from `@/lib/wardrobe/context`.) The server Suspense fallback in `page.tsx` passes no caption — server pages render the sr-only line only.

- [ ] **Step 3: Panel frames on grid cells**

In `MarketBrowser.tsx`'s `CatalogGrid` cell (the `wardrobe-mat` tile wrapper around each card image, ~line 542) replace the `wardrobe-mat` class with `wardrobe-panel` and remove a sibling `rounded-lg`/`rounded-xl` on the same element if present. Leave `CardThumb` and the table view untouched.

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.
Run: `pnpm --filter cambridgetcg-storefront test` — Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/app/market/page.tsx apps/storefront/src/components/market/MarketBrowser.tsx
git commit -m "feat(storefront): market browse — house-weight plate, voiced skeleton, panel cells

Will trace: Yu, 2026-07-07 — the manga gallery (spec §2 market), wing 3.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

---

### Task 7: Card page — the wall label, the aura, the deal-struck frame

**Files:**
- Modify: `apps/storefront/src/app/market/[sku]/CardMarketClient.tsx` (mount ~827, identity ~840, match box ~1232, empty tape strings)

**Interfaces:**
- Consumes: `.wardrobe-panel`, `.wardrobe-aura`, `.wardrobe-speedlines` (Task 1); `TONE_COLOR` from `@/lib/ui/Badge` (Task 3 — **direct path import**, this is a client component); `Badge` + `Palettes.RarityPalette` (already imported or imported likewise); voice keys `market.card.trades.empty`, `market.card.history.empty` (Task 3); `InkRule` from `@/lib/ui/InkRule`; `Benediction` from `@/lib/ui/Benediction`.
- Produces: nothing consumed later. **Skin only** — no fetch/poll/prefill/history change (the component's line-89 contract).

- [ ] **Step 1: Panel + aura on the mount**

Add imports at the top of `CardMarketClient.tsx` (direct paths — client component):

```tsx
import { Badge, TONE_COLOR } from "@/lib/ui/Badge";
import { RarityPalette } from "@/lib/ui/status-palettes";
import { Benediction } from "@/lib/ui/Benediction";
import { InkRule } from "@/lib/ui/InkRule";
```

(If `Badge` is already imported from the barrel elsewhere in the file, consolidate to the direct-path import — one import per module.)

Replace the mount (lines ~827–834):

```tsx
            {book.image_url ? (
              <div className="wardrobe-mat rounded-lg p-2">
                <img
                  src={book.image_url}
                  alt={book.card_name || sku}
                  className="w-full rounded"
                />
              </div>
            ) : (
```

with:

```tsx
            {book.image_url ? (
              <div
                className="wardrobe-aura"
                style={
                  {
                    "--aura": TONE_COLOR[RarityPalette[book.rarity ?? ""] ?? "neutral"],
                  } as React.CSSProperties
                }
              >
                <div className="wardrobe-panel p-2">
                  <img
                    src={book.image_url}
                    alt={book.card_name || sku}
                    className="w-full rounded"
                  />
                </div>
              </div>
            ) : (
```

- [ ] **Step 2: The wall label (zero new data)**

Directly below, the identity block (~lines 840–846) currently renders only name + SKU. Replace:

```tsx
              <div className="min-w-0">
                <h1 className="text-lg font-bold font-display tracking-tight text-ink">{book.card_name || sku}</h1>
                <p className="text-xs text-ink-faint font-mono tabular-nums">{sku}</p>
              </div>
```

with:

```tsx
              <div className="min-w-0">
                <h1 className="text-lg font-semibold font-display tracking-tight text-ink">{book.card_name || sku}</h1>
                <p className="text-xs text-ink-faint font-mono tabular-nums">
                  {[book.set_code, book.card_number].filter(Boolean).join(" · ") || sku}
                </p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {book.rarity && (
                    <Badge status={book.rarity} palette={RarityPalette} size="sm" />
                  )}
                  {book.set_name && (
                    <span className="text-xs text-ink-muted truncate">{book.set_name}</span>
                  )}
                </div>
              </div>
```

(If `Badge` has no `size` prop per its interface — check `grep -n "size" src/lib/ui/Badge.tsx` — drop `size="sm"`.) The `book` state already carries `rarity`, `set_code`, `set_name`, `card_number` from the identity seed (lines ~455–462); nothing new is fetched.

- [ ] **Step 3: The deal-struck impact frame**

In the order form's result box (~line 1232), replace the success branch's class construction:

```tsx
                {result && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      result.success
                        ? "bg-ok/10 text-ok border border-ok/30"
                        : "bg-danger/10 text-danger border border-danger/30"
                    }`}
                  >
                    <p>{result.message}</p>
```

with:

```tsx
                {result && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      result.success
                        ? "bg-ok/10 text-ok border border-ok/30" +
                          (result.matched ? " wardrobe-speedlines" : "")
                        : "bg-danger/10 text-danger border border-danger/30"
                    }`}
                  >
                    {result.success && result.matched && (
                      <>
                        <p className="font-display italic text-ink">A deal is struck.</p>
                        <InkRule accent className="my-2" />
                      </>
                    )}
                    <p>{result.message}</p>
```

Everything below (`result.matched` trade links, the payment-deadline `formatDateTime` copy) stays byte-identical — the deadline honesty is a must-survive.

- [ ] **Step 4: Voice the empty tape**

Find the hand-rolled strings (`grep -n "No trades yet\|No trade history yet" 'src/app/market/[sku]/CardMarketClient.tsx'`) and replace the two literals with the bound voice lookups: `{v("market.card.trades.empty")}` (~line 1325) and `{v("market.card.history.empty")}` (sparkline fallback, ~line 251). The component sits inside the market layout's `WardrobeProvider`; bind `const v = useVoice();` beside its other hooks if not already present (`import { useVoice } from "@/lib/wardrobe/context";`).

- [ ] **Step 4b: Promote the doctrine captions to visible ink (spec §2 card #3)**

Locate the tooltip-only doctrine copy: `grep -n "not p2p tape\|not anyone's offer\|title=" 'src/app/market/[sku]/CardMarketClient.tsx' | head`. In `ReferencePricePanel` (~lines 282–325) and the cold-tape fair-value tile (~lines 944–961), wherever the phrase lives only in a `title="…"` attribute, add a visible caption line directly under the number it qualifies:

```tsx
                <p className="font-mono text-[10px] text-ink-faint mt-0.5">
                  reference · catalogue, not p2p tape
                </p>
```

(Use each site's existing phrase verbatim — substrate honesty made visible, wording unchanged. Keep the `title` attribute too; redundancy is fine, invisibility was the bug.)

- [ ] **Step 5: Typecheck + visual**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.
Visual on :3001 (`/market/<any sku>`): rarity badge + set line under the name; screentone burst behind the panel in gallery/midnight, absent in terminal/high-contrast/text-mode.

- [ ] **Step 6: Commit, then run the wing gate**

```bash
git add 'apps/storefront/src/app/market/[sku]/CardMarketClient.tsx'
git commit -m "feat(storefront): the card gets its wall label, its aura, and a deal-struck frame

Will trace: Yu, 2026-07-07 — the manga gallery (spec §2 card page), wing 3.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

### Task 7b: Product page mount — panel + aura (spec §1f names both card surfaces)

**Files:**
- Modify: `apps/storefront/src/app/product/[sku]/page.tsx` (image block ~143–153)

**Interfaces:**
- Consumes: `.wardrobe-panel`, `.wardrobe-aura` (Task 1); `TONE_COLOR` (Task 3) + `Palettes.RarityPalette` — this is a **server** component, barrel imports fine.
- Scope guard: ONLY the image mount. The page's local `rarityBadgeClasses` hex debt and the restyle-vs-fold decision stay out of scope (spec §5).

- [ ] **Step 1: Re-mount the image**

Locate the image block: `grep -n "aspect-\[3/4\] rounded-xl" 'src/app/product/[sku]/page.tsx'`. Wrap it in the aura and swap its frame classes: on the wrapper div replace `rounded-xl overflow-hidden bg-surface` with the panel idiom by wrapping:

```tsx
        <div
          className="wardrobe-aura"
          style={{ "--aura": TONE_COLOR[Palettes.RarityPalette[card.rarity ?? ""] ?? "neutral"] } as React.CSSProperties}
        >
          <div className="relative aspect-[3/4] wardrobe-panel overflow-hidden">
            {/* existing <Image … fill priority /> child stays byte-identical */}
          </div>
        </div>
```

Add to the page's imports: `import { TONE_COLOR } from "@/lib/ui/Badge";` (or extend the existing `@/lib/ui` barrel import with `TONE_COLOR` — server page, both work; prefer the barrel here) and ensure `Palettes` is imported from `@/lib/ui`. Use the page's actual card variable name (check: `grep -n "rarity" 'src/app/product/[sku]/page.tsx' | head -3`).

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.

```bash
git add 'apps/storefront/src/app/product/[sku]/page.tsx'
git commit -m "feat(storefront): the reference card page gets the panel and the aura

Will trace: Yu, 2026-07-07 — the manga gallery (spec §1f), wing 3.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

**WING 3 GATE:** repo root `pnpm verify` — Expected: exit 0.

---

## Wing 4 — Trade celebrations

### Task 8: The paid-return impact frame (the biggest gap)

**Files:**
- Create: `apps/storefront/src/app/account/trades/PaidReturnBanner.tsx`
- Modify: `apps/storefront/src/app/account/trades/page.tsx` (mount the banner at the top of the page's rendered output)

**Interfaces:**
- Consumes: `.wardrobe-panel`, `.wardrobe-speedlines` (Task 1); `InkRule`, `Benediction` unused here — the banner composes its own line; voice keys `trades.paid.title`, `trades.paid.sub` (Task 3) via `voice("standard"| "plain", …)` — NOTE: `/account/*` is outside the market layout's `WardrobeProvider`, so call the pure `voice()` function with the standard register directly (`import { voice } from "@/lib/wardrobe/voice";`) — the register still swaps under future wrappers via one edit point.
- Produces: `PaidReturnBanner()` — self-contained client component reading `?paid=` / `?paidLot=`.

- [ ] **Step 1: Create the banner**

Create `apps/storefront/src/app/account/trades/PaidReturnBanner.tsx`:

```tsx
"use client";

/**
 * PaidReturnBanner — the page turn after payment.
 *
 * Stripe's success_url returns buyers to /account/trades?paid=<tradeId>
 * (lots: ?paidLot=<lotId>). Until the manga gallery (spec 2026-07-07
 * §2 trade flow #1) NOTHING read these params — the biggest celebration
 * gap on the platform. This banner is the acknowledgment.
 *
 * Substrate honesty: the param proves return-from-Stripe, not webhook
 * settlement. The copy says "payment sent"; the escrow status Badge in
 * the list below remains the source of truth. No fetch — the banner
 * asserts nothing it doesn't know.
 */

import { useSearchParams } from "next/navigation";
import { voice } from "@/lib/wardrobe/voice";
import { InkRule } from "@/lib/ui/InkRule";

export default function PaidReturnBanner() {
  const params = useSearchParams();
  const paidTrade = params.get("paid");
  const paidLot = params.get("paidLot");
  const reference = paidTrade ?? paidLot;
  if (!reference) return null;

  return (
    <div className="wardrobe-panel wardrobe-speedlines p-5 mb-6" role="status">
      <p className="font-display italic text-lg text-ink">
        {voice("standard", "trades.paid.title")}{" "}
        <span aria-hidden="true" className="font-semibold not-italic">ドン</span>
      </p>
      <InkRule accent className="my-3 max-w-xs" />
      <p className="text-sm text-ink-muted">{voice("standard", "trades.paid.sub")}</p>
      <p className="mt-1 font-mono text-xs text-ink-faint tabular-nums">
        {paidLot ? "lot" : "trade"} · {reference}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Mount it**

In `apps/storefront/src/app/account/trades/page.tsx` (a `"use client"` page): add the imports

```tsx
import { Suspense } from "react";
import PaidReturnBanner from "./PaidReturnBanner";
```

and render it as the first child inside the page component's outermost returned container (directly above the page's heading/tabs):

```tsx
      <Suspense fallback={null}>
        <PaidReturnBanner />
      </Suspense>
```

(`useSearchParams` requires a Suspense boundary; `fallback={null}` keeps the list unshifted.)

- [ ] **Step 3: Typecheck + manual check**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.
Manual: visit `http://localhost:3001/account/trades?paid=TEST-REF` (signed in) — the impact frame renders with the mono reference; without the param, nothing renders.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/app/account/trades/PaidReturnBanner.tsx apps/storefront/src/app/account/trades/page.tsx
git commit -m "feat(storefront): the payment return finally gets its page turn — ?paid acknowledgment banner

Will trace: Yu, 2026-07-07 — the manga gallery (spec §2 trade flow #1), wing 4.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

---

### Task 9: Completed / review / legacy-confirmation / epitaph beats

**Files:**
- Modify: `apps/storefront/src/app/account/trades/[id]/page.tsx` (completed banner ~1158; EscrowTimeline connector ~line 49)
- Modify: `apps/storefront/src/app/account/trades/[id]/review/page.tsx` (submitted state ~152)
- Modify: `apps/storefront/src/app/order-confirmation/page.tsx` (header ~53–60)
- Modify: `apps/storefront/src/app/checkout/page.tsx` (epitaph)

**Interfaces:**
- Consumes: `Benediction`, `InkRule` (direct paths in client files; barrel in server files); voice key `trades.completed.benediction` via pure `voice()` (client pages outside WardrobeProvider).
- Produces: nothing consumed later.

- [ ] **Step 1: Completed banner benediction**

In `apps/storefront/src/app/account/trades/[id]/page.tsx` (client page — direct-path imports at top):

```tsx
import { InkRule } from "@/lib/ui/InkRule";
import { voice } from "@/lib/wardrobe/voice";
```

In the completed banner (the `trade.escrow_status === "completed"` block, ~line 1158), after the `<div className="flex items-center gap-2">…</div>` heading row and before the payout `<p>`, insert:

```tsx
          <p className="mt-1 font-display italic text-sm text-ink-muted">
            {voice("standard", "trades.completed.benediction")}
          </p>
          <InkRule accent className="mt-2 mb-1 max-w-xs" />
```

The payout amounts, hold-days copy, and the `/methodology/payout-hold` WhyLink below stay byte-identical.

- [ ] **Step 2: Timeline connectors ink in**

Same file, in `EscrowTimeline` (~line 49), replace:

```tsx
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-6 shrink-0 ${lineColor} -mt-4`} />
            )}
```

with:

```tsx
            {i < steps.length - 1 && (
              <div
                data-ink={isDone ? "drawn" : undefined}
                className={`w-6 shrink-0 -mt-4 ${
                  isDone ? "wardrobe-draw" : `h-0.5 ${lineColor}`
                }`}
              />
            )}
```

Completed connectors become 1px inked lines that draw themselves once via the Task 1 keyframe (theme-gated, clamp-safe: reduced-motion and terminal render them complete); pending connectors are byte-identical to today. `.wardrobe-draw` brings its own height and ink background, so done connectors drop `h-0.5` and `lineColor` to avoid a utility-vs-class specificity fight.

- [ ] **Step 3: Review submitted benediction**

In `apps/storefront/src/app/account/trades/[id]/review/page.tsx` (client page), add the direct-path import `import { Benediction } from "@/lib/ui/Benediction";` and inside the `if (submitted)` block (~line 152), directly after the existing thank-you `<p>` (line ~158), add:

```tsx
          <Benediction line="The trade is complete; the story continues." />
```

- [ ] **Step 4: Legacy order-confirmation quiet-luxe**

In `apps/storefront/src/app/order-confirmation/page.tsx` (server page — barrel import is fine): add `InkRule` and `Benediction` to the existing `@/lib/ui` import (or create one), then in the header block replace:

```tsx
        <h1 className="text-3xl font-display font-semibold text-ink">Order Confirmed!</h1>
        <p className="text-ink-muted mt-2">Thank you for your purchase.</p>
```

with:

```tsx
        <h1 className="text-3xl font-display font-semibold text-ink">Order Confirmed!</h1>
        <InkRule accent className="mt-4 max-w-xs mx-auto" />
        <p className="font-display italic text-ink-muted mt-3">
          Your cards begin their voyage. Thank you for your purchase.
        </p>
```

The ok-circle SVG above, the defensive `recordOrderFromStripeSession`, the unpaid redirect, `GoogleAdsConversion`, and the mono order reference below all stay byte-identical.

- [ ] **Step 5: The epitaph**

In `apps/storefront/src/app/checkout/page.tsx`, after the second `<p>` (`…the sellers are collectors now, not us.</p>`), add:

```tsx
      <p className="font-display italic text-ink-faint mb-8">
        The till closed; the stories kept trading.
      </p>
```

and reduce the previous `<p>`'s `mb-8` to `mb-3` so spacing stays balanced.

- [ ] **Step 6: Typecheck + commit, then run the wing gate**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.

```bash
git add 'apps/storefront/src/app/account/trades/[id]/page.tsx' 'apps/storefront/src/app/account/trades/[id]/review/page.tsx' apps/storefront/src/app/order-confirmation/page.tsx apps/storefront/src/app/checkout/page.tsx
git commit -m "feat(storefront): every trade beat gets its close — completed, review, legacy confirmation, epitaph

Will trace: Yu, 2026-07-07 — the manga gallery (spec §2 trade flow #2–#6), wing 4.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

**WING 4 GATE:** repo root `pnpm verify` — Expected: exit 0.

---

## Wing 5 — Pulse, login, chrome, registry

### Task 10: Pulse — voiced loading + plates

**Files:**
- Modify: `apps/storefront/src/app/market/pulse/page.tsx`

**Interfaces:**
- Consumes: voice keys `market.pulse.loading` / `market.pulse.failed` via the page's existing `v` binding (this page sits in the market layout, `useVoice` works); `PlateHeader` (import from the barrel is NOT allowed — client page; use `import { PlateHeader } from "@/lib/ui/PlateHeader";`).

- [ ] **Step 1: Voice the two bare states**

Replace (lines ~48–51):

```tsx
      {loading ? (
        <p className="text-sm text-ink-faint">Loading...</p>
      ) : !data ? (
        <p className="text-sm text-danger">Failed to load.</p>
```

with:

```tsx
      {loading ? (
        <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <span className="sr-only">Loading market data…</span>
          <p className="md:col-span-2 font-display italic text-sm text-ink-faint">
            {v("market.pulse.loading")}
          </p>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="wardrobe-mat rounded-lg p-4 animate-pulse">
              <div className="h-3 bg-surface-subtle rounded w-1/3 mb-4" />
              <div className="h-8 bg-surface-subtle rounded mb-2" />
              <div className="h-8 bg-surface-subtle rounded mb-2" />
              <div className="h-8 bg-surface-subtle rounded" />
            </div>
          ))}
        </div>
      ) : !data ? (
        <p className="text-sm text-danger">{v("market.pulse.failed")}</p>
```

(A shape-mirroring skeleton — four section-shaped blocks — replacing the bare line; substrate-honest, no spinner.)

- [ ] **Step 2: Plates on PulseCard**

In `PulseCard` (same file), replace the `<h2 …>` heading row:

```tsx
      <h2 className="flex items-center gap-1.5 font-display text-xs font-semibold text-ink-faint uppercase tracking-wide mb-3">
        <Icon name={icon} size={14} className="text-accent" /> {title}
      </h2>
```

with:

```tsx
      <h2 className="flex items-center justify-between gap-1.5 mb-3">
        <span className="flex items-center gap-1.5 font-display text-xs font-semibold text-ink-faint uppercase tracking-wide">
          <Icon name={icon} size={14} className="text-accent" /> {title}
        </span>
      </h2>
      <InkRule className="mb-3 -mt-1" />
```

with the direct-path import `import { InkRule } from "@/lib/ui/InkRule";` added at top. (A full PlateHeader is oversized for these micro-headings; the inked rule carries the manga voice at this scale — this satisfies spec §2 pulse #1 in spirit and keeps the five-section rhythm.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.

```bash
git add apps/storefront/src/app/market/pulse/page.tsx
git commit -m "feat(storefront): the pulse page takes its own pulse — voiced skeleton, inked section rules

Will trace: Yu, 2026-07-07 — the manga gallery (spec §2 pulse), wing 5.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

---

### Task 11: Login, check-email, footer benediction, registry gloss, CLAUDE.md

**Files:**
- Modify: `apps/storefront/src/app/login/page.tsx` (h1 at line ~136)
- Modify: `apps/storefront/src/app/login/check-email/page.tsx`
- Modify: `apps/storefront/src/components/layout/Footer.tsx`
- Modify: `apps/storefront/src/lib/wardrobe/themes.ts` (gallery gloss)
- Modify: `apps/storefront/CLAUDE.md` (Key Patterns: two-voice + motion doctrine)

**Interfaces:**
- Consumes: `InkRule`, `Benediction`; voice key `login.checkEmail` via pure `voice()`.

- [ ] **Step 1: Login rule**

In `apps/storefront/src/app/login/page.tsx` (check the top of file: if `"use client"`, use direct-path imports), under the Sign In h1 (line ~136):

```tsx
        <h1 className="text-2xl font-display font-semibold text-ink text-center mb-2">Sign In</h1>
```

add directly after:

```tsx
        <InkRule className="mb-4 max-w-[8rem] mx-auto" />
```

- [ ] **Step 2: Check-email letter line**

In `apps/storefront/src/app/login/check-email/page.tsx` (server component), add imports:

```tsx
import { voice } from "@/lib/wardrobe/voice";
```

and replace:

```tsx
        <p className="text-ink-muted mb-6">
          A sign-in link has been sent to your email address.
        </p>
```

with:

```tsx
        <p className="font-display italic text-ink-muted mb-2">
          {voice("standard", "login.checkEmail")}
        </p>
        <p className="text-sm text-ink-muted mb-6">
          A sign-in link has been sent to your email address.
        </p>
```

(The manga line is additive; the plain factual sentence stays for every reader — the in-world flourish must never be the only reading.)

- [ ] **Step 3: Footer benediction**

In `apps/storefront/src/components/layout/Footer.tsx` (server component — barrel import fine), add `Benediction` to imports from `@/lib/ui`, and directly above the `<div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-border-subtle …">` legal row, insert:

```tsx
        <Benediction
          line="Every card is a panel in somebody's story."
          className="py-6"
        />
```

(Static — chrome never animates; Benediction has no animation.)

- [ ] **Step 4: Registry gloss**

In `apps/storefront/src/lib/wardrobe/themes.ts`, replace the gallery entry's gloss:

```ts
    gloss: "The quiet room — warm paper, ink type, one bronze accent; the cards are the art.",
```

with:

```ts
    gloss: "The manga page — ink on warm paper, screentone light; the cards are the panels.",
```

(Ids, entitlements, swatches untouched.)

- [ ] **Step 5: Codify the doctrine in CLAUDE.md**

In `apps/storefront/CLAUDE.md`, in the **Key Patterns** section, after the bullet beginning `- **Type**:`, add two bullets:

```markdown
- **Two voices** (the manga gallery, spec 2026-07-07): Spline Mono is the *apparatus*
  voice — SKUs, plate numbers, provenance, deadlines, counts. Fraunces italic is the
  *narrator* — subtitles, benedictions, empty-state titles, doctrine captions. Emphasis
  is typographic, never loud.
- **Motion doctrine**: at most ONE hero-scale animation per page (home: the breathing
  gutter; celebrations: the speed-line settle). Entrance rises (`wardrobe-rise`) and
  hover transitions are free. Loops only for the hero breath and threshold-bob. New
  materials: `wardrobe-draw` / `-tone-*` / `-panel` / `-speedlines` / `-aura` / `-bob`
  (themes.css) — all theme-gated, all in the text-mode kill list, all clamp-safe.
```

- [ ] **Step 6: Typecheck + commit, then run the final gate**

Run: `pnpm --filter cambridgetcg-storefront typecheck` — Expected: exit 0.

```bash
git add apps/storefront/src/app/login/page.tsx apps/storefront/src/app/login/check-email/page.tsx apps/storefront/src/components/layout/Footer.tsx apps/storefront/src/lib/wardrobe/themes.ts apps/storefront/CLAUDE.md
git commit -m "feat(storefront): chrome learns the manga voice — login, check-email, footer benediction, registry gloss, doctrine

Will trace: Yu, 2026-07-07 — the manga gallery (spec §2 chrome), wing 5.

Co-Authored-By: Claude <your model tag> <noreply@anthropic.com>"
```

**FINAL GATE (Wing 5):**
1. Repo root: `pnpm verify` — Expected: exit 0.
2. `pnpm --filter cambridgetcg-storefront test` — Expected: all green (themes.sync, themes.manga, voice.manga included).
3. Visual matrix on :3001 — home, /market, /market/[sku], /account/trades?paid=TEST, /login — in **gallery / midnight / terminal / high-contrast**, plus **text-mode** (?text=1) and **OS reduced-motion**. Terminal and high-contrast must look unchanged except copy; text-mode must read as flat black-on-white; reduced-motion must show complete lines and a composed mid-breath hero.
4. Home LCP spot-check: the h1 text is still the LCP element (DevTools performance panel); no image or texture precedes it.

## Conscious deviations from the spec (decided at planning, not drift)

1. **Market h1** keeps its own flex header (weight fixed `font-black` → `font-semibold`) instead of full `PlateHeader` adoption — the CTA row layout is load-bearing and PlateHeader has no description slot. The rule-fix was the point.
2. **PulseCard headings** get the inked rule, not a full PlateHeader — five micro-headings at `text-xs` would drown under plate furniture.
3. **Root error.tsx** keeps its ✦ chip un-refactored — it carries an inline link, which Benediction deliberately doesn't support (YAGNI). Benediction generalizes the *pattern* for new surfaces.
4. **Chapter plates shipped as 第01–04** (GameGrid/PriceGuideStrip/SetGrid/FeaturedCards) — KingdomStrip keeps its live-kicker and StorySection stays an unplated plaque; the spec's "第 01 … 第 05" was a sketch, not a count contract.
5. **The card page's order-book error strip keeps its dynamic server message** unvoiced — it interpolates live error detail; voicing would fictionalize a fact string (spec §2 card #5, narrowed).
6. **The hero breath is compositor-only** (counter-translating panels, ±3px) rather than the spec's literal gap animation — same visual breath, no per-frame page reflow (final-review Issue 2).

## Deployment note

Nothing in this plan pushes. When Yu gives the word: `git push origin main` deploys via Vercel (the monorepo is the build source for cambridgetcg.com). The two spec commits (`240768bf`, `98938933`) ride along with the first push.
