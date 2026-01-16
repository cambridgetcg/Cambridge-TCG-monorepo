/**
 * Points Metafield Sync Service
 *
 * Syncs points configuration to shop metafields for theme access.
 * Theme blocks can read these metafields without making API calls.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getPointsConfig } from "./points-config.server";
import { getActiveEvents } from "./points-bonus-events.server";

export interface SyncResult {
  success: boolean;
  metafieldsSet?: number;
  error?: string;
}

interface PointsMetafieldData {
  pointsPerDollar: number;
  currencyIcon: string;
  currencyName: string;
  currencyNamePlural: string;
  bonusMultiplier: number;
  bonusName: string | null;
  bonusEndsAt: string | null;
  enabled: boolean;
}

/**
 * Get the shop GID from the admin context
 */
async function getShopGid(admin: AdminApiContext): Promise<string | null> {
  try {
    const response = await admin.graphql(`
      query GetShopId {
        shop {
          id
        }
      }
    `);
    const data = await response.json();
    return data.data?.shop?.id || null;
  } catch (error) {
    console.error("[Points Metafield Sync] Error getting shop GID:", error);
    return null;
  }
}

/**
 * Sync points configuration to shop metafields
 *
 * @param admin - Shopify Admin API context
 * @param shop - Shop domain
 * @returns Result with success status
 */
export async function syncPointsConfigMetafield(
  admin: AdminApiContext,
  shop: string
): Promise<SyncResult> {
  try {
    console.log("[Points Metafield Sync] Starting sync for:", shop);

    // Get shop GID
    const shopGid = await getShopGid(admin);
    if (!shopGid) {
      return { success: false, error: "Could not get shop GID" };
    }

    // Get points config
    const config = await getPointsConfig(shop);
    if (!config) {
      console.log("[Points Metafield Sync] No points config found, syncing disabled state");
      return await setShopMetafields(admin, shopGid, {
        pointsPerDollar: 0,
        currencyIcon: "",
        currencyName: "points",
        currencyNamePlural: "points",
        bonusMultiplier: 1,
        bonusName: null,
        bonusEndsAt: null,
        enabled: false,
      });
    }

    // Get active bonus events
    const bonusResult = await getActiveEvents(shop);
    const bonusMultiplier = bonusResult.combinedMultiplier || 1;
    const bonusName = bonusResult.eventNames[0] || null;
    const bonusEndsAt = bonusResult.activeEvents[0]?.endsAt?.toISOString() || null;

    // Build metafield data
    const metafieldData: PointsMetafieldData = {
      pointsPerDollar: config.pointsPerDollar,
      currencyIcon: config.currencyIcon || "",
      currencyName: config.currencyName || "points",
      currencyNamePlural: config.currencyNamePlural || "points",
      bonusMultiplier,
      bonusName,
      bonusEndsAt,
      enabled: config.isEnabled,
    };

    return await setShopMetafields(admin, shopGid, metafieldData);
  } catch (error) {
    console.error("[Points Metafield Sync] Error syncing:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Set shop metafields for points config
 */
async function setShopMetafields(
  admin: AdminApiContext,
  shopGid: string,
  data: PointsMetafieldData
): Promise<SyncResult> {
  const mutation = `
    mutation SetShopMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const metafields = [
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "points_per_dollar",
      value: String(data.pointsPerDollar),
      type: "number_integer",
    },
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "points_icon",
      value: data.currencyIcon,
      type: "single_line_text_field",
    },
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "points_name",
      value: data.currencyName,
      type: "single_line_text_field",
    },
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "points_name_plural",
      value: data.currencyNamePlural,
      type: "single_line_text_field",
    },
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "bonus_multiplier",
      value: String(data.bonusMultiplier),
      type: "number_decimal",
    },
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "bonus_name",
      value: data.bonusName || "",
      type: "single_line_text_field",
    },
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "bonus_ends_at",
      value: data.bonusEndsAt || "",
      type: "single_line_text_field",
    },
    {
      ownerId: shopGid,
      namespace: "rewardspro",
      key: "points_enabled",
      value: String(data.enabled),
      type: "boolean",
    },
  ];

  try {
    const response = await admin.graphql(mutation, {
      variables: { metafields },
    });

    const result = await response.json();

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      const errors = result.data.metafieldsSet.userErrors;
      console.error("[Points Metafield Sync] Errors:", errors);
      return {
        success: false,
        error: errors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    const metafieldsSet = result.data?.metafieldsSet?.metafields?.length || 0;
    console.log("[Points Metafield Sync] Successfully set", metafieldsSet, "metafields");

    return {
      success: true,
      metafieldsSet,
    };
  } catch (error) {
    console.error("[Points Metafield Sync] GraphQL error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sync customer tier multiplier to customer metafield
 *
 * @param admin - Shopify Admin API context
 * @param shopifyCustomerId - Shopify customer GID
 * @param tierMultiplier - The tier's points multiplier
 * @param tierName - The tier name
 * @returns Result with success status
 */
export async function syncCustomerTierMetafield(
  admin: AdminApiContext,
  shopifyCustomerId: string,
  tierMultiplier: number,
  tierName: string
): Promise<SyncResult> {
  const mutation = `
    mutation SetCustomerTierMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const metafields = [
    {
      ownerId: shopifyCustomerId,
      namespace: "rewardspro",
      key: "tier_multiplier",
      value: String(tierMultiplier),
      type: "number_decimal",
    },
    {
      ownerId: shopifyCustomerId,
      namespace: "rewardspro",
      key: "tier_name",
      value: tierName,
      type: "single_line_text_field",
    },
  ];

  try {
    const response = await admin.graphql(mutation, {
      variables: { metafields },
    });

    const result = await response.json();

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      const errors = result.data.metafieldsSet.userErrors;
      console.error("[Points Metafield Sync] Customer metafield errors:", errors);
      return {
        success: false,
        error: errors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    return {
      success: true,
      metafieldsSet: result.data?.metafieldsSet?.metafields?.length || 0,
    };
  } catch (error) {
    console.error("[Points Metafield Sync] Customer metafield error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
