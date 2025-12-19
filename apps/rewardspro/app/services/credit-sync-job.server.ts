import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "../db.server";
import { ShopifyStoreCreditService } from "./shopify-store-credit.service";

/**
 * Store Credit Sync Job Service
 *
 * Provides reliable, resumable store credit synchronization from Shopify.
 * Key features:
 * - Fetches store credit balances from Shopify for each customer
 * - Compares with local balance and updates if different
 * - Creates SHOPIFY_SYNC ledger entries for audit trail
 * - Supports resume capability for interrupted syncs
 */

interface CreditSyncJobResult {
  success: boolean;
  jobId: string;
  status: string;
  progress: {
    processedCount: number;
    totalCustomers: number | null;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    percentComplete: number;
    totalImported: number;
    totalDifference: number;
  };
  hasMore: boolean;
  error?: string;
}

/**
 * Start a new store credit sync job
 * Creates the job record and counts total customers
 */
export async function startCreditSyncJob(
  shop: string,
  admin: AdminApiContext,
  triggeredBy: string = 'manual'
): Promise<CreditSyncJobResult> {
  console.log(`[Credit Sync Job] Starting new sync job for shop: ${shop}`);

  // Check for existing in-progress job
  const existingJob = await db.storeCreditSyncJob.findFirst({
    where: {
      shop,
      status: 'IN_PROGRESS'
    }
  });

  if (existingJob) {
    console.log(`[Credit Sync Job] Found existing in-progress job: ${existingJob.id}`);
    return {
      success: false,
      jobId: existingJob.id,
      status: 'IN_PROGRESS',
      progress: {
        processedCount: existingJob.processedCount,
        totalCustomers: existingJob.totalCustomers,
        updatedCount: existingJob.updatedCount,
        skippedCount: existingJob.skippedCount,
        errorCount: existingJob.errorCount,
        percentComplete: existingJob.totalCustomers
          ? Math.round((existingJob.processedCount / existingJob.totalCustomers) * 100)
          : 0,
        totalImported: Number(existingJob.totalImported),
        totalDifference: Number(existingJob.totalDifference)
      },
      hasMore: true,
      error: 'Credit sync already in progress. Use resume or wait for completion.'
    };
  }

  // Count total customers in database (only customers with shopifyCustomerId)
  const totalCustomers = await db.customer.count({
    where: {
      shop,
      shopifyCustomerId: { not: null }
    }
  });

  if (totalCustomers === 0) {
    return {
      success: false,
      jobId: '',
      status: 'FAILED',
      progress: {
        processedCount: 0,
        totalCustomers: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        percentComplete: 0,
        totalImported: 0,
        totalDifference: 0
      },
      hasMore: false,
      error: 'No customers found to sync. Please sync customers first.'
    };
  }

  // Create new job
  const job = await db.storeCreditSyncJob.create({
    data: {
      id: crypto.randomUUID(),
      shop,
      status: 'IN_PROGRESS',
      totalCustomers,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      triggeredBy,
      batchSize: 25 // Lower batch size due to individual Shopify API calls
    }
  });

  console.log(`[Credit Sync Job] Created job ${job.id} with ${totalCustomers} customers to process`);

  return {
    success: true,
    jobId: job.id,
    status: 'IN_PROGRESS',
    progress: {
      processedCount: 0,
      totalCustomers,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      percentComplete: 0,
      totalImported: 0,
      totalDifference: 0
    },
    hasMore: true
  };
}

/**
 * Process the next batch of customers for a credit sync job
 * Returns progress and whether more batches remain
 */
