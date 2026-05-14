/**
 * Unit tests for the kingdom-090 resolver — the pure-compute spine of the
 * price-search module. These tests LOCK current behaviour rather than
 * refactor it; the modules under test are deliberately untouched.
 *
 * ── The three quiet bugs being locked ─────────────────────────────────
 *
 * The pillow book (`docs/connections/the-pillow-book.md:13`) records the
 * three quiet bugs that live verification surfaced after kingdom-090
 * shipped on 2026-05-14. Two of them have load-bearing prevention here:
 *
 *   1. **card_number stored as publisher form** (`"OP01-001"`) not bare
 *      digits (`"001"`) — locked by `describe("scoreMatches")` → Tier 2
 *      (publisher form). The 5 OP01-001 fixtures below are the actual
 *      live-verified shape; if a future change reverts to expecting bare
 *      "001" only, Tier 2's reason flips to a fuzzy match and these
 *      tests fail.
 *
 *   2. **Case-tolerant SKU lookup** — `parseSkuShape` accepts uppercase
 *      legacy SKUs ("OP-OP01-001-JP-V11DZ") and emits lowercased parts.
 *      Locked by `describe("parseSkuShape")` → "uppercase legacy SKU".
 *
 *   3. **game-token slug/code drift** (wholesale games table's `code` is
 *      "onepiece"; slug is "one-piece"; SKU prefix is "op"). This bug
 *      lives in the ROUTE layer, not in `resolver.ts`. **Flagged here as
 *      a follow-up coverage gap**: the route-level resolution from
 *      game-slug → game-code is not yet unit-tested. Route tests would
 *      go under `apps/storefront/src/app/api/v1/search/cards/__tests__/`.
 */

import { describe, it, expect } from "vitest";

import type { PriceItem } from "@/lib/wholesale/client";
import {
  normalizeQuery,
  parseSetNumberShape,
  parseSkuShape,
  scoreMatches,
  groupSiblings,
  summarizeMatches,
} from "../resolver";

// ── Live-verified fixtures (the 5 OP01-001 variants from kingdom-090) ──
//
// These are the actual rows the wholesale catalog returned for
// Roronoa Zoro SR on 2026-05-14 — the data that surfaced bug #1.
// Every classifier branch should exercise at least one of these.

function makeItem(overrides: Partial<PriceItem>): PriceItem {
  return {
    sku: overrides.sku ?? "",
    card_number: overrides.card_number ?? "",
    price_gbp: overrides.price_gbp ?? 0,
    stock: overrides.stock ?? 0,
    pending_stock: overrides.pending_stock ?? 0,
    image_url: overrides.image_url ?? null,
    name: overrides.name ?? null,
    name_en: overrides.name_en ?? null,
    set_code: overrides.set_code ?? null,
    set_name: overrides.set_name ?? null,
    rarity: overrides.rarity ?? null,
    category: overrides.category ?? null,
    updated_at: overrides.updated_at ?? null,
  };
}

const OP01_001_FIXTURES: PriceItem[] = [
  // V11DZ — alt-art (manga background / manga art)
  makeItem({
    sku: "OP-OP01-001-JP-V11DZ",
    card_number: "OP01-001",
    set_code: "OP01",
    name: "ロロノア・ゾロ(漫画背景/漫画絵)",
    rarity: "SR",
  }),
  // V11L1 — base print
  makeItem({
    sku: "OP-OP01-001-JP-V11L1",
    card_number: "OP01-001",
    set_code: "OP01",
    name: "ロロノア・ゾロ",
    rarity: "SR",
  }),
  // V11L2 — EN-text print (Latin name in JP set)
  makeItem({
    sku: "OP-OP01-001-JP-V11L2",
    card_number: "OP01-001",
    set_code: "OP01",
    name: "Roronoa Zoro",
    name_en: "Roronoa Zoro",
    rarity: "SR",
  }),
  // VY12 — sealed gold-text promo
  makeItem({
    sku: "OP-OP01-001-JP-VY12",
    card_number: "OP01-001",
    set_code: "OP01",
    name: "ロロノア・ゾロ(未開封/金文字/漫画絵)",
    rarity: "SR",
  }),
  // VY13 — gold-text promo
  makeItem({
    sku: "OP-OP01-001-JP-VY13",
    card_number: "OP01-001",
    set_code: "OP01",
    name: "ロロノア・ゾロ(金文字/漫画絵)",
    rarity: "SR",
  }),
];

// ── normalizeQuery ────────────────────────────────────────────────────

