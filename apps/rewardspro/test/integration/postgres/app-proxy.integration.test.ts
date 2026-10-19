import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { loader } from "~/routes/api.proxy.$";
import { hasTestDatabase, resetDatabase } from "./database";
import { seedOfflineSession, signedProxyRequest } from "./shopify";

const SHOP = "proxy-test.myshopify.com";
const VICTIM = { shopifyCustomerId: "9876543210", email: "victim@example.test" };
const SHOPPER = { shopifyCustomerId: "100", email: "shopper@example.test" };

function get(path: string, request: Request) {
  return loader({ request, params: { "*": path }, context: {} });
}

/** Everything a response could leak about the victim. */
async function leaksVictim(response: Response) {
  const body = await response.text();
  return [VICTIM.email, "Vivianne", "Zelnick", VICTIM.shopifyCustomerId].some((needle) => body.includes(needle));
}

describe.skipIf(!hasTestDatabase)("app proxy identity on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedOfflineSession(SHOP);
    await prisma.shopSettings.create({ data: { shop: SHOP, storeName: "Proxy", storeUrl: `https://${SHOP}` } });
    for (const c of [VICTIM, SHOPPER]) {
      await prisma.customer.create({
        data: { shop: SHOP, ...c, firstName: c === VICTIM ? "Vivianne" : "Sam", lastName: c === VICTIM ? "Zelnick" : "Shopper", storeCredit: 42 },
      });
    }
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("gives a guest no personal data, whatever customer id the visitor adds", async () => {
    const response = await get(
      "membership",
      signedProxyRequest("membership", SHOP, "", [
        ["customer_id", VICTIM.shopifyCustomerId],
        ["customerId", VICTIM.shopifyCustomerId],
        ["cid", VICTIM.shopifyCustomerId],
      ]),
    );

    expect(response.status).toBe(200);
    const body = await response.clone().json();
    expect(body).toMatchObject({ success: false, requiresLogin: true, customer: null });
    await expect(leaksVictim(response)).resolves.toBe(false);
  });

  it("ignores a second, visitor-supplied logged_in_customer_id", async () => {
    // The verifier checks the last copy; URLSearchParams.get would read this first one
    const request = signedProxyRequest("membership", SHOP, VICTIM.shopifyCustomerId, [["logged_in_customer_id", ""]]);
    expect(new URL(request.url).searchParams.get("logged_in_customer_id")).toBe(VICTIM.shopifyCustomerId);

    const response = await get("membership", request);

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toMatchObject({ requiresLogin: true });
    await expect(leaksVictim(response)).resolves.toBe(false);
  });

  it("serves the signed-in shopper their own data", async () => {
    const response = await get("membership", signedProxyRequest("membership", SHOP, SHOPPER.shopifyCustomerId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(JSON.stringify(body)).toContain(SHOPPER.email);
    expect(JSON.stringify(body)).not.toContain(VICTIM.email);
  });

  it("does not read another shopper's balance through customer-summary", async () => {
    const response = await get("customer-summary", signedProxyRequest("customer-summary", SHOP, "", [["customer_id", VICTIM.shopifyCustomerId]]));

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toMatchObject({ customer: null, isAuthenticated: false });
  });

  it("refuses an unsigned request", async () => {
    const request = new Request(
      `https://test.example.com/api/proxy/membership?shop=${SHOP}&logged_in_customer_id=&customer_id=${VICTIM.shopifyCustomerId}`,
    );
    const response = await get("membership", request);

    expect(response.status).toBeGreaterThanOrEqual(400);
    await expect(leaksVictim(response)).resolves.toBe(false);
  });
});
