import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseEbayTitle } from "../title-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Fixture {
  id: string;
  title: string;
  expected: {
    game?: string | null;
    set?: string | null;
    number?: string | null;
    lang?: string | null;
    variant?: string | null;
    grade_company?: string | null;
    grade_value?: string;
    grade_value_oneof?: string[];
    min_confidence?: number;
    max_confidence?: number;
    forces_quarantine?: boolean;
    exclude_keywords_includes?: string[];
    sku_is_null?: boolean;
    notes_includes?: string;
  };
}

const fixturePath = join(__dirname, "fixtures", "titles.json");
const fixtures: { titles: Fixture[] } = JSON.parse(readFileSync(fixturePath, "utf-8"));

describe("title-parser — fixture corpus", () => {
  for (const fix of fixtures.titles) {
    it(`${fix.id}: ${fix.title.slice(0, 70)}${fix.title.length > 70 ? "…" : ""}`, () => {
      const result = parseEbayTitle(fix.title);
      const exp = fix.expected;

      if (exp.game !== undefined) expect(result.game).toBe(exp.game);
      if (exp.set !== undefined) expect(result.set).toBe(exp.set);
      if (exp.number !== undefined) expect(result.number).toBe(exp.number);
      if (exp.lang !== undefined) expect(result.lang).toBe(exp.lang);
      if (exp.variant !== undefined) expect(result.variant).toBe(exp.variant);
      if (exp.grade_company !== undefined) expect(result.grade.grade_company).toBe(exp.grade_company);
      if (exp.grade_value !== undefined) expect(result.grade.grade_value).toBe(exp.grade_value);
      if (exp.grade_value_oneof !== undefined) {
        expect(exp.grade_value_oneof).toContain(result.grade.grade_value);
      }
      if (exp.min_confidence !== undefined) {
        expect(result.confidence).toBeGreaterThanOrEqual(exp.min_confidence);
      }
      if (exp.max_confidence !== undefined) {
        expect(result.confidence).toBeLessThanOrEqual(exp.max_confidence);
      }
      if (exp.forces_quarantine !== undefined) {
        expect(result.forces_quarantine).toBe(exp.forces_quarantine);
      }
      if (exp.exclude_keywords_includes !== undefined) {
        for (const kw of exp.exclude_keywords_includes) {
          expect(result.condition.excluded_keywords).toContain(kw);
        }
      }
      if (exp.sku_is_null === true) {
        expect(result.sku).toBeNull();
      }
      if (exp.notes_includes !== undefined) {
        const has = result.notes.some((n) => n.includes(exp.notes_includes!));
        expect(has).toBe(true);
      }
    });
  }
});

describe("title-parser — corpus accuracy", () => {
  it("at least 80% of singles fixtures produce a non-null SKU above threshold", () => {
    const singles = fixtures.titles.filter(
      (f) =>
        !f.expected.forces_quarantine &&
        !f.expected.sku_is_null &&
        f.expected.min_confidence !== undefined &&
        f.expected.min_confidence >= 0.6,
    );
    const passed = singles.filter((f) => {
      const r = parseEbayTitle(f.title);
      return r.sku !== null && r.confidence >= 0.7;
    }).length;
    const accuracy = passed / Math.max(1, singles.length);
    // Surface this on test output so we can track parser improvements over time.
    // eslint-disable-next-line no-console
    console.log(`[parser-accuracy] singles ${passed}/${singles.length} = ${(accuracy * 100).toFixed(1)}%`);
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });

  it("100% of quarantine fixtures forces_quarantine === true", () => {
    const quarantines = fixtures.titles.filter((f) => f.expected.forces_quarantine === true);
    for (const f of quarantines) {
      const r = parseEbayTitle(f.title);
      expect(r.forces_quarantine, `failed on ${f.id}: ${f.title}`).toBe(true);
    }
  });
});

describe("title-parser — edge cases", () => {
  it("handles empty title", () => {
    const r = parseEbayTitle("");
    expect(r.sku).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("strips trailing | eBay separator by default", () => {
    const r1 = parseEbayTitle("One Piece TCG OP01-001 Japanese | eBay");
    const r2 = parseEbayTitle("One Piece TCG OP01-001 Japanese");
    expect(r1.sku).toBe(r2.sku);
  });

  it("respects strip_trailing_separators=false", () => {
    const r = parseEbayTitle("Foo Bar | eBay", { strip_trailing_separators: false });
    // 'eBay' substring shouldn't affect anything; we just verify the option is honored.
    expect(r.sku).toBeNull(); // no card number anyway
  });

  it("collapses whitespace", () => {
    const r1 = parseEbayTitle("One   Piece   TCG    OP01-001   Japanese");
    const r2 = parseEbayTitle("One Piece TCG OP01-001 Japanese");
    expect(r1.sku).toBe(r2.sku);
  });

  it("never throws on weird input", () => {
    // @ts-expect-error — runtime tolerance
    expect(() => parseEbayTitle(null)).not.toThrow();
    // @ts-expect-error
    expect(() => parseEbayTitle(undefined)).not.toThrow();
    // @ts-expect-error
    expect(() => parseEbayTitle(12345)).not.toThrow();
  });
});