export async function processCreditSyncBatch(
  jobId: string,
  admin: AdminApiContext
): Promise<CreditSyncJobResult> {
  // Get current job
  const job = await db.storeCreditSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    return {
      success: false,
      jobId,
      status: 'FAILED',
      progress: {
        processedCount: 0,
        totalCustomers: null,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        percentComplete: 0,
        totalImported: 0,
        totalDifference: 0
      },
      hasMore: false,
      error: 'Credit sync job not found'
    };
  }

  if (job.status !== 'IN_PROGRESS') {
    return {
      success: false,
      jobId,
      status: job.status,
      progress: {
        processedCount: job.processedCount,
        totalCustomers: job.totalCustomers,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalCustomers
          ? Math.round((job.processedCount / job.totalCustomers) * 100)
          : 0,
        totalImported: Number(job.totalImported),
        totalDifference: Number(job.totalDifference)
      },
      hasMore: false,
      error: `Job is ${job.status.toLowerCase()}, not in progress`
    };
  }

  const shop = job.shop;

  try {
    // Fetch batch of customers from database using cursor-based pagination
    const customers = await db.customer.findMany({
      where: {
        shop,
        shopifyCustomerId: { not: null },
        ...(job.lastCursor ? { id: { gt: job.lastCursor } } : {})
      },
      orderBy: { id: 'asc' },
      take: job.batchSize,
      select: {
        id: true,
        shopifyCustomerId: true,
        email: true,
        storeCredit: true
      }
    });

    if (customers.length === 0) {
      // No more customers - job complete
      const updatedJob = await db.storeCreditSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastActivityAt: new Date()
        }
      });

      console.log(`[Credit Sync Job] Completed - No more customers to process`);

      return {
        success: true,
        jobId,
        status: 'COMPLETED',
        progress: {
          processedCount: updatedJob.processedCount,
          totalCustomers: updatedJob.totalCustomers,
          updatedCount: updatedJob.updatedCount,
          skippedCount: updatedJob.skippedCount,
          errorCount: updatedJob.errorCount,
          percentComplete: 100,
          totalImported: Number(updatedJob.totalImported),
          totalDifference: Number(updatedJob.totalDifference)
        },
        hasMore: false
      };
    }

    // Initialize Shopify store credit service
    const storeCreditService = new ShopifyStoreCreditService(admin, shop);

    let batchUpdated = 0;
    let batchSkipped = 0;
    let batchErrors = 0;
    let batchImported = 0;
    let batchDifference = 0;

    // Process each customer
    for (const customer of customers) {
      const shopifyId = customer.shopifyCustomerId!;

      try {
        // Get Shopify store credit balance
        const balanceResult = await storeCreditService.getStoreCreditBalance(shopifyId);

        if (!balanceResult.success) {
          console.error(`[Credit Sync Job] Failed to get balance for ${shopifyId}: ${balanceResult.error}`);
          batchErrors++;
          continue;
        }

        const shopifyBalance = balanceResult.balance || 0;
        const localBalance = Number(customer.storeCredit);
        const difference = shopifyBalance - localBalance;

        // Check if balance needs updating (difference > $0.01)
        if (Math.abs(difference) <= 0.01) {
          // Balances match - skip
          batchSkipped++;
          continue;
        }

        // Update local balance and create ledger entry
        await db.$transaction(async (tx) => {
          // Update customer balance
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              storeCredit: shopifyBalance,
              updatedAt: new Date()
            }
          });

          // Create ledger entry for audit trail
          await tx.storeCreditLedger.create({
            data: {
              id: crypto.randomUUID(),
              customerId: customer.id,
              shop,
              amount: difference, // Positive = credit added, negative = reduced
              balance: shopifyBalance, // New balance after sync
              type: 'SHOPIFY_SYNC',
              syncStatus: 'SYNCED',
              syncedAt: new Date(),
              metadata: {
                previousLocalBalance: localBalance,
                shopifyBalance,
                syncJobId: jobId,
                syncReason: 'Initial import from Shopify',
                customerEmail: customer.email
              }
            }
          });
        });

        console.log(
          `[Credit Sync Job] Updated ${customer.email}: ` +
          `${localBalance.toFixed(2)} -> ${shopifyBalance.toFixed(2)} (${difference > 0 ? '+' : ''}${difference.toFixed(2)})`
        );

        batchUpdated++;
        batchImported += Math.max(0, difference); // Only count positive imports
        batchDifference += difference;

      } catch (customerError) {
        console.error(`[Credit Sync Job] Error processing customer ${customer.id}:`, customerError);
        batchErrors++;
      }
    }

    // Get last cursor for next batch
    const lastCursor = customers[customers.length - 1]?.id || job.lastCursor;

    // Check if there are more customers
    const remainingCount = await db.customer.count({
      where: {
        shop,
        shopifyCustomerId: { not: null },
        id: { gt: lastCursor || '' }
      }
    });

    const hasMore = remainingCount > 0;
    const newStatus = hasMore ? 'IN_PROGRESS' : 'COMPLETED';

    // Update job progress
    const updatedJob = await db.storeCreditSyncJob.update({
      where: { id: jobId },
      data: {
        processedCount: job.processedCount + customers.length,
        updatedCount: job.updatedCount + batchUpdated,
        skippedCount: job.skippedCount + batchSkipped,
        errorCount: job.errorCount + batchErrors,
        lastCursor,
        lastActivityAt: new Date(),
        totalImported: { increment: batchImported },
        totalDifference: { increment: batchDifference },
        status: newStatus,
        ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {})
      }
    });

    console.log(
      `[Credit Sync Job] Batch complete - ` +
      `Processed: ${updatedJob.processedCount}/${updatedJob.totalCustomers || '?'}, ` +
      `Updated: ${updatedJob.updatedCount}, Skipped: ${updatedJob.skippedCount}, ` +
      `Errors: ${updatedJob.errorCount}`
    );

    return {
      success: true,
      jobId,
      status: newStatus,
      progress: {
        processedCount: updatedJob.processedCount,
        totalCustomers: updatedJob.totalCustomers,
        updatedCount: updatedJob.updatedCount,
        skippedCount: updatedJob.skippedCount,
        errorCount: updatedJob.errorCount,
        percentComplete: updatedJob.totalCustomers
          ? Math.round((updatedJob.processedCount / updatedJob.totalCustomers) * 100)
          : 0,
        totalImported: Number(updatedJob.totalImported),
        totalDifference: Number(updatedJob.totalDifference)
      },
      hasMore
    };

  } catch (error) {
    console.error('[Credit Sync Job] Batch processing failed:', error);

    // Update job with error
    await db.storeCreditSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastActivityAt: new Date()
      }
    });

    return {
      success: false,
      jobId,
      status: 'FAILED',
      progress: {
        processedCount: job.processedCount,
        totalCustomers: job.totalCustomers,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalCustomers
          ? Math.round((job.processedCount / job.totalCustomers) * 100)
          : 0,
        totalImported: Number(job.totalImported),
        totalDifference: Number(job.totalDifference)
      },
      hasMore: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get current status of a credit sync job for a shop
 */
export async function getCreditSyncJobStatus(shop: string): Promise<CreditSyncJobResult | null> {
  // Get most recent job for this shop
  const job = await db.storeCreditSyncJob.findFirst({
    where: { shop },
    orderBy: { createdAt: 'desc' }
  });

  if (!job) {
    return null;
  }

  return {
    success: true,
    jobId: job.id,
    status: job.status,
    progress: {
      processedCount: job.processedCount,
      totalCustomers: job.totalCustomers,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      percentComplete: job.totalCustomers
        ? Math.round((job.processedCount / job.totalCustomers) * 100)
        : 0,
      totalImported: Number(job.totalImported),
      totalDifference: Number(job.totalDifference)
    },
    hasMore: job.status === 'IN_PROGRESS',
    error: job.lastError || undefined
  };
}

/**
 * Get credit sync job by ID
 */
export async function getCreditSyncJobById(jobId: string): Promise<CreditSyncJobResult | null> {
  const job = await db.storeCreditSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    return null;
  }

  return {
    success: true,
    jobId: job.id,
    status: job.status,
    progress: {
      processedCount: job.processedCount,
      totalCustomers: job.totalCustomers,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      percentComplete: job.totalCustomers
        ? Math.round((job.processedCount / job.totalCustomers) * 100)
        : 0,
      totalImported: Number(job.totalImported),
      totalDifference: Number(job.totalDifference)
    },
    hasMore: job.status === 'IN_PROGRESS',
    error: job.lastError || undefined
  };
}

