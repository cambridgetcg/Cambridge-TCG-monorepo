/**
 * Tier Health Monitoring Endpoint
 *
 * Provides health check for the tier resolution system:
 * - Detects orphaned tier purchases (references to deleted tiers)
 * - Detects orphaned tier subscriptions
 * - Detects customers with orphaned currentTierId
 * - Detects duplicate active subscriptions
 *
 * Useful for operations monitoring and debugging tier issues.
 *
 * GET /api/admin/tier-health - Returns health status
 * GET /api/admin/tier-health?shop=example.myshopify.com - Filter by shop
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";

interface TierHealthReport {
  healthy: boolean;
  timestamp: string;
  shop?: string;
  metrics: {
    orphanedPurchases: number;
    orphanedSubscriptions: number;
    customersWithOrphanedTier: number;
    duplicateActiveSubscriptions: number;
    totalActiveSubscriptions: number;
    totalActivePurchases: number;
  };
  details?: {
    orphanedPurchaseIds?: string[];
    orphanedSubscriptionIds?: string[];
    customersWithOrphanedTierIds?: string[];
    duplicateSubscriptionCustomerIds?: string[];
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  // 1. Verify authorization (require CRON_SECRET or admin token)
  const auth = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  const adminToken = process.env.ADMIN_API_TOKEN;

  const isAuthorized =
    (process.env.CRON_SECRET && auth === expectedAuth) ||
    (adminToken && auth === `Bearer ${adminToken}`);

  if (!isAuthorized) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse optional shop filter
  const url = new URL(request.url);
  const shopFilter = url.searchParams.get('shop');
  const includeDetails = url.searchParams.get('details') === 'true';

  try {
    // Build where clause
    const shopWhere = shopFilter ? { shop: shopFilter } : {};

    // 3. Count orphaned tier purchases (tier is null but status is ACTIVE)
    // With the SetNull change, tier will be null when the tier is deleted
    const orphanedPurchases = await db.tierPurchase.findMany({
      where: {
        ...shopWhere,
        tierId: null,  // Tier was deleted (SetNull)
        status: 'ACTIVE'
      },
      select: { id: true, customerId: true, shop: true }
    });

    // 4. Count orphaned tier subscriptions
    const orphanedSubscriptions = await db.tierSubscription.findMany({
      where: {
        ...shopWhere,
        tierId: null,  // Tier was deleted (SetNull)
        status: 'ACTIVE'
      },
      select: { id: true, customerId: true, shop: true }
    });

    // 5. Count customers with currentTierId pointing to non-existent tier
    // This uses a raw query since Prisma can't easily express "foreign key but no matching record"
    const customersWithOrphanedTier = await db.$queryRaw<
      Array<{ id: string; shop: string; currentTierId: string }>
    >`
      SELECT c.id, c.shop, c."currentTierId"
      FROM "Customer" c
      LEFT JOIN "Tier" t ON c."currentTierId" = t.id
      WHERE c."currentTierId" IS NOT NULL
        AND t.id IS NULL
        ${shopFilter ? db.$queryRaw`AND c.shop = ${shopFilter}` : db.$queryRaw``}
      LIMIT 100
    `;

    // 6. Find duplicate active subscriptions (same customer with multiple ACTIVE)
    const duplicateActiveSubscriptions = await db.$queryRaw<
      Array<{ customerId: string; shop: string; count: bigint }>
    >`
      SELECT "customerId", shop, COUNT(*) as count
      FROM "TierSubscription"
      WHERE status = 'ACTIVE'
        ${shopFilter ? db.$queryRaw`AND shop = ${shopFilter}` : db.$queryRaw``}
      GROUP BY "customerId", shop
      HAVING COUNT(*) > 1
      LIMIT 100
    `;

    // 7. Get total counts for context
    const totalActiveSubscriptions = await db.tierSubscription.count({
      where: { ...shopWhere, status: 'ACTIVE' }
    });

    const totalActivePurchases = await db.tierPurchase.count({
      where: { ...shopWhere, status: 'ACTIVE' }
    });

    // 8. Build health report
    const isHealthy =
      orphanedPurchases.length === 0 &&
      orphanedSubscriptions.length === 0 &&
      customersWithOrphanedTier.length === 0 &&
      duplicateActiveSubscriptions.length === 0;

    const report: TierHealthReport = {
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
      shop: shopFilter || undefined,
      metrics: {
        orphanedPurchases: orphanedPurchases.length,
        orphanedSubscriptions: orphanedSubscriptions.length,
        customersWithOrphanedTier: customersWithOrphanedTier.length,
        duplicateActiveSubscriptions: duplicateActiveSubscriptions.length,
        totalActiveSubscriptions,
        totalActivePurchases
      }
    };

    // Include details if requested
    if (includeDetails && !isHealthy) {
      report.details = {
        orphanedPurchaseIds: orphanedPurchases.map(p => p.id),
        orphanedSubscriptionIds: orphanedSubscriptions.map(s => s.id),
        customersWithOrphanedTierIds: customersWithOrphanedTier.map(c => c.id),
        duplicateSubscriptionCustomerIds: duplicateActiveSubscriptions.map(
          d => d.customerId
        )
      };
    }

    // 9. Log issues if any found
    if (!isHealthy) {
      console.warn('[TierHealth] Health check found issues:', {
        orphanedPurchases: orphanedPurchases.length,
        orphanedSubscriptions: orphanedSubscriptions.length,
        customersWithOrphanedTier: customersWithOrphanedTier.length,
        duplicateActiveSubscriptions: duplicateActiveSubscriptions.length
      });
    }

    return json(report);

  } catch (error) {
    console.error('[TierHealth] Error running health check:', error);
    return json({
      healthy: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Loader only - no action needed for health checks
