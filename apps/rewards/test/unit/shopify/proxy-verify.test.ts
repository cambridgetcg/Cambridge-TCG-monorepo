import type { Session } from "@shopify/shopify-app-react-router/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ProxyModule from "~/shopify/proxy.server";
import { signedProxyRequest } from "../../helpers/app-proxy";

/**
 * The app proxy's check of who is asking (spec 7, plan Decisions 10 and 18,
 * Review Focus 1). Shopify signs every request it forwards; the buyer is
 * only ever the signed `logged_in_customer_id`. The released widget appends
 * its own `shop` and `logged_in_customer_id`, and the library refuses a
 * repeated `shop`, so the app checks those requests' signature itself.
 *
 * The real library runs here, on sessions held in memory instead of
 * Postgres: ~/shopify.server's own storage needs the database.
 */

const sessions = vi.hoisted(() => new Map<string, Session>());

vi.mock("~/shopify.server", async () => {
  await import("@shopify/shopify-app-react-router/adapters/node");
  const { ApiVersion, AppDistribution, shopifyApp } = await import("@shopify/shopify-app-react-router/server");
  const shopify = shopifyApp({
    apiKey: "test-api-key",
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    apiVersion: ApiVersion.October26,
    appUrl: process.env.SHOPIFY_APP_URL!,
    authPathPrefix: "/auth",
    distribution: AppDistribution.AppStore,
    future: { expiringOfflineAccessTokens: true },
    sessionStorage: {
      storeSession: async (session: Session) => (sessions.set(session.id, session), true),
      loadSession: async (id: string) => sessions.get(id),
      deleteSession: async (id: string) => (sessions.delete(id), true),
      deleteSessions: async (ids: string[]) => (ids.forEach((id) => sessions.delete(id)), true),
      findSessionsByShop: async (shop: string) => [...sessions.values()].filter((session) => session.shop === shop),
    },
  });
  return { authenticate: shopify.authenticate, unauthenticated: shopify.unauthenticated };
});

const SHOP = "proxy-verify.myshopify.com";
const OTHER_SHOP = "someone-else.myshopify.com";
const OTHER_BUYER = "200";

type Verified = Exclude<Awaited<ReturnType<typeof ProxyModule.verifyProxyRequest>>, Response>;

let proxy: typeof ProxyModule;
let authenticate: typeof import("~/shopify.server").authenticate;

beforeAll(async () => {
  // The library logs its version, and each proxy request, at start
  vi.spyOn(console, "log").mockImplementation(() => {});
  proxy = await import("~/shopify/proxy.server");
  ({ authenticate } = await import("~/shopify.server"));
});

