import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Update the customerAccountBlockDismissed flag
    await prisma.shopSettings.update({
      where: { shop },
      data: { customerAccountBlockDismissed: true },
    });

    return json({ success: true });
  } catch (error) {
    console.error("Error dismissing customer account block banner:", error);
    return json({ error: "Failed to dismiss banner" }, { status: 500 });
  }
};
