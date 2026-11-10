/**
 * A small strict JSON parser for signed agent acts and pasted public keys
 * (docs/plans/agent-auth/held-keys.md, "The statement").
 *
 * JSON.parse keeps the last of two members with the same name, so a signed
 * header or payload could say one thing to this store and another to a
 * verifier that keeps the first. This parser refuses duplicate names
 * instead, compared after unescaping ("a" and "a" are the same name).
 *
 * It accepts RFC 8259 JSON text and nothing more: no comments, no trailing
 * commas, no leading zeros, no lone surrogate escapes (RFC 7493 I-JSON), no
 * control characters inside strings, and only space, tab, CR and LF as
 * whitespace. Nesting is capped, so a deep input cannot exhaust the stack.
 * Objects come back with a null prototype, so a member named "__proto__"
 * is an ordinary member. It never throws: a refusal says only where.
 *
 * With integerLiteralsOnly, a number must be spelled as an integer,
 * -?(0|[1-9][0-9]*): no fraction and no exponent, even where the value is
 * whole (1.0, 1e0), so the text means the same integer to every reader,
 * including one that reads exact decimals.
 */

export type StrictJsonValue =
  | null
  | boolean
  | number
  | string
  | StrictJsonValue[]
  | { [name: string]: StrictJsonValue };

export type StrictJsonResult =
  | { ok: true; value: StrictJsonValue }
  /** notIntegerLiteral: refused only because integerLiteralsOnly was asked
   *  and a number had a fraction or an exponent. */
  | { ok: false; error: string; notIntegerLiteral?: true };

export interface StrictJsonOptions {
  /** Refuse a number whose text has a fraction or an exponent. */
  integerLiteralsOnly?: boolean;
}

export const STRICT_JSON_MAX_DEPTH = 32;

class Refusal {
  constructor(
    readonly error: string,
    readonly notIntegerLiteral = false,
  ) {}
}

const NUMBER_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const INTEGER_LITERAL_RE = /^-?(?:0|[1-9][0-9]*)$/;

export function parseStrictJson(text: string, options: StrictJsonOptions = {}): StrictJsonResult {
  if (typeof text !== "string") return { ok: false, error: "not text" };
  let at = 0;

  const fail = (what: string): never => {
    throw new Refusal(`${what} at ${at}`);
  };

  const skipWhitespace = () => {
    while (at < text.length) {
      const c = text.charCodeAt(at);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) at += 1;
      else break;
    }
  };

  const hex4 = (): number => {
    const digits = text.slice(at, at + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail("bad \\u escape");
    at += 4;
    return parseInt(digits, 16);
  };

  const parseString = (): string => {
    // at is on the opening quote.
    at += 1;
    let out = "";
    for (;;) {
      if (at >= text.length) fail("unterminated string");
      const c = text.charCodeAt(at);
      if (c === 0x22) {
        at += 1;
        return out;
      }
      if (c < 0x20) fail("control character in string");
      if (c !== 0x5c) {
        // A raw surrogate can only arrive paired: the text was decoded from
        // UTF-8 (fatal), which cannot produce a lone one. Checked anyway.
        if (c >= 0xd800 && c <= 0xdbff) {
          const next = text.charCodeAt(at + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) fail("lone surrogate");
          out += text[at] + text[at + 1];
          at += 2;
          continue;
        }
        if (c >= 0xdc00 && c <= 0xdfff) fail("lone surrogate");
        out += text[at];
        at += 1;
        continue;
      }
      at += 1;
      const e = text[at];
      at += 1;
      switch (e) {
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case "n": out += "\n"; break;
        case "r": out += "\r"; break;
        case "t": out += "\t"; break;
        case "u": {
          const unit = hex4();
          if (unit >= 0xd800 && unit <= 0xdbff) {
            if (text[at] !== "\\" || text[at + 1] !== "u") fail("lone surrogate escape");
            at += 2;
            const low = hex4();
            if (low < 0xdc00 || low > 0xdfff) fail("lone surrogate escape");
            out += String.fromCharCode(unit, low);
          } else if (unit >= 0xdc00 && unit <= 0xdfff) {
            fail("lone surrogate escape");
          } else {
            out += String.fromCharCode(unit);
          }
          break;
        }
        default:
          fail("bad escape");
      }
    }
  };

  const parseNumber = (): number => {
    NUMBER_RE.lastIndex = at;
    const match = NUMBER_RE.exec(text);
    if (!match) fail("bad number");
    if (options.integerLiteralsOnly && !INTEGER_LITERAL_RE.test(match![0])) {
      throw new Refusal(`number is not an integer literal at ${at}`, true);
    }
    at += match![0].length;
    const value = Number(match![0]);
    if (!Number.isFinite(value)) fail("number out of range");
    return value;
  };

  const literal = (word: string, value: StrictJsonValue): StrictJsonValue => {
    if (text.startsWith(word, at)) {
      at += word.length;
      return value;
    }
    return fail("bad literal");
  };

  const parseValue = (depth: number): StrictJsonValue => {
    skipWhitespace();
    if (at >= text.length) fail("unexpected end");
    const c = text[at];
    if (c === "{") return parseObject(depth + 1);
    if (c === "[") return parseArray(depth + 1);
    if (c === '"') return parseString();
    if (c === "t") return literal("true", true);
    if (c === "f") return literal("false", false);
    if (c === "n") return literal("null", null);
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    return fail("unexpected character");
  };

  const parseObject = (depth: number): StrictJsonValue => {
    if (depth > STRICT_JSON_MAX_DEPTH) fail("nested too deep");
    at += 1;
    const out = Object.create(null) as { [name: string]: StrictJsonValue };
    skipWhitespace();
    if (text[at] === "}") {
      at += 1;
      return out;
    }
    for (;;) {
      skipWhitespace();
      if (text[at] !== '"') fail("expected a member name");
      const name = parseString();
      if (Object.prototype.hasOwnProperty.call(out, name)) fail("duplicate member name");
      skipWhitespace();
      if (text[at] !== ":") fail("expected ':'");
      at += 1;
      out[name] = parseValue(depth);
      skipWhitespace();
      if (text[at] === ",") {
        at += 1;
        continue;
      }
      if (text[at] === "}") {
        at += 1;
        return out;
      }
      fail("expected ',' or '}'");
    }
  };

  const parseArray = (depth: number): StrictJsonValue => {
    if (depth > STRICT_JSON_MAX_DEPTH) fail("nested too deep");
    at += 1;
    const out: StrictJsonValue[] = [];
    skipWhitespace();
    if (text[at] === "]") {
      at += 1;
      return out;
    }
    for (;;) {
      out.push(parseValue(depth));
      skipWhitespace();
      if (text[at] === ",") {
        at += 1;
        continue;
      }
      if (text[at] === "]") {
        at += 1;
        return out;
      }
      fail("expected ',' or ']'");
    }
  };

  try {
    const value = parseValue(0);
    skipWhitespace();
    if (at !== text.length) fail("trailing content");
    return { ok: true, value };
  } catch (err) {
    if (err instanceof Refusal) {
      return err.notIntegerLiteral ? { ok: false, error: err.error, notIntegerLiteral: true } : { ok: false, error: err.error };
    }
    throw err;
  }
}

/** A JSON object (not an array or null), as the parser returns it. */
export function isJsonObject(value: unknown): value is { [name: string]: StrictJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the object's own member names are exactly `names`, in any order. */
export function hasExactMembers(value: { [name: string]: unknown }, names: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === names.length && names.every((name) => Object.prototype.hasOwnProperty.call(value, name));
}