beforeEach(async () => {
  sessions.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Every new test asks as a buyer of its own, so the rate limit carries nothing between tests. */
let buyerNumber = 1000;
const freshBuyer = () => String(++buyerNumber);

async function verified(request: Request): Promise<Verified> {
  const answer = await proxy.verifyProxyRequest(request);
  if (answer instanceof Response) throw new Error(`Refused with ${answer.status}`);
  return answer;
}

async function refusal(request: Request): Promise<number> {
  const answer = await proxy.verifyProxyRequest(request);
  if (!(answer instanceof Response)) throw new Error(`Accepted as ${JSON.stringify(answer)}`);
  return answer.status;
}

/** What the library alone answers: its context, or the status of the Response it throws. */
async function libraryAnswer(request: Request): Promise<"accepted" | number> {
  try {
    await authenticate.public.appProxy(request);
    return "accepted";
  } catch (error) {
    if (error instanceof Response) return error.status;
    throw error;
  }
}

describe("Shopify's worked examples (Authenticate app proxies)", () => {
  // Shopify's two worked examples, secret `hush`, fixed vectors independent of
  // the tests' signer. The docs page renders the shop as `{shop}`; its
  // signatures are those of `shop-name`, the shop of Shopify's published example.
  const signed = "timestamp=1317327555";
  const customer = `extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&${signed}&signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb`;
  const anonymous = `extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=&path_prefix=%2Fapps%2Fawesome_reviews&${signed}&signature=e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb`;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1317327555 * 1000);
  });

  it("signs the sorted, comma-joined, concatenated pairs as Shopify does", () => {
    expect(proxy.proxySignature(new URLSearchParams(customer), "hush")).toBe("4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb");
    expect(proxy.proxySignature(new URLSearchParams(anonymous), "hush")).toBe("e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb");
  });

  it("accepts both examples at their own time", () => {
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer), "hush")).toBe(true);
    expect(proxy.proxyQueryVerified(new URLSearchParams(anonymous), "hush")).toBe(true);
  });

  it("refuses them with another secret, a changed value, or 91 seconds later", () => {
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer), "not-hush")).toBe(false);
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer.replace("logged_in_customer_id=1", "logged_in_customer_id=2")), "hush")).toBe(false);
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer.replace("extra=2", "extra=3")), "hush")).toBe(false);
    vi.setSystemTime((1317327555 + 90) * 1000);
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer), "hush")).toBe(true);
    vi.setSystemTime((1317327555 + 91) * 1000);
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer), "hush")).toBe(false);
    vi.setSystemTime((1317327555 - 91) * 1000);
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer), "hush")).toBe(false);
  });

  it("refuses a missing, repeated or empty signature or timestamp", () => {
    const without = (key: string) => {
      const params = new URLSearchParams(customer);
      params.delete(key);
      return params;
    };
    const twice = (key: string) => {
      const params = new URLSearchParams(customer);
      params.append(key, params.get(key)!);
      return params;
    };
    expect(proxy.proxyQueryVerified(without("signature"), "hush")).toBe(false);
    expect(proxy.proxyQueryVerified(without("timestamp"), "hush")).toBe(false);
    expect(proxy.proxyQueryVerified(twice("signature"), "hush")).toBe(false);
    expect(proxy.proxyQueryVerified(twice("timestamp"), "hush")).toBe(false);
    expect(proxy.proxyQueryVerified(new URLSearchParams(customer.replace(signed, "timestamp=")), "hush")).toBe(false);
  });
});

