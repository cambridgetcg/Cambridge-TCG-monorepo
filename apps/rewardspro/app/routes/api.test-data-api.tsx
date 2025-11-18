import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getAuroraClient } from "../utils/aurora-data-api";
import type { SqlParameter } from "@aws-sdk/client-rds-data";

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

/**
 * Test endpoint to debug Data API queries directly
 * WARNING: This bypasses authentication for testing purposes
 * NOTE: Read-only operation, queries customer data but doesn't modify anything
 */
export async function loader({ request }: LoaderFunctionArgs) {
  console.log('[Test Data API] 🔵 Request received');
  console.log('[Test Data API] 📍 URL:', request.url);
  console.log('[Test Data API] 🌍 Environment:', process.env.NODE_ENV);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("customerId");

  console.log('[Test Data API] 📋 Query parameters:', { shop, customerId });

  if (!shop || !customerId) {
    const errorResponse = {
      success: false,
      error: "Missing required parameters",
      message: "Both 'shop' and 'customerId' parameters are required",
    };
    console.log('[Test Data API] ❌ Missing parameters, returning error:', JSON.stringify(errorResponse));
    return json(errorResponse, { status: 400 });
  }

  try {
    console.log('[Test Data API] 🔍 Getting Aurora client...');
    const dataApi = getAuroraClient();
    console.log('[Test Data API] ✅ Aurora client ready');

    // Build the exact SQL query used in the proxy
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
        c."annualSpent",
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

    // Execute query and measure time
    console.log('[Test Data API] ⏱️ Executing SQL query...');
    const startTime = Date.now();
    const result = await dataApi.executeStatement(sql, parameters);
    const executionTime = Date.now() - startTime;
    console.log('[Test Data API] ✅ Query executed in', executionTime + 'ms');
    console.log('[Test Data API] 📊 Result:', {
      hasRecords: !!(result.records && result.records.length > 0),
      recordCount: result.records?.length || 0
    });

    // Format the SQL for display (pretty print)
    const formattedSql = sql
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Check if customer was found
    const customerFound = result.records && result.records.length > 0;
    console.log('[Test Data API] 🔍 Customer found:', customerFound);
    let customer = null;

    if (customerFound) {
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
        annualSpent: row.annualSpent,
        netSpent: row.netSpent,
        totalRefunded: row.totalRefunded,
        orderCount: row.orderCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        currentTierId: row.currentTierId,
        currentTier: row.tier_id ? {
          id: row.tier_id,
          shopDomain: row.tier_shop,
          name: row.tier_name,
          minSpend: row.tier_minSpend,
          cashbackPercent: row.tier_cashbackPercent
        } : null
      };
    }

    // Query all tiers for the shop to calculate tier progression
    console.log('[Test Data API] 🔍 Fetching all tiers for shop to calculate progression...');
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

    console.log('[Test Data API] ⏱️ Tiers query execution time:', tiersExecutionTime + 'ms');
    console.log('[Test Data API] 📊 Tiers found:', tiersResult.records?.length || 0);

    // Transform tiers result
    const allTiers = tiersResult.records?.map(row => ({
      id: row.id,
      name: row.name,
      minSpend: Number(row.minSpend || 0),
      cashbackPercent: Number(row.cashbackPercent || 0)
    })) || [];

    console.log('[Test Data API] 📦 All tiers:', allTiers.map(t => ({
      name: t.name,
      minSpend: t.minSpend,
      cashbackPercent: t.cashbackPercent
    })));

    // Calculate tier progression if customer found
    let tierProgress = null;
    if (customerFound && customer.currentTier) {
      tierProgress = calculateTierProgress(
        Number(customer.netSpent || 0),
        {
          id: customer.currentTier.id,
          name: customer.currentTier.name,
          minSpend: Number(customer.currentTier.minSpend || 0),
          cashbackPercent: Number(customer.currentTier.cashbackPercent || 0)
        },
        allTiers
      );
    }

    const responseData = {
      success: true,
      query: {
        sql: formattedSql,
        parameters: parameters.map(p => ({
          name: p.name,
          value: p.value?.stringValue || p.value?.longValue || p.value?.doubleValue || p.value?.booleanValue || null
        })),
        executionTime: `${executionTime}ms`,
        method: 'AWS Aurora Data API (Direct SQL)',
        recordCount: result.records?.length || 0,
        foundInDatabase: customerFound
      },
      customer: customerFound ? {
        id: customer.id,
        shopifyId: customer.shopifyCustomerId,
        email: customer.email,
        memberSince: customer.createdAt,
        totalSpent: Number(customer.totalSpent || 0),
        annualSpent: Number(customer.annualSpent || 0),
        totalRefunded: Number(customer.totalRefunded || 0),
        netSpent: Number(customer.netSpent || 0),
        orderCount: Number(customer.orderCount || 0)
      } : null,
      balance: customerFound ? {
        storeCredit: Number(customer.storeCredit || 0),
        totalEarned: Number(customer.totalCashbackEarned || 0),
        lastSynced: customer.updatedAt
      } : null,
      membership: customerFound && customer.currentTier ? {
        tier: {
          id: customer.currentTier.id,
          name: customer.currentTier.name,
          cashbackPercent: Number(customer.currentTier.cashbackPercent || 0)
        }
      } : null,
      tierProgress: tierProgress ? {
        currentSpending: tierProgress.currentSpending,
        totalSpent: customerFound ? Number(customer.totalSpent || 0) : 0,
        totalRefunded: customerFound ? Number(customer.totalRefunded || 0) : 0,
        netSpent: customerFound ? Number(customer.netSpent || 0) : 0,
        nextTierTarget: tierProgress.nextTierTarget,
        nextTierName: tierProgress.nextTierName,
        nextTierCashback: tierProgress.nextTierCashback,
        amountRemaining: tierProgress.amountRemaining,
        progressPercent: tierProgress.progressPercent,
        isMaxTier: tierProgress.isMaxTier,
        allTiers: tierProgress.allTiers
      } : null,
      rawResult: customerFound ? result.records[0] : null
    };

    console.log('[Test Data API] 📤 Preparing response...');
    console.log('[Test Data API] 🎯 Response data keys:', Object.keys(responseData));
    console.log('[Test Data API] 📦 Full response:', JSON.stringify(responseData, null, 2));

    return json(responseData);

  } catch (error: any) {
    console.error('[Test Data API] ❌ Caught error in main try-catch');
    console.error('[Test Data API] ❌ Error message:', error.message);
    console.error('[Test Data API] ❌ Error stack:', error.stack);
    console.error('[Test Data API] ❌ Error details:', {
      name: error.name,
      code: error.code,
      cause: error.cause
    });

    const errorResponse = {
      success: false,
      error: error.message || 'Database query failed',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      query: {
        method: 'AWS Aurora Data API (Direct SQL)',
        executionTime: 'N/A',
        foundInDatabase: false
      }
    };

    console.log('[Test Data API] 📤 Returning error response:', JSON.stringify(errorResponse, null, 2));
    return json(errorResponse, { status: 500 });
  }
}
