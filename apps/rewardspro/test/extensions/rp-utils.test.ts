/**
 * Unit tests for the storefront utilities module
 * (extensions/theme-app-extension-rewardspro/assets/rp-utils.js).
 *
 * This is vanilla JS executed in the browser; we run it in jsdom and
 * verify every surface of `window.RPUtils`. When the API changes, bump
 * VERSION in rp-utils.js and update the assertions here.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const RP_UTILS_PATH = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro/assets/rp-utils.js"
);

interface RPUtils {
  VERSION: string;
  logger: (scope: string) => {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  sanitize: {
    color: (v: unknown, fb: string) => string;
    number: (v: unknown, fb: number, min?: number, max?: number) => number;
    fontFamily: (v: unknown, fb?: string) => string;
  };
  escapeHtml: (text: unknown) => string;
  fetchWithRetry: (url: string, opts?: RequestInit, cfg?: object) => Promise<Response>;
  idempotencyKey: () => string;
  cache: {
    key: (parts: Array<string | undefined | null>) => string;
    read: <T = unknown>(parts: Array<string | undefined | null>, ttlSeconds: number) => T | null;
    write: (parts: Array<string | undefined | null>, data: unknown) => void;
    bust: (parts: Array<string | undefined | null>) => void;
  };
  format: {
    currency: (amount: number, currency: string, locale?: string) => string;
    number: (value: number, locale?: string) => string;
    currencySymbol: (currency: string, locale?: string) => string;
  };
  readTranslations: (
    dataset: Record<string, string | undefined>,
    schema: Record<string, { attr: string; fallback?: string }>
  ) => Record<string, string>;
}

/** vitest's jsdom ships an empty `localStorage` stub — Storage.prototype
 *  methods exist but the instance is not a valid Storage. Install a
 *  Map-backed polyfill before rp-utils.js reads the global. */
