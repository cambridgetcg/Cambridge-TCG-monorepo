#!/usr/bin/env node

/**
 * Creates the data-API plans' products and monthly GBP prices in Stripe test
 * mode, from src/lib/data-api/plans.ts (docs/plans/tcg-data-platform/paid-data-api.md §6).
 *
 * Idempotent: each paid plan's product has a fixed id and each price a lookup
 * key that names its amount, so a rerun reuses what exists and a changed
 * catalogue price gets a new price beside the old one. An existing object that
 * does not match the catalogue is reported and left alone, never rewritten.
 * An archived (active: false) product or price is never reused, since Checkout
 * refuses it: an archived product is followed by the next id in its line
 * (ctcg_data_api_pro, then ctcg_data_api_pro_2, ...), an archived price is
 * replaced by a new one that takes its lookup key, and the output names what
 * was replaced. Refuses any key that is not rk_test_ or sk_test_. Prints ids
 * only, never the key. Not run as part of the 2026-10-28 work; the plan prices
 * are proposals. Checkout sells a price only if it is what this script makes:
 * the product's metadata type and plan, the plan's amount, monthly, licensed
 * (dataApiPriceProblems in src/lib/data-api/billing/provider-contract.server.ts).
 *
 *   DATA_API_STRIPE_SECRET_KEY=<test key> pnpm --filter cambridgetcg-storefront exec tsx scripts/data-api-stripe-setup.ts
 */

import { pathToFileURL } from "node:url";
import Stripe from "stripe";
import { DATA_API_PLANS, DATA_API_PLANS_VERSION, type DataApiPlan } from "../src/lib/data-api/plans";

export const DATA_API_SETUP_API_VERSION = "2026-02-25.clover" as const;
const TEST_KEY = /^(?:rk|sk)_test_[A-Za-z0-9_]{16,240}$/;

type PaidPlan = DataApiPlan & { id: "pro" | "business" };

export interface DataApiStripeSetupClient {
  products: {
    retrieve(id: string): Promise<Stripe.Product>;
    create(params: Stripe.ProductCreateParams, options?: Stripe.RequestOptions): Promise<Stripe.Product>;
  };
  prices: {
    list(params: Stripe.PriceListParams): Promise<{ data: Stripe.Price[]; has_more: boolean }>;
    create(params: Stripe.PriceCreateParams, options?: Stripe.RequestOptions): Promise<Stripe.Price>;
  };
}

export interface DataApiPlanSetup {
  readonly planId: "pro" | "business";
  readonly productId: string;
  readonly priceId: string;
  readonly lookupKey: string;
  readonly created: { readonly product: boolean; readonly price: boolean };
  /** Archived objects found and not reused, for the output to name. */
  readonly replaced: { readonly products: readonly string[]; readonly price: string | null };
}

export class DataApiSetupRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataApiSetupRefusal";
  }
}

/** A plan's product ids, in order: an archived product is followed by the next. */
export const productIdFor = (planId: PaidPlan["id"], generation = 1) =>
  generation === 1 ? `ctcg_data_api_${planId}` : `ctcg_data_api_${planId}_${generation}`;
const PRODUCT_GENERATIONS = 20;
export const lookupKeyFor = (plan: PaidPlan) => `ctcg_data_api_${plan.id}_gbp_month_${plan.price.amountPence}`;

export function assertTestKey(key: string | undefined): string {
  const trimmed = key?.trim() ?? "";
  if (!TEST_KEY.test(trimmed)) {
    throw new DataApiSetupRefusal("DATA_API_STRIPE_SECRET_KEY must be a test-mode key (rk_test_ or sk_test_); nothing was sent to Stripe.");
  }
  return trimmed;
}

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "resource_missing";
}

const paidPlans = (plans: typeof DATA_API_PLANS): PaidPlan[] =>
  Object.values(plans).filter((plan): plan is PaidPlan => plan.id !== "free" && plan.price.amountPence > 0);

