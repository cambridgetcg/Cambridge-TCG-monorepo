/**
 * AI Feedback System - Seed Patterns API
 *
 * POST /api/ai-feedback/seed
 * Seeds initial learning patterns into the database.
 *
 * This is a one-time operation after migration.
 * Requires admin authentication.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { seedInitialPatterns } from "~/services/ai-feedback/feedback-service.server";

export async function action({ request }: ActionFunctionArgs) {
  // Require admin authentication
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    await seedInitialPatterns();

    return json({
      success: true,
      message: "AI learning patterns seeded successfully",
      shop: session.shop,
    });
  } catch (error) {
    console.error("[AI Feedback] Seed error:", error);
    return json(
      {
        error: "Failed to seed patterns",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function loader() {
  return json(
    { error: "Use POST to seed patterns" },
    { status: 405 }
  );
}
