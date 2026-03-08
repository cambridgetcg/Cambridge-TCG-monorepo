import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getTestMode } from "~/utils/billing-test-mode.server";

/**
 * Review Reward Claim
 *
 * When a merchant confirms they've left a review, we:
 * 1. Record the claim timestamp
 * 2. Permanently dismiss the banner
 * 3. Automatically create a Pro subscription with a 90-day free trial (3 months)
 * 4. Return the Shopify confirmation URL so the frontend can redirect the merchant
 *
 * The merchant clicks "Accept" on Shopify's confirmation page, then returns to the app on Pro.
 * After 90 days they're charged the normal Pro rate ($39/mo) unless they cancel.
 */

const REVIEW_TRIAL_DAYS = 90; // 3 months

const CREATE_PRO_SUBSCRIPTION_MUTATION = `#graphql
  mutation CreateReviewRewardSubscription(
    $name: String!
    $returnUrl: URL!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $trialDays: Int
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      trialDays: $trialDays
      test: $test
    ) {
      confirmationUrl
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query GetActiveSubscriptionsForReview {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
      }
    }
  }
`;

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    // Guard: if already claimed, just return success silently
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
      select: { reviewClickedAt: true },
    });

    if (settings?.reviewClickedAt) {
      console.log(`[ReviewReward] Shop "${shop}" already claimed — skipping duplicate`);
      return json({ success: true, alreadyClaimed: true });
    }

    // Record the claim first (best-effort — before billing, so it's never lost)
    await prisma.shopSettings.update({
      where: { shop },
      data: {
        reviewBannerDismissed: true,
        reviewClickedAt: new Date(),
      },
    });

    console.log(`[ReviewReward] Shop "${shop}" confirmed review at ${new Date().toISOString()}`);

    // Check existing subscription — don't downgrade Max/Ultra merchants
    let existingPlanName: string | null = null;
    try {
      const subsResponse = await admin.graphql(GET_ACTIVE_SUBSCRIPTIONS_QUERY);
      const subsResult = await subsResponse.json();
      const activeSubs = subsResult.data?.currentAppInstallation?.activeSubscriptions ?? [];
      if (activeSubs.length > 0) {
        existingPlanName = activeSubs[0].name as string;
      }
    } catch (err) {
      console.warn(`[ReviewReward] Could not fetch current subscription for ${shop}:`, err);
    }

    const PROTECTED_PLANS = ["RewardsPro Max", "RewardsPro Max Annual", "RewardsPro Ultra", "RewardsPro Ultra Annual"];
    if (existingPlanName && PROTECTED_PLANS.some(p => existingPlanName!.includes(p.replace("RewardsPro ", "")))) {
      console.log(`[ReviewReward] Shop "${shop}" is on ${existingPlanName} — skipping Pro grant to avoid downgrade`);
      return json({ success: true, skipped: true, reason: "Already on a higher plan — no upgrade needed" });
    }

    // Determine test mode
    const testModeResult = await getTestMode(shop, admin);
    const isTest = testModeResult.isTest;

    console.log(`[ReviewReward] Creating Pro subscription with ${REVIEW_TRIAL_DAYS}-day trial for ${shop} (test: ${isTest})`);

    const returnUrl = `${process.env.SHOPIFY_APP_URL}/app?review_reward=claimed`;

    const response = await admin.graphql(CREATE_PRO_SUBSCRIPTION_MUTATION, {
      variables: {
        name: "RewardsPro Pro",
        returnUrl,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                interval: "EVERY_30_DAYS",
                price: {
                  amount: "39.00",
                  currencyCode: "USD",
                },
              },
            },
          },
          // Usage overage line item (matches Pro plan config)
          {
            plan: {
              appUsagePricingDetails: {
                terms: "$10 per 100 orders over 500/month limit (max $50/month)",
                cappedAmount: {
                  amount: "50.00",
                  currencyCode: "USD",
                },
              },
            },
          },
        ],
        trialDays: REVIEW_TRIAL_DAYS,
        test: isTest,
      },
    });

    const result = await response.json();

    if (result.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errors = result.data.appSubscriptionCreate.userErrors as Array<{ field: string[]; message: string }>;
      console.error(`[ReviewReward] Billing errors for ${shop}:`, errors);
      // Claim is already recorded — return partial success so banner still hides
      return json({
        success: true,
        billingError: errors[0]?.message ?? "Subscription could not be created automatically",
      });
    }

    const confirmationUrl = result.data?.appSubscriptionCreate?.confirmationUrl as string | null;
    const subscriptionId = result.data?.appSubscriptionCreate?.appSubscription?.id as string | null;

    if (!confirmationUrl) {
      console.error(`[ReviewReward] No confirmationUrl returned for ${shop}`);
      return json({ success: true, billingError: "No confirmation URL returned from Shopify" });
    }

    console.log(`[ReviewReward] ✅ Created Pro subscription ${subscriptionId} for ${shop}. Confirmation URL ready.`);

    return json({ success: true, confirmationUrl });
  } catch (error) {
    console.error("[ReviewReward] Unexpected error:", error);
    return json({ error: "Failed to process review reward" }, { status: 500 });
  }
};
