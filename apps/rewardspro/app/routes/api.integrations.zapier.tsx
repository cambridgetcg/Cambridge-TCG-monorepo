/**
 * Zapier Integration API Endpoint
 *
 * Handles Zapier actions (inbound API calls from Zapier) and
 * webhook subscription management (for triggers).
 *
 * Actions:
 *   POST /api/integrations/zapier?action=award_points
 *   POST /api/integrations/zapier?action=deduct_points
 *   POST /api/integrations/zapier?action=find_customer
 *   POST /api/integrations/zapier?action=get_tier
 *   POST /api/integrations/zapier?action=set_tier
 *
 * Webhook Subscriptions (for Zapier triggers):
 *   POST /api/integrations/zapier/subscribe
 *   DELETE /api/integrations/zapier/unsubscribe
 *   GET /api/integrations/zapier/subscriptions
 *
 * Authentication: API Key via X-RewardsPro-Api-Key header
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { createLogger } from "~/services/logger.server";
import { decrypt } from "~/utils/encryption";
import { getIntegration } from "~/services/integrations/integration-manager.server";
import {
  addWebhookSubscription,
  removeWebhookSubscription,
  isValidApiKeyFormat,
  type ZapierTriggerSubscription,
} from "~/services/integrations/adapters/zapier-adapter.server";

const logger = createLogger("ZapierAPI");

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

interface AuthResult {
  success: boolean;
  shop?: string;
  error?: string;
}

/**
 * Authenticate Zapier request via API key
 */