async function ensureProduct(
  stripe: DataApiStripeSetupClient,
  plan: PaidPlan,
): Promise<{ product: Stripe.Product; created: boolean; archived: string[] }> {
  const archived: string[] = [];
  for (let generation = 1; generation <= PRODUCT_GENERATIONS; generation += 1) {
    const id = productIdFor(plan.id, generation);
    try {
      const product = await stripe.products.retrieve(id);
      if (product.livemode !== false) throw new DataApiSetupRefusal(`${id} is not a test-mode product.`);
      // An archived product keeps its id, so its successor takes the next one.
      if (product.active !== true) {
        archived.push(id);
        continue;
      }
      return { product, created: false, archived };
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const product = await stripe.products.create({
      id,
      name: `Cambridge TCG data API: ${plan.name}`,
      description: `Derived market data (${plan.permittedUse})`,
      metadata: { type: "data_api_subscription", plan: plan.id, catalogue: DATA_API_PLANS_VERSION },
    }, { idempotencyKey: `data-api-setup:product:${id}` });
    return { product, created: true, archived };
  }
  throw new DataApiSetupRefusal(`Every ${plan.id} product id up to ${productIdFor(plan.id, PRODUCT_GENERATIONS)} is archived; nothing was created.`);
}

async function ensurePrice(
  stripe: DataApiStripeSetupClient,
  plan: PaidPlan,
  productId: string,
  archivedProducts: readonly string[],
): Promise<{ price: Stripe.Price; created: boolean; replaced: string | null }> {
  const lookupKey = lookupKeyFor(plan);
  // The list includes archived prices: a lookup key stays on its price when the price is archived.
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 2 });
  if (found.has_more || found.data.length > 1) throw new DataApiSetupRefusal(`More than one price answers ${lookupKey}.`);
  const existing = found.data[0];
  let replaced: string | null = null;
  if (existing) {
    const product = typeof existing.product === "string" ? existing.product : existing.product.id;
    if (existing.livemode !== false) throw new DataApiSetupRefusal(`${existing.id} answers ${lookupKey} but is not a test-mode price; it was left alone.`);
    if (existing.active !== true || archivedProducts.includes(product)) {
      // Archived, or sold under an archived product: Checkout would refuse it. A new price takes the key.
      replaced = existing.id;
    } else if (
      product !== productId || existing.currency !== "gbp"
      || existing.unit_amount !== plan.price.amountPence || existing.recurring?.interval !== "month"
      || existing.recurring?.interval_count !== 1 || existing.recurring?.usage_type !== "licensed" || existing.type !== "recurring"
    ) {
      throw new DataApiSetupRefusal(`${existing.id} answers ${lookupKey} but does not match the catalogue; it was left alone.`);
    } else {
      return { price: existing, created: false, replaced: null };
    }
  }
  // A replacement gets its own key: replaying the first creation's key would hand back the archived price.
  const idempotencyKey = replaced === null ? `data-api-setup:price:${lookupKey}` : `data-api-setup:price:${lookupKey}:replaces:${replaced}`;
  const price = await stripe.prices.create({
    product: productId,
    currency: "gbp",
    unit_amount: plan.price.amountPence,
    // Licensed, one seat: checkout refuses a metered price (dataApiPriceProblems).
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    // plans.ts prices exclude VAT; VAT treatment is still Yu's to set.
    tax_behavior: "exclusive",
    lookup_key: lookupKey,
    metadata: { type: "data_api_subscription", plan: plan.id, catalogue: DATA_API_PLANS_VERSION, proposed: String(plan.price.proposed) },
    // Moves the lookup key off the price being replaced, in the same request.
    ...(replaced === null ? {} : { transfer_lookup_key: true }),
  }, { idempotencyKey });
  return { price, created: true, replaced };
}

export async function setUpDataApiStripePlans(
  stripe: DataApiStripeSetupClient,
  plans: typeof DATA_API_PLANS = DATA_API_PLANS,
): Promise<DataApiPlanSetup[]> {
  const results: DataApiPlanSetup[] = [];
  for (const plan of paidPlans(plans)) {
    if (plan.price.currency !== "GBP" || plan.price.interval !== "month") {
      throw new DataApiSetupRefusal(`The ${plan.id} plan is not a monthly GBP price.`);
    }
    const { product, created: productCreated, archived } = await ensureProduct(stripe, plan);
    const { price, created: priceCreated, replaced } = await ensurePrice(stripe, plan, product.id, archived);
    if (price.livemode !== false) throw new DataApiSetupRefusal(`${price.id} is not a test-mode price.`);
    results.push(Object.freeze({
      planId: plan.id, productId: product.id, priceId: price.id, lookupKey: lookupKeyFor(plan),
      created: Object.freeze({ product: productCreated, price: priceCreated }),
      replaced: Object.freeze({ products: Object.freeze([...archived]), price: replaced }),
    }));
  }
  return results;
}

/** Ids and lookup keys only, ready to paste as environment values. */
export function describeSetup(results: readonly DataApiPlanSetup[]): string {
  const state = (created: boolean, archived: readonly string[]) =>
    `${created ? "created" : "existing"}${archived.length > 0 ? `; archived ${archived.join(", ")} not reused` : ""}`;
  const lines = results.map(r => `${r.planId}: ${r.productId} (${state(r.created.product, r.replaced.products)}), ${r.priceId} (${state(r.created.price, r.replaced.price === null ? [] : [r.replaced.price])}), lookup ${r.lookupKey}`);
  for (const r of results) lines.push(`DATA_API_STRIPE_PRICE_${r.planId.toUpperCase()}=${r.priceId}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const key = assertTestKey(process.env.DATA_API_STRIPE_SECRET_KEY);
  const stripe = new Stripe(key, { apiVersion: DATA_API_SETUP_API_VERSION, maxNetworkRetries: 2 });
  console.log(describeSetup(await setUpDataApiStripePlans(stripe)));
}

if (typeof process.argv[1] === "string" && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof DataApiSetupRefusal ? error.message : `Setup failed: ${error instanceof Error ? error.name : "UnknownError"}`);
    process.exitCode = 1;
  });
}
