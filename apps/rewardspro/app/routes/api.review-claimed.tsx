import { json, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Records that the merchant has dismissed the review prompt.
 *
 * Reviews are never exchanged for a plan, trial, discount, or billing
 * agreement. Plan changes remain an explicit merchant action on /app/billing.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
      select: { reviewClickedAt: true },
    });

    if (settings?.reviewClickedAt) {
      return json({ success: true, alreadyRecorded: true });
    }

    await prisma.shopSettings.update({
      where: { shop },
      data: {
        reviewBannerDismissed: true,
        reviewClickedAt: new Date(),
      },
    });

    return json({ success: true });
  } catch (error) {
    console.error("[ReviewPrompt] Failed to record review prompt dismissal:", error);
    return json({ error: "Failed to update review prompt" }, { status: 500 });
  }
};
