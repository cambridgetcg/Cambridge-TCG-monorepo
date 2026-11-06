import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import * as pageStaticInfo from "next/dist/build/analysis/get-page-static-info";
import * as middlewareConfig from "next/dist/build/segment-config/middleware/middleware-config";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import proxy, { PRODUCTION_ALIAS_HOST, config } from "./proxy";

// Next's build internals, which its type declarations do not export.
const { getMiddlewareMatchers } = pageStaticInfo as unknown as { getMiddlewareMatchers: (matcher: unknown, nextConfig: unknown) => never };
const { MiddlewareConfigInputSchema } = middlewareConfig as unknown as { MiddlewareConfigInputSchema: { safeParse: (input: unknown) => { success: boolean } } };

// The production alias reaches Vercel without Cloudflare. A GET or HEAD to
// its /api goes to the apex; every other method, /api/cron, the apex and
// per-deployment hosts are served as before. The matcher is compiled with
// Next's own functions, so this is the same decision the build makes.

const ALIAS = PRODUCTION_ALIAS_HOST;
const DEPLOYMENT = "cambridgetcg-storefront-abc123def-cambridgetcg.vercel.app";

function request(method: string, host: string, path: string, cookie?: string): NextRequest {
  const headers = new Headers({ host });
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`https://${host}${path}`, { method, headers });
}

const matches = (() => {
  const matcher = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));
  return (host: string, pathname: string) => matcher(pathname, { headers: { host } } as never, {});
})();

describe("the proxy's matcher", () => {
  it("is a config Next accepts, naming the same alias as the code", () => {
    expect(MiddlewareConfigInputSchema.safeParse(config).success).toBe(true);
    expect(JSON.stringify(config.matcher)).toContain(`"value":"${ALIAS}"`);
  });

  it("runs on the alias's /api and the gated paths, nowhere else", () => {
    expect(matches(ALIAS, "/api/v1/prices/one-piece/op01/cards/001")).toBe(true);
    expect(matches(ALIAS, "/api/stripe/webhook")).toBe(true);
    expect(matches(ALIAS, "/api/cron/maintenance")).toBe(false);
    expect(matches(ALIAS, "/api/cron")).toBe(false);
    expect(matches("cambridgetcg.com", "/api/v1/prices/one-piece/op01/cards/001")).toBe(false);
    expect(matches(DEPLOYMENT, "/api/v1/prices/one-piece/op01/cards/001")).toBe(false);
    expect(matches(`${ALIAS}:443`, "/api/v1/sources")).toBe(true);
    expect(matches("cambridgetcg.com", "/admin/system/monitor")).toBe(true);
    expect(matches("cambridgetcg.com", "/api/admin/emails")).toBe(true);
    expect(matches("cambridgetcg.com", "/account/orders")).toBe(true);
    expect(matches("cambridgetcg.com", "/prices")).toBe(false);
  });
});

describe("the production alias's /api", () => {
  it.each(["GET", "HEAD"])("answers a %s with 308 to the same path and query on the apex", (method) => {
    const response = proxy(request(method, ALIAS, "/api/v1/prices/one-piece/op01/cards/001?currency=GBP&x=%2F"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://cambridgetcg.com/api/v1/prices/one-piece/op01/cards/001?currency=GBP&x=%2F");
  });

  it("redirects an alias GET for /api/admin too, so the apex's gate answers it", () => {
    const response = proxy(request("GET", ALIAS, "/api/admin/emails"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://cambridgetcg.com/api/admin/emails");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("passes a %s through untouched, so webhooks keep working", (method) => {
    const response = proxy(request(method, ALIAS, "/api/stripe/webhook"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("never redirects /api/cron, on any method", () => {
    for (const method of ["GET", "HEAD", "POST"]) {
      const response = proxy(request(method, ALIAS, "/api/cron/traffic-pull"));
      expect(response.headers.get("location"), method).toBeNull();
      expect(response.headers.get("x-middleware-next"), method).toBe("1");
    }
  });

  it("keeps the cookie gate on /api/admin for other methods", () => {
    expect(proxy(request("POST", ALIAS, "/api/admin/emails")).status).toBe(401);
  });
});

describe("every other host", () => {
  it("is not redirected: the apex and a per-deployment host serve their own /api", () => {
    for (const host of ["cambridgetcg.com", DEPLOYMENT, "www.cambridgetcg.com"]) {
      expect(proxy(request("GET", host, "/api/admin/emails")).status, host).toBe(401);
    }
  });

  it("keeps the cookie gate exactly as before", () => {
    const toLogin = proxy(request("GET", "cambridgetcg.com", "/account/orders?tab=open"));
    expect(toLogin.status).toBe(307);
    expect(new URL(toLogin.headers.get("location")!).searchParams.get("return")).toBe("/account/orders?tab=open");
    const signedIn = proxy(request("GET", "cambridgetcg.com", "/admin/system/monitor", "authjs.session-token=x"));
    expect(signedIn.headers.get("x-middleware-next")).toBe("1");
    expect(signedIn.headers.get("x-middleware-request-x-pathname")).toBe("/admin/system/monitor");
  });
});
