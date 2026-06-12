/**
 * Unit tests for the kingdom-090 resolver — the pure-compute spine of the
 * price-search module.
 *
 * History: the original suite LOCKED three quiet bugs surfaced by live
 * verification after kingdom-090 shipped (2026-05-14). The 2026-06-11
 * search overhaul fixed the locked behaviours, so this suite now locks
 * the FIXED contract:
 *
 *   1. **card_number stored as publisher form** ("OP01-001") — still
 *      locked via the 5 live-verified OP01-001 fixtures.
 *   2. **Case-tolerant SKU lookup** — parseSkuShape accepts uppercase
 *      legacy SKUs. The lang tail stays RAW in payloads (partner value
 *      domain: legacy rows say "jp"/"cn"); the ?lang= fold preference
 *      ISO-normalizes both sides at the comparison site, so lang=ja
 *      matches legacy jp prints without changing what partners see.
 *   3. **Input tolerance** — separators humans type (space, slash,
 *      en-dash, full-width) all parse; the doc-claimed " OP01 - 001 "
 *      form is no longer a skipped fixture.
 *   4. **Honest scoring** — rows the wholesale ILIKE returned that match
 *      no tier are DROPPED, not labelled "card_number partial match";
 *      name hits say "name matched".
 *   5. **Ranked fold** — rankFoldCandidates prefers requested language,
 *      then base print (no variant markers), then stock, then price —
 *      OP01-001 no longer opens on an arbitrary alt-art promo.
 */

import { describe, it, expect } from "vitest";

import type { PriceItem } from "@/lib/wholesale/client";
import {
  normalizeQuery,
  foldNameForCompare,
  parseSetNumberShape,
  parseSkuShape,
  scoreMatches,
  groupSiblings,
  summarizeMatches,
  rankFoldCandidates,
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

  it("preserves slashes (publisher collector form)", () => {
    expect(normalizeQuery("op01-001/281")).toBe("OP01-001/281");
  });

  it("NFKC-folds full-width characters (Japanese keyboards)", () => {
    expect(normalizeQuery("ＯＰ０１－００１")).toBe("OP01-001");
  });

  it("empty string round-trips empty", () => {
    expect(normalizeQuery("")).toBe("");
  });
});

// ── foldNameForCompare ────────────────────────────────────────────────

