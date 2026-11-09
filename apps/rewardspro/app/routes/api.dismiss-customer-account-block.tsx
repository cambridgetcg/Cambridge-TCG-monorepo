import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Dismisses the first-run setup card on the dashboard (app._index.tsx).
 * The route and its flag are named for the customer-account block banner,
 * which was removed; the setup card reuses them.
 */
export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // The setup card's dismissal is stored in customerAccountBlockDismissed
    await prisma.shopSettings.update({
      where: { shop },
      data: { customerAccountBlockDismissed: true },
    });

    return json({ success: true });
  } catch (error) {
    console.error("Error dismissing the first-run setup card:", error);
    return json({ error: "Failed to dismiss banner" }, { status: 500 });
  }
};
