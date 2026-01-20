/**
 * Third-Party Integration Webhook Endpoint
 *
 * Receives webhooks from external services (Judge.me, Recharge, etc.)
 * Validates signatures, processes events, and awards points.
 *
 * Route: /api/integrations/webhooks/:provider
 * Example: /api/integrations/webhooks/judgeme
 *         /api/integrations/webhooks/recharge
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  processWebhook,
  extractSignature,
} from "~/services/integrations/webhook-handler.server";
import { hasAdapter, getAdapter } from "~/services/integrations/integration-manager.server";
import type { IntegrationProvider } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map URL-friendly provider names to IntegrationProvider enum values
 */
const PROVIDER_MAP: Record<string, IntegrationProvider> = {
  klaviyo: "KLAVIYO",
  omnisend: "OMNISEND",
  mailchimp: "MAILCHIMP",
  judgeme: "JUDGE_ME",
  "judge-me": "JUDGE_ME",
  loox: "LOOX",
  yotpo: "YOTPO_REVIEWS",
  stamped: "STAMPED",
  okendo: "OKENDO",
  recharge: "RECHARGE",
  loop: "LOOP_SUBSCRIPTIONS",
  bold: "BOLD_SUBSCRIPTIONS",
  appstle: "APPSTLE",
  skio: "SKIO",
  gorgias: "GORGIAS",
  zendesk: "ZENDESK",
  richpanel: "RICHPANEL",
  postscript: "POSTSCRIPT",
  attentive: "ATTENTIVE",
  triplewhale: "TRIPLE_WHALE",
  lifetimely: "LIFETIMELY",
  polar: "POLAR_ANALYTICS",
  zapier: "ZAPIER",
  make: "MAKE",
};

/**
 * Map provider names to their shop domain header
 */