describe("foldNameForCompare", () => {
  it("makes 'Monkey D Luffy' match catalog 'Monkey.D.Luffy'", () => {
    expect(foldNameForCompare("Monkey D Luffy")).toBe(
      foldNameForCompare("Monkey.D.Luffy"),
    );
  });

  it("is case-insensitive", () => {
    expect(foldNameForCompare("LUFFY")).toBe(foldNameForCompare("luffy"));
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

  it("accepts a space separator ('op01 001')", () => {
    expect(parseSetNumberShape("op01 001")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("accepts a slash separator ('OP01/001')", () => {
    expect(parseSetNumberShape("OP01/001")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("accepts an en-dash separator ('OP01–001')", () => {
    expect(parseSetNumberShape("OP01–001")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("accepts full-width input ('ＯＰ０１－００１')", () => {
    expect(parseSetNumberShape("ＯＰ０１－００１")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("accepts the doc-claimed whitespace form ' OP01 - 001 '", () => {
    expect(parseSetNumberShape(" OP01 - 001 ")).toEqual({
      set: "OP01",
      number: "001",
    });
  });

  it("accepts alphanumeric number tokens ('SV01-TG12')", () => {
    expect(parseSetNumberShape("SV01-TG12")).toEqual({
      set: "SV01",
      number: "TG12",
    });
  });

  it("keeps dash-bearing set codes via last-dash capture ('D-BT01/001')", () => {
    expect(parseSetNumberShape("D-BT01/001")).toEqual({
      set: "D-BT01",
      number: "001",
    });
  });

  it("returns null on a bare collector number ('025/202') — no set token", () => {
    expect(parseSetNumberShape("025/202")).toBeNull();
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

  it("returns null on full SKU input — parseSkuShape owns that shape", () => {
    // The variants grid links pass full SKUs as q; parsing them as
    // set+number would break the canonical-SKU exact tier.
    expect(parseSetNumberShape("op-op01-001-ja")).toBeNull();
    expect(parseSetNumberShape("OP-OP01-001-JP-V11DZ")).toBeNull();
  });

  it("captures legacy double-prefix shape as {set: 'OP-OP01', number: '001'} (greedy)", () => {
    expect(parseSetNumberShape("OP-OP01-001")).toEqual({
      set: "OP-OP01",
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

  it("accepts uppercase legacy SKU, keeping the raw lang tail (partner value domain)", () => {
    expect(parseSkuShape("OP-OP01-001-JP-V11DZ")).toEqual({
      game: "op",
      set: "op01",
      number: "001",
      lang: "jp",
      variant: "v11dz",
    });
  });

  it("keeps cn raw too — ISO normalization happens at comparison sites only", () => {
    expect(parseSkuShape("op-op01-001-cn")?.lang).toBe("cn");
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

// ── scoreMatches — the confidence ladder ───────────────────────────────

describe("scoreMatches — Tier 1: canonical SKU exact", () => {
  it("matches a full SKU input against the same SKU row", () => {
    const fixture = OP01_001_FIXTURES[0]!; // V11DZ
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

describe("scoreMatches — Tier 1b: canonical↔legacy SKU bridge", () => {
  it("the documented canonical shape finds its legacy-cased row (normalizeSku bridge)", () => {
    // Catalog stores OP-OP01-001-JP-V11L1; partner types the canonical
    // op-op01-001-ja-v11l1 from the SKU standard docs. normalizeSku maps
    // both to the same canonical, so the lookup is exact.
    const matches = scoreMatches(
      { game: "op", q: "op-op01-001-ja-v11l1" },
      [OP01_001_FIXTURES[1]!],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe("exact");
    expect(matches[0]!.reason).toBe("canonical SKU exact");
  });

  it("a canonical SKU query whose exact print is absent still surfaces its siblings", () => {
    // op-op01-001-ja (no variant tail) is not stored verbatim — but the
    // five legacy prints of OP01-001 are the same physical card. They
    // must surface as fuzzy "same card, different print", not vanish
    // into "No cards matched".
    const matches = scoreMatches(
      { game: "op", q: "op-op01-001-ja" },
      OP01_001_FIXTURES,
    );
    expect(matches.length).toBe(5);
    for (const m of matches) {
      expect(m.confidence).toBe("fuzzy");
      expect(m.reason).toBe("same card, different print");
    }
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

  it("also matches tolerant separator input ('op01 001')", () => {
    const matches = scoreMatches(
      { game: "op", q: "op01 001" },
      OP01_001_FIXTURES,
    );
    expect(matches).toHaveLength(5);
    for (const m of matches) expect(m.confidence).toBe("exact");
  });

  it("populates parsed lang (ISO-normalized) and variant from the SKU tail", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );
    const variants = matches.map((m) => m.variant);
    expect(new Set(variants)).toEqual(
      new Set(["v11dz", "v11l1", "v11l2", "vy12", "vy13"]),
    );
    // Raw tails — partners filtering on "jp" keep working; the ?lang=
    // fold preference normalizes at the comparison site instead.
    expect(new Set(matches.map((m) => m.lang))).toEqual(new Set(["jp"]));
  });

  it("carries price/stock/rarity/set fields for list UIs", () => {
    const priced = makeItem({
      sku: "OP-OP01-001-JP-V11L1",
      card_number: "OP01-001",
      set_code: "OP01",
      set_name: "Romance Dawn",
      name: "ロロノア・ゾロ",
      rarity: "SR",
      price_gbp: 12.4,
      stock: 3,
    });
    const [m] = scoreMatches({ game: "op", q: "OP01-001" }, [priced]);
    expect(m!.price_gbp).toBe(12.4);
    expect(m!.in_stock).toBe(true);
    expect(m!.rarity).toBe("SR");
    expect(m!.set_name).toBe("Romance Dawn");
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
    const bareDigit = makeItem({
      sku: "op-op01-001-ja",
      card_number: "001",
      set_code: "OP01",
      name: "Test card",
    });
    const matches = scoreMatches({ game: "op", q: "OP01-001" }, [bareDigit]);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe("exact");
    expect(matches[0]!.reason).toContain("publisher form");
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

describe("scoreMatches — Tier 6: card number contains query", () => {
  it("labels OP01-0010 honestly when the input was OP01-001", () => {
    const noisy = makeItem({
      sku: "OP-OP01-0010-JP-V1",
      card_number: "OP01-0010",
      set_code: "OP01",
      name: "Noise row",
    });
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      [...OP01_001_FIXTURES, noisy],
    );
    const noise = matches.find((m) => m.card_number === "OP01-0010");
    expect(noise).toBeDefined();
    expect(noise!.confidence).toBe("fuzzy");
    expect(noise!.reason).toBe("card number contains query");
  });
});

describe("scoreMatches — Tier 7: name matched (honest reasons)", () => {
  it("labels a name hit 'name matched', not 'card_number partial match'", () => {
    const luffy = makeItem({
      sku: "OP-EB02-010-JP-VWLE",
      card_number: "EB02-010",
      set_code: "EB02",
      name: "Monkey.D.Luffy",
      name_en: "Monkey.D.Luffy",
    });
    const [m] = scoreMatches({ game: "op", q: "luffy" }, [luffy]);
    expect(m!.confidence).toBe("fuzzy");
    expect(m!.reason).toBe("name matched");
  });

  it("matches separator-blind ('Monkey D Luffy' vs 'Monkey.D.Luffy')", () => {
    const luffy = makeItem({
      sku: "OP-EB02-010-JP-VWLE",
      card_number: "EB02-010",
      set_code: "EB02",
      name: "Monkey.D.Luffy",
    });
    const matches = scoreMatches({ game: "op", q: "Monkey D Luffy" }, [luffy]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reason).toBe("name matched");
  });
});

describe("scoreMatches — unmatched rows are dropped", () => {
  it("drops a row that matches no tier instead of faking a reason", () => {
    const unrelated = makeItem({
      sku: "op-eb04-061-ja",
      card_number: "EB04-061",
      set_code: "EB04",
      name: "Different card entirely",
    });
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      [unrelated, OP01_001_FIXTURES[0]!],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.set_code).toBe("OP01");
  });
});

describe("scoreMatches — similarity mode (typo-tolerant retry)", () => {
  it("labels rows from the wholesale similarity retry honestly", () => {
    const luffy = makeItem({
      sku: "OP-EB02-010-JP-VWLE",
      card_number: "EB02-010",
      set_code: "EB02",
      name: "Monkey.D.Luffy",
    });
    // "lufy" is not a substring of the name — only the similarity retry
    // can have produced this row, and the reason must say so.
    const [m] = scoreMatches(
      { game: "op", q: "lufy", matchMode: "similarity" },
      [luffy],
    );
    expect(m!.confidence).toBe("fuzzy");
    expect(m!.reason).toContain("typo-tolerant");
  });
});

describe("scoreMatches — sorting", () => {
  it("places exact matches before fuzzy matches, in-stock before out", () => {
    const inStockFuzzy = makeItem({
      sku: "op-st01-001-ja",
      card_number: "ST01-001",
      set_code: "ST01",
      name: "Starter Zoro",
      stock: 5,
      price_gbp: 2,
    });
    const matches = scoreMatches(
      { game: "op", q: "001" },
      [...OP01_001_FIXTURES, inStockFuzzy],
    );
    // All fuzzy (number-only input); the in-stock row leads.
    expect(matches[0]!.sku).toBe("op-st01-001-ja");
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

// ── rankFoldCandidates ─────────────────────────────────────────────────

describe("rankFoldCandidates", () => {
  it("prefers the base print over alt-art/promo markers (the OP01-001 fix)", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );
    const { winner, fold_reason } = rankFoldCandidates(matches);
    // V11L1 ("ロロノア・ゾロ", no markers) and V11L2 ("Roronoa Zoro")
    // are both base-ish; alphabetic tiebreak lands on V11L1. The old
    // behaviour folded to V11DZ (manga-art) purely by array order.
    expect(winner.sku).toBe("OP-OP01-001-JP-V11L1");
    expect(fold_reason).toContain("base print");
  });

  it("prefers the requested language when given", () => {
    const en = makeItem({
      sku: "op-op01-001-en",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "Roronoa Zoro",
    });
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      [...OP01_001_FIXTURES, en],
    );
    const { winner, fold_reason } = rankFoldCandidates(matches, "en");
    expect(winner.sku).toBe("op-op01-001-en");
    expect(fold_reason).toContain("requested language (en)");
  });

  it("requesting 'ja' selects legacy 'jp'-tailed prints (ISO compare at the ranker)", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );
    const { winner, fold_reason } = rankFoldCandidates(matches, "ja");
    expect(winner.lang).toBe("jp");
    expect(fold_reason).toContain("requested language (ja)");
  });

  it("prefers in-stock among equal prints", () => {
    const out = makeItem({
      sku: "op-op01-001-ja-a",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "Roronoa Zoro",
      stock: 0,
    });
    const stocked = makeItem({
      sku: "op-op01-001-ja-b",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "Roronoa Zoro",
      stock: 2,
    });
    const matches = scoreMatches({ game: "op", q: "OP01-001" }, [out, stocked]);
    const { winner } = rankFoldCandidates(matches);
    expect(winner.sku).toBe("op-op01-001-ja-b");
  });

  it("says 'only print' for a single candidate", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      [OP01_001_FIXTURES[1]!],
    );
    expect(rankFoldCandidates(matches).fold_reason).toBe("only print");
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
      upstream_total: 0,
      truncated: false,
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

  it("two distinct physical cards at the best tier: ambiguous=true", () => {
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

  it("fuzzy noise below an exact match does NOT flag ambiguous", () => {
    // OP01-001 exact + OP01-0010 substring noise: the user has nothing
    // to disambiguate — the exact bucket is singular. The old behaviour
    // returned ambiguous=true here AND still folded, contradicting
    // itself in one payload.
    const noisy = makeItem({
      sku: "OP-OP01-0010-JP-V1",
      card_number: "OP01-0010",
      set_code: "OP01",
      name: "Noise row",
    });
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      [...OP01_001_FIXTURES, noisy],
    );
    const summary = summarizeMatches(matches);
    expect(summary.best_confidence).toBe("exact");
    expect(summary.distinct_set_number_buckets).toBe(2);
    expect(summary.ambiguous).toBe(false);
  });

  it("reports upstream_total + truncated when the fetch was capped", () => {
    const matches = scoreMatches(
      { game: "op", q: "OP01-001" },
      OP01_001_FIXTURES,
    );
    const summary = summarizeMatches(matches, { upstream_total: 80 });
    expect(summary.upstream_total).toBe(80);
    expect(summary.truncated).toBe(true);
  });
});
