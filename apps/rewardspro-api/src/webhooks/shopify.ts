import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { parseExactJson } from "../exact-json.js";

const ShopifyTopicSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_]+\/[a-z0-9_]+$/);

const ShopifyShopDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/);

const ShopifyWebhookIdSchema = z.string().trim().min(1).max(255);

export interface ShopifyWebhookHeaders {
  hmac: string;
  shopDomain: string;
  topic: string;
  triggeredAt: string | null;
  webhookId: string;
}

export class InvalidShopifyWebhookError extends Error {
  override readonly name = "InvalidShopifyWebhookError";
}

export function verifyShopifyHmac(
  rawBody: Buffer,
  suppliedHmac: string,
  secret: string,
): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(suppliedHmac)) {
    return false;
  }

  const supplied = Buffer.from(suppliedHmac, "base64");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function parseShopifyWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): ShopifyWebhookHeaders {
  const hmac = singleHeader(headers["x-shopify-hmac-sha256"]);
  const topic = ShopifyTopicSchema.safeParse(
    singleHeader(headers["x-shopify-topic"]),
  );
  const shopDomain = ShopifyShopDomainSchema.safeParse(
    singleHeader(headers["x-shopify-shop-domain"]),
  );
  const webhookId = ShopifyWebhookIdSchema.safeParse(
    singleHeader(headers["x-shopify-webhook-id"]),
  );
  const triggeredAtValue = singleHeader(headers["x-shopify-triggered-at"]);
  const triggeredAt =
    triggeredAtValue === undefined
      ? { success: true as const, data: null }
      : z.string().datetime({ offset: true }).safeParse(triggeredAtValue);

  if (
    hmac === undefined ||
    !topic.success ||
    !shopDomain.success ||
    !webhookId.success ||
    !triggeredAt.success
  ) {
    throw new InvalidShopifyWebhookError("Invalid Shopify webhook headers");
  }

  return {
    hmac,
    shopDomain: shopDomain.data,
    topic: topic.data,
    triggeredAt: triggeredAt.data,
    webhookId: webhookId.data,
  };
}

export function parseShopifyPayload(rawBody: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parseExactJson(rawBody.toString("utf8"));
  } catch {
    throw new InvalidShopifyWebhookError("Invalid Shopify webhook body");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new InvalidShopifyWebhookError("Invalid Shopify webhook body");
  }
  return parsed as Record<string, unknown>;
}

function singleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
