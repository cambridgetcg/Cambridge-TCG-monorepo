import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_CODES, GAMES, normalizeSku, parseSku } from "@cambridge-tcg/sku";
import {
  buildIdentifier,
  IDENTIFIER_MAX_LENGTH,
  identifierGameStatus,
  PUBLIC_IDENTIFIER_GAME_CODES,
  validateIdentifier,
} from "./identifier-validation";

vi.mock("pg", () => { throw new Error("Validator must not import a database driver"); });
vi.mock("@/lib/db", () => { throw new Error("Validator must not import a database"); });

afterEach(() => vi.unstubAllGlobals());

describe("identifier syntax adapter", () => {
  it("requires parsing AND unchanged normalization for strict canonical status", () => {
    expect(validateIdentifier("op-op01-001-ja")).toMatchObject({
      identifier: "op-op01-001-ja", status: "strict_canonical", strict_parse_valid: true,
      normalized_identifier: "op-op01-001-ja", scope: "syntax_only",
      game: { code: "op", status: "known" }, language: { code: "ja", listed_for_game: true },
    });
    expect(validateIdentifier("op-op01-001-jp")).toMatchObject({
      status: "normalization_suggested", strict_parse_valid: true,
      normalized_identifier: "op-op01-001-ja", parts: { lang: "ja" },
    });
  });

  it.each([
    ["OP-OP01-001-JP", "op-op01-001-ja"],
    ["PK-SVOBF-006-CN", "pkm-svobf-006-zh"],
    ["pkm-svobf-006-kr", "pkm-svobf-006-ko"],
    ["op-op01-001-jpn", "op-op01-001-ja"],
    ["op-op01-001-eng", "op-op01-001-en"],
    ["pkm-svobf-en-006", "pkm-svobf-006-en"],
    ["EB-EB01-001-JP", "op-eb01-001-ja"],
    ["ST-ST01-001-JP", "op-st01-001-ja"],
    ["FB-FB01-001-JP", "dbf-fb01-001-ja"],
    ["op-op01-001-cn", "op-op01-001-zh"],
  ])("delegates normalization of %s without overwriting", (identifier, normalized) => {
    expect(validateIdentifier(identifier)).toMatchObject({
      identifier, status: "normalization_suggested", normalized_identifier: normalized,
      parts: parseSku(normalized),
    });
  });

  it("does not guess a swap when two fields already fit the strict grammar", () => {
    const result = validateIdentifier("pkm-base-en-ja");
    expect(result).toMatchObject({ status: "strict_canonical", parts: { number: "en", lang: "ja" } });
    expect(result.normalized_identifier).toBe(normalizeSku(result.identifier));
  });

  it.each(["P-001-JP", "ST-001-JP", "op-op01-ja", "unknown-set-001-en", "constructor-set-001-en", "__proto__-set-001-en", "op-op01-001-zh-hant_foo", "", " op-op01-001-ja", "op-op01-001-ja ", "op-op01-001-ja\n"])("does not invent identity or trim %j", (identifier) => {
    expect(validateIdentifier(identifier)).toMatchObject({
      identifier, status: "invalid", strict_parse_valid: false,
      normalized_identifier: null, parts: null, game: null, language: null, variant_tokens: [],
    });
  });

  it("annotates unlisted language shape without rejecting it", () => {
    const result = validateIdentifier("op-op01-001-zz");
    expect(result).toMatchObject({ status: "strict_canonical", language: { code: "zz", listed_for_game: false } });
    expect(result.annotations.join(" ")).toContain("not an ISO registry");
  });

  it("does not sort variant tokens or assert printing existence", () => {
    const result = validateIdentifier("op-op01-001-ja-holo-alt-art");
    expect(result.variant_tokens).toEqual(["holo", "alt", "art"]);
    expect(result.status).toBe("strict_canonical");
    expect(result.annotations.join(" ")).toContain("do not prove that this printing exists");
  });

  it("keeps known, anticipated and internal distinct using the registry", () => {
    for (const code of GAME_CODES) {
      expect(validateIdentifier(`${code}-set-001-en`).game?.status).toBe(identifierGameStatus(code));
      expect(identifierGameStatus(code)).toBe(code === "tst" ? "internal" : GAMES[code].confirmed ? "known" : "anticipated");
    }
    expect(PUBLIC_IDENTIFIER_GAME_CODES).toEqual(GAME_CODES.filter((code) => code !== "tst"));
    expect(validateIdentifier("tst-set-001-en").annotations.join(" ")).toContain("internal test code");
  });

  it("bounds the adapter before reflecting oversized input", () => {
    expect(() => validateIdentifier("a".repeat(IDENTIFIER_MAX_LENGTH + 1))).toThrow(RangeError);
    expect(validateIdentifier("a".repeat(IDENTIFIER_MAX_LENGTH)).status).toBe("invalid");
  });

  it("validates and builds without fetching", () => {
    const fetch = vi.fn(() => { throw new Error("No upstream calls allowed"); });
    vi.stubGlobal("fetch", fetch);
    validateIdentifier("op-op01-001-ja");
    buildIdentifier({ game: "op", set: "op01", number: "001", lang: "ja" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("structured builder", () => {
  const valid = { game: "op", set: "OP01", number: "001", lang: "JA" };

  it("uses buildSku lowercase behavior and retains numbers", () => {
    expect(buildIdentifier({ ...valid, variant: "ALT-ART" })).toMatchObject({
      ok: true, identifier: "op-op01-001-ja-alt-art", validation: { status: "strict_canonical" },
    });
  });

  it("shows a further alias suggestion rather than changing buildSku output", () => {
    expect(buildIdentifier({ ...valid, lang: "JP" })).toMatchObject({
      ok: true, identifier: "op-op01-001-jp",
      validation: { status: "normalization_suggested", normalized_identifier: "op-op01-001-ja" },
    });
  });

  it.each([
    ["game", "unknown"], ["set", ""], ["number", "a/b"], ["lang", "jpn"], ["variant", "alt--art"],
  ] as const)("surfaces the package's %s field error", (field, value) => {
    expect(buildIdentifier({ ...valid, [field]: value })).toMatchObject({ ok: false, field });
  });

  it("does not trim fields, claim ISO validation, or silently omit an explicit empty variant", () => {
    expect(buildIdentifier({ ...valid, set: " op01" })).toMatchObject({ ok: false, field: "set" });
    expect(buildIdentifier({ ...valid, lang: "xxx" })).toMatchObject({ ok: false, field: "lang", message: "Language must be two letters; ISO membership is not checked." });
    expect(buildIdentifier({ ...valid, lang: "ZZ" })).toMatchObject({ ok: true, validation: { status: "strict_canonical", language: { listed_for_game: false } } });
    expect(buildIdentifier({ ...valid, variant: "" })).toMatchObject({ ok: false, field: "variant" });
    expect(buildIdentifier({ ...valid, number: "1".repeat(256) })).toMatchObject({ ok: false, field: "identifier" });
  });
});
