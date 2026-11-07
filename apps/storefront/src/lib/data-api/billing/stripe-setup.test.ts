import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DATA_API_PLANS } from "../plans";
import { readDataApiBillingConfig } from "./config.server";
import { dataApiPriceProblems } from "./provider-contract.server";
import {
  DataApiSetupRefusal,
  assertTestKey,
  describeSetup,
  lookupKeyFor,
  productIdFor,
  setUpDataApiStripePlans,
  type DataApiStripeSetupClient,
} from "../../../../scripts/data-api-stripe-setup";

// An in-memory test-mode Stripe: products by id, prices by lookup key. No network. Like Stripe, a
// product id stays taken once used, archived or not, and a lookup key moves only by transfer_lookup_key.
function fakeStripe() {
  const products = new Map<string, Stripe.Product>();
  const prices: Stripe.Price[] = [];
  const calls = { productCreates: 0, priceCreates: 0 };
  const client: DataApiStripeSetupClient = {
    products: {
      retrieve: vi.fn(async (id: string) => {
        const found = products.get(id);
        if (!found) throw Object.assign(new Error("No such product"), { code: "resource_missing" });
        return found;
      }),
      create: vi.fn(async (params: Stripe.ProductCreateParams) => {
        if (products.has(params.id!)) throw Object.assign(new Error("Product already exists"), { code: "resource_already_exists" });
        calls.productCreates += 1;
        const product = { id: params.id!, object: "product", livemode: false, active: true, name: params.name, metadata: params.metadata } as unknown as Stripe.Product;
        products.set(product.id, product);
        return product;
      }),
    },
    prices: {
      list: vi.fn(async (params: Stripe.PriceListParams) => ({
        data: prices.filter(price => params.lookup_keys?.includes(price.lookup_key ?? "")), has_more: false,
      })),
      create: vi.fn(async (params: Stripe.PriceCreateParams) => {
        const holder = prices.find(price => price.lookup_key === params.lookup_key);
        if (holder && !params.transfer_lookup_key) throw Object.assign(new Error("Lookup key already in use"), { code: "lookup_key_in_use" });
        if (holder) (holder as { lookup_key: string | null }).lookup_key = null;
        calls.priceCreates += 1;
        const price = { id: `price_fake${String(prices.length + 1).padStart(8, "0")}`, object: "price", livemode: false, active: true, type: "recurring",
          product: params.product, currency: params.currency, unit_amount: params.unit_amount, lookup_key: params.lookup_key,
          // Stripe's default usage type is licensed.
          recurring: { interval: params.recurring!.interval, interval_count: params.recurring!.interval_count, usage_type: params.recurring!.usage_type ?? "licensed" } } as unknown as Stripe.Price;
        prices.push(price);
        return price;
      }),
    },
  };
  return { client, products, prices, calls };
}

vi.mock("server-only", () => ({}));

let stripe: ReturnType<typeof fakeStripe>;
beforeEach(() => { stripe = fakeStripe(); });
const archive = (object: Stripe.Product | Stripe.Price | undefined) => { (object as { active: boolean }).active = false; };