describe("verifyProxyRequest", () => {
  it("a signed request: the shop and the signed buyer", async () => {
    const buyer = freshBuyer();
    await expect(verified(signedProxyRequest("membership", SHOP, buyer))).resolves.toEqual({ shop: SHOP, customerId: buyer, admin: undefined });
  });

  it("an empty, null or undefined logged_in_customer_id is a guest", async () => {
    for (const id of ["", "null", "undefined"]) {
      await expect(verified(signedProxyRequest("membership", SHOP, id))).resolves.toMatchObject({ shop: SHOP, customerId: null });
    }
  });

  // Review Focus 1: the released widget appends its own copies
  it("repeated parameters: identical shop and logged_in_customer_id, signed comma-joined → that buyer", async () => {
    const buyer = freshBuyer();
    const request = signedProxyRequest("membership", SHOP, buyer, [
      ["logged_in_customer_id", buyer],
      ["shop", SHOP],
    ]);
    // The library alone refuses it: `shop` must appear once
    expect(await libraryAnswer(request.clone())).toBe(400);

    await expect(verified(request)).resolves.toEqual({ shop: SHOP, customerId: buyer, admin: undefined });
  });

  it("repeated parameters: an identical logged_in_customer_id alone (the library accepts it) → that buyer", async () => {
    const buyer = freshBuyer();
    const request = signedProxyRequest("membership", SHOP, buyer, [["logged_in_customer_id", buyer]]);
    expect(await libraryAnswer(request.clone())).toBe("accepted");

    await expect(verified(request)).resolves.toMatchObject({ shop: SHOP, customerId: buyer });
  });

  it("repeated parameters: differing logged_in_customer_id → guest", async () => {
    const buyer = freshBuyer();
    // With the shop repeated too (the app's own check) and without (the library's)
    const cases = [
      signedProxyRequest("membership", SHOP, buyer, [["logged_in_customer_id", OTHER_BUYER], ["shop", SHOP]]),
      signedProxyRequest("membership", SHOP, "", [["logged_in_customer_id", OTHER_BUYER], ["shop", SHOP]]),
      signedProxyRequest("membership", SHOP, buyer, [["logged_in_customer_id", OTHER_BUYER]]),
      signedProxyRequest("membership", SHOP, "", [["logged_in_customer_id", OTHER_BUYER]]),
    ];
    for (const request of cases) {
      await expect(verified(request)).resolves.toEqual({ shop: SHOP, customerId: null, admin: undefined });
    }
  });

  it("repeated parameters: differing shop → 400", async () => {
    const buyer = freshBuyer();
    await expect(refusal(signedProxyRequest("membership", SHOP, buyer, [["shop", OTHER_SHOP]]))).resolves.toBe(400);
    await expect(
      refusal(signedProxyRequest("membership", SHOP, buyer, [["shop", OTHER_SHOP], ["logged_in_customer_id", buyer]])),
    ).resolves.toBe(400);
  });

  it("a bad signature or an old timestamp is refused", async () => {
    const buyer = freshBuyer();
    const now = Math.trunc(Date.now() / 1000);
    const repeated: Array<[string, string]> = [["shop", SHOP], ["logged_in_customer_id", buyer]];
    for (const extra of [[], repeated]) {
      // Signed with another secret
      await expect(refusal(signedProxyRequest("membership", SHOP, buyer, extra, { secret: "not-the-secret" }))).resolves.toBe(400);
      // Signed, then a value changed
      const tampered = signedProxyRequest("membership", SHOP, buyer, extra);
      const url = new URL(tampered.url);
      url.searchParams.set("logged_in_customer_id", OTHER_BUYER);
      await expect(refusal(new Request(url))).resolves.toBe(400);
      // Signed 91 seconds ago, or 91 seconds ahead
      await expect(refusal(signedProxyRequest("membership", SHOP, buyer, extra, { timestamp: now - 91 }))).resolves.toBe(400);
      await expect(refusal(signedProxyRequest("membership", SHOP, buyer, extra, { timestamp: now + 91 }))).resolves.toBe(400);
      // Not signed at all
      const unsigned = new URL(signedProxyRequest("membership", SHOP, buyer, extra).url);
      unsigned.searchParams.delete("signature");
      await expect(refusal(new Request(unsigned))).resolves.toBe(400);
    }
  });

  it("the store's Admin API client comes with its offline session, on both checks", async () => {
    const { Session } = await import("@shopify/shopify-app-react-router/server");
    sessions.set(
      `offline_${SHOP}`,
      new Session({ id: `offline_${SHOP}`, shop: SHOP, state: "state", isOnline: false, scope: "read_customers", accessToken: "shpat_unit" }),
    );
    const buyer = freshBuyer();

    const single = await verified(signedProxyRequest("membership", SHOP, buyer));
    expect(typeof single.admin?.graphql).toBe("function");
    const repeated = await verified(signedProxyRequest("membership", SHOP, buyer, [["shop", SHOP], ["logged_in_customer_id", buyer]]));
    expect(typeof repeated.admin?.graphql).toBe("function");
  });

  // Plan Decision 18: 30 a minute, keyed on the verified shop and buyer
  it("the 31st request in a minute from one buyer gets 429", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const buyer = freshBuyer();
    for (let i = 0; i < 30; i++) {
      await expect(verified(signedProxyRequest("membership", SHOP, buyer))).resolves.toMatchObject({ customerId: buyer });
    }
    const limited = await proxy.verifyProxyRequest(signedProxyRequest("membership", SHOP, buyer));
    expect(limited).toBeInstanceOf(Response);
    expect((limited as Response).status).toBe(429);
    expect(Number((limited as Response).headers.get("Retry-After"))).toBeGreaterThan(0);

    // Another buyer of the same shop, and the same id at another shop, are not held back
    await expect(verified(signedProxyRequest("membership", SHOP, freshBuyer()))).resolves.toMatchObject({ shop: SHOP });
    await expect(verified(signedProxyRequest("membership", OTHER_SHOP, buyer))).resolves.toMatchObject({ shop: OTHER_SHOP, customerId: buyer });
    // Nor is a refused request counted for the buyer it names
    const stranger = freshBuyer();
    for (let i = 0; i < 31; i++) await refusal(signedProxyRequest("membership", SHOP, stranger, [], { secret: "not-the-secret" }));
    await expect(verified(signedProxyRequest("membership", SHOP, stranger))).resolves.toMatchObject({ customerId: stranger });

    // A minute after the first of the 30, one more is let through
    vi.advanceTimersByTime(60_000);
    await expect(verified(signedProxyRequest("membership", SHOP, buyer))).resolves.toMatchObject({ customerId: buyer });
  });
});