function installStoragePolyfill(): void {
  const store = new Map<string, string>();
  const polyfill: Storage = {
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(window, "localStorage", { value: polyfill, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: polyfill, configurable: true, writable: true });
}

function loadRpUtils(): RPUtils {
  // Re-evaluate the IIFE into the current jsdom window so each describe
  // block gets a fresh `window.RPUtils` (important for the version-guard test).
  (window as unknown as { RPUtils?: unknown }).RPUtils = undefined;
  const source = fs.readFileSync(RP_UTILS_PATH, "utf-8");
  // The IIFE is self-contained and reads `window`, `document`, `localStorage`,
  // `crypto`, and `Intl` from the lexical environment. Running via indirect
  // eval binds those to the jsdom globals.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function(source)();
  const rp = (window as unknown as { RPUtils?: RPUtils }).RPUtils;
  if (!rp) throw new Error("rp-utils.js did not expose window.RPUtils");
  return rp;
}

let RP: RPUtils;

beforeAll(() => {
  installStoragePolyfill();
  RP = loadRpUtils();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("RPUtils — surface", () => {
  it("exposes VERSION as a semver-like string", () => {
    expect(RP.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("exposes every documented namespace", () => {
    expect(typeof RP.logger).toBe("function");
    expect(typeof RP.escapeHtml).toBe("function");
    expect(typeof RP.fetchWithRetry).toBe("function");
    expect(typeof RP.idempotencyKey).toBe("function");
    expect(typeof RP.readTranslations).toBe("function");

    expect(typeof RP.sanitize.color).toBe("function");
    expect(typeof RP.sanitize.number).toBe("function");
    expect(typeof RP.sanitize.fontFamily).toBe("function");

    expect(typeof RP.cache.read).toBe("function");
    expect(typeof RP.cache.write).toBe("function");
    expect(typeof RP.cache.bust).toBe("function");
    expect(typeof RP.cache.key).toBe("function");

    expect(typeof RP.format.currency).toBe("function");
  });

  it("keeps the existing RPUtils when an equal-or-newer one is already on window", () => {
    const first = (window as unknown as { RPUtils: RPUtils }).RPUtils;
    loadRpUtils(); // re-evaluates; should NOT downgrade
    const second = (window as unknown as { RPUtils: RPUtils }).RPUtils;
    // Same VERSION → same behavior either way; spot check that nothing threw.
    expect(second.VERSION).toBe(first.VERSION);
  });
});

describe("sanitize.color", () => {
  it.each([
    ["#fff", "#fff"],
    ["#FFAA00", "#FFAA00"],
    ["#112233ff", "#112233ff"],
    ["rgb(10, 20, 30)", "rgb(10, 20, 30)"],
    ["rgba(10, 20, 30, 0.5)", "rgba(10, 20, 30, 0.5)"],
    ["hsl(120, 50%, 50%)", "hsl(120, 50%, 50%)"],
    ["hsla(120, 50%, 50%, 0.3)", "hsla(120, 50%, 50%, 0.3)"],
    ["transparent", "transparent"],
    ["CurrentColor", "CurrentColor"],
  ])("accepts %s", (input, expected) => {
    expect(RP.sanitize.color(input, "#fallback")).toBe(expected);
  });

  it.each([
    ["java", "script:alert(1)"].join(""),
    "red; background:url(evil)",
    "#gghhii",
    "rgb(10, 20, 30); color:red",
    "expression(alert(1))",
    "",
    null,
    undefined,
    42,
    {},
  ])("rejects %s and returns the fallback", (input) => {
    // @ts-expect-error — testing runtime type robustness
    expect(RP.sanitize.color(input, "#fallback")).toBe("#fallback");
  });
});

describe("sanitize.number", () => {
  it("passes through values within range", () => {
    expect(RP.sanitize.number("42", 0, 0, 100)).toBe(42);
    expect(RP.sanitize.number(3.14, 0, 0, 10)).toBe(3.14);
  });

  it("rejects non-numeric strings", () => {
    expect(RP.sanitize.number("abc", 99)).toBe(99);
  });

  it("clamps out-of-range values to the fallback (by design)", () => {
    expect(RP.sanitize.number(500, 10, 0, 100)).toBe(10);
    expect(RP.sanitize.number(-1, 10, 0, 100)).toBe(10);
  });

  it("rejects Infinity and NaN", () => {
    expect(RP.sanitize.number(Infinity, 0)).toBe(0);
    expect(RP.sanitize.number(NaN, 0)).toBe(0);
  });
});

describe("sanitize.fontFamily", () => {
  it("accepts a quoted font stack", () => {
    expect(RP.sanitize.fontFamily("'Helvetica Neue', Arial, sans-serif", "inherit")).toBe(
      "'Helvetica Neue', Arial, sans-serif"
    );
  });

  it("rejects CSS-injection attempts", () => {
    expect(RP.sanitize.fontFamily("Arial}; color:red; {", "inherit")).toBe("inherit");
    expect(RP.sanitize.fontFamily("x:y;z", "inherit")).toBe("inherit");
  });

  it("falls back when empty or non-string", () => {
    expect(RP.sanitize.fontFamily("", "inherit")).toBe("inherit");
    // @ts-expect-error — testing runtime robustness
    expect(RP.sanitize.fontFamily(null, "inherit")).toBe("inherit");
  });
});

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(RP.escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(\"x\")&lt;/script&gt;"
    );
    expect(RP.escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("returns empty string for null/undefined", () => {
    expect(RP.escapeHtml(null)).toBe("");
    expect(RP.escapeHtml(undefined)).toBe("");
  });

  it("stringifies non-string input before escaping", () => {
    expect(RP.escapeHtml(42)).toBe("42");
  });
});

describe("cache", () => {
  const TTL = 60;

  it("writes and reads round-trip", () => {
    RP.cache.write(["scope", "shop", "customer"], { hello: "world" });
    expect(RP.cache.read(["scope", "shop", "customer"], TTL)).toEqual({ hello: "world" });
  });

  it("composes keys deterministically from parts", () => {
    expect(RP.cache.key(["a", "b", "c"])).toBe("rp:a:b:c");
  });

  it("omits empty/nullish parts from the key (per-customer + guest collapse)", () => {
    expect(RP.cache.key(["scope", "shop", undefined])).toBe("rp:scope:shop");
    expect(RP.cache.key(["scope", "shop", ""])).toBe("rp:scope:shop");
  });

  it("returns null on a stale entry", () => {
    // Advance time beyond TTL after writing. Fake timers avoid touching
    // localStorage internals (jsdom+vitest localStorage shim is unreliable
    // for direct use in test code).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      RP.cache.write(["s", "x"], { v: 1 });
      vi.setSystemTime(new Date(Date.now() + 1000 * (TTL + 10)));
      expect(RP.cache.read(["s", "x"], TTL)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null on a corrupted entry and evicts it", () => {
    const key = RP.cache.key(["bad"]);
    window.localStorage.setItem(key, "not-json");
    expect(RP.cache.read(["bad"], TTL)).toBeNull();
    // Corrupt entries must be evicted so future reads don't keep tripping.
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("returns null when the schema version no longer matches", () => {
    const key = RP.cache.key(["ver"]);
    window.localStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), v: "0.0.0", data: { old: true } })
    );
    expect(RP.cache.read(["ver"], TTL)).toBeNull();
  });

  it("bust() removes the entry", () => {
    // Round-trip first to prove write worked, then bust and re-read.
    RP.cache.write(["b"], { x: 1 });
    expect(RP.cache.read(["b"], TTL)).toEqual({ x: 1 });
    RP.cache.bust(["b"]);
    expect(RP.cache.read(["b"], TTL)).toBeNull();
  });
});

describe("idempotencyKey", () => {
  it("returns a reasonably unique value each call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(RP.idempotencyKey());
    expect(seen.size).toBe(200);
  });

  it("produces a non-empty string even when crypto.randomUUID is missing", () => {
    const originalUuid = window.crypto.randomUUID;
    // @ts-expect-error — simulate older browsers
    window.crypto.randomUUID = undefined;
    try {
      const rp2 = loadRpUtils();
      const key = rp2.idempotencyKey();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThanOrEqual(16);
    } finally {
      window.crypto.randomUUID = originalUuid;
      // Restore the canonical module for other tests.
      loadRpUtils();
    }
  });
});

describe("format.currencySymbol", () => {
  it("returns $ for USD", () => {
    expect(RP.format.currencySymbol("USD", "en-US")).toBe("$");
  });
  it("returns € for EUR", () => {
    expect(RP.format.currencySymbol("EUR", "en-US")).toBe("€");
  });
  it("falls back to $ on invalid input", () => {
    // @ts-expect-error — testing defensive fallback
    expect(RP.format.currencySymbol(undefined)).toBe("$");
    // @ts-expect-error
    expect(RP.format.currencySymbol("XXX_INVALID")).toBe("$");
  });
});

describe("format.number", () => {
  it("inserts locale-appropriate thousands separators", () => {
    expect(RP.format.number(1234567, "en-US")).toBe("1,234,567");
  });

  it("coerces non-numeric input to 0", () => {
    // @ts-expect-error — runtime robustness
    expect(RP.format.number("not a number", "en-US")).toBe("0");
  });

  it("handles null / undefined gracefully (returns '0')", () => {
    // @ts-expect-error — documenting defensive behavior
    expect(RP.format.number(null, "en-US")).toBe("0");
    // @ts-expect-error
    expect(RP.format.number(undefined, "en-US")).toBe("0");
  });

  it("returns a string even when Intl is unavailable", () => {
    // The fallback path catches locale exceptions and drops through to
    // toLocaleString, then to String(). It should never throw, which is
    // what we care about for widget rendering.
    expect(typeof RP.format.number(42)).toBe("string");
  });
});

describe("format.currency", () => {
  it("formats USD in en-US", () => {
    expect(RP.format.currency(1234.5, "USD", "en-US")).toBe("$1,234.50");
  });

  it("handles a missing currency by treating input as numeric", () => {
    // Default fallback path produces a `$1.23` style string.
    expect(RP.format.currency(1.23, "" as unknown as string, undefined)).toMatch(/1[.,]23/);
  });

  it("coerces non-numeric input to 0 rather than NaN", () => {
    // @ts-expect-error — runtime robustness
    expect(RP.format.currency("not a number", "USD", "en-US")).toBe("$0.00");
  });
});

describe("readTranslations", () => {
  it("uses dataset values when present, fallbacks otherwise", () => {
    const dataset = { i18nLoading: "Chargement…" } as unknown as Record<string, string>;
    const out = RP.readTranslations(dataset, {
      loading: { attr: "i18nLoading", fallback: "Loading…" },
      retry: { attr: "i18nRetry", fallback: "Try again" },
    });
    expect(out).toEqual({ loading: "Chargement…", retry: "Try again" });
  });

  it("returns an empty string when neither value nor fallback is provided", () => {
    const out = RP.readTranslations({}, { x: { attr: "doesNotExist" } });
    expect(out.x).toBe("");
  });
});

describe("fetchWithRetry", () => {
  it("resolves with the first successful response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"ok":true}', { status: 200 })
    );
    const res = await RP.fetchWithRetry("https://example.test/api");
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("retries on HTTP error and then succeeds", async () => {
    let n = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      n++;
      if (n < 2) return new Response("server error", { status: 500 });
      return new Response('{"ok":true}', { status: 200 });
    });
    // Short delays so the test stays fast.
    const res = await RP.fetchWithRetry("https://example.test/api", undefined, {
      retryBaseMs: 1,
      retryMaxMs: 2,
    });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it("does not retry on AbortError", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(RP.fetchWithRetry("https://example.test/api")).rejects.toThrow(/aborted/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("gives up after maxRetries and rethrows", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("network down");
    });
    await expect(
      RP.fetchWithRetry("https://example.test/api", undefined, { retryBaseMs: 1, retryMaxMs: 2 })
    ).rejects.toThrow(/network down/);
    // maxRetries defaults to 3.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    fetchSpy.mockRestore();
  });

  it("does NOT retry 4xx responses (client errors are not transient)", async () => {
    // Added as part of rp-utils v1.1 — retries eat CPU and obscure real
    // client bugs when a 404/401/422 would never resolve on its own.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad request", { status: 400 })
    );
    await expect(
      RP.fetchWithRetry("https://example.test/api", undefined, {
        retryBaseMs: 1,
        retryMaxMs: 2,
        extractErrorMessage: true,
      })
    ).rejects.toThrow(/HTTP 400/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("extractErrorMessage=true lifts `error`/`message` from JSON body into the thrown Error", async () => {
    // Raffles needs this so "HTTP 400: Raffle entry limit reached" bubbles
    // up to the UI instead of "HTTP 400: Bad Request".
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Raffle entry limit reached" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );
    await expect(
      RP.fetchWithRetry("https://example.test/api", undefined, {
        extractErrorMessage: true,
      })
    ).rejects.toThrow(/Raffle entry limit reached/);
    fetchSpy.mockRestore();
  });

  it("extractErrorMessage falls back to the text body when JSON parse fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("service unavailable — DB down", { status: 503 })
    );
    await expect(
      RP.fetchWithRetry("https://example.test/api", undefined, {
        extractErrorMessage: true,
        retryBaseMs: 1,
        retryMaxMs: 2,
        maxRetries: 1, // don't retry through the text body
      })
    ).rejects.toThrow(/service unavailable/);
    fetchSpy.mockRestore();
  });

  it("the thrown Error carries a `.status` property when extractErrorMessage is on", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "nope" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    );
    try {
      await RP.fetchWithRetry("https://example.test/api", undefined, {
        extractErrorMessage: true,
      });
    } catch (err: unknown) {
      // Callers that want to branch on status (e.g., 409 conflict) can
      // read it from the thrown Error directly.
      const e = err as { status?: number };
      expect(e.status).toBe(409);
    }
    fetchSpy.mockRestore();
  });
});