describe("data-API Stripe setup script", () => {
  it("makes exactly the prices checkout will sell: each passes checkout's attestation once its ids are configured", async () => {
    const results = await setUpDataApiStripePlans(stripe.client);
    const config = readDataApiBillingConfig({
      DATA_API_STRIPE_SECRET_KEY: "rk_test_fixture_dataapi_0000001", DATA_API_STRIPE_WEBHOOK_SECRET: "whsec_fixture_dataapi_00000001",
      DATA_API_STRIPE_PRICE_PRO: results.find(r => r.planId === "pro")!.priceId, DATA_API_STRIPE_PRICE_BUSINESS: results.find(r => r.planId === "business")!.priceId,
    });
    for (const result of results) {
      // As Checkout retrieves it: the price with its product expanded.
      const created = stripe.prices.find(p => p.id === result.priceId)!;
      const expanded = { ...created, product: stripe.products.get(result.productId)! } as Stripe.Price;
      expect(dataApiPriceProblems(expanded, result.planId, config)).toEqual([]);
    }
  });

  it("refuses to reuse a metered price that answers the lookup key", async () => {
    await setUpDataApiStripePlans(stripe.client);
    (stripe.prices[0]!.recurring as { usage_type: string }).usage_type = "metered";
    await expect(setUpDataApiStripePlans(stripe.client)).rejects.toThrow(/does not match the catalogue/);
  });

  it("refuses any key that is not a test-mode secret, before Stripe", () => {
    for (const key of [undefined, "", "sk_live_fixture_dataapi_0000001", "rk_live_fixture_dataapi_0000001", "pk_test_fixture_dataapi_0000001"]) {
      expect(() => assertTestKey(key)).toThrow(DataApiSetupRefusal);
    }
    expect(assertTestKey(" rk_test_fixture_dataapi_0000001\n")).toBe("rk_test_fixture_dataapi_0000001");
  });

  it("creates each paid plan's product and monthly GBP price from plans.ts, ex VAT", async () => {
    const results = await setUpDataApiStripePlans(stripe.client);
    expect(results.map(r => [r.planId, r.productId, r.lookupKey, r.created])).toEqual([
      ["pro", "ctcg_data_api_pro", "ctcg_data_api_pro_gbp_month_1200", { product: true, price: true }],
      ["business", "ctcg_data_api_business", "ctcg_data_api_business_gbp_month_6000", { product: true, price: true }],
    ]);
    const priceParams = vi.mocked(stripe.client.prices.create).mock.calls.map(([params]) => params);
    expect(priceParams).toEqual([DATA_API_PLANS.pro, DATA_API_PLANS.business].map(plan => expect.objectContaining({
      product: productIdFor(plan.id as "pro" | "business"), currency: "gbp", unit_amount: plan.price.amountPence,
      recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive", lookup_key: lookupKeyFor(plan as never),
    })));
    expect(vi.mocked(stripe.client.prices.create).mock.calls.every(([, options]) => options?.idempotencyKey?.startsWith("data-api-setup:price:"))).toBe(true);
  });

  it("reuses what exists on a rerun", async () => {
    await setUpDataApiStripePlans(stripe.client);
    const again = await setUpDataApiStripePlans(stripe.client);
    expect(again.map(r => r.created)).toEqual([{ product: false, price: false }, { product: false, price: false }]);
    expect(again.map(r => r.replaced)).toEqual([{ products: [], price: null }, { products: [], price: null }]);
    expect(stripe.calls).toEqual({ productCreates: 2, priceCreates: 2 });
  });

  it("never reuses an archived price found by lookup key: a new one takes the key, and the output says so", async () => {
    await setUpDataApiStripePlans(stripe.client);
    archive(stripe.prices[0]);
    const results = await setUpDataApiStripePlans(stripe.client);
    expect(results[0]).toMatchObject({ planId: "pro", productId: "ctcg_data_api_pro", priceId: "price_fake00000003",
      created: { product: false, price: true }, replaced: { products: [], price: "price_fake00000001" } });
    expect(results[1]).toMatchObject({ priceId: "price_fake00000002", created: { product: false, price: false } });
    const [params, options] = vi.mocked(stripe.client.prices.create).mock.calls[2]!;
    expect(params).toMatchObject({ product: "ctcg_data_api_pro", lookup_key: "ctcg_data_api_pro_gbp_month_1200", transfer_lookup_key: true });
    // Not the first creation's key, which Stripe could answer with the archived price.
    expect(options?.idempotencyKey).toBe("data-api-setup:price:ctcg_data_api_pro_gbp_month_1200:replaces:price_fake00000001");
    expect(stripe.prices[0]).toMatchObject({ id: "price_fake00000001", active: false, lookup_key: null });
    const text = describeSetup(results);
    expect(text).toContain("price_fake00000003 (created; archived price_fake00000001 not reused)");
    expect(text).toContain("DATA_API_STRIPE_PRICE_PRO=price_fake00000003");
    // The replacement is what a rerun finds.
    expect((await setUpDataApiStripePlans(stripe.client)).map(r => r.priceId)).toEqual(["price_fake00000003", "price_fake00000002"]);
    expect(stripe.calls.priceCreates).toBe(3);
  });

  it("never reuses an archived product: the next id in its line takes over, with a new price", async () => {
    await setUpDataApiStripePlans(stripe.client);
    archive(stripe.products.get("ctcg_data_api_business"));
    const results = await setUpDataApiStripePlans(stripe.client);
    // The old price is active but sold under the archived product, so it is not reused either.
    expect(results[1]).toMatchObject({ planId: "business", productId: "ctcg_data_api_business_2", priceId: "price_fake00000003",
      created: { product: true, price: true }, replaced: { products: ["ctcg_data_api_business"], price: "price_fake00000002" } });
    expect(stripe.prices[2]).toMatchObject({ product: "ctcg_data_api_business_2", lookup_key: "ctcg_data_api_business_gbp_month_6000" });
    expect(describeSetup(results)).toContain("ctcg_data_api_business_2 (created; archived ctcg_data_api_business not reused)");
    expect(results[0]).toMatchObject({ productId: "ctcg_data_api_pro", created: { product: false, price: false } });

    archive(stripe.products.get("ctcg_data_api_business_2"));
    expect((await setUpDataApiStripePlans(stripe.client))[1]).toMatchObject({
      productId: "ctcg_data_api_business_3", replaced: { products: ["ctcg_data_api_business", "ctcg_data_api_business_2"] },
    });
    expect((await setUpDataApiStripePlans(stripe.client))[1]).toMatchObject({ productId: "ctcg_data_api_business_3", created: { product: false, price: false } });
  });

  it("stops, creating nothing, when every product id in a plan's line is archived", async () => {
    for (let generation = 1; generation <= 20; generation += 1) {
      const id = productIdFor("pro", generation);
      stripe.products.set(id, { id, object: "product", livemode: false, active: false } as unknown as Stripe.Product);
    }
    await expect(setUpDataApiStripePlans(stripe.client)).rejects.toThrow(/up to ctcg_data_api_pro_20 is archived; nothing was created/);
    expect(stripe.calls).toEqual({ productCreates: 0, priceCreates: 0 });
  });

  it("leaves a mismatched price alone and says so", async () => {
    await setUpDataApiStripePlans(stripe.client);
    (stripe.prices[0] as { unit_amount: number }).unit_amount = 999;
    await expect(setUpDataApiStripePlans(stripe.client)).rejects.toThrow(/does not match the catalogue; it was left alone/);
    (stripe.prices[0] as { unit_amount: number; product: string }).unit_amount = 1200;
    (stripe.prices[0] as { product: string }).product = "prod_someoneelse001";
    await expect(setUpDataApiStripePlans(stripe.client)).rejects.toThrow(/does not match the catalogue; it was left alone/);
    expect(stripe.calls.priceCreates).toBe(2);
  });

  it("prints ids and lookup keys only", async () => {
    const text = describeSetup(await setUpDataApiStripePlans(stripe.client));
    expect(text).toContain("DATA_API_STRIPE_PRICE_PRO=price_fake00000001");
    expect(text).toContain("DATA_API_STRIPE_PRICE_BUSINESS=price_fake00000002");
    expect(text).not.toMatch(/(?:sk|rk)_(?:test|live)_|whsec_/);
  });

  it("runs nothing on import and never prints the key", () => {
    expect(stripe.calls).toEqual({ productCreates: 0, priceCreates: 0 });
    const source = readFileSync(new URL("../../../../scripts/data-api-stripe-setup.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/console\.\w+\([^)]*\bkey\b/);
    expect(source).toMatch(/pathToFileURL\(process\.argv\[1\]\)\.href === import\.meta\.url/);
  });
});
