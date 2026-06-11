/**
 * Auth-identity tests for the storefront App Proxy route.
 *
 * Historic bug (fixed in commit introducing getProxyCustomerId):
 *   POST handlers in api.proxy.$.tsx destructured `logged_in_customer_id`
 *   from the request *body*. Shopify's App Proxy HMAC covers the URL and
 *   query string but NOT the body, so any logged-in customer could craft a
 *   valid-signature request and swap the body's customer ID to impersonate
 *   another customer on the same shop (horizontal auth bypass).
 *
 * These tests lock in:
 *   1) The helper `getProxyCustomerId` reads ONLY from the URL's signed
 *      query string.
 *   2) No POST handler in the source re-introduces the body-destructure
 *      pattern. Static source checks catch future regressions before runtime.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROXY_FILE = path.resolve(__dirname, "../../app/routes/api.proxy.$.tsx");

describe("getProxyCustomerId (runtime)", () => {
  let getProxyCustomerId: (req: Request) => string | null;

  beforeAll(async () => {
    // Import lazily so the surrounding route file's side-effectful imports
    // (prisma, aws clients, services) are only paid when this file runs.
    const mod = await import("../../app/routes/api.proxy.$");
    getProxyCustomerId = mod.getProxyCustomerId;
  });

  const makeReq = (urlSuffix: string, init?: RequestInit) =>
    new Request(`https://app.example.com/apps/rewardspro/raffles${urlSuffix}`, init);

  it("returns the id from the signed URL query string", () => {
    const req = makeReq("?shop=s.myshopify.com&logged_in_customer_id=42&signature=abc");
    expect(getProxyCustomerId(req)).toBe("42");
  });

  it("returns null when the query param is missing", () => {
    const req = makeReq("?shop=s.myshopify.com&signature=abc");
    expect(getProxyCustomerId(req)).toBeNull();
  });

  it.each(["", "null", "undefined"])(
    "returns null when the query param is the sentinel string %p",
    (sentinel) => {
      const req = makeReq(`?logged_in_customer_id=${sentinel}`);
      expect(getProxyCustomerId(req)).toBeNull();
    }
  );

  it("IGNORES the request body entirely — body-supplied IDs never surface", async () => {
    // Body carries a *different* customer id than the URL. The helper must
    // resolve to the URL's id (42) and never peek at the body. This is the
    // core regression guard for the horizontal-auth bypass.
    const req = makeReq("?logged_in_customer_id=42", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logged_in_customer_id: "999", customerId: "999" }),
    });

    expect(getProxyCustomerId(req)).toBe("42");

    // Double-confirm: even after we awaited the body, the helper still
    // yields the URL id (helper doesn't consume the stream).
    const readBody = await req.json();
    expect(readBody.logged_in_customer_id).toBe("999");
    expect(getProxyCustomerId(req)).toBe("42");
  });

  it("does not decode or trust arbitrary query chars — returns raw value", () => {
    // Shopify-signed values are always pure digits, but the helper should
    // still return exactly what Shopify signed, unmodified.
    const req = makeReq("?logged_in_customer_id=%20%20123");
    // Browsers decode URI components on searchParams.get, so leading spaces
    // come back. The helper treats that as a non-sentinel value — DB lookup
    // downstream will simply not find a matching customer. This documents
    // the boundary, it does not assert a trim.
    expect(getProxyCustomerId(req)).toBe("  123");
  });
});

describe("api.proxy.$.tsx — source contract (regression guard)", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(PROXY_FILE, "utf-8");
  });

  /** Slice out the `action` (POST) handler, excluding the `loader` (GET). */
  function getActionSource(): string {
    const start = source.indexOf("export async function action(");
    expect(start).toBeGreaterThan(-1);
    return source.slice(start);
  }

  it("does NOT destructure logged_in_customer_id from a request body", () => {
    const action = getActionSource();

    // Matches `const { ..., logged_in_customer_id, ... } = body;`-style reads.
    // The only place logged_in_customer_id may appear post-fix is inside
    // `getProxyCustomerId` (which reads the URL) or diagnostic comments.
    const forbidden = /\{\s*[^}]*\blogged_in_customer_id\b[^}]*\}\s*=\s*body/g;
    const hits = action.match(forbidden) || [];

    expect(
      hits,
      "POST handlers must resolve the customer ID from the signed URL via " +
        "getProxyCustomerId(request), never from the request body. Re-read " +
        "the test file header for the rationale."
    ).toEqual([]);
  });

  it("does NOT destructure a customer id from the gift-cards/convert body", () => {
    const action = getActionSource();

    // Historic pattern: `const { bundleId, customerId: shopifyCustomerId } = body;`
    // — same bypass risk, different field name.
    const forbidden = /\{\s*[^}]*\bcustomerId\s*:\s*\w+[^}]*\}\s*=\s*body/g;
    const hits = action.match(forbidden) || [];

    expect(
      hits,
      "gift-cards/convert (and siblings) must not rename a body `customerId` " +
        "into a local identity variable. Use getProxyCustomerId(request)."
    ).toEqual([]);
  });

  it("every mutating POST handler calls getProxyCustomerId before its body read", () => {
    const action = getActionSource();

    // Each path block starts with `if (proxyPath === "...")`. For the
    // mutating endpoints, getProxyCustomerId must appear between the path
    // check and the `request.json()` body read.
    const mutating = [
      "raffles",
      "raffles/enter",
      "challenges/claim",
      "challenges/join",
      "mystery-boxes/open",
      "gift-cards/convert",
    ];

    for (const pathName of mutating) {
      // Grab the block up to the next `if (proxyPath ===` or end-of-action.
      const blockStart = action.indexOf(`proxyPath === "${pathName}"`);
      expect(blockStart, `missing handler block for ${pathName}`).toBeGreaterThan(-1);

      const rest = action.slice(blockStart);
      const blockEnd = rest.indexOf(`proxyPath ===`, 1);
      const block = blockEnd > 0 ? rest.slice(0, blockEnd) : rest;

      const helperIdx = block.indexOf("getProxyCustomerId(request)");
      const bodyIdx = block.indexOf("await request.json()");

      expect(
        helperIdx,
        `${pathName} handler must call getProxyCustomerId(request)`
      ).toBeGreaterThan(-1);

      // If both are present, helper must appear first so identity is
      // resolved before any body-derived decision runs.
      if (bodyIdx > -1) {
        expect(
          helperIdx,
          `${pathName}: getProxyCustomerId(request) must appear before ` +
            `request.json() — the body is untrusted for identity purposes.`
        ).toBeLessThan(bodyIdx);
      }
    }
  });

  it("mutating POST handlers claim an idempotency key before the DB write", () => {
    const action = getActionSource();

    // Each of these endpoints performs a state-changing write. Clients send
    // an `Idempotency-Key` header; the handler must gate on
    // claimIdempotencyKey so a double-click / retry / replay can't double-
    // spend points or issue duplicate gift cards.
    const guarded = [
      { path: "raffles", scope: "raffle-entry" },
      { path: "raffles/enter", scope: "raffle-enter" },
      { path: "challenges/claim", scope: "challenge-claim" },
      { path: "mystery-boxes/open", scope: "mystery-box-open" },
      { path: "gift-cards/convert", scope: "gift-card-convert" },
    ];

    for (const { path: p, scope } of guarded) {
      const blockStart = action.indexOf(`proxyPath === "${p}"`);
      const rest = action.slice(blockStart);
      const blockEnd = rest.indexOf(`proxyPath ===`, 1);
      const block = blockEnd > 0 ? rest.slice(0, blockEnd) : rest;

      expect(
        block,
        `${p} handler must call claimIdempotencyKey("${scope}", ...)`
      ).toContain(`claimIdempotencyKey("${scope}"`);
    }
  });
});
