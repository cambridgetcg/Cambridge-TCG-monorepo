/**
 * Claude Design handoff contract.
 *
 * `extensions/theme-app-extension-rewardspro/claude-design/design-system.md`
 * is the file we hand to Anthropic's Claude Design product as the
 * organization's design-system input. It's a derived artifact: the source
 * of truth is `assets/rp-shared.css` (tokens) and `DESIGN.md`
 * (philosophy). This test pins the handoff file's structure so a future
 * edit can't silently drop a section and break the handoff.
 *
 * The 9-section shape mirrors the VoltAgent/awesome-claude-design
 * convention referenced by Anthropic's Claude Design documentation.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const HANDOFF = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro/claude-design/design-system.md"
);

let source: string;

beforeAll(() => {
  source = fs.readFileSync(HANDOFF, "utf-8");
});

describe("Claude Design handoff — design-system.md exists and is complete", () => {
  it("file is present at the expected location", () => {
    expect(fs.existsSync(HANDOFF)).toBe(true);
  });

  it("has the 9 required top-level sections in order", () => {
    // The section order matters — Claude Design reads this top-to-bottom
    // and the narrative (atmosphere → color → type → components → layout
    // → elevation → responsive → guardrails → prompt) is how designers
    // communicate a system to the tool.
    const expected = [
      "## 1. Visual Theme & Atmosphere",
      "## 2. Color System",
      "## 3. Typography",
      "## 4. Components",
      "## 5. Layout & Spacing",
      "## 6. Shadows & Elevation",
      "## 7. Responsive Breakpoints & Touch Targets",
      "## 8. Design Guardrails",
      "## 9. Agent Prompt Guide",
    ];

    let cursor = 0;
    for (const heading of expected) {
      const idx = source.indexOf(heading, cursor);
      expect(idx, `missing or out-of-order heading: ${heading}`).toBeGreaterThanOrEqual(0);
      cursor = idx + heading.length;
    }
  });

  it("names the foundational token families so Claude Design can wire them", () => {
    // Without these tokens in the handoff, generated designs would
    // invent their own spacing/radius/duration values — exactly the
    // drift the shared token system was built to prevent.
    for (const token of [
      "--rp-space-",
      "--rp-font-",
      "--rp-radius-",
      "--rp-duration-",
      "--rp-shadow-",
      "--rp-primary-color",
      "--rp-text-color",
      "--rp-background-color",
    ]) {
      expect(source, `token family missing from handoff: ${token}`).toContain(token);
    }
  });

  it("documents both light and dark mode color values", () => {
    expect(source).toMatch(/light mode/i);
    expect(source).toMatch(/dark mode/i);
    expect(source).toMatch(/prefers-color-scheme/);
  });

  it("names the core component primitives", () => {
    for (const primitive of [
      ".rp-btn",
      ".rp-card",
      ".rp-pill",
      ".rp-empty-state",
    ]) {
      expect(source, `primitive missing: ${primitive}`).toContain(primitive);
    }
  });

  it("records the 11px typography floor so generated designs don't go smaller", () => {
    expect(source).toMatch(/11\s*px/);
  });

  it("records the 44px touch-target floor", () => {
    expect(source).toMatch(/44\s*px/);
  });

  it("documents reduced-motion behavior", () => {
    expect(source).toMatch(/prefers-reduced-motion/);
  });

  it("includes a file manifest pointing back to the canonical sources", () => {
    // The manifest is what makes this a handoff bundle rather than a
    // standalone spec — it tells Claude Design where the authoritative
    // CSS + runtime live so multi-file ingest can follow.
    expect(source).toMatch(/##\s+File manifest/i);
    expect(source).toContain("rp-shared.css");
    expect(source).toContain("rp-utils.js");
    expect(source).toContain("DESIGN.md");
    // Local-only scoring artifact must appear in the manifest too,
    // so anyone reading the handoff knows where the test prompts live.
    expect(source).toContain("test-prompts.md");
  });

  it("declares that CSS is authoritative when docs and CSS disagree", () => {
    // If a future edit removes this precedence rule, a drift between
    // the markdown and the CSS could silently reshape what Claude
    // Design generates. Lock it.
    expect(source).toMatch(/CSS (file )?is authoritative|CSS wins/i);
  });
});

describe("Claude Design handoff — companion files referenced in the manifest exist", () => {
  const EXT = path.resolve(
    __dirname,
    "../../extensions/theme-app-extension-rewardspro"
  );

  it.each([
    "assets/rp-shared.css",
    "assets/rp-utils.js",
    "DESIGN.md",
    "claude-design/test-prompts.md",
    "claude-design/README.md",
  ])("%s is present", (rel) => {
    expect(fs.existsSync(path.join(EXT, rel))).toBe(true);
  });
});

describe("Claude Design handoff — test-prompts.md exists and covers the key scenarios", () => {
  const PROMPTS = path.resolve(
    __dirname,
    "../../extensions/theme-app-extension-rewardspro/claude-design/test-prompts.md"
  );

  let text: string;

  beforeAll(() => {
    text = fs.readFileSync(PROMPTS, "utf-8");
  });

  it("file exists", () => {
    expect(fs.existsSync(PROMPTS)).toBe(true);
  });

  it("includes the four canonical test scenarios", () => {
    // These four cover resting/ambient (expiry banner), earn (tier upgrade),
    // empty (redemption history), and composition (missions card) — the
    // spread of states the design system has to handle.
    for (const scenario of [
      "Points expiry banner",
      "Tier upgrade celebration",
      "Redemption history empty state",
      "Missions widget card",
    ]) {
      expect(text, `missing test scenario: ${scenario}`).toContain(scenario);
    }
  });

  it("includes a rubric section with token, primitive, a11y, voice, and motion checks", () => {
    expect(text).toMatch(/##\s+Rubric/i);
    for (const heading of [
      "Token discipline",
      "Primitive composition",
      "Accessibility",
      "Voice",
      "Motion",
    ]) {
      expect(text, `rubric section missing: ${heading}`).toContain(heading);
    }
  });

  it("instructs reviewers to fix the handoff rather than the prompt when a test fails", () => {
    // The failure-triage logic is the whole point of this file — without
    // it, a failing Claude Design output would trigger prompt edits
    // instead of handoff edits, and the system would never converge.
    expect(text).toMatch(/handoff (is silent|is ambiguous)/i);
    expect(text).toMatch(/Updating\s+`design-system\.md`\s+almost always wins/);
  });
});