const SHOP_HEADER_MAP: Record<IntegrationProvider, string> = {
  KLAVIYO: "X-Klaviyo-Shop",
  JUDGE_ME: "X-Shop-Domain",
  RECHARGE: "X-Recharge-Shop-Domain",
  GORGIAS: "X-Gorgias-Shop",
  // Default headers for other providers
  OMNISEND: "X-Shop-Domain",
  MAILCHIMP: "X-Shop-Domain",
  LOOX: "X-Shop-Domain",
  YOTPO_REVIEWS: "X-Shop-Domain",
  STAMPED: "X-Shop-Domain",
  OKENDO: "X-Shop-Domain",
  LOOP_SUBSCRIPTIONS: "X-Shop-Domain",
  BOLD_SUBSCRIPTIONS: "X-Shop-Domain",
  APPSTLE: "X-Shop-Domain",
  SKIO: "X-Shop-Domain",
  ZENDESK: "X-Shop-Domain",
  RICHPANEL: "X-Shop-Domain",
  POSTSCRIPT: "X-Shop-Domain",
  ATTENTIVE: "X-Shop-Domain",
  TRIPLE_WHALE: "X-Shop-Domain",
  LIFETIMELY: "X-Shop-Domain",
  POLAR_ANALYTICS: "X-Shop-Domain",
  ZAPIER: "X-Shop-Domain",
  MAKE: "X-Shop-Domain",
  CUSTOM_WEBHOOK: "X-Shop-Domain",
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function action({ request, params }: ActionFunctionArgs) {
  const providerSlug = params.provider?.toLowerCase();

  if (!providerSlug) {
    return json({ error: "Provider not specified" }, { status: 400 });
  }

  // Map slug to provider enum
  const provider = PROVIDER_MAP[providerSlug];
  if (!provider) {
    console.error(`[Webhook] Unknown provider slug: ${providerSlug}`);
    return json({ error: "Unknown provider" }, { status: 400 });
  }

  // Check if adapter exists
  if (!hasAdapter(provider)) {
    console.error(`[Webhook] No adapter for provider: ${provider}`);
    return json({ error: "Provider not supported" }, { status: 400 });
  }

  try {
    // Get raw payload
    const payload = await request.text();

    // Extract headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Get topic from headers (different providers use different headers)
    const topic = extractTopic(provider, headers);
    if (!topic) {
      console.warn(`[Webhook] No topic found for ${provider}`, { headers: Object.keys(headers) });
      return json({ error: "Missing webhook topic" }, { status: 400 });
    }

    // Get signature
    const signature = extractSignature(headers, provider);
    if (!signature) {
      console.warn(`[Webhook] No signature found for ${provider}`);
      return json({ error: "Missing webhook signature" }, { status: 401 });
    }

    // Get shop from headers or payload
    const shop = extractShop(provider, headers, payload);
    if (!shop) {
      console.warn(`[Webhook] No shop found for ${provider}`);
      return json({ error: "Missing shop identifier" }, { status: 400 });
    }

    console.log(`[Webhook] Processing ${provider} webhook: ${topic} for shop: ${shop}`);

    // Process the webhook
    const result = await processWebhook(shop, {
      provider,
      topic,
      payload,
      signature,
      headers,
    });

    if (result.status === "DUPLICATE") {
      return json({ success: true, message: "Duplicate webhook - already processed" });
    }

    if (!result.success) {
      console.error(`[Webhook] Processing failed: ${result.error}`, {
        provider,
        topic,
        shop,
        webhookId: result.webhookId,
      });

      // Still return 200 to prevent retries for validation errors
      if (result.error?.includes("signature") || result.error?.includes("not found")) {
        return json(
          { success: false, error: result.error },
          { status: 401 }
        );
      }

      return json({ success: false, error: result.error });
    }

    console.log(`[Webhook] Processed successfully`, {
      provider,
      topic,
      shop,
      webhookId: result.webhookId,
      pointsAwarded: result.pointsAwarded,
    });

    return json({
      success: true,
      webhookId: result.webhookId,
      pointsAwarded: result.pointsAwarded,
    });
  } catch (error) {
    console.error(`[Webhook] Unexpected error:`, error);

    // Return 200 to prevent infinite retries
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER - Return webhook info (for verification)
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ params }: LoaderFunctionArgs) {
  const providerSlug = params.provider?.toLowerCase();

  if (!providerSlug) {
    return json({ error: "Provider not specified" }, { status: 400 });
  }

  const provider = PROVIDER_MAP[providerSlug];
  if (!provider) {
    return json({ error: "Unknown provider" }, { status: 400 });
  }

  if (!hasAdapter(provider)) {
    return json({ error: "Provider not supported" }, { status: 400 });
  }

  const adapter = getAdapter(provider);
  const webhookConfig = adapter.config.webhooks;

  return json({
    provider,
    endpoint: `/api/integrations/webhooks/${providerSlug}`,
    signatureHeader: webhookConfig?.signatureHeader,
    supportedTopics: webhookConfig?.supportedTopics || [],
    message: "POST webhooks to this endpoint",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract webhook topic from headers based on provider
 */
function extractTopic(
  provider: IntegrationProvider,
  headers: Record<string, string>
): string | null {
  // Each provider may use different header names for the topic
  const topicHeaders: Record<IntegrationProvider, string[]> = {
    KLAVIYO: ["x-klaviyo-topic", "x-event-type"],
    JUDGE_ME: ["x-judgeme-topic", "x-event"],
    RECHARGE: ["x-recharge-topic", "x-event"],
    GORGIAS: ["x-gorgias-event", "x-event"],
    // Defaults for other providers
    OMNISEND: ["x-event-type"],
    MAILCHIMP: ["x-mc-webhook-type"],
    LOOX: ["x-loox-topic"],
    YOTPO_REVIEWS: ["x-yotpo-topic"],
    STAMPED: ["x-stamped-topic"],
    OKENDO: ["x-okendo-topic"],
    LOOP_SUBSCRIPTIONS: ["x-loop-topic"],
    BOLD_SUBSCRIPTIONS: ["x-bold-topic"],
    APPSTLE: ["x-appstle-topic"],
    SKIO: ["x-skio-topic"],
    ZENDESK: ["x-zendesk-webhook-type"],
    RICHPANEL: ["x-richpanel-event"],
    POSTSCRIPT: ["x-postscript-topic"],
    ATTENTIVE: ["x-attentive-topic"],
    TRIPLE_WHALE: ["x-tw-topic"],
    LIFETIMELY: ["x-lifetimely-topic"],
    POLAR_ANALYTICS: ["x-polar-topic"],
    ZAPIER: ["x-rewardspro-event"], // Zapier uses our custom header
    MAKE: ["x-rewardspro-event"],
    CUSTOM_WEBHOOK: ["x-webhook-topic", "x-event-type"],
  };

  const possibleHeaders = topicHeaders[provider] || ["x-webhook-topic"];

  for (const header of possibleHeaders) {
    const value = headers[header.toLowerCase()];
    if (value) {
      return value;
    }
  }

  // Try generic headers as fallback
  return headers["x-event-type"] || headers["x-webhook-topic"] || null;
}

/**
 * Extract shop domain from headers or payload
 */
function extractShop(
  provider: IntegrationProvider,
  headers: Record<string, string>,
  payload: string
): string | null {
  // Try provider-specific header first
  const shopHeader = SHOP_HEADER_MAP[provider];
  if (shopHeader && headers[shopHeader.toLowerCase()]) {
    return headers[shopHeader.toLowerCase()];
  }

  // Try common headers
  const commonHeaders = [
    "x-shop-domain",
    "x-shopify-shop-domain",
    "x-store-domain",
  ];

  for (const header of commonHeaders) {
    if (headers[header]) {
      return headers[header];
    }
  }

  // Try to extract from payload
  try {
    const parsed = JSON.parse(payload);

    // Check common payload fields
    const shopFields = [
      "shop_domain",
      "shopDomain",
      "shop",
      "store_domain",
      "storeDomain",
    ];

    for (const field of shopFields) {
      if (parsed[field] && typeof parsed[field] === "string") {
        return parsed[field];
      }
    }

    // Check nested fields
    if (parsed.data?.shop_domain) return parsed.data.shop_domain;
    if (parsed.meta?.shop_domain) return parsed.meta.shop_domain;
  } catch {
    // Ignore parse errors
  }

  return null;
}
