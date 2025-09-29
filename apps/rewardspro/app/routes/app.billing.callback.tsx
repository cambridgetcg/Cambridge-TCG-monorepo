/**
 * Billing Callback Route
 * Handles the return from Shopify billing confirmation page
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { BillingGraphQLService } from "../services/billing/billing-graphql.service";
import { db } from "~/db.server";
import { v4 as uuidv4 } from "uuid";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Get charge_id from URL (NO HMAC verification needed for billing callbacks)
  // IMPORTANT: charge_id is an integer ID, not the full GID
  const chargeId = url.searchParams.get('charge_id');
  const shop = url.searchParams.get('shop'); // Optional but recommended

  if (!chargeId) {
    console.error("[Billing Callback] No charge_id in URL");
    return redirect('/app/billing?error=no_charge_id');
  }

  // Verify shop matches session (security check since no HMAC)
  if (shop && shop !== session.shop) {
    console.error('[Billing Callback] Shop mismatch:', { urlShop: shop, sessionShop: session.shop });
    return redirect('/app/billing?error=invalid_shop');
  }

  try {
    // The charge is already approved when we reach this callback
    // Update subscription status in database
    console.log(`[Billing Callback] Processing approved charge ${chargeId} for ${session.shop}`);

    // Get current subscription status to verify activation
    const appUrl = process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`;
    const billingService = new BillingGraphQLService(admin, session.shop, appUrl);
    const subscriptionStatus = await billingService.getCurrentSubscription();

    if (subscriptionStatus.hasActiveSubscription) {
      // Update or create subscription record
      try {
        await db.billingSubscription.upsert({
          where: { shop: session.shop },
          create: {
            id: uuidv4(),
            shop: session.shop,
            subscriptionId: subscriptionStatus.subscription?.id || chargeId,
            planName: subscriptionStatus.subscription?.name || "Unknown",
            status: "ACTIVE",
            isTest: subscriptionStatus.subscription?.test || subscriptionStatus.isDevStore || false,
            currentPeriodEnd: subscriptionStatus.subscription?.currentPeriodEnd
              ? new Date(subscriptionStatus.subscription.currentPeriodEnd)
              : null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          update: {
            subscriptionId: subscriptionStatus.subscription?.id || chargeId,
            planName: subscriptionStatus.subscription?.name || "Unknown",
            status: "ACTIVE",
            isTest: subscriptionStatus.subscription?.test || subscriptionStatus.isDevStore || false,
            currentPeriodEnd: subscriptionStatus.subscription?.currentPeriodEnd
              ? new Date(subscriptionStatus.subscription.currentPeriodEnd)
              : null,
            updatedAt: new Date(),
          }
        });

        // Update shop settings
        await db.shopSettings.update({
          where: { shop: session.shop },
          data: {
            billingStatus: "ACTIVE",
            updatedAt: new Date(),
          }
        });

        console.log(`[Billing Callback] Subscription activated for ${session.shop}`);
      } catch (dbError: any) {
        console.log("[Billing Callback] Could not update database (tables may not exist):", dbError.message);
      }

      return redirect('/app/billing?success=true&message=Subscription%20activated%20successfully');
    } else {
      console.error('[Billing Callback] Subscription not found after approval');
      return redirect('/app/billing?error=activation_failed&message=Subscription%20not%20found');
    }

  } catch (error: any) {
    console.error('[Billing Callback] Error processing callback:', error);
    return redirect('/app/billing?error=processing_failed&message=An%20error%20occurred%20while%20processing%20your%20subscription');
  }
}