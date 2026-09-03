import { describe, expect, it } from "vitest";
import {
  DELIBERATE_CONTRACTS,
  assessResponse,
  expectedFor,
  type ManifestResource,
} from "../../scripts/deploy-verify-contract";

function resource(path: string): ManifestResource {
  return {
    id: `test:${path}`,
    path,
    host: path.startsWith("/api/v1/prices") || path.startsWith("/api/v1/ingest-")
      ? "wholesale"
      : "storefront",
    methods: ["GET"],
    auth: "public",
  };
}

function matchingResponse(path: string): Response {
  const contract = DELIBERATE_CONTRACTS[path];
  return new Response(contract.bodyIncludes.join("\n"), {
    status: contract.status,
    headers: {
      "Cache-Control": contract.cacheControlIncludes.join(", "),
    },
  });
}

describe("deploy verifier response contracts", () => {
  it("names every deliberate non-2xx route", () => {
    expect(Object.keys(DELIBERATE_CONTRACTS)).toEqual([
      "/api/v1/coffee",
      "/api/v1/buy-the-kingdom",
      "/data/catalog.jsonl",
      "/api/v1/do-you-remember-me",
      "/api/v1/cards/[sku]/history",
      "/api/v1/sets/[code]/checklist",
      "/api/v1/cards/[sku]/tcgplayer-history",
      "/api/v1/prices",
      "/api/v1/prices/[sku]",
      "/api/v1/ingest-quarantine/[id]",
      "/api/prism-signals/offers/all",
      "/api/prism-signals/stripe/checkout",
      "/api/prism-signals/stripe/portal",
      "/api/webhooks/stripe/prism-signals",
    ]);
  });

  it("requires exact status, stable body markers, and cache policy for deliberate responses", async () => {
    for (const path of Object.keys(DELIBERATE_CONTRACTS)) {
      const expected = expectedFor(resource(path));
      expect(expected.deliberate).toBe(DELIBERATE_CONTRACTS[path]);
      expect(await assessResponse(resource(path), matchingResponse(path), expected)).toEqual({
        passed: true,
      });

      const genericFailure = new Response("Service Unavailable", {
        status: DELIBERATE_CONTRACTS[path].status,
        headers: {
          "Cache-Control": DELIBERATE_CONTRACTS[path].cacheControlIncludes.join(", "),
        },
      });
      expect((await assessResponse(resource(path), genericFailure, expected)).passed).toBe(false);
    }
  });

  it("does not let a parametric 404 replace an exact deliberate contract", async () => {
    const path = "/api/v1/cards/[sku]/history";
    const result = await assessResponse(
      resource(path),
      new Response("Not found", { status: 404 }),
    );

    expect(result).toEqual({
      passed: false,
      detail: "expected 503 (deliberate contract), got 404",
    });
  });

  it("retains the 400/404 fallback for ordinary parametric probes", async () => {
    const result = await assessResponse(
      resource("/api/v1/examples/[id]"),
      new Response("Not found", { status: 404 }),
    );

    expect(result).toEqual({ passed: true });
  });

  it("rejects a deliberate response with the wrong cache policy", async () => {
    const path = "/api/v1/cards/[sku]/history";
    const contract = DELIBERATE_CONTRACTS[path];
    const result = await assessResponse(
      resource(path),
      new Response(contract.bodyIncludes.join("\n"), {
        status: contract.status,
        headers: { "Cache-Control": "public, max-age=3600" },
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.detail).toContain("cache-control:no-store");
  });

  it("keeps PRISM fail-closed probes exact without relaxing global auth rules", async () => {
    expect(DELIBERATE_CONTRACTS["/api/prism-signals/offers/all"]).toEqual({
      status: 503,
      bodyIncludes: [
        '"code":"offer_unavailable"',
        "The PRISM Signals All sandbox offer is not available.",
      ],
      cacheControlIncludes: ["public", "s-maxage=10"],
    });
    expect(
      DELIBERATE_CONTRACTS["/api/prism-signals/stripe/checkout"],
    ).toMatchObject({
      status: 403,
      bodyIncludes: [
        '"code":"invalid_origin"',
        "A same-origin browser request is required.",
      ],
      cacheControlIncludes: ["private", "no-store"],
    });
    expect(
      DELIBERATE_CONTRACTS["/api/prism-signals/stripe/portal"],
    ).toMatchObject({
      status: 403,
      bodyIncludes: [
        '"code":"invalid_origin"',
        "A same-origin browser request is required.",
      ],
      cacheControlIncludes: ["private", "no-store"],
    });
    expect(
      DELIBERATE_CONTRACTS["/api/webhooks/stripe/prism-signals"],
    ).toMatchObject({
      status: 503,
      bodyIncludes: [
        '"code":"webhook_unavailable"',
        "The PRISM Signals Stripe webhook could not be durably processed.",
      ],
      cacheControlIncludes: ["private", "no-store"],
    });

    const ordinaryUser = {
      ...resource("/api/example/user-mutation"),
      methods: ["POST"],
      auth: "user",
    };
    expect(expectedFor(ordinaryUser).codes).not.toContain(403);
    const ordinaryProvider = {
      ...resource("/api/example/provider-callback"),
      methods: ["POST"],
      auth: "provider-signature",
    };
    expect(expectedFor(ordinaryProvider).codes).not.toContain(503);
  });
});