describe("normalizeQuery", () => {
  it("uppercases", () => {
    expect(normalizeQuery("op01-001")).toBe("OP01-001");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeQuery("  OP01-001  ")).toBe("OP01-001");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeQuery("OP01   001")).toBe("OP01 001");
  });

  it("preserves dashes", () => {
    expect(normalizeQuery("op01-001")).toBe("OP01-001");
  });

  it("preserves slashes (publisher collector form)", () => {
    expect(normalizeQuery("op01-001/281")).toBe("OP01-001/281");
  });

  it("empty string round-trips empty", () => {
    expect(normalizeQuery("")).toBe("");
  });

  it("uppercases mixed case", () => {
    expect(normalizeQuery("Op-Op01-001-Ja")).toBe("OP-OP01-001-JA");
  });
});

// ── parseSetNumberShape ────────────────────────────────────────────────

describe("parseSetNumberShape", () => {
  it("parses the canonical set-number form", () => {
    expect(parseSetNumberShape("OP01-001")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("is case-insensitive via normalizeQuery", () => {
    expect(parseSetNumberShape("op01-001")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("strips trailing /<total> collector form", () => {
    expect(parseSetNumberShape("OP01-001/281")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("returns null when no set token present", () => {
    expect(parseSetNumberShape("001")).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(parseSetNumberShape("")).toBeNull();
  });

  it("returns null on garbage", () => {
    expect(parseSetNumberShape("garbage")).toBeNull();
  });

  it("captures legacy double-prefix shape as {set: 'OP-OP01', number: '001'} (greedy)", () => {
    // The regex is greedy on `[A-Z0-9-]+` then consumes the LAST `-`
    // before the trailing digits — so "OP-OP01-001" parses with set
    // "OP-OP01". Surprising-looking but consistent with the comment
    // about the last-dash anchor. Documented here so a future refactor
    // doesn't quietly break the legacy SKU path.
    expect(parseSetNumberShape("OP-OP01-001")).toEqual({
      set: "OP-OP01",
      number: "001",
    });
  });

  // Behaviour gap surfaced by the test suite — the function's doc comment
  // claims " OP01 - 001 " is accepted, but the regex has no allowance for
  // internal spaces. Skipped so a future fix has a ready-made fixture.
  it.skip("whitespace-tolerant internal-space form ' OP01 - 001 ' (doc claims yes, regex says no)", () => {
    expect(parseSetNumberShape(" OP01 - 001 ")).toEqual({
      set: "OP01",
      number: "001",
    });
  });
});

// ── parseSkuShape ──────────────────────────────────────────────────────

describe("parseSkuShape", () => {
  it("parses a canonical lowercase SKU with 4 segments", () => {
    expect(parseSkuShape("op-op01-001-ja")).toEqual({
      game: "op",
      set: "op01",
      number: "001",
      lang: "ja",
      variant: null,
    });
  });

  it("accepts uppercase legacy SKU (case-tolerant — locks bug #2)", () => {
    expect(parseSkuShape("OP-OP01-001-JP-V11DZ")).toEqual({
      game: "op",
      set: "op01",
      number: "001",
      lang: "jp",
      variant: "v11dz",
    });
  });

  it("joins multi-segment variant tail with a single dash", () => {
    expect(parseSkuShape("op-op01-001-ja-foil-alt")).toEqual({
      game: "op",
      set: "op01",
      number: "001",
      lang: "ja",
      variant: "foil-alt",
    });
  });

  it("returns null when fewer than 4 segments", () => {
    expect(parseSkuShape("abc")).toBeNull();
    expect(parseSkuShape("op-op01-001")).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(parseSkuShape("")).toBeNull();
  });
});

// ── scoreMatches — the 5-tier confidence ladder ────────────────────────

describe("scoreMatches — Tier 1: canonical SKU exact", () => {
  it("matches a full SKU input against the same SKU row", () => {
    const fixture = OP01_001_FIXTURES[0]!; // V11DZ
    // Tier 1 compares c.sku.toLowerCase() === input.q.trim().toLowerCase()
    // so a canonical lowercase input matches the uppercase legacy SKU.
    const matches = scoreMatches(
      { game: "op", q: "op-op01-001-jp-v11dz" },
      [fixture],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe("exact");
    expect(matches[0]!.reason).toContain("canonical SKU exact");
    expect(matches[0]!.sku).toBe("OP-OP01-001-JP-V11DZ");
  });
});

describe("scoreMatches — Tier 2: publisher form (the bug-#1 lock)", () => {
  it("matches all 5 OP01-001 fixtures exactly against input 'OP01-001'", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );

    expect(matches).toHaveLength(5);
    for (const m of matches) {
      expect(m.confidence).toBe("exact");
      expect(m.reason).toContain("publisher form");
    }
  });

  it("populates parsed lang and variant from the SKU tail", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );
    const variants = matches.map((m) => m.variant);
    // All 5 variants present, lowercased.
    expect(new Set(variants)).toEqual(
      new Set(["v11dz", "v11l1", "v11l2", "vy12", "vy13"]),
    );
    expect(new Set(matches.map((m) => m.lang))).toEqual(new Set(["jp"]));
  });

  it("returns name when present and falls back to card_number when not", () => {
    const noName = makeItem({
      sku: "OP-OP01-001-JP-V11L1",
      card_number: "OP01-001",
      set_code: "OP01",
      name: null,
    });
    const matches = scoreMatches({ game: "op", q: "OP01-001" }, [noName]);
    expect(matches[0]!.name).toBe("OP01-001");
  });
});

describe("scoreMatches — Tier 3: bare-digit card_number", () => {
  it("classifies a bare-digit row as exact, with publisher-form reason (Tier 2 absorbs it)", () => {
    // Synthetic fixture: card_number stored as just "001" (some upstream
    // catalogs). When card_number_norm has no dash, the code builds a
    // card_number_full = "OP01-001" which satisfies Tier 2 first — so
    // Tier 3's literal reason "set+number matched" is currently
    // unreachable. We lock the actual reason here.
    const bareDigit = makeItem({
      sku: "op-op01-001-ja",
      card_number: "001",
      set_code: "OP01",
      name: "Test card",
    });
    const matches = scoreMatches({ game: "op", q: "OP01-001" }, [bareDigit]);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe("exact");
    // Lock current behaviour: Tier 2 absorbs the bare-digit case.
    expect(matches[0]!.reason).toContain("publisher form");
  });

  it.skip("Tier 3 reason 'set+number matched' is unreachable under current logic — flagged for follow-up", () => {
    // Tier 3's literal branch is dead code today: any path where Tier 3
    // would fire is already absorbed by Tier 2's card_number_full
    // synthesis. Either Tier 3 should be removed, or Tier 2's
    // card_number_full reassignment should be guarded so Tier 3 fires
    // when card_number is bare digits. Documented as a behaviour gap.
  });
});

describe("scoreMatches — Tier 4: suffix match (legacy double-prefix)", () => {
  it("matches a legacy 'OP-OP01-001' card_number row against 'OP01-001'", () => {
    const legacyDoublePrefix = makeItem({
      sku: "op-op01-001-ja",
      card_number: "OP-OP01-001",
      set_code: "OP01",
      name: "Test card",
    });
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      [legacyDoublePrefix],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe("exact");
    expect(matches[0]!.reason).toContain("suffixed");
  });
});

describe("scoreMatches — Tier 5: fuzzy number-only", () => {
  it("matches OP01-001 fixtures fuzzily on bare '001'", () => {
    const matches = scoreMatches({ game: "op", q: "001" }, OP01_001_FIXTURES);

    expect(matches).toHaveLength(5);
    for (const m of matches) {
      expect(m.confidence).toBe("fuzzy");
      expect(m.reason).toContain("ambiguous");
    }
  });
});

describe("scoreMatches — sorting", () => {
  it("places exact matches before fuzzy matches", () => {
    // Mix an OP01-001 fixture (exact) with a bare-001 fixture for a
    // different set (will only match Tier 5 fuzzy when input is "001").
    const otherSet001 = makeItem({
      sku: "op-st01-001-ja",
      card_number: "ST01-001",
      set_code: "ST01",
      name: "Different set card",
    });
    const mixed = [otherSet001, ...OP01_001_FIXTURES];

    // Input "OP01-001" → 5 exact (OP01-001 fixtures) + 1 non-match for
    // the ST01 row (its card_number "ST01-001" doesn't end with "-001"
    // in the resolver's Tier-5 path; let's instead use the suffix-only
    // resolver: input "001" → fuzzy for everything that ends in "-001".
    const matches = scoreMatches({ game: "op", q: "001" }, mixed);
    // All 6 fuzzy → sort alphabetic by ${set_code}-${card_number}-${lang}.
    expect(matches[0]!.set_code).toBe("OP01");
    expect(matches.at(-1)!.set_code).toBe("ST01");
  });

  it("within an exact tier, sorts alphabetic on set_code-card_number-lang", () => {
    // Two different exact-matching cards. The OP01-001 fixtures share
    // identical (set_code, card_number, lang), so we add a synthetic
    // card with a different set+number to verify cross-card ordering.
    const op02 = makeItem({
      sku: "op-op02-001-ja",
      card_number: "OP02-001",
      set_code: "OP02",
      name: "Different set",
    });
    // Score both rows; OP01 should land before OP02 alphabetically.
    const op01Sample = OP01_001_FIXTURES[1]!; // V11L1 base
    const matches = scoreMatches(
      { game: "op", q: "op-op02-001-ja" },
      [op02, op01Sample],
    );
    // op02 is the SKU-exact (Tier 1); op01Sample doesn't match anything
    // canonical (its sku differs), so it returns as fuzzy with
    // "card_number partial match" reason. Exact comes first.
    expect(matches[0]!.set_code).toBe("OP02");
    expect(matches[0]!.confidence).toBe("exact");
  });
});

// ── groupSiblings ──────────────────────────────────────────────────────

describe("groupSiblings", () => {
  it("collapses the 5 OP01-001 variants into one group", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );
    const groups = groupSiblings(matches);

    expect(groups.size).toBe(1);
    expect(groups.has("OP01-OP01-001")).toBe(true);
    expect(groups.get("OP01-OP01-001")?.length).toBe(5);
  });

  it("splits across different (set, number) tuples into separate groups", () => {
    const op02 = makeItem({
      sku: "OP-OP02-001-JP-V11L1",
      card_number: "OP02-001",
      set_code: "OP02",
      name: "OP02 card",
    });
    // Use Tier 5 (fuzzy "001" against all card_numbers ending in -001).
    const matches = scoreMatches(
      { game: "op", q: "001" },
      [...OP01_001_FIXTURES, op02],
    );
    const groups = groupSiblings(matches);

    expect(groups.size).toBe(2);
    expect(groups.has("OP01-OP01-001")).toBe(true);
    expect(groups.has("OP02-OP02-001")).toBe(true);
  });

  it("handles null set_code by using '_' placeholder in the key", () => {
    const noSet = makeItem({
      sku: "op-zzz-999-ja",
      card_number: "ZZZ-999",
      set_code: null,
      name: "No-set card",
    });
    const matches = scoreMatches(
      { game: "op", q: "op-zzz-999-ja" },
      [noSet],
    );
    const groups = groupSiblings(matches);
    expect(groups.has("_-ZZZ-999")).toBe(true);
  });

  it("returns an empty Map for empty input", () => {
    expect(groupSiblings([]).size).toBe(0);
  });
});

// ── summarizeMatches ───────────────────────────────────────────────────

describe("summarizeMatches", () => {
  it("zero matches: count=0, best=none, not ambiguous", () => {
    const summary = summarizeMatches([]);
    expect(summary).toEqual({
      count: 0,
      best_confidence: "none",
      distinct_set_number_buckets: 0,
      ambiguous: false,
    });
  });

  it("five OP01-001 sibling variants: count=5, exact, 1 bucket, not ambiguous", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );
    const summary = summarizeMatches(matches);

    expect(summary.count).toBe(5);
    expect(summary.best_confidence).toBe("exact");
    expect(summary.distinct_set_number_buckets).toBe(1);
    expect(summary.ambiguous).toBe(false);
  });

  it("two distinct physical cards: ambiguous=true", () => {
    const op02 = makeItem({
      sku: "OP-OP02-001-JP-V11L1",
      card_number: "OP02-001",
      set_code: "OP02",
      name: "OP02 card",
    });
    const matches = scoreMatches(
      { game: "op", q: "001" },
      [...OP01_001_FIXTURES, op02],
    );
    const summary = summarizeMatches(matches);

    expect(summary.distinct_set_number_buckets).toBe(2);
    expect(summary.ambiguous).toBe(true);
  });

  it("any-exact match wins over fuzzy when summarising", () => {
    const exactRow = OP01_001_FIXTURES[0]!;
    const fuzzyOnlyRow = makeItem({
      sku: "op-eb04-061-ja",
      card_number: "EB04-061",
      set_code: "EB04",
      name: "Different fuzzy match",
    });
    // input "OP01-001" gives Tier 2 exact for OP01 row and no-match for
    // EB04 row (fuzzy fallback "card_number partial match").
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      [fuzzyOnlyRow, exactRow],
    );

    const summary = summarizeMatches(matches);
    expect(summary.best_confidence).toBe("exact");
  });
});
