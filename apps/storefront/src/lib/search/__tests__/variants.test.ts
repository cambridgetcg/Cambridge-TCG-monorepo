/**
 * Unit tests for the kingdom-090 variant classifier — the 8-tier
 * heuristic waterfall that names each sibling row's kind so the UI can
 * render the right group. These tests LOCK current classification
 * decisions; the module under test is deliberately not modified.
 *
 * Each branch of the waterfall is exercised against either a real
 * OP01-001 fixture (live-verified 2026-05-14) or a minimal synthetic
 * row crafted to land at that branch with no earlier branch claiming
 * priority.
 */

import { describe, it, expect } from "vitest";

import type { PriceItem } from "@/lib/wholesale/client";
import {
  effectiveLanguage,
  classifySibling,
  compareVariantKinds,
  VARIANT_KIND_ORDER,
} from "../variants";

// ── Live-verified fixtures (the 5 OP01-001 variants) ──────────────────

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

const V11DZ = makeItem({
  sku: "OP-OP01-001-JP-V11DZ",
  card_number: "OP01-001",
  set_code: "OP01",
  name: "ロロノア・ゾロ(漫画背景/漫画絵)",
  rarity: "SR",
});

const V11L1 = makeItem({
  sku: "OP-OP01-001-JP-V11L1",
  card_number: "OP01-001",
  set_code: "OP01",
  name: "ロロノア・ゾロ",
  rarity: "SR",
});

const V11L2 = makeItem({
  sku: "OP-OP01-001-JP-V11L2",
  card_number: "OP01-001",
  set_code: "OP01",
  name: "Roronoa Zoro",
  name_en: "Roronoa Zoro",
  rarity: "SR",
});

const VY12 = makeItem({
  sku: "OP-OP01-001-JP-VY12",
  card_number: "OP01-001",
  set_code: "OP01",
  name: "ロロノア・ゾロ(未開封/金文字/漫画絵)",
  rarity: "SR",
});

const VY13 = makeItem({
  sku: "OP-OP01-001-JP-VY13",
  card_number: "OP01-001",
  set_code: "OP01",
  name: "ロロノア・ゾロ(金文字/漫画絵)",
  rarity: "SR",
});

// ── effectiveLanguage ──────────────────────────────────────────────────

describe("effectiveLanguage", () => {
  it("CJK-only name returns 'ja'", () => {
    expect(effectiveLanguage("ロロノア・ゾロ")).toBe("ja");
  });

  it("Latin-only name returns 'en'", () => {
    expect(effectiveLanguage("Roronoa Zoro")).toBe("en");
  });

  it("strips parenthesised markers before classifying the core script", () => {
    expect(effectiveLanguage("ロロノア・ゾロ(Promo)")).toBe("ja");
  });

  it("empty string returns 'unknown'", () => {
    expect(effectiveLanguage("")).toBe("unknown");
  });

  it("null returns 'unknown'", () => {
    expect(effectiveLanguage(null)).toBe("unknown");
  });

  it("mixed CJK + Latin (after stripping parens) returns 'unknown'", () => {
    expect(effectiveLanguage("Zoro ゾロ")).toBe("unknown");
  });

  it("strips full-width parens too", () => {
    // The regex matches both `(` and `（` open brackets.
    expect(effectiveLanguage("ロロノア・ゾロ(漫画背景/漫画絵)")).toBe("ja");
  });

  it("a name that is ONLY parens returns 'unknown'", () => {
    // After stripping parens, the core is empty → unknown.
    expect(effectiveLanguage("(Promo)")).toBe("unknown");
  });

  it("handles single-language English name with a parenthesised marker", () => {
    expect(effectiveLanguage("Roronoa Zoro (Foil)")).toBe("en");
  });
});

// ── classifySibling — the 8-tier waterfall ─────────────────────────────

describe("classifySibling — Tier 1: self detection", () => {
  it("returns 'self' when sibling SKU matches self SKU (case-insensitive)", () => {
    const result = classifySibling({ sibling: V11L1, self: V11L1 });
    expect(result.variant_kind).toBe("self");
    expect(result.variant_kind_reason).toContain("exact SKU match");
  });

  it("matches case-insensitively (uppercase legacy SKU)", () => {
    // Self has uppercase SKU; sibling SKU also uppercase → same case.
    // Build a variant where the sibling SKU is the LOWER form.
    const lowerSelfClone = { ...V11L1, sku: V11L1.sku.toLowerCase() };
    const result = classifySibling({ sibling: lowerSelfClone, self: V11L1 });
    expect(result.variant_kind).toBe("self");
  });
});

