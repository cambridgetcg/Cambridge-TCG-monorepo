import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { triggerAutoSyncBackground, hasAutoSyncRun } from "~/services/auto-sync.service";
import db from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Check if this is a new installation (first time auth)
  if (session?.shop) {
    try {
      // Check if auto-sync has already run
      const syncCompleted = await hasAutoSyncRun(session.shop);

      if (!syncCompleted) {
        console.log(`[Auth] New installation detected for ${session.shop} - triggering auto-sync`);

        // Ensure shop settings exist before syncing
        await db.shopSettings.upsert({
          where: { shop: session.shop },
          update: {},
          create: {
            id: crypto.randomUUID(),
            shop: session.shop,
            storeName: session.shop,
            storeUrl: `https://${session.shop}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });

        // Trigger automatic sync in background (non-blocking)
        triggerAutoSyncBackground({
          shop: session.shop,
          admin,
          syncCustomers: true,
          syncOrders: true,
          // Sync last 1 year of orders by default
          ordersStartDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          ordersEndDate: new Date(),
          batchSize: 50,
        });

        console.log(`[Auth] Auto-sync triggered successfully for ${session.shop}`);
      } else {
        console.log(`[Auth] Auto-sync already completed for ${session.shop}, skipping`);
      }
    } catch (error) {
      // Don't fail auth if auto-sync fails - just log it
      console.error(`[Auth] Failed to trigger auto-sync:`, error);
    }
  }

  return null;
};
