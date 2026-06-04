/**
 * Rubric-based scoring for generated designs.
 *
 * Deterministic regex checks — fast, unit-testable, and catches token
 * drift / primitive invention / a11y regressions. Not a substitute for
 * human review, but a floor.
 */
import type { ExtractedCode } from "./generator";
import { isKnownToken } from "../rp-registry";

export type Category = "tokens" | "primitives" | "a11y" | "voice" | "motion";

export interface RubricCheck {
  id: string;
  category: Category;
  description: string;
  check: (code: ExtractedCode) => { pass: boolean; reason?: string };
}

export interface CheckResult {
  check: RubricCheck;
  pass: boolean;
  reason?: string;
}

export interface ScoreCard {
  results: CheckResult[];
  passed: number;
  total: number;
  byCategory: Record<Category, { passed: number; total: number }>;
}

export const RUBRIC: RubricCheck[] = [
  /* ─── Tokens ─────────────────────────────────────────────────────── */
  {
    id: "no-raw-hex",
    category: "tokens",
    description: "No raw hex colors (outside var() fallbacks or comments)",
    check: ({ html, css }) => {
      const combined = html + "\n" + css;
      const hits: string[] = [];
      for (const m of combined.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
        const prefix = combined.slice(Math.max(0, m.index! - 120), m.index!);
        if (/var\([^)]*$/.test(prefix)) continue;   // var(--x, #fff) fallback
        if (/\/\*[^*]*$/.test(prefix)) continue;    // inside /* comment */
        hits.push(m[0]);
      }
      return hits.length === 0
        ? { pass: true }
        : { pass: false, reason: `raw hex: ${hits.slice(0, 3).join(", ")}` };
    },
  },
  {
    id: "no-raw-spacing",
    category: "tokens",
    description: "padding/margin/gap use --rp-space-* (allowing 0, %, auto)",
    check: ({ css }) => {
      const regex = /(padding|margin|gap)(?:-[a-z]+)?\s*:\s*([^;]+);/gi;
      const bad: string[] = [];
      for (const m of css.matchAll(regex)) {
        const value = m[2].trim();
        // Word-boundary around "px" fails because digits are word chars —
        // match literal digits-followed-by-px instead.
        if (!/\d(?:\.\d+)?\s*px\b/.test(value)) continue;
        if (/var\(--rp-space/.test(value)) continue;
        bad.push(m[0].trim());
      }
      return bad.length === 0
        ? { pass: true }
        : { pass: false, reason: `non-token spacing: ${bad.slice(0, 2).join(" | ")}` };
    },
  },
  {
    id: "font-floor-11px",
    category: "tokens",
    description: "No font-size below 11px (0.6875rem floor)",
    check: ({ css }) => {
      for (const m of css.matchAll(/font-size\s*:\s*([^;]+);/gi)) {
        const value = m[1];
        for (const px of value.matchAll(/(\d+(?:\.\d+)?)px/g)) {
          if (parseFloat(px[1]) < 11) return { pass: false, reason: `${px[0]} below 11px` };
        }
        for (const rem of value.matchAll(/(\d+(?:\.\d+)?)rem/g)) {
          if (parseFloat(rem[1]) < 0.6875) {
            return { pass: false, reason: `${rem[0]} below 0.6875rem` };
          }
        }
      }
      return { pass: true };
    },
  },
  {
    id: "font-family-inherit",
    category: "tokens",
    description: "font-family is always inherit (never specified)",
    check: ({ css }) => {
      for (const m of css.matchAll(/font-family\s*:\s*([^;]+);/gi)) {
        if (m[1].trim().toLowerCase() !== "inherit") {
          return { pass: false, reason: `font-family: ${m[1].trim()}` };
        }
      }
      return { pass: true };
    },
  },
  {
    id: "tokens-resolve",
    category: "tokens",
    description: "Every var(--rp-*) reference resolves to a known token in the registry",
    check: ({ html, css }) => {
      const combined = html + "\n" + css;
      const unknown: string[] = [];
      const seen = new Set<string>();
      for (const m of combined.matchAll(/var\(\s*(--rp-[a-z0-9-]+)/gi)) {
        const name = m[1];
        if (seen.has(name)) continue;
        seen.add(name);
        // `--rp-primary-color` is conventionally inherited from the
        // merchant theme rather than defined in rp-shared.css; allow it.
        if (name === "--rp-primary-color") continue;
        if (!isKnownToken(name)) unknown.push(name);
      }
      return unknown.length === 0
        ? { pass: true }
        : { pass: false, reason: `unknown tokens: ${unknown.slice(0, 3).join(", ")}` };
    },
  },
  {
    id: "radius-on-scale",
    category: "tokens",
    description: "border-radius uses --rp-radius-* (sm/md/lg/full)",
    check: ({ css }) => {
      const bad: string[] = [];
      for (const m of css.matchAll(/border-radius\s*:\s*([^;]+);/gi)) {
        const value = m[1].trim();
        if (/var\(--rp-radius/.test(value)) continue;
        if (/^(0|50%|999px|100%)$/.test(value)) continue;
        if (/\d(?:\.\d+)?\s*(px|rem|em)\b/.test(value)) bad.push(`border-radius: ${value}`);
      }
      return bad.length === 0
        ? { pass: true }
        : { pass: false, reason: bad.slice(0, 2).join(" | ") };
    },
  },

  /* ─── Primitives ─────────────────────────────────────────────────── */
  {
    id: "buttons-use-rp-btn",
    category: "primitives",
    description: "Every <button> includes the .rp-btn class",
    check: ({ html }) => {
      const buttons = [...html.matchAll(/<button\b([^>]*)>/gi)];
      if (buttons.length === 0) return { pass: true };
      for (const [, attrs] of buttons) {
        const cls = /class=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
        if (!/\brp-btn\b/.test(cls)) {
          return { pass: false, reason: `<button> missing .rp-btn (class="${cls}")` };
        }
      }
      return { pass: true };
    },
  },

  /* ─── A11y ───────────────────────────────────────────────────────── */
  {
    id: "min-tap-target",
    category: "a11y",
    description: "Interactive elements meet the 44px tap-target floor",
    check: ({ html, css }) => {
      const hasInteractive = /<button|<a\s/i.test(html);
      if (!hasInteractive) return { pass: true };
      if (/\brp-btn\b/.test(html)) return { pass: true };
      if (/min-height\s*:\s*44px/.test(css)) return { pass: true };
      return { pass: false, reason: "no .rp-btn and no min-height: 44px declared" };
    },
  },
  {
    id: "color-scheme-dark-aware",
    category: "a11y",
    description: "Uses semantic color tokens (auto-cascades under prefers-color-scheme: dark)",
    check: ({ html, css }) => {
      const combined = html + "\n" + css;
      if (/var\(--rp-(text|background|card-bg|border|color|primary)/.test(combined)) return { pass: true };
      return { pass: false, reason: "no semantic color token found" };
    },
  },

  /* ─── Voice ──────────────────────────────────────────────────────── */
  {
    id: "no-plumbing-copy",
    category: "voice",
    description: "Copy avoids plumbing language and false urgency",
    check: ({ html }) => {
      const patterns: Array<[RegExp, string]> = [
        [/\bfailed to\b/i, "'failed to' — conversational alternative required"],
        [/\bconfiguration error\b/i, "'configuration error' exposes plumbing"],
        [/\brequest timed out\b/i, "'request timed out' exposes plumbing"],
        [/\bundefined\b|\bnull\b/, "raw null/undefined leaked into copy"],
        [/!!!/, "triple exclamation — false urgency"],
        [/\bLAST CHANCE\b/i, "'last chance' — false urgency"],
        [/\bACT NOW\b/i, "'act now' — false urgency"],
      ];
      for (const [re, why] of patterns) {
        if (re.test(html)) return { pass: false, reason: why };
      }
      return { pass: true };
    },
  },

  /* ─── Motion ─────────────────────────────────────────────────────── */
  {
    id: "no-transition-all",
    category: "motion",
    description: "No `transition: all` — name properties explicitly",
    check: ({ css }) => {
      if (/transition\s*:\s*all\b/i.test(css)) {
        return { pass: false, reason: "transition: all is drift" };
      }
      return { pass: true };
    },
  },
  {
    id: "reduced-motion-honored",
    category: "motion",
    description: "When animations are present, prefers-reduced-motion is honored",
    check: ({ css }) => {
      const hasMotion = /@keyframes|animation\s*:|transition\s*:/i.test(css);
      if (!hasMotion) return { pass: true };
      if (/prefers-reduced-motion/.test(css)) return { pass: true };
      return { pass: false, reason: "motion present without prefers-reduced-motion block" };
    },
  },
];

export function score(code: ExtractedCode): ScoreCard {
  const results: CheckResult[] = RUBRIC.map((check) => {
    const r = check.check(code);
    return { check, pass: r.pass, reason: r.reason };
  });
  const byCategory = {
    tokens: { passed: 0, total: 0 },
    primitives: { passed: 0, total: 0 },
    a11y: { passed: 0, total: 0 },
    voice: { passed: 0, total: 0 },
    motion: { passed: 0, total: 0 },
  } as Record<Category, { passed: number; total: number }>;
  for (const r of results) {
    byCategory[r.check.category].total++;
    if (r.pass) byCategory[r.check.category].passed++;
  }
  return {
    results,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    byCategory,
  };
}

export function formatScoreCard(card: ScoreCard): string {
  const lines: string[] = [];
  lines.push(`\nRubric — ${card.passed}/${card.total} passed\n`);
  for (const [cat, s] of Object.entries(card.byCategory)) {
    lines.push(`  ${cat.padEnd(12)} ${s.passed}/${s.total}`);
  }
  lines.push("");
  for (const r of card.results) {
    lines.push(`  ${r.pass ? "✓" : "✗"} [${r.check.category.padEnd(10)}] ${r.check.description}`);
    if (!r.pass && r.reason) lines.push(`      → ${r.reason}`);
  }
  return lines.join("\n");
}