describe("classifySibling — Tier 2: promo set code", () => {
  it("classifies set_code='PROMO' rows as promo", () => {
    const promoRow = makeItem({
      sku: "OP-PROMO-001-JP-V11L1",
      card_number: "PROMO-001",
      set_code: "PROMO",
      name: "ロロノア・ゾロ",
    });
    const result = classifySibling({ sibling: promoRow, self: V11L1 });
    expect(result.variant_kind).toBe("promo");
    expect(result.variant_kind_reason).toContain("set_code=PROMO");
  });

  it("classifies P-prefixed set codes (e.g. 'P-001') as promo", () => {
    const pPrefixRow = makeItem({
      sku: "OP-P001-001-JP-V11L1",
      card_number: "P-001",
      set_code: "P-001",
      name: "ロロノア・ゾロ",
    });
    const result = classifySibling({ sibling: pPrefixRow, self: V11L1 });
    expect(result.variant_kind).toBe("promo");
    expect(result.variant_kind_reason).toContain("set_code=P-001");
  });

  it("classifies set_code='ST00' as promo (in the PROMO_SET_CODES list)", () => {
    const st00Row = makeItem({
      sku: "OP-ST00-001-JP-V11L1",
      card_number: "ST00-001",
      set_code: "ST00",
      name: "ロロノア・ゾロ",
    });
    const result = classifySibling({ sibling: st00Row, self: V11L1 });
    expect(result.variant_kind).toBe("promo");
  });

  it("does NOT classify 'POKER' as promo (P-prefix requires a separator)", () => {
    // The regex /^P[-_]/ requires P followed by - or _, so plain
    // P-prefixed words like POKER skip the promo classification.
    const pokerRow = makeItem({
      sku: "OP-POKER-001-JP-V11L1",
      card_number: "POKER-001",
      set_code: "POKER",
      name: "ロロノア・ゾロ",
    });
    const result = classifySibling({ sibling: pokerRow, self: V11L1 });
    expect(result.variant_kind).not.toBe("promo");
  });
});

describe("classifySibling — Tier 3: cross-set super-parallel", () => {
  it("classifies an OP08 row against an OP01 self as 'super-parallel'", () => {
    const op08Row = makeItem({
      sku: "OP-OP08-001-JP-V11L1",
      card_number: "OP08-001",
      set_code: "OP08",
      name: "ロロノア・ゾロ",
    });
    const result = classifySibling({ sibling: op08Row, self: V11L1 });
    expect(result.variant_kind).toBe("super-parallel");
    expect(result.variant_kind_reason).toContain("OP08");
    expect(result.variant_kind_reason).toContain("OP01");
  });
});

describe("classifySibling — Tier 4: promo name marker", () => {
  it("VY12 (未開封/金文字/漫画絵) classifies as promo via 未開封 marker", () => {
    const result = classifySibling({ sibling: VY12, self: V11L1 });
    expect(result.variant_kind).toBe("promo");
    expect(result.variant_kind_reason).toContain("name marker");
  });

  it("VY13 (金文字/漫画絵) classifies as promo via 金文字 marker", () => {
    const result = classifySibling({ sibling: VY13, self: V11L1 });
    expect(result.variant_kind).toBe("promo");
    expect(result.variant_kind_reason).toContain("name marker");
  });

  it("(Promo) parenthesised English marker classifies as promo", () => {
    const promoMarkerRow = makeItem({
      sku: "OP-OP01-001-JP-VPM01",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "Roronoa Zoro (Promo)",
    });
    const result = classifySibling({ sibling: promoMarkerRow, self: V11L2 });
    expect(result.variant_kind).toBe("promo");
  });
});

describe("classifySibling — Tier 5: parallel name marker", () => {
  it("classifies a パラレル-named row as 'parallel'", () => {
    const parallelRow = makeItem({
      sku: "OP-OP01-001-JP-VPAR1",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "ロロノア・ゾロ(パラレル)",
    });
    const result = classifySibling({ sibling: parallelRow, self: V11L1 });
    expect(result.variant_kind).toBe("parallel");
    expect(result.variant_kind_reason).toContain("name marker");
  });

  it("classifies a ホロ仕様 (holo) row as 'parallel'", () => {
    const holoRow = makeItem({
      sku: "OP-OP01-001-JP-VHOL1",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "ロロノア・ゾロ(ホロ仕様)",
    });
    const result = classifySibling({ sibling: holoRow, self: V11L1 });
    expect(result.variant_kind).toBe("parallel");
  });
});

describe("classifySibling — Tier 6: alt-art name marker", () => {
  it("V11DZ (漫画背景/漫画絵) classifies as alt-art via 漫画背景 marker", () => {
    const result = classifySibling({ sibling: V11DZ, self: V11L1 });
    expect(result.variant_kind).toBe("alt-art");
    expect(result.variant_kind_reason).toContain("name marker");
  });

  it("classifies a フルアート row as 'alt-art'", () => {
    const fullArtRow = makeItem({
      sku: "OP-OP01-001-JP-VFA01",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "ロロノア・ゾロ(フルアート)",
    });
    const result = classifySibling({ sibling: fullArtRow, self: V11L1 });
    expect(result.variant_kind).toBe("alt-art");
  });
});

