// app/routes/api.proxy.$.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getAuroraClient } from "../utils/aurora-data-api";
import type { SqlParameter } from "@aws-sdk/client-rds-data";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";

/**
 * Calculate tier progression data for a customer
 * @param currentNetSpend - Customer's net spending (totalSpent - totalRefunded)
 * @param currentTier - Customer's current tier object
 * @param allTiers - All tiers for the shop
 * @returns Tier progress data including next tier, progress percentage, and amount remaining
 *
 * Note: Tier progression is based on netSpend (total spent minus refunds) to ensure
 * customers who return items don't get credit toward tier upgrades for refunded purchases.
 */
function calculateTierProgress(
  currentNetSpend: number,
  currentTier: { id: string; name: string; minSpend: number; cashbackPercent: number } | null,
  allTiers: Array<{ id: string; name: string; minSpend: number; cashbackPercent: number }>
) {
  console.log('[TierProgress] 🔵 Calculating tier progression...');
  console.log('[TierProgress] 📊 Input:', {
    currentNetSpend,
    currentTierName: currentTier?.name || 'NO_TIER',
    totalTiers: allTiers.length
  });

  // If no current tier, return default state
  if (!currentTier) {
    console.log('[TierProgress] ⚠️ No current tier assigned');
    return {
      currentSpending: currentNetSpend,
      nextTierTarget: null,
      nextTierName: null,
      nextTierCashback: null,
      amountRemaining: 0,
      progressPercent: 0,
      isMaxTier: false,
      allTiers: allTiers.map(t => ({
        name: t.name,
        minSpend: t.minSpend,
        cashbackPercent: t.cashbackPercent
      }))
    };
  }

  // Sort tiers by minSpend ascending
  const sortedTiers = [...allTiers].sort((a, b) => a.minSpend - b.minSpend);

  // Find current tier index
  const currentTierIndex = sortedTiers.findIndex(t => t.id === currentTier.id);

  if (currentTierIndex === -1) {
    console.log('[TierProgress] ⚠️ Current tier not found in all tiers list');
    return {
      currentSpending: currentNetSpend,
      nextTierTarget: null,
      nextTierName: null,
      nextTierCashback: null,
      amountRemaining: 0,
      progressPercent: 0,
      isMaxTier: false,
      allTiers: sortedTiers.map(t => ({
        name: t.name,
        minSpend: t.minSpend,
        cashbackPercent: t.cashbackPercent
      }))
    };
  }

  // Check if this is the max tier
  const isMaxTier = currentTierIndex === sortedTiers.length - 1;

  if (isMaxTier) {
    console.log('[TierProgress] 🏆 Customer is at max tier');
    return {
      currentSpending: currentNetSpend,
      nextTierTarget: null,
      nextTierName: null,
      nextTierCashback: null,
      amountRemaining: 0,
      progressPercent: 100,
      isMaxTier: true,
      allTiers: sortedTiers.map(t => ({
        name: t.name,
        minSpend: t.minSpend,
        cashbackPercent: t.cashbackPercent
      }))
    };
  }

  // Calculate progress to next tier
  const nextTier = sortedTiers[currentTierIndex + 1];
  const amountRemaining = Math.max(0, nextTier.minSpend - currentNetSpend);
  const progressPercent = Math.min(
    Math.max(0, Math.round((currentNetSpend / nextTier.minSpend) * 100)),
    99 // Cap at 99% until they actually reach the next tier
  );

  console.log('[TierProgress] ✅ Progress calculated:', {
    currentTier: currentTier.name,
    nextTier: nextTier.name,
    currentSpending: currentNetSpend,
    nextTierTarget: nextTier.minSpend,
    amountRemaining,
    progressPercent
  });

  return {
    currentSpending: currentNetSpend,
    nextTierTarget: nextTier.minSpend,
    nextTierName: nextTier.name,
    nextTierCashback: nextTier.cashbackPercent,
    amountRemaining,
    progressPercent,
    isMaxTier: false,
    allTiers: sortedTiers.map(t => ({
      name: t.name,
      minSpend: t.minSpend,
      cashbackPercent: t.cashbackPercent
    }))
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const proxyPath = params["*"] || "";
  const url = new URL(request.url);

  console.log('[Proxy API] 🔵 Request received');
  console.log('[Proxy API] 📍 Path:', proxyPath);
  console.log('[Proxy API] 📍 Full URL:', request.url);

  // SECURITY: Authenticate the app proxy request with HMAC validation
  // This ensures the request is coming from Shopify and not a direct attack
  let session, liquid;
  try {
    console.log('[Proxy API] 🔐 Starting proxy authentication...');
    const authResult = await authenticate.public.appProxy(request);
    session = authResult.session;
    liquid = authResult.liquid;
    console.log('[Proxy API] ✅ Proxy authentication successful');
  } catch (authError) {
    console.error('[Proxy API] ❌ Proxy authentication failed:', authError);
    const errorResponse = {
      success: false,
      error: "Authentication failed",
      message: "Unable to authenticate proxy request: " + (authError.message || "Unknown error")
    };
    console.log('[Proxy API] 📤 Returning auth error:', JSON.stringify(errorResponse));
    return json(errorResponse, { status: 401 });
  }

  // CORS headers for all responses
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  };
  
  // Test endpoint
  if (proxyPath === "test") {
    return json({
      success: true,
      message: "API endpoint is working",
      timestamp: new Date().toISOString()
    }, { headers });
  }
  
  // Membership endpoint
  if (proxyPath === "membership") {
    console.log('[Proxy API] 🔵 Membership endpoint called');
    console.log('[Proxy API] 📍 Full URL:', request.url);
    console.log('[Proxy API] 🔍 All Query Params:', Object.fromEntries(url.searchParams));

    // Extract customer ID from various possible parameters
    const customerId = url.searchParams.get("logged_in_customer_id") ||
                      url.searchParams.get("customer_id") ||
                      url.searchParams.get("customerId") ||
                      url.searchParams.get("cid");

    // SECURITY: Use authenticated shop from session ONLY
    // We completely ignore the shop parameter in URL to prevent spoofing
    const shop = session?.shop;

    // If no authenticated session, reject the request
    if (!shop || !session) {
      console.error('[Proxy API] ❌ No authenticated session - rejecting request');
      const shopFromQuery = url.searchParams.get("shop");
      if (shopFromQuery) {
        console.error('[Proxy API] ⚠️ Attempted direct access with shop parameter:', shopFromQuery);
      }
      return json({
        success: false,
        error: "Authentication required",
        message: "This request must come through Shopify app proxy",
        requiresLogin: false
      }, { status: 401, headers });
    }

    console.log('[Proxy API] 🏪 Shop (authenticated):', shop);
    console.log('[Proxy API] 🔐 Session exists:', !!session);
    console.log('[Proxy API] 👤 Customer ID:', customerId);
    
    // Handle non-logged-in users
    if (!customerId || customerId === "" || customerId === "null" || customerId === "undefined") {
      console.log('[Proxy API] 🔐 No customer ID - guest user');
      return json({
        success: false,
        requiresLogin: true,
        message: "Please log in to view your rewards",
        query: {
          shopDomain: shop || 'unknown',
          shopifyCustomerId: 'guest',
          endpoint: '/apps/rewardspro/api/customer',
          foundInDatabase: false,
          method: 'No Query - Guest User',
          executionTime: 'N/A'
        },
        customer: null,
        balance: {
          storeCredit: 0,
          totalEarned: 0,
          lastSynced: null
        },
        membership: {
          tier: {
            id: "guest",
            name: "Guest",
            cashbackPercent: 1
          }
        }
      }, {
        status: 200,
        headers
      });
    }

    try {
      console.log('[Proxy API] 🔍 Querying database for customer...');
      console.log('[Proxy API] 📊 Query params:', {
        shopDomain: shop,
        shopifyCustomerId: customerId
      });

      // Use direct Data API for customer lookup (replaces Prisma for better visibility)
      const dataApi = getAuroraClient();

      console.log('[Proxy API] 🔍 Using DIRECT Data API query');
      console.log('[Proxy API] 📋 Query parameters:', {
        shopDomain: shop,
        shopifyCustomerId: customerId
      });

      // Build the exact SQL query with proper joins
      // Note: Using currentTierId instead of MembershipHistory table
      const sql = `
        SELECT
          c.id,
          c.shop,
          c."shopifyCustomerId",
          c.email,
          c."firstName",
          c."lastName",
          c."storeCredit",
          c."totalCashbackEarned",
          c."totalSpent",
          c."netSpent",
          c."totalRefunded",
          c."orderCount",
          c."createdAt",
          c."updatedAt",
          c."currentTierId",

          t.id as "tier_id",
          t.shop as "tier_shop",
          t.name as "tier_name",
          t."minSpend" as "tier_minSpend",
          t."cashbackPercent" as "tier_cashbackPercent"

        FROM "Customer" c

        LEFT JOIN "Tier" t
          ON t.id = c."currentTierId"

        WHERE
          c.shop = :shopDomain
          AND c."shopifyCustomerId" = :shopifyCustomerId

        LIMIT 1
      `;

      const parameters: SqlParameter[] = [
        { name: 'shopDomain', value: { stringValue: shop } },
        { name: 'shopifyCustomerId', value: { stringValue: customerId } }
      ];

      console.log('[Proxy API] 📋 SQL (formatted):', sql.replace(/\s+/g, ' ').trim());
      console.log('[Proxy API] 📋 Parameters:', JSON.stringify(parameters));

      const startTime = Date.now();
      const result = await dataApi.executeStatement(sql, parameters);
      const executionTime = Date.now() - startTime;

      console.log('[Proxy API] ⏱️ Query execution time:', executionTime + 'ms');
      console.log('[Proxy API] 📊 Data API Result:', {
        recordCount: result.records?.length || 0,
        hasData: !!(result.records && result.records.length > 0)
      });

      // Transform Data API result to match Prisma format
      let customer = null;
      if (result.records && result.records.length > 0) {
        const row = result.records[0];

        customer = {
          id: row.id,
          shopDomain: row.shop,
          shopifyCustomerId: row.shopifyCustomerId,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          storeCredit: row.storeCredit,
          totalCashbackEarned: row.totalCashbackEarned,
          totalSpent: row.totalSpent,
          netSpent: row.netSpent,
          totalRefunded: row.totalRefunded,
          orderCount: row.orderCount,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          currentTierId: row.currentTierId,

          // Transform currentTier relationship
          currentTier: row.tier_id ? {
            id: row.tier_id,
            shopDomain: row.tier_shop,
            name: row.tier_name,
            minSpend: row.tier_minSpend,
            cashbackPercent: row.tier_cashbackPercent
          } : null
        };

        console.log('[Proxy API] ✅ Customer transformed:', {
          id: customer.id,
          email: customer.email,
          shopifyCustomerId: customer.shopifyCustomerId,
          storeCredit: customer.storeCredit,
          totalCashbackEarned: customer.totalCashbackEarned,
          netSpent: customer.netSpent,
          totalRefunded: customer.totalRefunded,
          currentTierId: customer.currentTierId,
          hasTier: !!customer.currentTier,
          tierName: customer.currentTier?.name || 'NO_TIER'
        });
      }

      console.log('[Proxy API] 📥 Customer found in database:', customer ? 'YES' : 'NO');
      
      // Return "not found" response if customer doesn't exist (don't show fake data)
      if (!customer) {
        console.log('[Proxy API] ⚠️ Customer not found in database');
        console.log('[Proxy API] ℹ️ Returning customer_not_found status');
        console.log('[Proxy API] 💡 Customer will be created when:');
        console.log('[Proxy API]    1. Shopify fires customer/create webhook, or');
        console.log('[Proxy API]    2. Merchant runs customer sync from admin');
        console.log('[Proxy API] 📋 Query used:', {
          shopDomain: shop,
          shopifyCustomerId: customerId
        });

        return json({
          success: false,
          status: 'customer_not_found',
          message: 'Customer not found in database. Data will be available after merchant runs customer sync.',
          query: {
            shopDomain: shop,
            shopifyCustomerId: customerId,
            endpoint: '/apps/rewardspro/api/customer',
            foundInDatabase: false,
            method: 'AWS Aurora Data API (Direct SQL)',
            executionTime: executionTime + 'ms'
          },
          customer: null,
          balance: null,
          membership: null
        });
      }

      // Get current tier from customer
      let currentTier = customer.currentTier;

      console.log('[Proxy API] 🎖️ Current tier from customer:', {
        hasTier: !!currentTier,
        tierName: currentTier?.name,
        tierCashback: currentTier?.cashbackPercent
      });

      // FALLBACK: If no tier found, try to find/assign one
      if (!currentTier) {
        console.log('[Proxy API] ⚠️ No tier assigned to customer, starting fallback logic...');
        console.log('[Proxy API] 🔍 Customer data for tier lookup:', {
          customerId: customer.id,
          totalSpent: customer.totalSpent,
          storeCredit: customer.storeCredit,
          totalCashbackEarned: customer.totalCashbackEarned
        });

        // Try to find the appropriate tier based on customer spending from database
        const customerSpending = Number(customer.totalSpent || 0);

        console.log('[Proxy API] 💰 Customer spending for tier evaluation:', {
          fromDatabase: customer.totalSpent,
          usingValue: customerSpending
        });

        console.log('[Proxy API] 🔎 Searching for tier with criteria:', {
          shop: shop,
          minSpend_lte: customerSpending
        });

        let assignedTier = await prisma.tier.findFirst({
          where: {
            shop: shop,
            minSpend: { lte: customerSpending }
          },
          orderBy: {
            minSpend: 'desc'
          }
        });

        console.log('[Proxy API] 🔍 Tier lookup result:', {
          customerSpending,
          foundTier: assignedTier?.name || 'NONE',
          tierDetails: assignedTier ? {
            id: assignedTier.id,
            name: assignedTier.name,
            minSpend: assignedTier.minSpend,
            cashbackPercent: assignedTier.cashbackPercent
          } : null
        });

        // If still no tier, get the default (lowest minSpend) tier
        if (!assignedTier) {
          console.log('[Proxy API] 🔍 No tier found by spending, getting default tier...');

          // First, let's check ALL tiers for this shop for debugging
          const allTiers = await prisma.tier.findMany({
            where: { shop: shop }
          });

          console.log('[Proxy API] 📦 ALL TIERS IN DATABASE for shop:', {
            shop,
            count: allTiers.length,
            tiers: allTiers.map(t => ({
              id: t.id,
              name: t.name,
              minSpend: t.minSpend,
              cashbackPercent: t.cashbackPercent
            }))
          });

          assignedTier = await prisma.tier.findFirst({
            where: {
              shop: shop
            },
            orderBy: {
              minSpend: 'asc'
            }
          });

          if (assignedTier) {
            console.log('[Proxy API] ✅ Default tier found:', {
              id: assignedTier.id,
              name: assignedTier.name,
              minSpend: assignedTier.minSpend,
              cashbackPercent: assignedTier.cashbackPercent
            });
          }
        }

        // If still no tier, create Bronze tier
        if (!assignedTier) {
          console.log('[Proxy API] ➕ No tier exists, creating Bronze tier...');
          assignedTier = await prisma.tier.create({
            data: {
              id: `${shop}-bronze-${Date.now()}`,
              shop: shop,
              name: "Bronze",
              minSpend: 0,
              cashbackPercent: 1,
              evaluationPeriod: "ANNUAL"
            }
          });
          console.log('[Proxy API] ✅ Bronze tier created:', assignedTier.id);
        }

        // Use tier resolution system to assign the correct tier
        // This respects priority: Manual Override > Subscription > Purchase > Spending-based
        console.log('[Proxy API] ➕ Using tier resolution system for customer:', customer.id);

        try {
          const result = await updateCustomerToEffectiveTier(shop, customer.id, {
            triggeredBy: 'proxy_api_first_access'
          });

          console.log('[Proxy API] ✅ Tier resolution complete:', {
            changed: result.changed,
            source: result.source,
            tierId: result.newTierId
          });

          // Fetch the updated tier for the response
          if (result.newTierId) {
            currentTier = await prisma.tier.findUnique({
              where: { id: result.newTierId }
            });
          } else if (assignedTier) {
            // Fallback to assignedTier if resolver didn't assign one
            currentTier = assignedTier;
          }
        } catch (error: any) {
          console.error('[Proxy API] ❌ Failed to resolve customer tier:', error);
          console.error('[Proxy API] ❌ Error details:', {
            message: error.message,
            code: error.code,
            meta: error.meta
          });
          // Fallback to assignedTier if resolver failed
          currentTier = assignedTier;
        }
      }

      // Query all tiers for the shop to calculate tier progression
      console.log('[Proxy API] 🔍 Fetching all tiers for shop to calculate progression...');
      const tiersSql = `
        SELECT
          id,
          name,
          "minSpend",
          "cashbackPercent"
        FROM "Tier"
        WHERE shop = :shopDomain
        ORDER BY "minSpend" ASC
      `;

      const tiersParameters: SqlParameter[] = [
        { name: 'shopDomain', value: { stringValue: shop } }
      ];

      const tiersStartTime = Date.now();
      const tiersResult = await dataApi.executeStatement(tiersSql, tiersParameters);
      const tiersExecutionTime = Date.now() - tiersStartTime;

      console.log('[Proxy API] ⏱️ Tiers query execution time:', tiersExecutionTime + 'ms');
      console.log('[Proxy API] 📊 Tiers found:', tiersResult.records?.length || 0);

      // Fetch shop settings for widget theme
      console.log('[Proxy API] 🎨 Fetching shop settings for widget theme...');
      const shopSettings = await prisma.shopSettings.findUnique({
        where: { shop }
      });

      console.log('[Proxy API] 🎨 Widget theme settings:', shopSettings ? 'Found' : 'Not found');

      // Transform tiers result
      const allTiers = tiersResult.records?.map(row => ({
        id: row.id,
        name: row.name,
        minSpend: Number(row.minSpend || 0),
        cashbackPercent: Number(row.cashbackPercent || 0)
      })) || [];

      console.log('[Proxy API] 📦 All tiers:', allTiers.map(t => ({
        name: t.name,
        minSpend: t.minSpend,
        cashbackPercent: t.cashbackPercent
      })));

      // Final data validation before response
      console.log('[Proxy API] 📊 Final data check before response:', {
        hasCustomer: !!customer,
        customerId: customer?.id,
        storeCredit: customer?.storeCredit,
        storeCreditType: typeof customer?.storeCredit,
        totalCashbackEarned: customer?.totalCashbackEarned,
        totalCashbackEarnedType: typeof customer?.totalCashbackEarned,
        netSpent: customer?.netSpent,
        totalRefunded: customer?.totalRefunded,
        totalSpent: customer?.totalSpent,
        currentTierName: currentTier?.name || 'NO_TIER',
        currentTierCashback: currentTier?.cashbackPercent || 'NO_CASHBACK',
        currentTierCashbackType: typeof currentTier?.cashbackPercent,
        currentTierId: currentTier?.id || 'NO_ID',
        tierObjectExists: !!currentTier
      });

      // Calculate tier progression
      const tierProgress = calculateTierProgress(
        Number(customer.netSpent || 0),
        currentTier ? {
          id: currentTier.id,
          name: currentTier.name,
          minSpend: Number(currentTier.minSpend || 0),
          cashbackPercent: Number(currentTier.cashbackPercent || 0)
        } : null,
        allTiers
      );

      const responseData = {
        success: true,
        customer: {
          id: customer.id,
          shopifyId: customer.shopifyCustomerId,
          email: customer.email,
          memberSince: customer.createdAt.toISOString(),
          totalSpent: Number(customer.totalSpent || 0),
          totalRefunded: Number(customer.totalRefunded || 0),
          netSpent: Number(customer.netSpent || 0),
          orderCount: Number(customer.orderCount || 0)
        },
        balance: {
          storeCredit: Number(customer.storeCredit || 0),
          totalEarned: Number(customer.totalCashbackEarned || 0),
          lastSynced: customer.updatedAt?.toISOString() || null
        },
        membership: {
          tier: currentTier ? {
            id: currentTier.id,
            name: currentTier.name,
            cashbackPercent: Number(currentTier.cashbackPercent)
          } : {
            id: "default",
            name: "Bronze",
            cashbackPercent: 1
          }
        },
        tierProgress: {
          currentSpending: tierProgress.currentSpending,
          totalSpent: Number(customer.totalSpent || 0),
          totalRefunded: Number(customer.totalRefunded || 0),
          netSpent: Number(customer.netSpent || 0),
          nextTierTarget: tierProgress.nextTierTarget,
          nextTierName: tierProgress.nextTierName,
          nextTierCashback: tierProgress.nextTierCashback,
          amountRemaining: tierProgress.amountRemaining,
          progressPercent: tierProgress.progressPercent,
          isMaxTier: tierProgress.isMaxTier,
          allTiers: tierProgress.allTiers
        },
        theme: shopSettings ? {
          mode: shopSettings.widgetThemeMode || 'LIGHT',
          primaryColor: shopSettings.widgetPrimaryColor || '#5C6AC4',
          backgroundColor: shopSettings.widgetBackgroundColor || '#FFFFFF',
          textColor: shopSettings.widgetTextColor || '#212B36',
          accentColor: shopSettings.widgetAccentColor || '#008060',
          borderRadius: shopSettings.widgetBorderRadius || 12,
          fontFamily: shopSettings.widgetFontFamily || 'inherit',
        } : {
          mode: 'LIGHT',
          primaryColor: '#5C6AC4',
          backgroundColor: '#FFFFFF',
          textColor: '#212B36',
          accentColor: '#008060',
          borderRadius: 12,
          fontFamily: 'inherit',
        },
        settings: {
          currency: shopSettings?.storeCurrency || 'USD',
        },
        query: {
          shopDomain: shop,
          shopifyCustomerId: customerId,
          endpoint: '/apps/rewardspro/api/customer',
          foundInDatabase: true,
          method: 'AWS Aurora Data API (Direct SQL)',
          executionTime: executionTime + 'ms'
        }
      };

      console.log('[Proxy API] 📤 Preparing success response...');
      console.log('[Proxy API] 🎯 Response data keys:', Object.keys(responseData));

      // DEBUG: Extra validation before returning
      console.log('[Proxy API] 🎯 FINAL RESPONSE VALUES:', {
        'tier.name': responseData.membership.tier.name,
        'tier.cashbackPercent': responseData.membership.tier.cashbackPercent,
        'balance.storeCredit': responseData.balance.storeCredit,
        'balance.totalEarned': responseData.balance.totalEarned,
        'customerEmail': responseData.customer.email
      });

      console.log('[Proxy API] ✅ Full response object:', JSON.stringify(responseData, null, 2));
      console.log('[Proxy API] 📋 Response headers:', JSON.stringify(headers));
      console.log('[Proxy API] 📤 Calling json() to return response...');

      const jsonResponse = json(responseData, { headers });
      console.log('[Proxy API] ✅ json() completed, returning response');
      return jsonResponse;

    } catch (error: any) {
      console.error('[Proxy API] ❌ Caught error in membership endpoint');
      console.error('[Proxy API] ❌ Error message:', error.message);
      console.error('[Proxy API] ❌ Error stack:', error.stack);
      console.error('[Proxy API] ❌ Error details:', {
        name: error.name,
        code: error.code,
        cause: error.cause
      });

      // Return error with fallback data
      const errorResponse = {
        success: false,
        error: "Database error",
        message: "Unable to load rewards data. Please try again later.",
        requiresLogin: false,
        query: {
          shopDomain: shop,
          shopifyCustomerId: customerId,
          endpoint: '/apps/rewardspro/api/customer',
          foundInDatabase: false,
          method: 'Error - Query Failed',
          executionTime: 'N/A'
        },
        customer: {
          id: "error",
          shopifyId: customerId,
          email: ""
        },
        balance: {
          storeCredit: 0,
          totalEarned: 0,
          lastSynced: null
        },
        membership: {
          tier: {
            id: "error",
            name: "Bronze",
            cashbackPercent: 1
          }
        }
      };

      console.log('[Proxy API] 📤 Returning error response:', JSON.stringify(errorResponse, null, 2));
      return json(errorResponse, { status: 500, headers });
    }
  }
  
  // 404 for unknown paths
  console.log('[Proxy API] ⚠️ Unknown path requested:', proxyPath);
  const notFoundResponse = {
    success: false,
    error: "Not found",
    message: `Endpoint '${proxyPath}' not found`,
    availablePaths: ["test", "membership"]
  };
  console.log('[Proxy API] 📤 Returning 404 response:', JSON.stringify(notFoundResponse));
  return json(notFoundResponse, { status: 404, headers });
}

// Handle OPTIONS requests for CORS
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  
  return json({ error: "Method not allowed" }, { status: 405 });
}