/**
 * Integration Points Rules API Route
 *
 * Manages points rules for third-party integrations:
 * - GET: List points rules for a provider
 * - POST: Create a new points rule
 * - PUT: Update an existing points rule
 * - DELETE: Delete a points rule
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import type { IntegrationProvider, IntegrationPointsType } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// LOADER - List points rules
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider") as IntegrationProvider | null;

    const where: { shop: string; provider?: IntegrationProvider } = {
      shop: session.shop,
    };

    if (provider) {
      where.provider = provider;
    }

    const rules = await db.integrationPointsRule.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return json({
      success: true,
      rules,
    });
  } catch (error) {
    console.error("[PointsRulesAPI] Error listing rules:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list rules",
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION - Manage points rules
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
        return handleCreate(session.shop, body);

      case "PUT":
        return handleUpdate(session.shop, body);

      case "DELETE":
        return handleDelete(session.shop, body);

      default:
        return json({ error: "Method not allowed" }, { status: 405 });
    }
  } catch (error) {
    console.error("[PointsRulesAPI] Error processing action:", error);
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

interface CreateRuleBody {
  provider: IntegrationProvider;
  triggerEvent: string;
  name: string;
  description?: string;
  pointsType?: IntegrationPointsType;
  pointsAmount: number;
  pointsPercent?: number;
  maxPoints?: number;
  conditions?: Record<string, unknown>;
  enabled?: boolean;
}

/**
 * Handle creating a new points rule
 */
async function handleCreate(shop: string, body: CreateRuleBody) {
  const {
    provider,
    triggerEvent,
    name,
    description,
    pointsType = "FIXED",
    pointsAmount,
    pointsPercent,
    maxPoints,
    conditions = {},
    enabled = true,
  } = body;

  // Validate required fields
  if (!provider || !triggerEvent || !name) {
    return json(
      { success: false, error: "provider, triggerEvent, and name are required" },
      { status: 400 }
    );
  }

  // Check for existing rule
  const existing = await db.integrationPointsRule.findFirst({
    where: {
      shop,
      provider,
      triggerEvent,
    },
  });

  if (existing) {
    return json(
      { success: false, error: "A rule for this trigger event already exists" },
      { status: 409 }
    );
  }

  console.log(`[PointsRulesAPI] Creating rule for ${provider}/${triggerEvent}`);

  const rule = await db.integrationPointsRule.create({
    data: {
      id: uuidv4(),
      shop,
      provider,
      triggerEvent,
      name,
      description,
      pointsType,
      pointsAmount,
      pointsPercent,
      maxPoints,
      conditions,
      enabled,
      updatedAt: new Date(),
    },
  });

  return json({
    success: true,
    rule,
    message: "Points rule created successfully",
  });
}

interface UpdateRuleBody {
  id: string;
  name?: string;
  description?: string;
  pointsType?: IntegrationPointsType;
  pointsAmount?: number;
  pointsPercent?: number;
  maxPoints?: number | null;
  conditions?: Record<string, unknown>;
  enabled?: boolean;
}

/**
 * Handle updating a points rule
 */
async function handleUpdate(shop: string, body: UpdateRuleBody) {
  const { id, ...updates } = body;

  if (!id) {
    return json(
      { success: false, error: "Rule ID is required" },
      { status: 400 }
    );
  }

  // Find existing rule
  const existing = await db.integrationPointsRule.findFirst({
    where: { id, shop },
  });

  if (!existing) {
    return json(
      { success: false, error: "Rule not found" },
      { status: 404 }
    );
  }

  console.log(`[PointsRulesAPI] Updating rule ${id}`);

  const rule = await db.integrationPointsRule.update({
    where: { id },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });

  return json({
    success: true,
    rule,
    message: "Points rule updated successfully",
  });
}

/**
 * Handle deleting a points rule
 */
async function handleDelete(shop: string, body: { id: string }) {
  const { id } = body;

  if (!id) {
    return json(
      { success: false, error: "Rule ID is required" },
      { status: 400 }
    );
  }

  // Find existing rule
  const existing = await db.integrationPointsRule.findFirst({
    where: { id, shop },
  });

  if (!existing) {
    return json(
      { success: false, error: "Rule not found" },
      { status: 404 }
    );
  }

  console.log(`[PointsRulesAPI] Deleting rule ${id}`);

  await db.integrationPointsRule.delete({
    where: { id },
  });

  return json({
    success: true,
    message: "Points rule deleted successfully",
  });
}
