/**
 * Scorer rubric contract — every check triggers on the failure case it
 * claims to catch, and doesn't trigger on good code.
 *
 * These tests are the floor: if you loosen a check, a test should fail
 * and force you to explain why in the PR description.
 */
import { describe, it, expect } from "vitest";
import {
  RUBRIC,
  score,
  extractCode,
  MockGenerator,
  loadHandoff,
  PROMPTS,
} from "../../scripts/claude-design-bridge";

function codeFrom(html: string, css: string) {
  return { html, css, liquid: "" };
}

describe("scorer — rubric shape", () => {
  it("every rubric check has a unique id", () => {
    const ids = RUBRIC.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every rubric check has a category in the known set", () => {
    const known = new Set(["tokens", "primitives", "a11y", "voice", "motion"]);
    for (const r of RUBRIC) expect(known.has(r.category)).toBe(true);
  });

  it("rubric covers all five categories", () => {
    const seen = new Set(RUBRIC.map((r) => r.category));
    for (const c of ["tokens", "primitives", "a11y", "voice", "motion"]) {
      expect(seen.has(c)).toBe(true);
    }
  });
});

describe("scorer — good code passes every check", () => {
  const goodHtml = `
    <aside class="rp-card" role="status">
      <p class="rp-headline">Your points expire in 30 days</p>
      <p class="rp-meta">Your points are safe — use them before May 23.</p>
      <div class="rp-empty-state__actions">
        <button class="rp-btn rp-btn--secondary" type="button">Dismiss</button>
        <a class="rp-btn-link" href="/account">View balance</a>
      </div>
    </aside>
  `;
  const goodCss = `
    .expiry-banner {
      background: var(--rp-background-subtle);
      color: var(--rp-text-color);
      border: 1px solid var(--rp-border-color);
      border-radius: var(--rp-radius-lg);
      padding: var(--rp-space-lg);
      box-shadow: var(--rp-shadow-sm);
      transition: box-shadow var(--rp-duration-fast) var(--rp-easing);
    }
    @media (prefers-reduced-motion: reduce) {
      .expiry-banner { transition: none; }
    }
  `;

  it("scorecard is all green", () => {
    const card = score(codeFrom(goodHtml, goodCss));
    const failing = card.results.filter((r) => !r.pass);
    expect(
      failing,
      `failing checks: ${failing.map((f) => `${f.check.id} (${f.reason})`).join(", ")}`
    ).toEqual([]);
    expect(card.passed).toBe(card.total);
  });
});

