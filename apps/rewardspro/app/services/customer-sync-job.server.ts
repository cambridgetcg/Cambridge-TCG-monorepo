import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "../db.server";
import { updateCustomerToEffectiveTier } from "./tier-resolution.server";
import { withRetry } from "../utils/retry";

/**
 * Customer Sync Job Service
 *
 * Provides reliable, resumable customer synchronization from Shopify.
 *
 * Key features:
 * - Fetches total customer count first for accurate progress
 * - Processes in batches with cursor persistence for resume
 * - Real progress tracking (not simulated)
 * - Error recovery and resume capability
 * - Rate limiting with 200ms delay between batches
 * - Retry with exponential backoff for transient errors
 * - Timeout protection for hanging requests
 */

// Rate limiting: delay between batches to avoid Shopify throttling
const RATE_LIMIT_DELAY_MS = 200;

// Maximum job duration before timeout (4 hours)
const MAX_JOB_DURATION_MS = 4 * 60 * 60 * 1000;

// Helper function for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// GraphQL query to get shop's total customer count
// In Shopify API 2025-01, customersCount returns an object with count and precision
const SHOP_CUSTOMER_COUNT_QUERY = `
  query getShopCustomerCount {
    customersCount {
      count
      precision
    }
  }
`;

// GraphQL query to fetch customers in batches
const CUSTOMERS_BATCH_QUERY = `
  query getCustomers($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          email
          firstName
          lastName
          displayName
          createdAt
          updatedAt
          amountSpent {
            amount
            currencyCode
          }
          numberOfOrders
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface SyncJobResult {
  success: boolean;
  jobId: string;
  status: string;
  progress: {
    processedCount: number;
    totalCustomers: number | null;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    percentComplete: number;
  };
  hasMore: boolean;
  error?: string;
  retryAfterMs?: number; // Delay before retry when rate limited
  startedAt?: string; // ISO timestamp for ETA calculation
}

interface CustomerBatch {
  edges: Array<{
    cursor: string;
    node: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      displayName: string;
      createdAt: string;
      updatedAt: string;
      amountSpent: {
        amount: string;
        currencyCode: string;
      } | null;
      numberOfOrders: number;
    };
  }>;
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

/**
 * Start a new customer sync job
 * Creates the job record and fetches total customer count from Shopify
 */
export async function startSyncJob(
  shop: string,
  admin: AdminApiContext,
  triggeredBy: string = 'manual'
): Promise<SyncJobResult> {
  console.log(`[Sync Job] Starting new sync job for shop: ${shop}`);

  // Check for existing in-progress job
  const existingJob = await db.customerSyncJob.findFirst({
    where: {
      shop,
      status: 'IN_PROGRESS'
    }
  });

  if (existingJob) {
    console.log(`[Sync Job] Found existing in-progress job: ${existingJob.id}`);
    return {
      success: false,
      jobId: existingJob.id,
      status: 'IN_PROGRESS',
      progress: {
        processedCount: existingJob.processedCount,
        totalCustomers: existingJob.totalCustomers,
        createdCount: existingJob.createdCount,
        updatedCount: existingJob.updatedCount,
        skippedCount: existingJob.skippedCount,
        errorCount: existingJob.errorCount,
        percentComplete: existingJob.totalCustomers
          ? Math.round((existingJob.processedCount / existingJob.totalCustomers) * 100)
          : 0
      },
      hasMore: true,
      error: 'Sync already in progress. Use resume or wait for completion.'
    };
  }

  // Get total customer count from Shopify (2025-01 API uses customersCount object)
  let totalCustomers: number | null = null;
  try {
    const countResponse = await admin.graphql(SHOP_CUSTOMER_COUNT_QUERY);
    const countResult = await countResponse.json() as any;

    if (countResult.data?.customersCount?.count !== undefined) {
      totalCustomers = countResult.data.customersCount.count;
      const precision = countResult.data.customersCount.precision || 'EXACT';
      console.log(`[Sync Job] Shopify reports ${totalCustomers} total customers (precision: ${precision})`);
    }
  } catch (error) {
    console.error('[Sync Job] Failed to get customer count:', error);
    // Continue without count - progress will show as X processed
  }

  // Get tier information for assignments
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'desc' }
  });

  if (tiers.length === 0) {
    return {
      success: false,
      jobId: '',
      status: 'FAILED',
      progress: {
        processedCount: 0,
        totalCustomers: null,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        percentComplete: 0
      },
      hasMore: false,
      error: 'No tiers configured. Please create at least one tier before syncing customers.'
    };
  }

  // Determine batch size based on store size for memory efficiency
  let batchSize = 50; // Default reduced from 100 for memory efficiency
  if (totalCustomers && totalCustomers > 50000) {
    batchSize = 25; // Smaller batches for very large stores
  } else if (totalCustomers && totalCustomers < 1000) {
    batchSize = 100; // Larger batches OK for small stores
  }

  // Create new job
  const job = await db.customerSyncJob.create({
    data: {
      id: crypto.randomUUID(),
      shop,
      status: 'IN_PROGRESS',
      totalCustomers,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      triggeredBy,
      batchSize,
      metadata: {
        tierCount: tiers.length,
        lowestTierId: tiers[tiers.length - 1].id
      }
    }
  });

  console.log(`[Sync Job] Created job ${job.id} with ${totalCustomers} customers to process`);

  return {
    success: true,
    jobId: job.id,
    status: 'IN_PROGRESS',
    progress: {
      processedCount: 0,
      totalCustomers,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      percentComplete: 0
    },
    hasMore: true,
    startedAt: job.startedAt?.toISOString()
  };
}

/**
 * Process the next batch of customers for a sync job
 * Returns progress and whether more batches remain
 */
export async function processNextBatch(
  jobId: string,
  admin: AdminApiContext
): Promise<SyncJobResult> {
  // Get current job
  const job = await db.customerSyncJob.findUnique({
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
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        percentComplete: 0
      },
      hasMore: false,
      error: 'Sync job not found'
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
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalCustomers
          ? Math.round((job.processedCount / job.totalCustomers) * 100)
          : 0
      },
      hasMore: false,
      error: `Job is ${job.status.toLowerCase()}, not in progress`
    };
  }

  // Check for job timeout (4 hours max)
  const jobAge = Date.now() - new Date(job.startedAt || job.createdAt).getTime();
  if (jobAge > MAX_JOB_DURATION_MS) {
    await db.customerSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        lastError: 'Job timed out after 4 hours',
        completedAt: new Date()
      }
    });

    return {
      success: false,
      jobId,
      status: 'FAILED',
      progress: {
        processedCount: job.processedCount,
        totalCustomers: job.totalCustomers,
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalCustomers
          ? Math.round((job.processedCount / job.totalCustomers) * 100)
          : 0
      },
      hasMore: false,
      error: 'Job exceeded maximum duration of 4 hours'
    };
  }

  const shop = job.shop;

  // Get tiers for assignment
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'desc' }
  });

  if (tiers.length === 0) {
    await db.customerSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        lastError: 'No tiers configured',
        completedAt: new Date()
      }
    });

    return {
      success: false,
      jobId,
      status: 'FAILED',
      progress: {
        processedCount: job.processedCount,
        totalCustomers: job.totalCustomers,
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: 0
      },
      hasMore: false,
      error: 'No tiers configured'
    };
  }

  try {
    // Fetch batch from Shopify with retry for transient errors
    const response = await withRetry(
      async () => {
        const res = await admin.graphql(CUSTOMERS_BATCH_QUERY, {
          variables: {
            first: job.batchSize,
            after: job.lastCursor
          }
        });
        return res;
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        onRetry: (error, attempt) => {
          console.log(`[Sync Job] Retry attempt ${attempt} for batch fetch: ${error.message}`);
        }
      }
    );

    const result = await response.json() as any;

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const customers: CustomerBatch = result.data.customers;

    let batchCreated = 0;
    let batchUpdated = 0;
    let batchSkipped = 0;
    let batchErrors = 0;

    // Process each customer
    for (const edge of customers.edges) {
      const shopifyCustomer = edge.node;
      const shopifyId = shopifyCustomer.id.split('/').pop()!;

      try {
        // Skip customers without email
        if (!shopifyCustomer.email) {
          console.log(`[Sync Job] Skipping customer ${shopifyId} - no email`);
          batchSkipped++;
          continue;
        }

        // Parse spending - explicitly cast to correct types for Data API adapter
        const totalSpent = parseFloat(shopifyCustomer.amountSpent?.amount || '0');
        // Ensure orderCount is an integer (Data API adapter can pass as text otherwise)
        const ordersCount = parseInt(String(shopifyCustomer.numberOfOrders || 0), 10);

        // Determine appropriate tier based on spending
        let assignedTier = tiers[tiers.length - 1]; // Default to lowest
        for (const tier of tiers) {
          if (totalSpent >= parseFloat(tier.minSpend.toString())) {
            assignedTier = tier;
            break;
          }
        }

        // Check if customer exists
        const existingCustomer = await db.customer.findFirst({
          where: {
            shop,
            shopifyCustomerId: shopifyId
          }
        });

        if (!existingCustomer) {
          // Create new customer WITHOUT tier assignment
          // Tier will be resolved by updateCustomerToEffectiveTier below
          // NEUROSURGICAL FIX: Initialize netSpent and totalRefunded for new customers
          const initialTotalSpent = Number(totalSpent);

          const newCustomer = await db.customer.create({
            data: {
              shop,
              shopifyCustomerId: shopifyId,
              email: shopifyCustomer.email,
              firstName: shopifyCustomer.firstName || '',
              lastName: shopifyCustomer.lastName || '',
              totalSpent: initialTotalSpent,
              netSpent: initialTotalSpent, // NEW: Initialize to totalSpent (no refunds assumed)
              totalRefunded: 0, // NEW: Initialize to 0
              orderCount: Number(ordersCount),
              storeCredit: 0,
              // Don't set currentTierId - let resolver handle it
              shopifyCreatedAt: new Date(shopifyCustomer.createdAt),
              shopifyUpdatedAt: new Date(shopifyCustomer.updatedAt),
              createdAt: new Date(shopifyCustomer.createdAt),
              updatedAt: new Date(shopifyCustomer.updatedAt)
            }
          });

          // Use tier resolver to properly assign tier (respects purchases, subscriptions, etc.)
          await updateCustomerToEffectiveTier(shop, newCustomer.id, {
            triggeredBy: 'customer_sync'
          });

          batchCreated++;
          console.log(`[Sync Job] Created customer ${shopifyId} - resolved via tier system`);
        } else {
          // Update existing customer - only update spending data, NOT tier
          // NEUROSURGICAL FIX: Also update netSpent to stay consistent
          const updatedTotalSpent = Number(totalSpent);
          const currentTotalRefunded = Number(existingCustomer.totalRefunded || 0);

          await db.customer.update({
            where: { id: existingCustomer.id },
            data: {
              email: shopifyCustomer.email,
              firstName: shopifyCustomer.firstName || existingCustomer.firstName,
              lastName: shopifyCustomer.lastName || existingCustomer.lastName,
              totalSpent: updatedTotalSpent,
              netSpent: updatedTotalSpent - currentTotalRefunded, // NEW: Keep netSpent in sync
              orderCount: Number(ordersCount),
              shopifyUpdatedAt: new Date(shopifyCustomer.updatedAt),
              updatedAt: new Date()
              // DO NOT update tier directly - tier resolution handles this
            }
          });

          // Use tier resolver to recalculate (respects manual overrides, purchases, subscriptions)
          await updateCustomerToEffectiveTier(shop, existingCustomer.id, {
            triggeredBy: 'customer_sync'
          });

          batchUpdated++;
        }
      } catch (customerError) {
        console.error(`[Sync Job] Error processing customer ${shopifyId}:`, customerError);
        batchErrors++;
      }
    }

    // Update job progress
    const newProcessedCount = job.processedCount + customers.edges.length;
    const hasMore = customers.pageInfo.hasNextPage;
    const newStatus = hasMore ? 'IN_PROGRESS' : 'COMPLETED';

    const updatedJob = await db.customerSyncJob.update({
      where: { id: jobId },
      data: {
        processedCount: newProcessedCount,
        createdCount: job.createdCount + batchCreated,
        updatedCount: job.updatedCount + batchUpdated,
        skippedCount: job.skippedCount + batchSkipped,
        errorCount: job.errorCount + batchErrors,
        lastCursor: customers.pageInfo.endCursor,
        lastActivityAt: new Date(),
        status: newStatus,
        ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {})
      }
    });

    console.log(
      `[Sync Job] Batch complete - ` +
      `Processed: ${newProcessedCount}/${job.totalCustomers || '?'}, ` +
      `Created: ${updatedJob.createdCount}, Updated: ${updatedJob.updatedCount}, ` +
      `Skipped: ${updatedJob.skippedCount}, Errors: ${updatedJob.errorCount}`
    );

    // Rate limiting: add delay between batches to avoid Shopify throttling
    if (hasMore) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    return {
      success: true,
      jobId,
      status: newStatus,
      progress: {
        processedCount: updatedJob.processedCount,
        totalCustomers: updatedJob.totalCustomers,
        createdCount: updatedJob.createdCount,
        updatedCount: updatedJob.updatedCount,
        skippedCount: updatedJob.skippedCount,
        errorCount: updatedJob.errorCount,
        percentComplete: updatedJob.totalCustomers
          ? Math.round((updatedJob.processedCount / updatedJob.totalCustomers) * 100)
          : 0
      },
      hasMore,
      startedAt: job.startedAt?.toISOString()
    };
  } catch (error) {
    console.error('[Sync Job] Batch processing failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for Shopify rate limiting / throttling
    const isThrottled = errorMessage.includes('Throttled') ||
                        errorMessage.includes('rate limit') ||
                        errorMessage.includes('429') ||
                        errorMessage.includes('Too Many Requests');

    if (isThrottled) {
      // Don't mark as FAILED - keep as IN_PROGRESS for auto-resume with delay
      const metadata = (job.metadata as Record<string, unknown>) || {};
      await db.customerSyncJob.update({
        where: { id: jobId },
        data: {
          lastError: 'Rate limited by Shopify - will retry',
          lastActivityAt: new Date(),
          metadata: {
            ...metadata,
            throttledAt: new Date().toISOString(),
            retryAfterMs: 5000
          }
        }
      });

      console.log('[Sync Job] Rate limited by Shopify, will retry in 5 seconds');

      return {
        success: false,
        jobId,
        status: 'IN_PROGRESS', // Keep as in-progress for auto-resume
        progress: {
          processedCount: job.processedCount,
          totalCustomers: job.totalCustomers,
          createdCount: job.createdCount,
          updatedCount: job.updatedCount,
          skippedCount: job.skippedCount,
          errorCount: job.errorCount,
          percentComplete: job.totalCustomers
            ? Math.round((job.processedCount / job.totalCustomers) * 100)
            : 0
        },
        hasMore: true,
        error: 'Rate limited - retry in 5 seconds',
        retryAfterMs: 5000,
        startedAt: job.startedAt?.toISOString()
      };
    }

    // Non-throttle error: mark as failed
    await db.customerSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        lastError: errorMessage,
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
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalCustomers
          ? Math.round((job.processedCount / job.totalCustomers) * 100)
          : 0
      },
      hasMore: false,
      error: errorMessage,
      startedAt: job.startedAt?.toISOString()
    };
  }
}

/**
 * Get current status of a sync job
 */
export async function getSyncJobStatus(shop: string): Promise<SyncJobResult | null> {
  // Get most recent job for this shop
  const job = await db.customerSyncJob.findFirst({
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
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      percentComplete: job.totalCustomers
        ? Math.round((job.processedCount / job.totalCustomers) * 100)
        : 0
    },
    hasMore: job.status === 'IN_PROGRESS',
    error: job.lastError || undefined,
    startedAt: job.startedAt?.toISOString()
  };
}

/**
 * Resume a failed sync job from where it left off
 */
export async function resumeSyncJob(
  jobId: string,
  admin: AdminApiContext
): Promise<SyncJobResult> {
  const job = await db.customerSyncJob.findUnique({
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
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        percentComplete: 0
      },
      hasMore: false,
      error: 'Sync job not found'
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
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalCustomers
          ? Math.round((job.processedCount / job.totalCustomers) * 100)
          : 0
      },
      hasMore: job.status === 'IN_PROGRESS',
      error: `Cannot resume job with status: ${job.status}`
    };
  }

  // Reset job to in-progress
  await db.customerSyncJob.update({
    where: { id: jobId },
    data: {
      status: 'IN_PROGRESS',
      lastError: null,
      lastActivityAt: new Date()
    }
  });

  console.log(`[Sync Job] Resumed job ${jobId} from cursor: ${job.lastCursor}`);

  // Process next batch
  return processNextBatch(jobId, admin);
}

/**
 * Cancel an in-progress sync job
 */
export async function cancelSyncJob(jobId: string): Promise<boolean> {
  const job = await db.customerSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job || job.status !== 'IN_PROGRESS') {
    return false;
  }

  await db.customerSyncJob.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      lastActivityAt: new Date()
    }
  });

  console.log(`[Sync Job] Cancelled job ${jobId}`);
  return true;
}

/**
 * Get sync job by ID
 */
export async function getSyncJobById(jobId: string): Promise<SyncJobResult | null> {
  const job = await db.customerSyncJob.findUnique({
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
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      percentComplete: job.totalCustomers
        ? Math.round((job.processedCount / job.totalCustomers) * 100)
        : 0
    },
    hasMore: job.status === 'IN_PROGRESS',
    error: job.lastError || undefined,
    startedAt: job.startedAt?.toISOString()
  };
}

/**
 * Get customer sync statistics for a shop
 */
export async function getCustomerSyncStats(shop: string): Promise<{
  totalCustomers: number;
  customersWithTier: number;
  customersInitialSynced: boolean;
  lastSyncJob: {
    id: string;
    status: string;
    completedAt: Date | null;
    createdCount: number;
    updatedCount: number;
    processedCount: number;
  } | null;
}> {
  // Count total customers
  const totalCustomers = await db.customer.count({
    where: { shop }
  });

  // Count customers with a tier assigned
  const customersWithTier = await db.customer.count({
    where: {
      shop,
      currentTierId: { not: null }
    }
  });

  // Check if initial sync has been done
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
    select: { customersInitialSynced: true }
  });

  // Get last sync job (handle case where table doesn't exist yet)
  let lastJob = null;
  try {
    lastJob = await db.customerSyncJob.findFirst({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        completedAt: true,
        createdCount: true,
        updatedCount: true,
        processedCount: true
      }
    });
  } catch (error) {
    // Table may not exist yet if migration hasn't been run
    console.warn('[Customer Sync] CustomerSyncJob table not available:', error instanceof Error ? error.message : 'Unknown error');
  }

  return {
    totalCustomers,
    customersWithTier,
    customersInitialSynced: shopSettings?.customersInitialSynced ?? false,
    lastSyncJob: lastJob
  };
}
