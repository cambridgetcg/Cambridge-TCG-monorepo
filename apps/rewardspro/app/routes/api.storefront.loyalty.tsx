import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

/**
 * DEPRECATED: Storefront API endpoint for loyalty widget
 *
 * ⚠️ This endpoint is deprecated and will be removed in a future version.
 * New implementations should use the app proxy route: /apps/proxy/loyalty
 *
 * Kept for backward compatibility with existing installations that haven't
 * updated to the app proxy version yet. Will be removed after all merchants
 * have migrated to the new version.
 *
 * Migration Date: 2025-10-14
 * Planned Removal: 2-4 weeks after app proxy deployment
 *
 * Authentication: Customer metafield ID + shop domain verification
 * No session tokens (not available on storefront)
 *
 * Security: Shop-scoped queries prevent cross-shop access
 */

interface LoyaltyData {
  balance: number;
  tier: {
    id: string;
    name: string;
    icon: string;
    color: string;
  } | null;
  progress: {
    current: number;
    next: number;
    percentage: number;
  } | null;
  expiringPoints: {
    amount: number;
    date: string;
  } | null;
}

// Handle CORS preflight requests
export async function options({ request }: LoaderFunctionArgs) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const customerIdFromMetafield = url.searchParams.get("customerId");
  const shopDomain = url.searchParams.get("shop");

  // Validate required parameters
  if (!customerIdFromMetafield || !shopDomain) {
    return json(
      { error: "Missing required parameters: customerId and shop" },
      {
        status: 400,
        headers: getCorsHeaders(request)
      }
    );
  }

  // Normalize shop domain (remove protocol, trailing slash)
  const normalizedShop = shopDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  // Ensure .myshopify.com domain
  const shopWithDomain = normalizedShop.endsWith(".myshopify.com")
    ? normalizedShop
    : `${normalizedShop}.myshopify.com`;

  try {
    // Verify shop exists (use ShopSettings, not Shop)
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop: shopWithDomain },
      select: { id: true, shop: true, storeCurrency: true }
    });

    if (!shopSettings) {
      return json(
        { error: "Shop not found" },
        {
          status: 404,
          headers: getCorsHeaders(request)
        }
      );
    }

    // Find customer by internal ID (from metafield value) and shop (shop-scoped for security)
    const customer = await db.customer.findFirst({
      where: {
        id: customerIdFromMetafield,
        shop: shopWithDomain
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        pointsBalance: true,
        lifetimePoints: true,
        currentTierId: true,
        currentTier: {
          select: {
            id: true,
            name: true,
            icon: true,
            color: true,
            minSpend: true,
            threshold: true
          }
        }
      }
    });

    if (!customer) {
      return json(
        { error: "Customer not found" },
        {
          status: 404,
          headers: getCorsHeaders(request)
        }
      );
    }

    // Convert Decimal to number
    const pointsBalance = typeof customer.pointsBalance === 'object' && 'toNumber' in customer.pointsBalance
      ? (customer.pointsBalance as any).toNumber()
      : Number(customer.pointsBalance);

    const lifetimePoints = typeof customer.lifetimePoints === 'object' && 'toNumber' in customer.lifetimePoints
      ? (customer.lifetimePoints as any).toNumber()
      : Number(customer.lifetimePoints);

    // Get next tier for progress calculation
    const currentTierThreshold = customer.currentTier
      ? (customer.currentTier.threshold || customer.currentTier.minSpend)
      : 0;

    const nextTier = await db.tier.findFirst({
      where: {
        shop: shopWithDomain,
        minSpend: {
          gt: currentTierThreshold
        }
      },
      orderBy: {
        minSpend: "asc"
      },
      select: {
        id: true,
        name: true,
        minSpend: true,
        threshold: true
      }
    });

    // Calculate expiring points (points expiring in next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringPointsData = await db.storeCreditLedger.aggregate({
      where: {
        customerId: customer.id,
        shop: shopWithDomain,
        amount: {
          gt: 0
        },
        expiresAt: {
          lte: thirtyDaysFromNow,
          gt: new Date()
        }
      },
      _sum: {
        amount: true
      }
    });

    // Get earliest expiration date
    const earliestExpiration = await db.storeCreditLedger.findFirst({
      where: {
        customerId: customer.id,
        shop: shopWithDomain,
        amount: {
          gt: 0
        },
        expiresAt: {
          lte: thirtyDaysFromNow,
          gt: new Date()
        }
      },
      orderBy: {
        expiresAt: "asc"
      },
      select: {
        expiresAt: true
      }
    });

    // Convert expiring points sum
    const expiringSum = expiringPointsData._sum.amount
      ? (typeof expiringPointsData._sum.amount === 'object' && 'toNumber' in expiringPointsData._sum.amount
          ? (expiringPointsData._sum.amount as any).toNumber()
          : Number(expiringPointsData._sum.amount))
      : 0;

    // Build response
    const loyaltyData: LoyaltyData = {
      balance: pointsBalance,
      tier: customer.currentTier ? {
        id: customer.currentTier.id,
        name: customer.currentTier.name,
        icon: customer.currentTier.icon || "⭐",
        color: customer.currentTier.color || "#FFD700"
      } : null,
      progress: nextTier ? {
        current: lifetimePoints,
        next: nextTier.threshold || nextTier.minSpend,
        percentage: Math.min(100, Math.round((lifetimePoints / (nextTier.threshold || nextTier.minSpend)) * 100))
      } : null,
      expiringPoints: expiringSum > 0 && earliestExpiration ? {
        amount: expiringSum,
        date: earliestExpiration.expiresAt!.toISOString()
      } : null
    };

    // Return with CORS headers for storefront access
    return json(loyaltyData, {
      headers: {
        ...getCorsHeaders(request),
        "Cache-Control": "private, max-age=30", // 30 second cache
        "Vary": "Origin"
      }
    });

  } catch (error) {
    console.error("Error fetching loyalty data:", error);
    return json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: getCorsHeaders(request)
      }
    );
  }
}

// CORS headers helper
function getCorsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin");
  let allowOrigin = "*"; // Default to all origins for development

  if (requestOrigin) {
    try {
      const originUrl = new URL(requestOrigin);
      const originHost = originUrl.hostname;

      // Allow *.myshopify.com domains
      if (originHost.endsWith(".myshopify.com")) {
        allowOrigin = requestOrigin;
      }
      // Allow custom domains (check against shop's storeUrl if needed)
      // This is a simplified version - enhance as needed
      else {
        // For now, allow all origins (tighten in production)
        allowOrigin = requestOrigin;
      }
    } catch (error) {
      // Invalid origin URL, keep default
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400" // 24 hours
  };
}
