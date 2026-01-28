/**
 * Integrations API Route
 *
 * Handles integration management operations:
 * - GET: List all integrations for a shop
 * - POST: Create/connect a new integration
 * - PUT: Update integration settings
 * - DELETE: Disconnect an integration
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  getIntegrations,
  getIntegration,
  upsertIntegration,
  storeApiKey,
  disconnectIntegration,
  updateEnabledFeatures,
  testConnection,
} from "~/services/integrations/integration-manager.server";
import type { IntegrationProvider } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION ACCESS (RATE-BASED MODEL)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if shop has access to a specific integration provider
 * Rate-based model: All plans have access to all integrations
 * Limits (like API call counts) differentiate plans
 */
async function checkIntegrationAccess(
  _shop: string,
  _provider: IntegrationProvider
): Promise<{ hasAccess: boolean; error?: object }> {
  // Rate-based model: All integrations enabled for all plans
  return { hasAccess: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER - List integrations
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider") as IntegrationProvider | null;

    // Get specific integration or all integrations
    if (provider) {
      const integration = await getIntegration(session.shop, provider);
      return json({
        success: true,
        integration,
      });
    }

    const integrations = await getIntegrations(session.shop);
    return json({
      success: true,
      integrations,
    });
  } catch (error) {
    console.error("[IntegrationsAPI] Error listing integrations:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list integrations",
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION - Manage integrations
// ═══════════════════════════════════════════════════════════════════════════

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = request.method.toUpperCase();

  try {
    const body = await request.json();

    switch (method) {
      case "POST":
        return handleConnect(session.shop, body);

      case "PUT":
        return handleUpdate(session.shop, body);

      case "DELETE":
        return handleDisconnect(session.shop, body);

      default:
        return json({ error: "Method not allowed" }, { status: 405 });
    }
  } catch (error) {
    console.error("[IntegrationsAPI] Error processing action:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle connecting a new integration
 */
async function handleConnect(
  shop: string,
  body: {
    provider: IntegrationProvider;
    apiKey?: string;
    apiSecret?: string;
    webhookSecret?: string;
    config?: Record<string, unknown>;
  }
) {
  const { provider, apiKey, webhookSecret, config } = body;

  if (!provider) {
    return json(
      { success: false, error: "Provider is required" },
      { status: 400 }
    );
  }

  // Check integration feature access
  const accessCheck = await checkIntegrationAccess(shop, provider);
  if (!accessCheck.hasAccess) {
    console.log(`[IntegrationsAPI] Access denied for ${provider} - shop: ${shop}`);
    return json(
      {
        success: false,
        error: "Integration not available on your plan",
        code: "FEATURE_NOT_AVAILABLE",
        ...accessCheck.error,
      },
      { status: 403 }
    );
  }

  console.log(`[IntegrationsAPI] Connecting ${provider} for shop: ${shop}`);

  // Connect the integration
  let integration;
  if (apiKey) {
    // Use storeApiKey for API key-based integrations
    integration = await storeApiKey(shop, provider, apiKey, webhookSecret);
  } else {
    // Create integration record (OAuth will be handled separately)
    integration = await upsertIntegration(shop, provider, {
      config: config as object,
    });
  }

  // Test the connection if credentials provided
  if (apiKey) {
    const testResult = await testConnection(shop, provider);
    if (!testResult.success) {
      return json({
        success: true,
        integration,
        warning: "Integration created but connection test failed",
        testResult,
      });
    }
  }

  return json({
    success: true,
    integration,
    message: `${provider} integration connected successfully`,
  });
}

/**
 * Handle updating integration settings
 */
async function handleUpdate(
  shop: string,
  body: {
    provider: IntegrationProvider;
    action?: "test" | "update";
    settings?: {
      enabledFeatures?: string[];
      pointsConfig?: Record<string, unknown>;
      config?: Record<string, unknown>;
    };
  }
) {
  const { provider, action, settings } = body;

  if (!provider) {
    return json(
      { success: false, error: "Provider is required" },
      { status: 400 }
    );
  }

  // Handle test action
  if (action === "test") {
    console.log(`[IntegrationsAPI] Testing ${provider} connection for shop: ${shop}`);
    const testResult = await testConnection(shop, provider);
    return json({
      success: testResult.success,
      testResult,
    });
  }

  // Handle settings update
  if (settings) {
    console.log(`[IntegrationsAPI] Updating ${provider} settings for shop: ${shop}`);

    let integration;

    // Update enabled features if provided
    if (settings.enabledFeatures) {
      integration = await updateEnabledFeatures(shop, provider, settings.enabledFeatures);
    }

    // Update other config if provided
    if (settings.pointsConfig || settings.config) {
      integration = await upsertIntegration(shop, provider, {
        pointsConfig: settings.pointsConfig as object,
        config: settings.config as object,
      });
    }

    return json({
      success: true,
      integration,
      message: "Integration settings updated",
    });
  }

  return json(
    { success: false, error: "No action or settings provided" },
    { status: 400 }
  );
}

/**
 * Handle disconnecting an integration
 */
async function handleDisconnect(
  shop: string,
  body: { provider: IntegrationProvider }
) {
  const { provider } = body;

  if (!provider) {
    return json(
      { success: false, error: "Provider is required" },
      { status: 400 }
    );
  }

  console.log(`[IntegrationsAPI] Disconnecting ${provider} for shop: ${shop}`);

  await disconnectIntegration(shop, provider);

  return json({
    success: true,
    message: `${provider} integration disconnected`,
  });
}
