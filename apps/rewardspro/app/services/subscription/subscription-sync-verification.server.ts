/**
 * Subscription Sync Verification Service
 *
 * Compares local subscription state with Shopify to detect discrepancies.
 * Used for debugging and ensuring data integrity.
 *
 * Part of Neural Network Optimization - Debugging Infrastructure
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import { subscriptionLogger, withCorrelation, generateCorrelationId } from './subscription-correlation.server';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ShopifyContractState {
  id: string;
  status: string;
  nextBillingDate: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    email: string;
  };
  lines: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    currentPrice: string;
  }>;
}

export interface LocalSubscriptionState {
  id: string;
  shopifyContractId: string | null;
  status: string;
  nextBillingDate: Date | null;
  customerId: string;
  customerShopifyId: string;
  tierId: string;
  tierName: string | null;
  currentPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncDiscrepancy {
  field: string;
  local: unknown;
  shopify: unknown;
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

export interface SyncVerificationResult {
  subscriptionId: string;
  contractId: string;
  inSync: boolean;
  localState: LocalSubscriptionState | null;
  shopifyState: ShopifyContractState | null;
  discrepancies: SyncDiscrepancy[];
  verifiedAt: Date;
  error?: string;
}

export interface BulkSyncVerificationResult {
  shop: string;
  totalChecked: number;
  inSync: number;
  outOfSync: number;
  errors: number;
  results: SyncVerificationResult[];
  criticalIssues: SyncVerificationResult[];
  verifiedAt: Date;
}

// ============================================================================
// SYNC VERIFICATION SERVICE
// ============================================================================

export class SubscriptionSyncVerificationService {
  /**
   * Verify a single subscription's sync state
   */
  static async verifySubscription(
    admin: AdminApiContext,
    shop: string,
    subscriptionId: string
  ): Promise<SyncVerificationResult> {
    const correlationId = generateCorrelationId();

    return withCorrelation(
      {
        correlationId,
        shop,
        operation: 'sync_verify',
        subscriptionId,
      },
      async () => {
        subscriptionLogger.operationStart('verifySubscription', { subscriptionId });

        const verifiedAt = new Date();

        try {
          // Get local state
          const localSubscription = await db.tierSubscription.findUnique({
            where: { id: subscriptionId },
            include: {
              customer: true,
              tier: true,
            },
          });

          if (!localSubscription) {
            return {
              subscriptionId,
              contractId: 'unknown',
              inSync: false,
              localState: null,
              shopifyState: null,
              discrepancies: [],
              verifiedAt,
              error: 'Subscription not found in local database',
            };
          }

          if (!localSubscription.shopifyContractId) {
            return {
              subscriptionId,
              contractId: 'none',
              inSync: true, // No Shopify contract to compare
              localState: this.formatLocalState(localSubscription),
              shopifyState: null,
              discrepancies: [{
                field: 'shopifyContractId',
                local: null,
                shopify: null,
                severity: 'info',
                description: 'Subscription has no Shopify contract (local-only)',
              }],
              verifiedAt,
            };
          }

          // Get Shopify state
          const shopifyContract = await this.fetchShopifyContract(admin, localSubscription.shopifyContractId);

          if (!shopifyContract) {
            return {
              subscriptionId,
              contractId: localSubscription.shopifyContractId,
              inSync: false,
              localState: this.formatLocalState(localSubscription),
              shopifyState: null,
              discrepancies: [{
                field: 'existence',
                local: 'exists',
                shopify: 'not_found',
                severity: 'critical',
                description: 'Subscription exists locally but not in Shopify',
              }],
              verifiedAt,
            };
          }

          // Compare states
          const discrepancies = this.compareStates(
            this.formatLocalState(localSubscription),
            shopifyContract
          );

          const result: SyncVerificationResult = {
            subscriptionId,
            contractId: localSubscription.shopifyContractId,
            inSync: discrepancies.length === 0,
            localState: this.formatLocalState(localSubscription),
            shopifyState: shopifyContract,
            discrepancies,
            verifiedAt,
          };

          subscriptionLogger.operationComplete('verifySubscription', {
            inSync: result.inSync,
            discrepancyCount: discrepancies.length,
          });

          return result;
        } catch (error) {
          subscriptionLogger.error('Sync verification failed', error);
          return {
            subscriptionId,
            contractId: 'unknown',
            inSync: false,
            localState: null,
            shopifyState: null,
            discrepancies: [],
            verifiedAt,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }
    );
  }

  /**
   * Verify all subscriptions for a shop
   */
  static async verifyAllForShop(
    admin: AdminApiContext,
    shop: string,
    options?: {
      limit?: number;
      onlyActive?: boolean;
      onlyWithContract?: boolean;
    }
  ): Promise<BulkSyncVerificationResult> {
    const correlationId = generateCorrelationId();

    return withCorrelation(
      {
        correlationId,
        shop,
        operation: 'bulk_sync_verify',
      },
      async () => {
        subscriptionLogger.operationStart('verifyAllForShop', options);

        const limit = options?.limit || 100;
        const verifiedAt = new Date();

        // Get subscriptions to verify
        const subscriptions = await db.tierSubscription.findMany({
          where: {
            shop,
            ...(options?.onlyActive && { status: 'ACTIVE' }),
            ...(options?.onlyWithContract && { shopifyContractId: { not: null } }),
          },
          take: limit,
          orderBy: { updatedAt: 'desc' },
        });

        const results: SyncVerificationResult[] = [];
        let inSync = 0;
        let outOfSync = 0;
        let errors = 0;

        for (const subscription of subscriptions) {
          const result = await this.verifySubscription(admin, shop, subscription.id);
          results.push(result);

          if (result.error) {
            errors++;
          } else if (result.inSync) {
            inSync++;
          } else {
            outOfSync++;
          }
        }

        const criticalIssues = results.filter(r =>
          r.discrepancies.some(d => d.severity === 'critical')
        );

        subscriptionLogger.operationComplete('verifyAllForShop', {
          totalChecked: subscriptions.length,
          inSync,
          outOfSync,
          errors,
          criticalCount: criticalIssues.length,
        });

        return {
          shop,
          totalChecked: subscriptions.length,
          inSync,
          outOfSync,
          errors,
          results,
          criticalIssues,
          verifiedAt,
        };
      }
    );
  }

  /**
   * Find orphaned subscriptions (exist locally but not in Shopify)
   */
  static async findOrphanedSubscriptions(
    admin: AdminApiContext,
    shop: string,
    limit: number = 50
  ): Promise<Array<{ subscriptionId: string; contractId: string; status: string }>> {
    const subscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        shopifyContractId: { not: null },
        status: { in: ['ACTIVE', 'PAUSED'] }, // Only check non-terminal states
      },
      take: limit,
      select: {
        id: true,
        shopifyContractId: true,
        status: true,
      },
    });

    const orphaned: Array<{ subscriptionId: string; contractId: string; status: string }> = [];

    for (const sub of subscriptions) {
      if (!sub.shopifyContractId) continue;

      const shopifyContract = await this.fetchShopifyContract(admin, sub.shopifyContractId);
      if (!shopifyContract) {
        orphaned.push({
          subscriptionId: sub.id,
          contractId: sub.shopifyContractId,
          status: sub.status,
        });
      }
    }

    return orphaned;
  }

  /**
   * Find status mismatches between local and Shopify
   */
  static async findStatusMismatches(
    admin: AdminApiContext,
    shop: string,
    limit: number = 50
  ): Promise<Array<{ subscriptionId: string; localStatus: string; shopifyStatus: string }>> {
    const subscriptions = await db.tierSubscription.findMany({
      where: {
        shop,
        shopifyContractId: { not: null },
      },
      take: limit,
      select: {
        id: true,
        shopifyContractId: true,
        status: true,
      },
    });

    const mismatches: Array<{ subscriptionId: string; localStatus: string; shopifyStatus: string }> = [];

    for (const sub of subscriptions) {
      if (!sub.shopifyContractId) continue;

      const shopifyContract = await this.fetchShopifyContract(admin, sub.shopifyContractId);
      if (shopifyContract && !this.statusesMatch(sub.status, shopifyContract.status)) {
        mismatches.push({
          subscriptionId: sub.id,
          localStatus: sub.status,
          shopifyStatus: shopifyContract.status,
        });
      }
    }

    return mismatches;
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Fetch subscription contract from Shopify
   */
  private static async fetchShopifyContract(
    admin: AdminApiContext,
    contractId: string
  ): Promise<ShopifyContractState | null> {
    const query = `
      query GetSubscriptionContract($id: ID!) {
        subscriptionContract(id: $id) {
          id
          status
          nextBillingDate
          createdAt
          updatedAt
          customer {
            id
            email
          }
          lines(first: 10) {
            edges {
              node {
                productId
                variantId
                quantity
                currentPrice {
                  amount
                }
              }
            }
          }
        }
      }
    `;

    try {
      // Ensure contractId is a GID
      const gid = contractId.startsWith('gid://')
        ? contractId
        : `gid://shopify/SubscriptionContract/${contractId}`;

      const response = await admin.graphql(query, {
        variables: { id: gid },
      });
      const data = await response.json();

      const contract = data.data?.subscriptionContract;
      if (!contract) return null;

      return {
        id: contract.id,
        status: contract.status,
        nextBillingDate: contract.nextBillingDate,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
        customer: {
          id: contract.customer?.id || '',
          email: contract.customer?.email || '',
        },
        lines: contract.lines?.edges?.map((e: any) => ({
          productId: e.node.productId,
          variantId: e.node.variantId,
          quantity: e.node.quantity,
          currentPrice: e.node.currentPrice?.amount || '0',
        })) || [],
      };
    } catch (error) {
      subscriptionLogger.warn('Failed to fetch Shopify contract', { contractId, error });
      return null;
    }
  }

  /**
   * Format local subscription state for comparison
   */
  private static formatLocalState(subscription: any): LocalSubscriptionState {
    return {
      id: subscription.id,
      shopifyContractId: subscription.shopifyContractId,
      status: subscription.status,
      nextBillingDate: subscription.nextBillingDate,
      customerId: subscription.customerId,
      customerShopifyId: subscription.customer?.shopifyCustomerId || '',
      tierId: subscription.tierId,
      tierName: subscription.tier?.name || null,
      currentPrice: Number(subscription.currentPrice) || 0,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  /**
   * Compare local and Shopify states to find discrepancies
   */
  private static compareStates(
    local: LocalSubscriptionState,
    shopify: ShopifyContractState
  ): SyncDiscrepancy[] {
    const discrepancies: SyncDiscrepancy[] = [];

    // Status comparison
    if (!this.statusesMatch(local.status, shopify.status)) {
      discrepancies.push({
        field: 'status',
        local: local.status,
        shopify: shopify.status,
        severity: 'critical',
        description: `Status mismatch: local is ${local.status}, Shopify is ${shopify.status}`,
      });
    }

    // Next billing date comparison (allow 1 day tolerance)
    if (local.nextBillingDate && shopify.nextBillingDate) {
      const localDate = new Date(local.nextBillingDate).getTime();
      const shopifyDate = new Date(shopify.nextBillingDate).getTime();
      const diffMs = Math.abs(localDate - shopifyDate);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays > 1) {
        discrepancies.push({
          field: 'nextBillingDate',
          local: local.nextBillingDate,
          shopify: shopify.nextBillingDate,
          severity: 'warning',
          description: `Billing date differs by ${diffDays.toFixed(1)} days`,
        });
      }
    }

    // Customer ID comparison
    const shopifyCustomerNumericId = shopify.customer.id.replace('gid://shopify/Customer/', '');
    if (local.customerShopifyId !== shopifyCustomerNumericId) {
      discrepancies.push({
        field: 'customerId',
        local: local.customerShopifyId,
        shopify: shopifyCustomerNumericId,
        severity: 'critical',
        description: 'Customer ID mismatch - subscription may be assigned to wrong customer',
      });
    }

    // Price comparison (allow small tolerance for rounding)
    if (shopify.lines.length > 0) {
      const shopifyPrice = parseFloat(shopify.lines[0].currentPrice);
      const priceDiff = Math.abs(local.currentPrice - shopifyPrice);

      if (priceDiff > 0.01) {
        discrepancies.push({
          field: 'currentPrice',
          local: local.currentPrice,
          shopify: shopifyPrice,
          severity: 'warning',
          description: `Price differs by ${priceDiff.toFixed(2)}`,
        });
      }
    }

    return discrepancies;
  }

  /**
   * Check if statuses are equivalent (accounting for naming differences)
   */
  private static statusesMatch(localStatus: string, shopifyStatus: string): boolean {
    // Normalize statuses
    const normalizeStatus = (status: string) => status.toUpperCase();

    const localNorm = normalizeStatus(localStatus);
    const shopifyNorm = normalizeStatus(shopifyStatus);

    // Direct match
    if (localNorm === shopifyNorm) return true;

    // Handle known mappings
    const equivalentStatuses: Record<string, string[]> = {
      'ACTIVE': ['ACTIVE'],
      'PAUSED': ['PAUSED'],
      'CANCELLED': ['CANCELLED', 'CANCELED'],
      'EXPIRED': ['EXPIRED'],
      'FAILED': ['FAILED'],
    };

    const localEquivalents = equivalentStatuses[localNorm] || [localNorm];
    return localEquivalents.includes(shopifyNorm);
  }
}

// ============================================================================
// DIAGNOSTIC QUERIES
// ============================================================================

/**
 * Get subscription health metrics for a shop
 */
export async function getSubscriptionHealthMetrics(shop: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  withContractId: number;
  withoutContractId: number;
  failedPayments: number;
  inGracePeriod: number;
  recentlyUpdated: number;
}> {
  // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
  // Replace groupBy with findMany + in-memory aggregation
  const [
    total,
    statusEntries,
    withContract,
    failedPayments,
    recentlyUpdated,
  ] = await Promise.all([
    db.tierSubscription.count({ where: { shop } }),
    db.tierSubscription.findMany({
      where: { shop },
      select: { status: true },
    }),
    db.tierSubscription.count({
      where: { shop, shopifyContractId: { not: null } },
    }),
    db.tierSubscription.count({
      where: { shop, status: 'FAILED' },
    }),
    db.tierSubscription.count({
      where: {
        shop,
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  // Count by status in memory (replaces groupBy)
  const byStatus: Record<string, number> = {};
  for (const entry of statusEntries) {
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }

  // Check grace periods
  const now = new Date();
  const inGracePeriod = await db.tierSubscription.count({
    where: {
      shop,
      status: 'FAILED',
      metadata: {
        path: ['gracePeriodEnd'],
        gte: now.toISOString(),
      },
    },
  });

  return {
    total,
    byStatus,
    withContractId: withContract,
    withoutContractId: total - withContract,
    failedPayments,
    inGracePeriod,
    recentlyUpdated,
  };
}

/**
 * Find subscriptions with potential issues
 */
export async function findPotentialIssues(shop: string): Promise<{
  duplicateContracts: Array<{ contractId: string; count: number }>;
  staleFailedSubscriptions: Array<{ id: string; failedAt: Date }>;
  invalidTransitions: Array<{ id: string; lastTransition: any }>;
}> {
  // Find duplicate contract IDs
  const duplicates = await db.$queryRaw`
    SELECT "shopifyContractId", COUNT(*) as count
    FROM "TierSubscription"
    WHERE shop = ${shop}
      AND "shopifyContractId" IS NOT NULL
    GROUP BY "shopifyContractId"
    HAVING COUNT(*) > 1
  `;

  // Find stale FAILED subscriptions (failed > 7 days ago, still FAILED)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleFailed = await db.tierSubscription.findMany({
    where: {
      shop,
      status: 'FAILED',
      updatedAt: { lt: sevenDaysAgo },
    },
    select: { id: true, updatedAt: true },
    take: 50,
  });

  return {
    duplicateContracts: duplicates.map(d => ({
      contractId: d.shopifyContractId,
      count: Number(d.count),
    })),
    staleFailedSubscriptions: staleFailed.map(s => ({
      id: s.id,
      failedAt: s.updatedAt,
    })),
    invalidTransitions: [], // Would need to parse metadata to check
  };
}

// Convenience export
export const verifySubscriptionSync = SubscriptionSyncVerificationService.verifySubscription.bind(SubscriptionSyncVerificationService);
export const verifyAllSubscriptionsSync = SubscriptionSyncVerificationService.verifyAllForShop.bind(SubscriptionSyncVerificationService);