describe("classifySibling — Tier 7: language differs", () => {
  it("V11L2 (Latin 'Roronoa Zoro') against V11L1 self (CJK) classifies as 'language'", () => {
    const result = classifySibling({ sibling: V11L2, self: V11L1 });
    expect(result.variant_kind).toBe("language");
    expect(result.variant_kind_reason).toMatch(/script en/);
    expect(result.variant_kind_reason).toMatch(/self ja/);
    expect(result.effective_language).toBe("en");
  });

  it("does NOT classify language when either side is 'unknown'", () => {
    // Self has mixed name → effective_language 'unknown'. Sibling has
    // CJK name → 'ja'. Since self is unknown, Tier 7's both-known guard
    // bypasses → falls through to default 'alt-art'.
    const unknownSelf = makeItem({
      sku: "OP-OP01-001-JP-VUNK0",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "Zoro ゾロ", // mixed
    });
    const cjkSibling = makeItem({
      sku: "OP-OP01-001-JP-VCJK0",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "ロロノア・ゾロ",
    });
    const result = classifySibling({ sibling: cjkSibling, self: unknownSelf });
    expect(result.variant_kind).not.toBe("language");
  });
});

describe("classifySibling — Tier 8: default catch-all (alt-art)", () => {
  it("classifies same-set + same-lang + no-markers as 'alt-art' with reason 'default'", () => {
    // Synthetic minimal fixture: same set, same script, no markers in
    // name. The base print fixture V11L1 against itself triggers Tier 1
    // (self), so we use a different SKU with the same shape.
    const cleanSibling = makeItem({
      sku: "OP-OP01-001-JP-VCLEAN",
      card_number: "OP01-001",
      set_code: "OP01",
      name: "ロロノア・ゾロ",
    });
    const result = classifySibling({ sibling: cleanSibling, self: V11L1 });
    expect(result.variant_kind).toBe("alt-art");
    expect(result.variant_kind_reason).toContain("default");
  });
});

describe("classifySibling — effective_language is always populated", () => {
  it("carries the sibling's inferred language alongside the kind", () => {
    expect(classifySibling({ sibling: V11L1, self: V11L1 }).effective_language).toBe("ja");
    expect(classifySibling({ sibling: V11L2, self: V11L1 }).effective_language).toBe("en");
    // VY12 has parens stripped → core "ロロノア・ゾロ" → "ja"
    expect(classifySibling({ sibling: VY12, self: V11L1 }).effective_language).toBe("ja");
  });
});

// ── VARIANT_KIND_ORDER and compareVariantKinds ────────────────────────

describe("VARIANT_KIND_ORDER", () => {
  it("orders kinds as self < language < alt-art < parallel < super-parallel < promo < unknown", () => {
    expect(VARIANT_KIND_ORDER).toEqual([
      "self",
      "language",
      "alt-art",
      "parallel",
      "super-parallel",
      "promo",
      "unknown",
    ]);
  });
});

describe("compareVariantKinds", () => {
  it("self comes before language", () => {
    expect(compareVariantKinds("self", "language")).toBeLessThan(0);
  });

  it("language comes before alt-art", () => {
    expect(compareVariantKinds("language", "alt-art")).toBeLessThan(0);
  });

  it("alt-art comes before parallel", () => {
    expect(compareVariantKinds("alt-art", "parallel")).toBeLessThan(0);
  });

  it("parallel comes before super-parallel", () => {
    expect(compareVariantKinds("parallel", "super-parallel")).toBeLessThan(0);
  });

  it("super-parallel comes before promo", () => {
    expect(compareVariantKinds("super-parallel", "promo")).toBeLessThan(0);
  });

  it("promo comes before unknown", () => {
    expect(compareVariantKinds("promo", "unknown")).toBeLessThan(0);
  });

  it("same kind returns 0", () => {
    expect(compareVariantKinds("alt-art", "alt-art")).toBe(0);
  });

  it("is symmetric (reversed comparison flips sign)", () => {
    expect(compareVariantKinds("language", "self")).toBeGreaterThan(0);
  });

  it("sorts an array of kinds into the canonical order", () => {
    const shuffled: ReturnType<typeof classifySibling>["variant_kind"][] = [
      "promo",
      "self",
      "alt-art",
      "language",
      "unknown",
      "super-parallel",
      "parallel",
    ];
    const sorted = [...shuffled].sort(compareVariantKinds);
    expect(sorted).toEqual(VARIANT_KIND_ORDER);
  });
});