/**
 * Resume a failed credit sync job
 */
export async function resumeCreditSyncJob(
  jobId: string,
  admin: AdminApiContext
): Promise<CreditSyncJobResult> {
  const job = await db.storeCreditSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    return {
      success: false,
      jobId,
      status: 'FAILED',
      progress: {
        processedCount: 0,
        totalCustomers: null,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        percentComplete: 0,
        totalImported: 0,
        totalDifference: 0
      },
      hasMore: false,
      error: 'Credit sync job not found'
    };
  }

  if (job.status !== 'FAILED' && job.status !== 'CANCELLED') {
    return {
      success: false,
      jobId,
      status: job.status,
      progress: {
        processedCount: job.processedCount,
        totalCustomers: job.totalCustomers,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalCustomers
          ? Math.round((job.processedCount / job.totalCustomers) * 100)
          : 0,
        totalImported: Number(job.totalImported),
        totalDifference: Number(job.totalDifference)
      },
      hasMore: job.status === 'IN_PROGRESS',
      error: `Cannot resume job with status: ${job.status}`
    };
  }

  // Reset job to in-progress
  await db.storeCreditSyncJob.update({
    where: { id: jobId },
    data: {
      status: 'IN_PROGRESS',
      lastError: null,
      lastActivityAt: new Date()
    }
  });

  console.log(`[Credit Sync Job] Resumed job ${jobId} from cursor: ${job.lastCursor}`);

  // Process next batch
  return processCreditSyncBatch(jobId, admin);
}

