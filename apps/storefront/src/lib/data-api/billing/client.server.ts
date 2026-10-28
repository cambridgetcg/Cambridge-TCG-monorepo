import "server-only";
import Stripe from "stripe";
import { readDataApiBillingConfig, type DataApiBillingConfig } from "./config.server";

export function createDataApiStripeTestClient(config: DataApiBillingConfig): Stripe {
  return new Stripe(config.secretKey, {
    apiVersion: config.apiVersion,
    maxNetworkRetries: 2,
    appInfo: { name: "Cambridge TCG data-API test billing", version: "1" },
  });
}

let cached: { readonly identity: string; readonly client: Stripe } | undefined;

/** Lazy, so builds and other routes never need or share this key. */
export function getDataApiStripeTestClient(config: DataApiBillingConfig = readDataApiBillingConfig()): Stripe {
  const identity = `${config.apiVersion}:${config.secretKey}`;
  if (cached?.identity === identity) return cached.client;
  const client = createDataApiStripeTestClient(config);
  cached = { identity, client };
  return client;
}
