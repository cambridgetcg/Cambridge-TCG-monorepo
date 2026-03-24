/**
 * Marketing Mode Service
 *
 * Handles detection and management of the merchant's chosen marketing platform.
 * Merchants can choose between:
 * - INHOUSE: Full in-house Marketing Hub with campaigns, templates, automations
 * - KLAVIYO: Simplified hub focused on Klaviyo integration and event tracking
 *
 * @see /app/routes/app.marketing._index.tsx - Main Marketing Hub
 * @see /app/routes/app.marketing.klaviyo.tsx - Klaviyo integration
 */

import prisma from "~/db.server";
import type { MarketingHubMode } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface MarketingModeInfo {
  mode: MarketingHubMode;
  modeSetAt: Date | null;
  hasSeenChoice: boolean;
  isKlaviyoConnected: boolean;
  isSendGridConfigured: boolean;
}

export interface SetModeResult {
  success: boolean;
  error?: string;
  mode?: MarketingHubMode;
}

// ============================================
// MODE DETECTION
// ============================================

/**
 * Get the current marketing hub mode for a shop
 */
export async function getMarketingHubMode(shop: string): Promise<MarketingHubMode> {
  const settings = await prisma.emailSettings.findUnique({
    where: { shop },
    select: { marketingHubMode: true },
  });

  return settings?.marketingHubMode || "UNCONFIGURED";
}

/**
 * Get full marketing mode information including connection status
 */
export async function getMarketingModeInfo(shop: string): Promise<MarketingModeInfo> {
  const settings = await prisma.emailSettings.findUnique({
    where: { shop },
    select: {
      marketingHubMode: true,
      marketingModeSetAt: true,
      hasSeenMarketingChoice: true,
      klaviyoOAuthConnected: true,
      klaviyoEnabled: true,
      senderEmail: true,
    },
  });

  return {
    mode: settings?.marketingHubMode || "UNCONFIGURED",
    modeSetAt: settings?.marketingModeSetAt || null,
    hasSeenChoice: settings?.hasSeenMarketingChoice || false,
    isKlaviyoConnected: settings?.klaviyoOAuthConnected || settings?.klaviyoEnabled || false,
    isSendGridConfigured: !!settings?.senderEmail,
  };
}

/**
 * Check if the choice modal should be shown
 * Returns true if:
 * - Mode is UNCONFIGURED
 * - Merchant hasn't seen the choice modal yet
 */
export async function shouldShowMarketingChoice(shop: string): Promise<boolean> {
  const info = await getMarketingModeInfo(shop);
  return info.mode === "UNCONFIGURED" && !info.hasSeenChoice;
}

/**
 * Check if in-house marketing features should be shown
 * Returns true for INHOUSE or UNCONFIGURED modes
 */
export async function shouldShowInHouseMarketing(shop: string): Promise<boolean> {
  const mode = await getMarketingHubMode(shop);
  return mode === "INHOUSE" || mode === "UNCONFIGURED";
}

/**
 * Check if Klaviyo-focused marketing hub should be shown
 */
export async function shouldShowKlaviyoMarketing(shop: string): Promise<boolean> {
  const mode = await getMarketingHubMode(shop);
  return mode === "KLAVIYO";
}

// ============================================
// ROUTE GUARDS
// ============================================

/**
 * Guard function for in-house marketing routes.
 * Returns a redirect Response if the merchant is in Klaviyo mode.
 * Should be called at the start of loaders for in-house only routes.
 *
 * @example
 * export const loader = async ({ request }: LoaderFunctionArgs) => {
 *   const { session } = await authenticate.admin(request);
 *   const guardRedirect = await guardInHouseRoute(session.shop);
 *   if (guardRedirect) return guardRedirect;
 *   // ... rest of loader
 * };
 */
export async function guardInHouseRoute(shop: string): Promise<Response | null> {
  const mode = await getMarketingHubMode(shop);

  if (mode === "KLAVIYO") {
    // Import dynamically to avoid circular dependencies
    const { redirect } = await import("@remix-run/node");
    return redirect("/app/marketing?notice=klaviyo_mode");
  }

  return null;
}

// ============================================
// MODE MANAGEMENT
// ============================================

/**
 * Set the marketing hub mode for a shop
 */
