import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hasTrustedMemberOrigin, memberError, memberHeaders, readMemberBody } from "./member-http";
afterEach(() => vi.unstubAllEnvs());

describe("private HTTP boundary", () => {
  it("overrides cache/CORS on errors and successes", () => {
    const headers = memberHeaders({ "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true" });
    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.get("vary")).toBe("Cookie, Authorization");
    expect(headers.has("access-control-allow-origin")).toBe(false);
    expect(headers.has("access-control-allow-credentials")).toBe(false);
    expect(memberError("denied", 401).headers.get("cache-control")).toBe("private, no-store");
  });
  it("uses only the configured trusted origin, not arbitrary Host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cambridgetcg.com");
    const request = (origin: string, host = "cambridgetcg.com") => new Request(`https://${host}/api/account/data/keys`, { headers: { origin, host } });
    expect(hasTrustedMemberOrigin(request("https://evil.example", "evil.example"))).toBe(false);
    expect(hasTrustedMemberOrigin(request("null"))).toBe(false);
    expect(hasTrustedMemberOrigin(request("https://cambridgetcg.com.evil.example"))).toBe(false);
    expect(hasTrustedMemberOrigin(request("https://cambridgetcg.com"))).toBe(true);
    expect(hasTrustedMemberOrigin(new Request("https://cambridgetcg.com"))).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cambridgetcg.com/path");
    expect(hasTrustedMemberOrigin(request("https://cambridgetcg.com"))).toBe(false);
  });
  it("accepts explicitly configured local development only", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
    vi.stubEnv("NODE_ENV", "test");
    const request = new Request("http://localhost:3001", { headers: { origin: "http://localhost:3001" } });
    expect(hasTrustedMemberOrigin(request)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(hasTrustedMemberOrigin(request)).toBe(false);
  });
  it.each(["[]", "null", "{}", '{"name":1}', '{"name":"a","scope":"write"}', "not JSON"])("rejects wrong-shaped body %s", async body => {
    await expect(readMemberBody(new Request("https://cambridgetcg.com", { method: "POST", headers: { "content-type": "application/json" }, body }), "name")).rejects.toMatchObject({ status: 400 });
  });
  it("bounds actual chunked bytes, not merely Content-Length", async () => {
    const request = new Request("https://cambridgetcg.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x".repeat(2000) }) });
    await expect(readMemberBody(request, "name")).rejects.toMatchObject({ status: 413 });
  });
  it("requires JSON content type and supports an exact small object", async () => {
    await expect(readMemberBody(new Request("https://cambridgetcg.com", { method: "POST", body: '{"name":"key"}' }), "name")).rejects.toMatchObject({ status: 415 });
    expect(await readMemberBody(new Request("https://cambridgetcg.com", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: '{"name":"key"}' }), "name")).toBe("key");
  });
});
