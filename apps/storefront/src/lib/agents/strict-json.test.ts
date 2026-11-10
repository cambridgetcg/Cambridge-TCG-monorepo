import { describe, expect, it } from "vitest";
import { hasExactMembers, isJsonObject, parseStrictJson, STRICT_JSON_MAX_DEPTH } from "./strict-json";

const ok = (text: string) => {
  const parsed = parseStrictJson(text);
  if (!parsed.ok) throw new Error(`refused ${text}: ${parsed.error}`);
  return parsed.value;
};
const refused = (text: string) => parseStrictJson(text).ok === false;

describe("parseStrictJson", () => {
  it("reads what JSON.parse reads, for ordinary JSON", () => {
    for (const text of [
      '{"a":1,"b":[true,false,null],"c":{"d":"e"}}',
      ' { "x" : -0.5e+3 , "y" : "\\u00e9\\n\\"\\\\\\/" } ',
      "[]",
      "{}",
      '"\\ud83d\\ude00"',
      "0",
      '{"emoji":"😀"}',
    ]) {
      expect(ok(text), text).toEqual(JSON.parse(text));
    }
  });

  it("refuses duplicate member names, escaped or not, at any depth", () => {
    expect(refused('{"a":1,"a":2}')).toBe(true);
    expect(refused('{"alg":"Ed25519","\\u0061lg":"none"}')).toBe(true);
    expect(refused('{"x":{"k":1,"k":1}}')).toBe(true);
    expect(refused('[{"k":1,"k":1}]')).toBe(true);
    // The same name in sibling objects is fine.
    expect(ok('[{"k":1},{"k":2}]')).toEqual([{ k: 1 }, { k: 2 }]);
    // JSON.parse would have kept the last.
    expect(JSON.parse('{"a":1,"a":2}')).toEqual({ a: 2 });
  });

  it("refuses everything outside RFC 8259", () => {
    for (const text of [
      "",
      " ",
      "{",
      '{"a":1,}',
      "[1,]",
      "01",
      "1.",
      ".5",
      "+1",
      "NaN",
      "Infinity",
      "1e400",
      "'a'",
      '{a:1}',
      '{"a":1}//',
      '{"a":1} {"b":2}',
      '"\t"',
      '"\\x41"',
      '"\\ud800"',
      '"\\udc00"',
      '"\\ud800\\u0041"',
      "﻿{}",
      " {}",
      "tru",
      "nulll",
    ]) {
      expect(refused(text), JSON.stringify(text)).toBe(true);
    }
  });

  it("gives objects a null prototype, so __proto__ is an ordinary member", () => {
    const value = ok('{"__proto__":{"polluted":true},"a":1}') as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBeNull();
    expect(Object.keys(value)).toEqual(["__proto__", "a"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(refused('{"__proto__":1,"__proto__":2}')).toBe(true);
  });

  it("caps nesting instead of exhausting the stack", () => {
    const deep = (n: number) => "[".repeat(n) + "]".repeat(n);
    expect(parseStrictJson(deep(STRICT_JSON_MAX_DEPTH)).ok).toBe(true);
    expect(parseStrictJson(deep(STRICT_JSON_MAX_DEPTH + 1)).ok).toBe(false);
    expect(parseStrictJson(deep(100_000)).ok).toBe(false);
  });

  it("with integerLiteralsOnly, takes a number only as an integer literal", () => {
    const strict = (text: string) => parseStrictJson(text, { integerLiteralsOnly: true });
    for (const text of ["0", "-0", "7", "-12", "1794324086", '{"a":[1,2,{"b":3}]}']) {
      expect(strict(text), text).toEqual({ ok: true, value: JSON.parse(text) });
    }
    for (const text of ["1.0", "1e0", "1E0", "10e-1", "1.5", "1e+2", '{"a":1.0}', "[1,2.0]", "-0.0"]) {
      expect(strict(text), text).toMatchObject({ ok: false, notIntegerLiteral: true });
    }
    // Without it, the same texts parse; other refusals are not marked.
    expect(parseStrictJson("1.0")).toEqual({ ok: true, value: 1 });
    expect(strict('{"a":1,"a":2}')).toEqual({ ok: false, error: expect.any(String) });
  });

  it("says where, never what", () => {
    const parsed = parseStrictJson('{"secret-looking":1,"secret-looking":2}');
    expect(parsed).toMatchObject({ ok: false });
    if (!parsed.ok) expect(parsed.error).not.toContain("secret");
  });
});

describe("member helpers", () => {
  it("checks exact member sets in any order", () => {
    const value = ok('{"b":1,"a":2}') as Record<string, unknown>;
    expect(isJsonObject(value)).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(hasExactMembers(value, ["a", "b"])).toBe(true);
    expect(hasExactMembers(value, ["a"])).toBe(false);
    expect(hasExactMembers(value, ["a", "b", "c"])).toBe(false);
    expect(hasExactMembers(ok("{}") as Record<string, unknown>, [])).toBe(true);
  });
});
