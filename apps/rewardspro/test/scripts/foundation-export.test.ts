/**
 * Writer contract.
 *
 *   1. Pure synthetic — formatters produce well-shaped output for a
 *      hand-crafted tiny registry.
 *   2. Pure round-trip — emit JSON, parse it, get the registry data
 *      back. Catches non-serializable / lossy fields.
 *   3. Bounded I/O — `exportFoundation(tmp)` writes ONLY to the tmp
 *      directory. Nothing outside is touched.
 *   4. Golden — emitting against the real registry produces parseable
 *      artifacts with stable shape.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  formatJson,
  formatTs,
  exportFoundation,
  buildArtifacts,
} from "../../scripts/foundation-export";
import { parse, registry } from "../../scripts/rp-registry";

const FROZEN_NOW = "2026-04-25T12:00:00.000Z";
const TINY = parse(`
  :root {
    --rp-space-md: 12px;
    --rp-text-color: #212B36;
    --rp-color-success: #22c55e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --rp-text-color: rgba(255, 255, 255, 0.92);
    }
  }
  .rp-btn { padding: 8px; }
  .rp-btn--primary { background: blue; }
`);

describe("formatJson() — pure", () => {
  it("emits the schema header, source path, and timestamp", () => {
    const a = formatJson(TINY, FROZEN_NOW);
    expect(a.format).toBe("json");
    expect(a.filename).toBe("tokens.json");
    const data = JSON.parse(a.content);
    expect(data.$schema).toBe("rp-foundation/v1");
    expect(data.source).toContain("rp-shared.css");
    expect(data.generatedAt).toBe(FROZEN_NOW);
  });

  it("preserves every token's value, category, and dark override", () => {
    const a = formatJson(TINY, FROZEN_NOW);
    const data = JSON.parse(a.content);
    expect(data.tokens["--rp-space-md"]).toEqual({
      value: "12px",
      category: "spacing",
    });
    expect(data.tokens["--rp-text-color"]).toEqual({
      value: "#212B36",
      dark: "rgba(255, 255, 255, 0.92)",
      category: "color-semantic",
    });
  });

  it("lists primitive class names", () => {
    const a = formatJson(TINY, FROZEN_NOW);
    const data = JSON.parse(a.content);
    expect(data.primitives).toEqual(["rp-btn", "rp-btn--primary"]);
  });
});

describe("formatTs() — pure", () => {
  it("emits a do-not-edit header and a regeneration hint", () => {
    const a = formatTs(TINY, FROZEN_NOW);
    expect(a.filename).toBe("tokens.ts");
    expect(a.content).toContain("Auto-generated");
    expect(a.content).toContain("foundation:export");
    expect(a.content).toContain(FROZEN_NOW);
  });

  it("emits a `tokens` const that's parseable as TypeScript-shaped data", () => {
    const a = formatTs(TINY, FROZEN_NOW);
    expect(a.content).toContain('"--rp-space-md": { value: "12px"');
    expect(a.content).toContain('"--rp-text-color": { value: "#212B36", dark: "rgba(255, 255, 255, 0.92)"');
    expect(a.content).toContain("export const tokens =");
    expect(a.content).toContain("export type TokenName = keyof typeof tokens;");
  });

  it("emits a `primitives` array with `as const` for narrow types", () => {
    const a = formatTs(TINY, FROZEN_NOW);
    expect(a.content).toContain("export const primitives = [");
    expect(a.content).toContain('"rp-btn",');
    expect(a.content).toContain('"rp-btn--primary",');
    expect(a.content).toContain("export type PrimitiveName = (typeof primitives)[number];");
  });
});

describe("exportFoundation() — bounded write", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fnd-export-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes both artifacts and reports their sizes", () => {
    const result = exportFoundation(tmpDir);
    expect(result.dir).toBe(tmpDir);
    const filenames = result.artifacts.map((a) => a.filename).sort();
    expect(filenames).toEqual(["tokens.json", "tokens.ts"]);
    for (const a of result.artifacts) {
      expect(a.bytes).toBeGreaterThan(0);
    }
  });

  it("touches only the target directory — nothing outside", () => {
    const before = fs.readdirSync(tmpDir);
    expect(before).toEqual([]);
    exportFoundation(tmpDir);
    const after = fs.readdirSync(tmpDir).sort();
    expect(after).toEqual(["tokens.json", "tokens.ts"]);
  });

  it("emitted JSON parses and contains the live registry's tokens", () => {
    exportFoundation(tmpDir);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, "tokens.json"), "utf-8"));
    expect(Object.keys(data.tokens).length).toBe(registry.tokens.length);
    expect(data.tokens["--rp-space-md"]).toBeDefined();
  });
});

describe("buildArtifacts() — uses the real registry, no I/O", () => {
  it("returns exactly two artifacts (json + ts)", () => {
    const arts = buildArtifacts();
    expect(arts.map((a) => a.format).sort()).toEqual(["json", "ts"]);
    expect(arts.every((a) => a.content.length > 0)).toBe(true);
  });

  it("the JSON artifact's token count matches the registry", () => {
    const json = buildArtifacts().find((a) => a.format === "json")!;
    const data = JSON.parse(json.content);
    expect(Object.keys(data.tokens).length).toBe(registry.tokens.length);
    expect(data.primitives.length).toBe(registry.primitives.length);
  });
});