describe("scorer — bad code triggers the right check", () => {
  it("raw hex fails no-raw-hex", () => {
    const card = score(codeFrom("<div>hi</div>", ".a { color: #ff0000; }"));
    const r = card.results.find((x) => x.check.id === "no-raw-hex")!;
    expect(r.pass).toBe(false);
  });

  it("hex inside var() fallback passes no-raw-hex", () => {
    const card = score(codeFrom("", ".a { color: var(--rp-primary-color, #5C6AC4); }"));
    const r = card.results.find((x) => x.check.id === "no-raw-hex")!;
    expect(r.pass).toBe(true);
  });

  it("padding with raw px fails no-raw-spacing", () => {
    const card = score(codeFrom("", ".a { padding: 10px 14px; }"));
    const r = card.results.find((x) => x.check.id === "no-raw-spacing")!;
    expect(r.pass).toBe(false);
  });

  it("padding via --rp-space-* passes no-raw-spacing", () => {
    const card = score(codeFrom("", ".a { padding: var(--rp-space-md) var(--rp-space-lg); }"));
    const r = card.results.find((x) => x.check.id === "no-raw-spacing")!;
    expect(r.pass).toBe(true);
  });

  it("font-size: 9px fails font-floor-11px", () => {
    const card = score(codeFrom("", ".a { font-size: 9px; }"));
    const r = card.results.find((x) => x.check.id === "font-floor-11px")!;
    expect(r.pass).toBe(false);
  });

  it("font-size: 0.6875rem passes font-floor-11px", () => {
    const card = score(codeFrom("", ".a { font-size: 0.6875rem; }"));
    const r = card.results.find((x) => x.check.id === "font-floor-11px")!;
    expect(r.pass).toBe(true);
  });

  it("font-family: sans-serif fails font-family-inherit", () => {
    const card = score(codeFrom("", ".a { font-family: sans-serif; }"));
    const r = card.results.find((x) => x.check.id === "font-family-inherit")!;
    expect(r.pass).toBe(false);
  });

  it("raw border-radius fails radius-on-scale", () => {
    const card = score(codeFrom("", ".a { border-radius: 6px; }"));
    const r = card.results.find((x) => x.check.id === "radius-on-scale")!;
    expect(r.pass).toBe(false);
  });

  it("button without .rp-btn fails buttons-use-rp-btn", () => {
    const card = score(codeFrom(`<button class="primary">Go</button>`, ""));
    const r = card.results.find((x) => x.check.id === "buttons-use-rp-btn")!;
    expect(r.pass).toBe(false);
  });

  it("button with .rp-btn passes buttons-use-rp-btn", () => {
    const card = score(codeFrom(`<button class="rp-btn rp-btn--primary">Go</button>`, ""));
    const r = card.results.find((x) => x.check.id === "buttons-use-rp-btn")!;
    expect(r.pass).toBe(true);
  });

  it("plumbing copy fails no-plumbing-copy", () => {
    const card = score(codeFrom(`<p>Failed to load rewards</p>`, ""));
    const r = card.results.find((x) => x.check.id === "no-plumbing-copy")!;
    expect(r.pass).toBe(false);
  });

  it("triple exclamation fails no-plumbing-copy", () => {
    const card = score(codeFrom(`<p>CONGRATS!!!</p>`, ""));
    const r = card.results.find((x) => x.check.id === "no-plumbing-copy")!;
    expect(r.pass).toBe(false);
  });

  it("var(--rp-frob) fails tokens-resolve (registry doesn't know it)", () => {
    const card = score(codeFrom("", ".a { padding: var(--rp-frob); }"));
    const r = card.results.find((x) => x.check.id === "tokens-resolve")!;
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("--rp-frob");
  });

  it("var(--rp-space-md) passes tokens-resolve (registry knows it)", () => {
    const card = score(codeFrom("", ".a { padding: var(--rp-space-md); }"));
    const r = card.results.find((x) => x.check.id === "tokens-resolve")!;
    expect(r.pass).toBe(true);
  });

  it("var(--rp-primary-color) passes tokens-resolve (theme-inherited exception)", () => {
    const card = score(codeFrom("", ".a { color: var(--rp-primary-color); }"));
    const r = card.results.find((x) => x.check.id === "tokens-resolve")!;
    expect(r.pass).toBe(true);
  });

  it("transition: all fails no-transition-all", () => {
    const card = score(codeFrom("", ".a { transition: all 0.2s ease; }"));
    const r = card.results.find((x) => x.check.id === "no-transition-all")!;
    expect(r.pass).toBe(false);
  });

  it("animation without prefers-reduced-motion fails reduced-motion-honored", () => {
    const card = score(codeFrom("", "@keyframes fade { from { opacity: 0; } to { opacity: 1; } } .a { animation: fade 200ms; }"));
    const r = card.results.find((x) => x.check.id === "reduced-motion-honored")!;
    expect(r.pass).toBe(false);
  });

  it("animation with prefers-reduced-motion passes reduced-motion-honored", () => {
    const card = score(codeFrom("", `
      @keyframes fade { from { opacity: 0; } }
      .a { animation: fade 200ms; }
      @media (prefers-reduced-motion: reduce) {
        .a { animation: none; }
      }
    `));
    const r = card.results.find((x) => x.check.id === "reduced-motion-honored")!;
    expect(r.pass).toBe(true);
  });
});

describe("extractCode — separates html/css/liquid fences", () => {
  it("extracts explicit html and css fences", () => {
    const text = "```html\n<div>hi</div>\n```\n```css\n.a { color: red; }\n```";
    const { html, css } = extractCode(text);
    expect(html).toBe("<div>hi</div>");
    expect(css).toBe(".a { color: red; }");
  });

  it("pulls <style> out of html into css", () => {
    const text = "```html\n<div>hi</div><style>.a { color: red; }</style>\n```";
    const { html, css } = extractCode(text);
    expect(html).toBe("<div>hi</div>");
    expect(css.trim()).toBe(".a { color: red; }");
  });

  it("treats an unlabeled fence with tags as html", () => {
    const text = "```\n<div>hi</div>\n```";
    const { html } = extractCode(text);
    expect(html).toBe("<div>hi</div>");
  });
});

describe("handoff — loads and composes", () => {
  it("always includes design-system.md content", () => {
    const s = loadHandoff({ includeCss: false });
    expect(s).toContain("Visual Theme & Atmosphere");
    expect(s).toContain("Color System");
    expect(s).toContain("Agent Prompt Guide");
  });

  it("embeds rp-shared.css by default", () => {
    const s = loadHandoff();
    // Section separators in rp-shared.css use `/* ══` — not present
    // in design-system.md (where only markdown `---` is used), so this
    // is a reliable sentinel for the embedded CSS.
    expect(s).toContain("/* ══");
  });

  it("omits rp-shared.css when includeCss=false", () => {
    const s = loadHandoff({ includeCss: false });
    expect(s).not.toContain("/* ══");
  });
});

describe("prompts — canonical set matches the handoff test-prompts.md", () => {
  it("has exactly four named prompts", () => {
    expect(PROMPTS.length).toBe(4);
  });

  it("each prompt has a unique id and a non-empty text", () => {
    const ids = PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROMPTS) expect(p.text.length).toBeGreaterThan(50);
  });
});

describe("MockGenerator — useful for offline tests", () => {
  it("returns the fixture verbatim", async () => {
    const fixture = "```html\n<div class='rp-card'>hi</div>\n```";
    const gen = new MockGenerator(fixture);
    const r = await gen.generate();
    expect(r.text).toBe(fixture);
    expect(r.code.html).toBe("<div class='rp-card'>hi</div>");
    expect(r.model).toBe("mock");
  });
});