async function authenticateZapierRequest(request: Request): Promise<AuthResult> {
  const apiKey = request.headers.get("X-RewardsPro-Api-Key");

  if (!apiKey) {
    return { success: false, error: "Missing API key" };
  }

  if (!isValidApiKeyFormat(apiKey)) {
    return { success: false, error: "Invalid API key format" };
  }

  // Find integration with this API key
  const integrations = await db.integration.findMany({
    where: {
      provider: "ZAPIER",
      status: "CONNECTED",
    },
    select: {
      id: true,
      shop: true,
      apiKey: true,
    },
  });

  // Check each integration's API key
  for (const integration of integrations) {
    if (integration.apiKey) {
      try {
        const decryptedKey = decrypt(integration.apiKey);
        if (decryptedKey === apiKey) {
          return { success: true, shop: integration.shop };
        }
      } catch {
        // Skip integrations with invalid encrypted keys
        continue;
      }
    }
  }

  return { success: false, error: "Invalid API key" };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER - GET requests
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Health check / info endpoint
  if (!action) {
    return json({
      provider: "ZAPIER",
      version: "1.0",
      endpoints: {
        actions: "/api/integrations/zapier?action={action}",
        subscribe: "/api/integrations/zapier (POST with action=subscribe)",
        unsubscribe: "/api/integrations/zapier (DELETE with action=unsubscribe)",
      },
      availableActions: [
        "award_points",
        "deduct_points",
        "find_customer",
        "get_tier",
        "set_tier",
      ],
      triggerEvents: [
        "customer.tier_changed",
        "points.earned",
        "points.redeemed",
        "cashback.earned",
        "raffle.winner_selected",
      ],
      authentication: "API Key via X-RewardsPro-Api-Key header",
    });
  }

  // Authenticate
  const auth = await authenticateZapierRequest(request);
  if (!auth.success || !auth.shop) {
    return json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  // Handle GET actions
  switch (action) {
    case "subscriptions":
      return handleGetSubscriptions(auth.shop);

    case "test_auth":
      return handleTestAuth(auth.shop);

    default:
      return json({ error: `Unknown GET action: ${action}` }, { status: 400 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION - POST/PUT/DELETE requests
// ═══════════════════════════════════════════════════════════════════════════

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();

  // Authenticate
  const auth = await authenticateZapierRequest(request);
  if (!auth.success || !auth.shop) {
    return json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const shop = auth.shop;

  try {
    const url = new URL(request.url);
    const actionType = url.searchParams.get("action");
    const body = await request.json().catch(() => ({}));

    logger.info("Zapier API request", {
      shop,
      method,
      action: actionType,
    });

    // Route to appropriate handler
    switch (method) {
      case "POST":
        return handlePostAction(shop, actionType, body);

      case "DELETE":
        return handleDeleteAction(shop, actionType, body);

      default:
        return json({ error: "Method not allowed" }, { status: 405 });
    }
  } catch (error) {
    logger.error("Zapier API error", {
      shop,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function handlePostAction(
  shop: string,
  actionType: string | null,
  body: Record<string, unknown>
) {
  switch (actionType) {
    case "award_points":
      return handleAwardPoints(shop, body);

    case "deduct_points":
      return handleDeductPoints(shop, body);

    case "find_customer":
      return handleFindCustomer(shop, body);

    case "get_tier":
      return handleGetTier(shop, body);

    case "set_tier":
      return handleSetTier(shop, body);

    case "subscribe":
      return handleSubscribe(shop, body);

    default:
      return json({ error: `Unknown action: ${actionType}` }, { status: 400 });
  }
}

/**
 * Award points to a customer
 */
async function handleAwardPoints(
  shop: string,
  body: { email?: string; customer_id?: string; points?: number; reason?: string }
) {
  const { email, customer_id, points, reason } = body;

  if (!points || typeof points !== "number" || points <= 0) {
    return json({ error: "Valid positive points amount required" }, { status: 400 });
  }

  if (!email && !customer_id) {
    return json({ error: "Either email or customer_id required" }, { status: 400 });
  }

  // Find customer
  const customer = await findCustomerByEmailOrId(shop, email, customer_id);
  if (!customer) {
    return json({ error: "Customer not found" }, { status: 404 });
  }

  // Award points
  const updatedCustomer = await db.customer.update({
    where: { id: customer.id },
    data: {
      totalPointsEarned: { increment: points },
      currentPoints: { increment: points },
    },
  });

  // Create ledger entry
  await db.pointsLedger.create({
    data: {
      shop,
      customerId: customer.id,
      type: "EARNED",
      points,
      source: "INTEGRATION",
      reason: reason || "Awarded via Zapier",
      metadata: {
        provider: "ZAPIER",
        action: "award_points",
      },
    },
  });

  logger.info("Points awarded via Zapier", {
    shop,
    customerId: customer.id,
    points,
  });

  return json({
    success: true,
    customer_id: customer.id,
    email: customer.email,
    points_awarded: points,
    new_balance: updatedCustomer.currentPoints,
    new_total_earned: updatedCustomer.totalPointsEarned,
  });
}

/**
 * Deduct points from a customer
 */
async function handleDeductPoints(
  shop: string,
  body: { email?: string; customer_id?: string; points?: number; reason?: string }
) {
  const { email, customer_id, points, reason } = body;

  if (!points || typeof points !== "number" || points <= 0) {
    return json({ error: "Valid positive points amount required" }, { status: 400 });
  }

  if (!email && !customer_id) {
    return json({ error: "Either email or customer_id required" }, { status: 400 });
  }

  // Find customer
  const customer = await findCustomerByEmailOrId(shop, email, customer_id);
  if (!customer) {
    return json({ error: "Customer not found" }, { status: 404 });
  }

  // Check sufficient balance
  if (customer.currentPoints < points) {
    return json(
      {
        error: "Insufficient points balance",
        current_balance: customer.currentPoints,
        requested: points,
      },
      { status: 400 }
    );
  }

  // Deduct points
  const updatedCustomer = await db.customer.update({
    where: { id: customer.id },
    data: {
      currentPoints: { decrement: points },
    },
  });

  // Create ledger entry
  await db.pointsLedger.create({
    data: {
      shop,
      customerId: customer.id,
      type: "REDEEMED",
      points: -points,
      source: "INTEGRATION",
      reason: reason || "Deducted via Zapier",
      metadata: {
        provider: "ZAPIER",
        action: "deduct_points",
      },
    },
  });

  logger.info("Points deducted via Zapier", {
    shop,
    customerId: customer.id,
    points,
  });

  return json({
    success: true,
    customer_id: customer.id,
    email: customer.email,
    points_deducted: points,
    new_balance: updatedCustomer.currentPoints,
  });
}

/**
 * Find customer by email or ID
 */
async function handleFindCustomer(
  shop: string,
  body: { email?: string; customer_id?: string; shopify_customer_id?: string }
) {
  const { email, customer_id, shopify_customer_id } = body;

  if (!email && !customer_id && !shopify_customer_id) {
    return json(
      { error: "Either email, customer_id, or shopify_customer_id required" },
      { status: 400 }
    );
  }

  let customer = null;

  if (customer_id) {
    customer = await db.customer.findUnique({
      where: { id: customer_id },
      include: { tier: true },
    });
  } else if (email) {
    customer = await db.customer.findUnique({
      where: { shop_email: { shop, email: email.toLowerCase() } },
      include: { tier: true },
    });
  } else if (shopify_customer_id) {
    customer = await db.customer.findUnique({
      where: { shop_shopifyCustomerId: { shop, shopifyCustomerId: shopify_customer_id } },
      include: { tier: true },
    });
  }

  if (!customer) {
    return json({ error: "Customer not found" }, { status: 404 });
  }

  return json({
    success: true,
    customer: {
      id: customer.id,
      email: customer.email,
      shopify_customer_id: customer.shopifyCustomerId,
      first_name: customer.firstName,
      last_name: customer.lastName,
      current_points: customer.currentPoints,
      total_points_earned: customer.totalPointsEarned,
      tier: customer.tier
        ? {
            id: customer.tier.id,
            name: customer.tier.name,
            level: customer.tier.level,
          }
        : null,
      created_at: customer.createdAt.toISOString(),
    },
  });
}

/**
 * Get customer's current tier
 */
async function handleGetTier(
  shop: string,
  body: { email?: string; customer_id?: string }
) {
  const { email, customer_id } = body;

  if (!email && !customer_id) {
    return json({ error: "Either email or customer_id required" }, { status: 400 });
  }

  const customer = await findCustomerByEmailOrId(shop, email, customer_id);
  if (!customer) {
    return json({ error: "Customer not found" }, { status: 404 });
  }

  const customerWithTier = await db.customer.findUnique({
    where: { id: customer.id },
    include: { tier: true },
  });

  return json({
    success: true,
    customer_id: customer.id,
    email: customer.email,
    tier: customerWithTier?.tier
      ? {
          id: customerWithTier.tier.id,
          name: customerWithTier.tier.name,
          level: customerWithTier.tier.level,
          min_points: customerWithTier.tier.minPoints,
        }
      : null,
  });
}

/**
 * Set customer's tier
 */
async function handleSetTier(
  shop: string,
  body: { email?: string; customer_id?: string; tier_id?: string; tier_name?: string }
) {
  const { email, customer_id, tier_id, tier_name } = body;

  if (!email && !customer_id) {
    return json({ error: "Either email or customer_id required" }, { status: 400 });
  }

  if (!tier_id && !tier_name) {
    return json({ error: "Either tier_id or tier_name required" }, { status: 400 });
  }

  // Find customer
  const customer = await findCustomerByEmailOrId(shop, email, customer_id);
  if (!customer) {
    return json({ error: "Customer not found" }, { status: 404 });
  }

  // Find tier
  let tier = null;
  if (tier_id) {
    tier = await db.tier.findUnique({ where: { id: tier_id } });
  } else if (tier_name) {
    tier = await db.tier.findFirst({
      where: { shop, name: { equals: tier_name, mode: "insensitive" } },
    });
  }

  if (!tier) {
    return json({ error: "Tier not found" }, { status: 404 });
  }

  // Update customer's tier
  const updatedCustomer = await db.customer.update({
    where: { id: customer.id },
    data: { tierId: tier.id },
    include: { tier: true },
  });

  logger.info("Tier set via Zapier", {
    shop,
    customerId: customer.id,
    tierId: tier.id,
    tierName: tier.name,
  });

  return json({
    success: true,
    customer_id: customer.id,
    email: customer.email,
    tier: {
      id: tier.id,
      name: tier.name,
      level: tier.level,
    },
  });
}

/**
 * Subscribe to a trigger event (webhook)
 */
async function handleSubscribe(
  shop: string,
  body: Record<string, unknown>
) {
  const { event, target_url } = body as { event?: string; target_url?: string };

  if (!event || !target_url) {
    return json({ error: "event and target_url required" }, { status: 400 });
  }

  // Validate URL
  try {
    new URL(target_url);
  } catch {
    return json({ error: "Invalid target_url" }, { status: 400 });
  }

  // Get integration
  const integration = await getIntegration(shop, "ZAPIER");
  if (!integration) {
    return json({ error: "Zapier integration not configured" }, { status: 400 });
  }

  // Get current subscriptions
  const metadata = integration.metadata as Record<string, unknown>;
  const currentSubscriptions =
    (metadata?.webhookSubscriptions as ZapierTriggerSubscription[]) || [];

  // Check for duplicate
  const existingSubscription = currentSubscriptions.find(
    (sub) => sub.event === event && sub.targetUrl === target_url
  );
  if (existingSubscription) {
    return json({
      success: true,
      subscription_id: existingSubscription.id,
      message: "Subscription already exists",
    });
  }

  // Add new subscription
  const updatedSubscriptions = addWebhookSubscription(
    currentSubscriptions,
    event,
    target_url
  );

  // Save to integration
  await db.integration.update({
    where: { id: integration.id },
    data: {
      metadata: {
        ...metadata,
        webhookSubscriptions: updatedSubscriptions,
      },
    },
  });

  const newSubscription = updatedSubscriptions[updatedSubscriptions.length - 1];

  logger.info("Zapier webhook subscription added", {
    shop,
    event,
    subscriptionId: newSubscription.id,
  });

  return json({
    success: true,
    subscription_id: newSubscription.id,
    event,
    target_url,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function handleDeleteAction(
  shop: string,
  actionType: string | null,
  body: Record<string, unknown>
) {
  switch (actionType) {
    case "unsubscribe":
      return handleUnsubscribe(shop, body);

    default:
      return json({ error: `Unknown DELETE action: ${actionType}` }, { status: 400 });
  }
}

/**
 * Unsubscribe from a trigger event
 */
async function handleUnsubscribe(
  shop: string,
  body: { subscription_id?: string; target_url?: string }
) {
  const { subscription_id, target_url } = body;

  if (!subscription_id && !target_url) {
    return json(
      { error: "Either subscription_id or target_url required" },
      { status: 400 }
    );
  }

  // Get integration
  const integration = await getIntegration(shop, "ZAPIER");
  if (!integration) {
    return json({ error: "Zapier integration not configured" }, { status: 400 });
  }

  // Get current subscriptions
  const metadata = integration.metadata as Record<string, unknown>;
  const currentSubscriptions =
    (metadata?.webhookSubscriptions as ZapierTriggerSubscription[]) || [];

  // Find subscription to remove
  let subscriptionToRemove: ZapierTriggerSubscription | undefined;

  if (subscription_id) {
    subscriptionToRemove = currentSubscriptions.find((sub) => sub.id === subscription_id);
  } else if (target_url) {
    subscriptionToRemove = currentSubscriptions.find((sub) => sub.targetUrl === target_url);
  }

  if (!subscriptionToRemove) {
    return json({ error: "Subscription not found" }, { status: 404 });
  }

  // Remove subscription
  const updatedSubscriptions = removeWebhookSubscription(
    currentSubscriptions,
    subscriptionToRemove.id
  );

  // Save to integration
  await db.integration.update({
    where: { id: integration.id },
    data: {
      metadata: {
        ...metadata,
        webhookSubscriptions: updatedSubscriptions,
      },
    },
  });

  logger.info("Zapier webhook subscription removed", {
    shop,
    subscriptionId: subscriptionToRemove.id,
  });

  return json({
    success: true,
    removed_subscription_id: subscriptionToRemove.id,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all webhook subscriptions
 */
async function handleGetSubscriptions(shop: string) {
  const integration = await getIntegration(shop, "ZAPIER");
  if (!integration) {
    return json({ error: "Zapier integration not configured" }, { status: 400 });
  }

  const metadata = integration.metadata as Record<string, unknown>;
  const subscriptions =
    (metadata?.webhookSubscriptions as ZapierTriggerSubscription[]) || [];

  return json({
    success: true,
    subscriptions: subscriptions.map((sub) => ({
      id: sub.id,
      event: sub.event,
      target_url: sub.targetUrl,
      enabled: sub.enabled,
      created_at: sub.createdAt,
    })),
  });
}

/**
 * Test authentication
 */
async function handleTestAuth(shop: string) {
  return json({
    success: true,
    shop,
    message: "Authentication successful",
    timestamp: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find customer by email or internal ID
 */
async function findCustomerByEmailOrId(
  shop: string,
  email?: string,
  customerId?: string
) {
  if (customerId) {
    return db.customer.findUnique({
      where: { id: customerId },
    });
  }

  if (email) {
    return db.customer.findUnique({
      where: { shop_email: { shop, email: email.toLowerCase() } },
    });
  }

  return null;
}
