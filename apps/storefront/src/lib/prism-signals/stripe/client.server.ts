import "server-only";
import Stripe from "stripe";
import {
  readPrismStripeSandboxConfig,
  type PrismStripeSandboxConfigV1,
} from "./config.server";

export function createPrismStripeTestClient(
  config: PrismStripeSandboxConfigV1,
): Stripe {
  return new Stripe(config.secretKey, {
    apiVersion: config.apiVersion,
    maxNetworkRetries: 2,
    appInfo: {
      name: "Cambridge TCG PRISM Signals sandbox",
      version: "1",
    },
  });
}

let cached:
  | { readonly identity: string; readonly client: Stripe }
  | undefined;

/** Lazy so builds and non-PRISM routes never require or share this secret. */
export function getPrismStripeTestClient(
  config: PrismStripeSandboxConfigV1 = readPrismStripeSandboxConfig(),
): Stripe {
  const identity = `${config.accountId}:${config.apiVersion}:${config.secretKey}`;
  if (cached?.identity === identity) return cached.client;
  const client = createPrismStripeTestClient(config);
  cached = { identity, client };
  return client;
}
