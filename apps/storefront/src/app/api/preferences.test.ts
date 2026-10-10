import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as appearance } from "./appearance/route";
import { GET as textMode } from "./text-mode/route";
import { GET as language } from "./lang-mode/route";
import { GET as currency } from "./currency/route";

const access = vi.hoisted(() => ({
  auth: vi.fn(() => { throw new Error("Free preferences must not read authentication"); }),
  profile: vi.fn(() => { throw new Error("Free preferences must not read membership data"); }),
}));
vi.mock("@/lib/auth", () => ({ auth: access.auth }));
vi.mock("@/lib/membership/db", () => ({ getMemberProfile: access.profile }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Preference routes must not call the network"); }));
});
afterEach(() => {
  expect(access.auth).not.toHaveBeenCalled();
  expect(access.profile).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

const routes = [
  { path: "appearance", get: appearance, query: "theme=gallery", cookie: "theme", value: "gallery", fallback: "/" },
  { path: "text-mode", get: textMode, query: "on=1", cookie: "text-mode", value: "1", fallback: "/" },
  { path: "lang-mode", get: language, query: "mode=ja", cookie: "lang-mode", value: "ja", fallback: "/" },
  { path: "currency", get: currency, query: "code=USD", cookie: "display-currency", value: "USD", fallback: "/prices" },
] as const;

function request(path: string, query: string, back?: string) {
  // Reproduce a server-reconstructed origin that differs from the browser's.
  const url = new URL(`/api/${path}?${query}`, "http://localhost:3001");
  if (back !== undefined) url.searchParams.set("back", back);
  return new Request(url, { headers: { host: "127.0.0.1:3001" } });
}

describe.each(routes)("$path preference redirect", (route) => {
  it("returns to the browser origin with path, query and fragment intact", async () => {
    const back = "/prices/search?q=Mr%20Mime&game=pokemon#results";
    const response = await route.get(request(route.path, route.query, back));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(back);
    expect(new URL(response.headers.get("location")!, "http://127.0.0.1:3001").origin).toBe("http://127.0.0.1:3001");
    expect(response.cookies.get(route.cookie)).toMatchObject({
      value: route.value, path: "/", sameSite: "lax", httpOnly: false, maxAge: 31536000,
    });
    expect(response.headers.get("set-cookie")).not.toMatch(/Domain=|HttpOnly/i);
  });

  it("uses its existing default when back is absent", async () => {
    const response = await route.get(request(route.path, route.query));
    expect(response.headers.get("location")).toBe(route.fallback);
  });

  it.each([
    "https://evil.example/path", "//evil.example/path", "/\\evil.example/path",
    "/\t/evil.example/path", "/\n/evil.example/path", "/\r/evil.example/path",
    "/\u0000/path", "/safe/..//evil.example/path", "/%2e%2e//evil.example/path",
  ])("fails closed for an unsafe return target: %s", async (back) => {
    const response = await route.get(request(route.path, route.query, back));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(route.fallback);
    expect(response.cookies.get(route.cookie)?.value).toBe(route.value);
  });

  it("serializes a Unicode return path as a valid relative Location", async () => {
    const response = await route.get(request(route.path, route.query, "/カード?q=青#結果"));
    expect(response.headers.get("location")).toBe("/%E3%82%AB%E3%83%BC%E3%83%89?q=%E9%9D%92#%E7%B5%90%E6%9E%9C");
  });
});

describe("preference cookie operations", () => {
  it.each(["gallery", "midnight", "terminal", "high-contrast"])("still saves theme %s with a tone", async (theme) => {
    const response = await appearance(request("appearance", `theme=${theme}&tone=plain`));
    expect(response.cookies.get("theme")?.value).toBe(theme);
    expect(response.cookies.get("tone")?.value).toBe("plain");
    expect(response.cookies.get("tone")?.maxAge).toBe(31536000);
  });

  it.each(["system", "default"])("clears theme %s and the default tone", async (theme) => {
    const response = await appearance(request("appearance", `theme=${theme}&tone=default`));
    for (const name of ["theme", "tone"]) {
      expect(response.cookies.get(name)).toMatchObject({ value: "", path: "/", expires: new Date(0) });
    }
  });

  it("leaves cookies unchanged for unknown appearance values", async () => {
    const response = await appearance(request("appearance", "theme=unknown&tone=unknown"));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears text mode when switched off", async () => {
    const response = await textMode(request("text-mode", "on=0"));
    expect(response.cookies.get("text-mode")).toMatchObject({ value: "", expires: new Date(0) });
  });

  it.each(["math", "ja", "zh-Hant", "zh-Hans", "es"])("still saves language mode %s", async (mode) => {
    const response = await language(request("lang-mode", `mode=${mode}`));
    expect(response.cookies.get("lang-mode")).toMatchObject({ value: mode, maxAge: 31536000 });
  });

  it.each(["default", "unknown"])("clears language mode for %s", async (mode) => {
    const response = await language(request("lang-mode", `mode=${mode}`));
    expect(response.cookies.get("lang-mode")).toMatchObject({ value: "", expires: new Date(0) });
  });

  it("retains the currency alias and clears unknown currency codes", async () => {
    const enabled = await currency(request("currency", "currency=usd"));
    expect(enabled.cookies.get("display-currency")?.value).toBe("USD");
    const cleared = await currency(request("currency", "code=unknown"));
    expect(cleared.cookies.get("display-currency")).toMatchObject({ value: "", expires: new Date(0) });
  });
});
