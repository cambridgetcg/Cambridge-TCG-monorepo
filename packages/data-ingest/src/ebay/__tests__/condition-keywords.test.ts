import { describe, expect, it } from "vitest";
import { detectConditionKeywords } from "../condition-keywords.js";

describe("condition-keywords", () => {
  it("flags damaged / creased / bent as exclusions", () => {
    const result = detectConditionKeywords("Card Damaged with creases");
    expect(result.exclude).toBe(true);
    expect(result.excluded_keywords).toContain("damaged");
    expect(result.excluded_keywords).toContain("creased");
  });

  it("flags proxy / counterfeit / custom card as exclusions", () => {
    const r1 = detectConditionKeywords("Charizard PROXY card");
    expect(r1.exclude).toBe(true);
    expect(r1.excluded_keywords).toContain("proxy");

    const r2 = detectConditionKeywords("Pikachu replica fan-made");
    expect(r2.exclude).toBe(true);
    expect(r2.excluded_keywords).toContain("counterfeit");

    const r3 = detectConditionKeywords("Magic the gathering custom card art");
    expect(r3.exclude).toBe(true);
    expect(r3.excluded_keywords).toContain("custom-card");
  });

  it("flags lot / bulk as exclusions", () => {
    const r = detectConditionKeywords("Lot of 50 random cards bulk");
    expect(r.exclude).toBe(true);
    expect(r.excluded_keywords).toContain("lot");
    expect(r.excluded_keywords).toContain("bulk");
  });

  it("does NOT flag 'mp' that's part of a set code", () => {
    // MP23-032 is a Yu-Gi-Oh set code; we must not treat 'MP' here as
    // "moderately played".
    const r = detectConditionKeywords("Yu-Gi-Oh MP23-032 Dark Magician English");
    expect(r.exclude).toBe(false);
  });

  it("does NOT flag 'hp' that's part of an HP stat", () => {
    const r = detectConditionKeywords("Pokemon Pikachu 60 HP English");
    expect(r.exclude).toBe(false);
  });

  it("recognises near-mint / lightly-played / mint", () => {
    expect(detectConditionKeywords("Charizard Near Mint English").condition).toBe("near-mint");
    expect(detectConditionKeywords("Charizard NM English").condition).toBe("near-mint");
    expect(detectConditionKeywords("Card LP english").condition).toBe("lightly-played");
    expect(detectConditionKeywords("Card Lightly Played").condition).toBe("lightly-played");
    expect(detectConditionKeywords("Mint condition Pikachu").condition).toBe("mint");
  });

  it("prefers near-mint over bare mint", () => {
    const r = detectConditionKeywords("Charizard Near Mint Holo Mint");
    expect(r.condition).toBe("near-mint");
  });

  it("returns no opinion when nothing matches", () => {
    const r = detectConditionKeywords("Pokemon Charizard");
    expect(r.exclude).toBe(false);
    expect(r.condition).toBeNull();
    expect(r.excluded_keywords).toEqual([]);
    expect(r.neutral_keywords).toEqual([]);
  });

  it("handles empty / null-shaped input safely", () => {
    expect(detectConditionKeywords("").exclude).toBe(false);
    // @ts-expect-error — proving runtime safety on bad input
    expect(detectConditionKeywords(undefined).exclude).toBe(false);
  });
});