/**
 * Cancel an in-progress credit sync job
 */
export async function cancelCreditSyncJob(jobId: string): Promise<boolean> {
  const job = await db.storeCreditSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job || job.status !== 'IN_PROGRESS') {
    return false;
  }

  await db.storeCreditSyncJob.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      lastActivityAt: new Date()
    }
  });

  console.log(`[Credit Sync Job] Cancelled job ${jobId}`);
  return true;
}

/**
 * Get credit sync statistics for a shop
 */
export async function getCreditSyncStats(shop: string): Promise<{
  customersWithCredit: number;
  totalCreditBalance: number;
  lastSyncJob: {
    id: string;
    status: string;
    completedAt: Date | null;
    updatedCount: number;
    totalImported: number;
  } | null;
}> {
  // Count customers with positive credit balance
  const customersWithCredit = await db.customer.count({
    where: {
      shop,
      storeCredit: { gt: 0 }
    }
  });

  // Sum total credit balance
  const creditSum = await db.customer.aggregate({
    where: { shop },
    _sum: { storeCredit: true }
  });

  // Get last sync job (handle case where table doesn't exist yet)
  let lastJob = null;
  try {
    lastJob = await db.storeCreditSyncJob.findFirst({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        completedAt: true,
        updatedCount: true,
        totalImported: true
      }
    });
  } catch (error) {
    // Table may not exist yet if migration hasn't been run
    console.warn('[Credit Sync] StoreCreditSyncJob table not available:', error instanceof Error ? error.message : 'Unknown error');
  }

  return {
    customersWithCredit,
    totalCreditBalance: Number(creditSum._sum.storeCredit || 0),
    lastSyncJob: lastJob ? {
      id: lastJob.id,
      status: lastJob.status,
      completedAt: lastJob.completedAt,
      updatedCount: lastJob.updatedCount,
      totalImported: Number(lastJob.totalImported)
    } : null
  };
}
