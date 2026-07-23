/**
 * Subscription Reconciliation Service
 *
 * Detects and resolves inconsistencies between local database
 * and Shopify's subscription state.
 *
 * @module reconciliation.server
 */

import prisma from "../../db.server";
import { v4 as uuidv4 } from "uuid";

// ============================================
// TYPES
// ============================================

export interface ReconciliationMismatch {
  field: string;
  localValue: any;
  expectedValue: any;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ReconciliationResult {
  shop: string;
  hasIssues: boolean;
  mismatches: ReconciliationMismatch[];
  autoFixed: boolean;
  requiresManualReview: boolean;
}

export interface ReconciliationJobResult {
  startedAt: Date;
  completedAt: Date;
  shopsChecked: number;
  issuesFound: number;
  autoFixed: number;
  manualReviewRequired: number;
  errors: string[];
}

// ============================================
// LOCAL RECONCILIATION
// ============================================

/**
 * Check consistency between local tables for a shop
 *
 * Compares AppSubscription, ShopSettings, and BillingSubscription.
 *
 * @param shop - Shop domain
 */
export async function reconcileLocalState(shop: string): Promise<ReconciliationResult> {
  const mismatches: ReconciliationMismatch[] = [];

  try {
    // Fetch all related records
    const [appSubscription, shopSettings, billingSubscription] = await Promise.all([
      prisma.appSubscription.findUnique({
        where: { shop },
        select: {
          status: true,
          planName: true,
          shopifySubscriptionId: true,
        },
      }),
      prisma.shopSettings.findUnique({
        where: { shop },
        select: {
          subscriptionStatus: true,
          currentPlanName: true,
          billingStatus: true,
        },
      }),
      prisma.billingSubscription.findUnique({
        where: { shop },
        select: {
          subscriptionStatus: true,
          subscriptionId: true,
        },
      }),
    ]);

    // Check for missing records
    if (!appSubscription && (shopSettings?.subscriptionStatus === "ACTIVE" ||
        billingSubscription?.subscriptionStatus === "ACTIVE")) {
      mismatches.push({
        field: "AppSubscription",
        localValue: null,
        expectedValue: "exists",
        severity: "HIGH",
      });
    }

    // Check status consistency
    if (appSubscription && shopSettings) {
      if (appSubscription.status !== shopSettings.subscriptionStatus) {
        mismatches.push({
          field: "status",
          localValue: `AppSubscription: ${appSubscription.status}, ShopSettings: ${shopSettings.subscriptionStatus}`,
          expectedValue: appSubscription.status,
          severity: "HIGH",
        });
      }
    }

    if (appSubscription && billingSubscription) {
      if (appSubscription.status !== billingSubscription.subscriptionStatus) {
        mismatches.push({
          field: "status",
          localValue: `AppSubscription: ${appSubscription.status}, BillingSubscription: ${billingSubscription.subscriptionStatus}`,
          expectedValue: appSubscription.status,
          severity: "HIGH",
        });
      }
    }

    // Check plan name consistency
    if (appSubscription && shopSettings) {
      if (appSubscription.planName !== shopSettings.currentPlanName &&
          shopSettings.currentPlanName !== null) {
        mismatches.push({
          field: "planName",
          localValue: `AppSubscription: ${appSubscription.planName}, ShopSettings: ${shopSettings.currentPlanName}`,
          expectedValue: appSubscription.planName,
          severity: "MEDIUM",
        });
      }
    }

    // Check billing status consistency
    if (shopSettings) {
      const expectedBillingStatus = shopSettings.subscriptionStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE";
      if (shopSettings.billingStatus !== expectedBillingStatus) {
        mismatches.push({
          field: "billingStatus",
          localValue: shopSettings.billingStatus,
          expectedValue: expectedBillingStatus,
          severity: "MEDIUM",
        });
      }
    }

    const hasHighSeverity = mismatches.some(m => m.severity === "HIGH" || m.severity === "CRITICAL");

    return {
      shop,
      hasIssues: mismatches.length > 0,
      mismatches,
      autoFixed: false,
      requiresManualReview: hasHighSeverity,
    };

  } catch (error: any) {
    console.error(`[Reconciliation] Error checking ${shop}:`, error);
    return {
      shop,
      hasIssues: true,
      mismatches: [{
        field: "error",
        localValue: error.message,
        expectedValue: "no error",
        severity: "CRITICAL",
      }],
      autoFixed: false,
      requiresManualReview: true,
    };
  }
}

/**
 * Auto-fix local state inconsistencies
 *
 * Uses AppSubscription as source of truth.
 *
 * @param shop - Shop domain
 */
export async function fixLocalStateInconsistencies(shop: string): Promise<boolean> {
  try {
    const appSubscription = await prisma.appSubscription.findUnique({
      where: { shop },
      select: {
        status: true,
        planName: true,
        shopifySubscriptionId: true,
      },
    });

    if (!appSubscription) {
      console.log(`[Reconciliation] No AppSubscription for ${shop}, cannot auto-fix`);
      return false;
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Update ShopSettings to match AppSubscription
      await tx.shopSettings.update({
        where: { shop },
        data: {
          subscriptionStatus: appSubscription.status,
          currentPlanName: appSubscription.planName,
          billingStatus: appSubscription.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
          subscriptionUpdatedAt: now,
          updatedAt: now,
        },
      });

      // Update BillingSubscription to match
      await tx.billingSubscription.updateMany({
        where: { shop },
        data: {
          subscriptionStatus: appSubscription.status,
          subscriptionId: appSubscription.shopifySubscriptionId,
          updatedAt: now,
        },
      });
    });

    console.log(`[Reconciliation] Auto-fixed inconsistencies for ${shop}`);
    return true;

  } catch (error) {
    console.error(`[Reconciliation] Failed to auto-fix ${shop}:`, error);
    return false;
  }
}