export async function setMarketingHubMode(
  shop: string,
  mode: MarketingHubMode
): Promise<SetModeResult> {
  try {
    // Validate mode
    if (!["UNCONFIGURED", "INHOUSE", "KLAVIYO"].includes(mode)) {
      return { success: false, error: "Invalid marketing mode" };
    }

    // If switching to KLAVIYO, verify Klaviyo is connected
    if (mode === "KLAVIYO") {
      const settings = await prisma.emailSettings.findUnique({
        where: { shop },
        select: { klaviyoOAuthConnected: true, klaviyoEnabled: true },
      });

      const isConnected = settings?.klaviyoOAuthConnected || settings?.klaviyoEnabled;
      if (!isConnected) {
        return {
          success: false,
          error: "Please connect your Klaviyo account first",
        };
      }
    }

    // Update the mode
    await prisma.emailSettings.upsert({
      where: { shop },
      create: {
        shop,
        senderEmail: `noreply@${shop}`, // Default sender
        marketingHubMode: mode,
        marketingModeSetAt: new Date(),
        hasSeenMarketingChoice: true,
      },
      update: {
        marketingHubMode: mode,
        marketingModeSetAt: new Date(),
        hasSeenMarketingChoice: true,
      },
    });

    // If switching to INHOUSE, enable email provider as SendGrid
    if (mode === "INHOUSE") {
      await prisma.emailSettings.update({
        where: { shop },
        data: { emailProvider: "SENDGRID" },
      });
    }

    // If switching to KLAVIYO, update email provider
    if (mode === "KLAVIYO") {
      await prisma.emailSettings.update({
        where: { shop },
        data: { emailProvider: "KLAVIYO" },
      });
    }

    console.log(`[MarketingMode] Set mode for ${shop}: ${mode}`);

    return { success: true, mode };
  } catch (error: any) {
    console.error("[MarketingMode] Error setting mode:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark that the merchant has seen the choice modal
 * (They may have dismissed it without choosing)
 */
export async function markChoiceModalSeen(shop: string): Promise<void> {
  await prisma.emailSettings.upsert({
    where: { shop },
    create: {
      shop,
      senderEmail: `noreply@${shop}`,
      hasSeenMarketingChoice: true,
    },
    update: {
      hasSeenMarketingChoice: true,
    },
  });
}

/**
 * Handle mode switch with data migration
 * When switching modes, we need to handle existing data appropriately
 */
export async function switchMarketingMode(
  shop: string,
  newMode: MarketingHubMode
): Promise<SetModeResult> {
  const currentMode = await getMarketingHubMode(shop);

  // If switching from INHOUSE to KLAVIYO, archive active campaigns
  if (currentMode === "INHOUSE" && newMode === "KLAVIYO") {
    try {
      // Archive draft and scheduled campaigns (don't delete)
      await prisma.emailCampaign.updateMany({
        where: {
          shop,
          status: { in: ["draft", "scheduled"] },
        },
        data: {
          status: "archived",
        },
      });

      // Disable in-house automations
      await prisma.emailAutomation.updateMany({
        where: { shop },
        data: { isEnabled: false },
      });

      console.log(`[MarketingMode] Archived campaigns and disabled automations for ${shop}`);
    } catch (error) {
      console.error("[MarketingMode] Error archiving data:", error);
      // Continue with mode switch even if archival fails
    }
  }

  // Set the new mode
  return setMarketingHubMode(shop, newMode);
}

// ============================================
// ANALYTICS
// ============================================

/**
 * Get marketing mode adoption stats (for admin/analytics)
 */
export async function getMarketingModeStats(): Promise<{
  unconfigured: number;
  inhouse: number;
  klaviyo: number;
  total: number;
}> {
  const [unconfigured, inhouse, klaviyo] = await Promise.all([
    prisma.emailSettings.count({ where: { marketingHubMode: "UNCONFIGURED" } }),
    prisma.emailSettings.count({ where: { marketingHubMode: "INHOUSE" } }),
    prisma.emailSettings.count({ where: { marketingHubMode: "KLAVIYO" } }),
  ]);

  return {
    unconfigured,
    inhouse,
    klaviyo,
    total: unconfigured + inhouse + klaviyo,
  };
}
