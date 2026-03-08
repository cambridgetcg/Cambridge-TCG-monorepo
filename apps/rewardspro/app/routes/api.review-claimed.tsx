import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Called when a merchant confirms they've left a review.
 * Records the timestamp and permanently dismisses the banner.
 * Yu can then check the DB for reviewClickedAt records and grant Pro manually.
 */
export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    await prisma.shopSettings.update({
      where: { shop },
      data: {
        reviewBannerDismissed: true,
        reviewClickedAt: new Date(),
      },
    });

    console.log(`[Review] Shop "${shop}" confirmed leaving a review at ${new Date().toISOString()}`);

    return json({ success: true });
  } catch (error) {
    console.error("Error recording review claim:", error);
    return json({ error: "Failed to record review" }, { status: 500 });
  }
};