// ============================================
// RECONCILIATION JOB
// ============================================

/**
 * Run full reconciliation job
 *
 * Checks all shops for inconsistencies and attempts auto-fixes.
 */
export async function runReconciliationJob(): Promise<ReconciliationJobResult> {
  const startedAt = new Date();
  console.log("[Reconciliation] Starting reconciliation job...");

  const result: ReconciliationJobResult = {
    startedAt,
    completedAt: new Date(),
    shopsChecked: 0,
    issuesFound: 0,
    autoFixed: 0,
    manualReviewRequired: 0,
    errors: [],
  };

  try {
    // Get all shops with subscription data
    const shops = await prisma.appSubscription.findMany({
      select: { shop: true },
    });

    result.shopsChecked = shops.length;
    console.log(`[Reconciliation] Checking ${shops.length} shops...`);

    for (const { shop } of shops) {
      try {
        // Check for inconsistencies
        const checkResult = await reconcileLocalState(shop);

        if (checkResult.hasIssues) {
          result.issuesFound++;

          // Log the issue
          await prisma.reconciliationLog.create({
            data: {
              id: uuidv4(),
              shop,
              mismatches: checkResult.mismatches,
              mismatchCount: checkResult.mismatches.length,
              action: checkResult.requiresManualReview ? "MANUAL_REVIEW" : "DETECTED",
            },
          });

          // Attempt auto-fix if safe
          if (!checkResult.requiresManualReview) {
            const fixed = await fixLocalStateInconsistencies(shop);
            if (fixed) {
              result.autoFixed++;

              // Update log
              await prisma.reconciliationLog.updateMany({
                where: {
                  shop,
                  action: "DETECTED",
                },
                data: {
                  action: "AUTO_FIXED",
                  resolution: "Synced all tables to AppSubscription state",
                  resolvedAt: new Date(),
                  resolvedBy: "reconciliation-job",
                },
              });
            }
          } else {
            result.manualReviewRequired++;
          }
        }

      } catch (error: any) {
        result.errors.push(`${shop}: ${error.message}`);
      }
    }

    result.completedAt = new Date();
    const duration = result.completedAt.getTime() - result.startedAt.getTime();

    console.log(`[Reconciliation] Job complete in ${duration}ms:`, {
      shopsChecked: result.shopsChecked,
      issuesFound: result.issuesFound,
      autoFixed: result.autoFixed,
      manualReviewRequired: result.manualReviewRequired,
      errors: result.errors.length,
    });

    return result;

  } catch (error: any) {
    result.errors.push(`Job error: ${error.message}`);
    result.completedAt = new Date();
    console.error("[Reconciliation] Job failed:", error);
    return result;
  }
}

/**
 * Get reconciliation issues pending manual review
 */
export async function getPendingReconciliationIssues(): Promise<any[]> {
  try {
    return await prisma.reconciliationLog.findMany({
      where: {
        action: "MANUAL_REVIEW",
        resolvedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (error) {
    console.error("[Reconciliation] Error fetching pending issues:", error);
    return [];
  }
}

/**
 * Mark a reconciliation issue as resolved
 */
export async function resolveReconciliationIssue(
  logId: string,
  resolution: string,
  resolvedBy: string
): Promise<boolean> {
  try {
    await prisma.reconciliationLog.update({
      where: { id: logId },
      data: {
        action: "RESOLVED",
        resolution,
        resolvedAt: new Date(),
        resolvedBy,
      },
    });
    return true;
  } catch (error) {
    console.error("[Reconciliation] Error resolving issue:", error);
    return false;
  }
}

/**
 * Get reconciliation statistics
 */
export async function getReconciliationStats(): Promise<{
  total: number;
  autoFixed: number;
  manualReview: number;
  resolved: number;
  pending: number;
}> {
  try {
    const [total, autoFixed, manualReview, resolved] = await Promise.all([
      prisma.reconciliationLog.count(),
      prisma.reconciliationLog.count({ where: { action: "AUTO_FIXED" } }),
      prisma.reconciliationLog.count({ where: { action: "MANUAL_REVIEW" } }),
      prisma.reconciliationLog.count({ where: { action: "RESOLVED" } }),
    ]);

    const pending = manualReview - resolved;

    return {
      total,
      autoFixed,
      manualReview,
      resolved,
      pending: Math.max(0, pending),
    };
  } catch (error) {
    console.error("[Reconciliation] Error getting stats:", error);
    return {
      total: 0,
      autoFixed: 0,
      manualReview: 0,
      resolved: 0,
      pending: 0,
    };
  }
}
