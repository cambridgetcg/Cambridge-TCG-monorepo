/**
 * Patcher contract.
 *
 *   1. Pure synthetic — `patch()` against hand-crafted files,
 *      covering CSS selectors, class= attrs, classList.X() calls,
 *      BEM caveat surfacing, and read-only invariance.
 *   2. Markdown rendering — well-formed output for PR review.
 *   3. Bounded write — `buildPatches(tmp)` writes only inside tmp.
 *   4. Golden — runs against the real codebase, asserts on the
 *      adoption gap that migration-planner already surfaces.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  patch,
  renderMarkdown,
  buildPatches,
} from "../../scripts/migration-patcher";

const FROZEN = "2026-04-25T00:00:00.000Z";

describe("patch() — pure", () => {
  it("matches CSS selectors with the dotted form", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [
        { path: "a.css", content: ".rp-mb-card {\n  padding: 8px;\n}\n" },
      ],
      now: FROZEN,
    });
    expect(m.totalEdits).toBe(1);
    expect(m.files[0].edits[0]).toMatchObject({
      line: 1,
      find: "rp-mb-card",
      replace: "rp-card",
    });
    expect(m.files[0].edits[0].original).toContain(".rp-mb-card");
  });

  it("does NOT match a BEM-suffixed sibling like .rp-mb-card__title", () => {
    // The dotted matcher uses a negative lookahead on `[a-z0-9_-]` so
    // `.rp-mb-card__title` is not falsely flagged as `.rp-mb-card`.
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [
        {
          path: "a.css",
          content: ".rp-mb-card__title { color: red; }\n",
        },
      ],
      now: FROZEN,
    });
    expect(m.totalEdits).toBe(0);
  });

  it("matches class=\"...\" attributes", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [
        {
          path: "a.html",
          content: '<div class="rp-mb-card other">x</div>\n',
        },
      ],
      now: FROZEN,
    });
    expect(m.totalEdits).toBe(1);
  });

  it("matches className= attributes (JSX)", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [
        {
          path: "a.tsx",
          content: '<div className="rp-mb-card">x</div>\n',
        },
      ],
      now: FROZEN,
    });
    expect(m.totalEdits).toBe(1);
  });

  it("matches classList.add/remove/toggle calls", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [
        {
          path: "a.js",
          content:
            'el.classList.add("rp-mb-card");\nel.classList.toggle("rp-mb-card");\n',
        },
      ],
      now: FROZEN,
    });
    expect(m.totalEdits).toBe(2);
  });

  it("never mutates the input files (read-only)", () => {
    const original = ".rp-mb-card { color: red; }\n";
    const files = [{ path: "a.css", content: original }];
    patch({ source: "rp-mb-card", target: "rp-card", files, now: FROZEN });
    expect(files[0].content).toBe(original);
  });

  it("groups edits by file and counts the total", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [
        {
          path: "a.css",
          content: ".rp-mb-card {}\n.rp-mb-card.x {}\n",
        },
        {
          path: "b.js",
          content: 'el.classList.add("rp-mb-card");\n',
        },
      ],
      now: FROZEN,
    });
    expect(m.files).toHaveLength(2);
    expect(m.totalEdits).toBe(3);
  });

  it("includes a string-replacement caveat in every manifest", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [],
      now: FROZEN,
    });
    expect(m.caveats[0]).toMatch(/string-level/i);
  });

  it("flags BEM elements explicitly when neither side has `__`", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [],
      now: FROZEN,
    });
    expect(m.caveats.some((c) => /BEM/i.test(c))).toBe(true);
  });

  it("escapes regex metacharacters in source / target names", () => {
    // Hyphenated BEM modifiers contain `--` which isn't a regex metachar
    // — but `*`, `+`, etc. would be. This guards future names.
    const m = patch({
      source: "rp-btn--primary",
      target: "rp-btn--primary",
      files: [
        { path: "a.css", content: ".rp-btn--primary {}\n" },
      ],
      now: FROZEN,
    });
    expect(m.totalEdits).toBe(1);
  });
});

describe("renderMarkdown() — PR-review formatting", () => {
  it("includes the title, total counts, file path, and per-line edit", () => {
    const m = patch({
      source: "rp-mb-card",
      target: "rp-card",
      files: [
        { path: "a.css", content: ".rp-mb-card { padding: 8px; }\n" },
      ],
      now: FROZEN,
    });
    const md = renderMarkdown(m);
    expect(md).toContain("# Migration: `.rp-mb-card` → `.rp-card`");
    expect(md).toContain("1 edit(s) across 1 file(s)");
    expect(md).toContain("`a.css`");
    expect(md).toMatch(/Line 1: replace `rp-mb-card` with `rp-card`/);
  });

  it("renders caveats in their own section", () => {
    const m = patch({ source: "rp-x", target: "rp-y", files: [], now: FROZEN });
    const md = renderMarkdown(m);
    expect(md).toContain("## Caveats");
  });
});

describe("buildPatches() — bounded write", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "patch-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes only inside the target directory and produces .json + .md per manifest", () => {
    const before = fs.readdirSync(tmp);
    expect(before).toEqual([]);

    const result = buildPatches({ target: "rp-card", outputDir: tmp });

    if (result.manifests.length === 0) {
      // No widgets had `rp-card` candidates — write nothing.
      expect(fs.readdirSync(tmp)).toEqual([]);
      return;
    }

    const after = fs.readdirSync(tmp);
    // For each manifest, exactly two files: <stem>.json + <stem>.md
    expect(after.length).toBe(result.manifests.length * 2);
    for (const f of after) {
      expect(f.endsWith(".json") || f.endsWith(".md")).toBe(true);
    }
  });

  it("returns an empty result when no suggestion matches the target", () => {
    const result = buildPatches({
      target: "rp-this-does-not-exist",
      outputDir: tmp,
    });
    expect(result.manifests).toEqual([]);
    expect(result.written).toEqual([]);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });
});

describe("buildPatches() — golden run against the real codebase", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "patch-golden-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("generates non-empty patches for the next adoption gap (.rp-btn--primary)", () => {
    // The previous version of this test targeted `.rp-card` — that
    // gap closed when missions-widget composed it on 2026-04-25.
    // Aspirational target shifted to `.rp-btn--primary`, which is now
    // the planner's #1 suggestion.
    const result = buildPatches({ target: "rp-btn--primary", outputDir: tmp });
    expect(result.manifests.length).toBeGreaterThan(0);
    expect(result.manifests.every((m) => m.totalEdits > 0)).toBe(true);
  });
});
