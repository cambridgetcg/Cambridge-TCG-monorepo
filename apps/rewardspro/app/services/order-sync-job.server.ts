import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * Order Sync Job Service
 *
 * Provides reliable, resumable order synchronization from Shopify.
 * Key features:
 * - Fetches order count first for accurate progress
 * - Processes in batches with cursor persistence for resume
 * - Real progress tracking (not simulated)
 * - Error recovery and resume capability
 */

// GraphQL query to get shop's order count for date range
const SHOP_ORDER_COUNT_QUERY = `
  query getOrderCount($query: String) {
    ordersCount(query: $query) {
      count
    }
  }
`;

// GraphQL query to fetch orders in batches
const ORDERS_BATCH_QUERY = `
  query getOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          email
          createdAt
          updatedAt
          processedAt
          currencyCode
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          totalRefundedSet {
            shopMoney {
              amount
            }
          }
          netPaymentSet {
            shopMoney {
              amount
            }
          }
          displayFinancialStatus
          displayFulfillmentStatus
          customer {
            id
            email
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                variantTitle
                sku
                vendor
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                totalDiscountSet {
                  shopMoney {
                    amount
                  }
                }
                requiresShipping
                taxable
                product {
                  id
                }
                variant {
                  id
                }
              }
            }
          }
          refunds {
            id
            createdAt
            note
            refundLineItems(first: 100) {
              edges {
                node {
                  lineItem {
                    id
                  }
                  quantity
                  subtotalSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
          }
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
    totalOrders: number | null;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    percentComplete: number;
  };
  hasMore: boolean;
  error?: string;
}

/**
 * Start a new order sync job
 * Creates the job record and fetches total order count from Shopify
 */
export async function startOrderSyncJob(
  shop: string,
  admin: AdminApiContext,
  triggeredBy: string = 'manual',
  options?: { startDate?: Date; endDate?: Date }
): Promise<SyncJobResult> {
  console.log(`[Order Sync Job] Starting new sync job for shop: ${shop}`);

  // Check for existing in-progress job
  const existingJob = await db.orderSyncJob.findFirst({
    where: {
      shop,
      status: 'IN_PROGRESS'
    }
  });

  if (existingJob) {
    console.log(`[Order Sync Job] Found existing in-progress job: ${existingJob.id}`);
    return {
      success: false,
      jobId: existingJob.id,
      status: 'IN_PROGRESS',
      progress: {
        processedCount: existingJob.processedCount,
        totalOrders: existingJob.totalOrders,
        createdCount: existingJob.createdCount,
        updatedCount: existingJob.updatedCount,
        skippedCount: existingJob.skippedCount,
        errorCount: existingJob.errorCount,
        percentComplete: existingJob.totalOrders
          ? Math.round((existingJob.processedCount / existingJob.totalOrders) * 100)
          : 0
      },
      hasMore: true,
      error: 'Sync already in progress. Use resume or wait for completion.'
    };
  }

  // Set default date range (last year)
  const startDate = options?.startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const endDate = options?.endDate || new Date();

  // Build query for order count
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  const query = `created_at:>=${startDateStr} AND created_at:<=${endDateStr} AND (financial_status:paid OR financial_status:partially_refunded OR financial_status:refunded)`;

  // Get total order count from Shopify
  let totalOrders: number | null = null;
  try {
    const countResponse = await admin.graphql(SHOP_ORDER_COUNT_QUERY, {
      variables: { query }
    });
    const countResult = await countResponse.json() as any;

    if (countResult.data?.ordersCount?.count !== undefined) {
      totalOrders = countResult.data.ordersCount.count;
      console.log(`[Order Sync Job] Shopify reports ${totalOrders} total orders for date range`);
    }
  } catch (error) {
    console.error('[Order Sync Job] Failed to get order count:', error);
    // Continue without count - progress will show as X processed
  }

  // Create new job
  const job = await db.orderSyncJob.create({
    data: {
      shop,
      status: 'IN_PROGRESS',
      totalOrders,
      startDate,
      endDate,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      triggeredBy,
      batchSize: 50,
      metadata: {
        dateRange: `${startDateStr} to ${endDateStr}`
      }
    }
  });

  console.log(`[Order Sync Job] Created job ${job.id} with ${totalOrders} orders to process`);

  return {
    success: true,
    jobId: job.id,
    status: 'IN_PROGRESS',
    progress: {
      processedCount: 0,
      totalOrders,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      percentComplete: 0
    },
    hasMore: true
  };
}

/**
 * Process the next batch of orders for a sync job
 * Returns progress and whether more batches remain
 */
export async function processOrderBatch(
  jobId: string,
  admin: AdminApiContext
): Promise<SyncJobResult> {
  // Get current job
  const job = await db.orderSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    return {
      success: false,
      jobId,
      status: 'FAILED',
      progress: {
        processedCount: 0,
        totalOrders: null,
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
        totalOrders: job.totalOrders,
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalOrders
          ? Math.round((job.processedCount / job.totalOrders) * 100)
          : 0
      },
      hasMore: false,
      error: `Job is ${job.status.toLowerCase()}, not in progress`
    };
  }

  const shop = job.shop;

  // Build query for date range
  const startDateStr = job.startDate?.toISOString().split('T')[0] || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDateStr = job.endDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
  const query = `created_at:>=${startDateStr} AND created_at:<=${endDateStr} AND (financial_status:paid OR financial_status:partially_refunded OR financial_status:refunded)`;

  try {
    // Fetch batch from Shopify
    const response = await admin.graphql(ORDERS_BATCH_QUERY, {
      variables: {
        first: job.batchSize,
        after: job.lastCursor,
        query
      }
    });

    const result = await response.json() as any;

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const orders = result.data.orders;

    let batchCreated = 0;
    let batchUpdated = 0;
    let batchSkipped = 0;
    let batchErrors = 0;

    // Process each order
    for (const edge of orders.edges) {
      const orderData = edge.node;
      const shopifyOrderId = orderData.id.replace('gid://shopify/Order/', '');

      try {
        // Extract customer ID
        const shopifyCustomerId = orderData.customer?.id ?
          orderData.customer.id.replace('gid://shopify/Customer/', '') : null;

        // Skip guest checkouts
        if (!shopifyCustomerId) {
          console.log(`[Order Sync Job] Skipping order ${orderData.name} - guest checkout`);
          batchSkipped++;
          continue;
        }

        // Find customer in our database
        const customer = await db.customer.findFirst({
          where: {
            shop,
            shopifyCustomerId
          },
          include: {
            currentTier: true
          }
        });

        if (!customer) {
          console.log(`[Order Sync Job] Skipping order ${orderData.name} - customer not in database`);
          batchSkipped++;
          continue;
        }

        // Check if order exists
        const existingOrder = await (db as any).order.findFirst({
          where: {
            shop,
            shopifyOrderId
          }
        });

        if (existingOrder) {
          // Update existing order
          await updateExistingOrder(existingOrder.id, orderData);
          batchUpdated++;
          console.log(`[Order Sync Job] Updated order ${orderData.name}`);
        } else {
          // Create new order
          await createNewOrder(shop, shopifyOrderId, orderData, customer);
          batchCreated++;
          console.log(`[Order Sync Job] Created order ${orderData.name}`);
        }
      } catch (orderError) {
        console.error(`[Order Sync Job] Error processing order ${shopifyOrderId}:`, orderError);
        batchErrors++;
      }
    }

    // Update job progress
    const newProcessedCount = job.processedCount + orders.edges.length;
    const hasMore = orders.pageInfo.hasNextPage;
    const newStatus = hasMore ? 'IN_PROGRESS' : 'COMPLETED';

    const updatedJob = await db.orderSyncJob.update({
      where: { id: jobId },
      data: {
        processedCount: newProcessedCount,
        createdCount: job.createdCount + batchCreated,
        updatedCount: job.updatedCount + batchUpdated,
        skippedCount: job.skippedCount + batchSkipped,
        errorCount: job.errorCount + batchErrors,
        lastCursor: orders.pageInfo.endCursor,
        lastActivityAt: new Date(),
        status: newStatus,
        ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {})
      }
    });

    // If completed, update customer spending totals
    if (newStatus === 'COMPLETED') {
      await updateCustomerSpendingTotals(shop);
    }

    console.log(
      `[Order Sync Job] Batch complete - ` +
      `Processed: ${newProcessedCount}/${job.totalOrders || '?'}, ` +
      `Created: ${updatedJob.createdCount}, Updated: ${updatedJob.updatedCount}, ` +
      `Skipped: ${updatedJob.skippedCount}, Errors: ${updatedJob.errorCount}`
    );

    return {
      success: true,
      jobId,
      status: newStatus,
      progress: {
        processedCount: updatedJob.processedCount,
        totalOrders: updatedJob.totalOrders,
        createdCount: updatedJob.createdCount,
        updatedCount: updatedJob.updatedCount,
        skippedCount: updatedJob.skippedCount,
        errorCount: updatedJob.errorCount,
        percentComplete: updatedJob.totalOrders
          ? Math.round((updatedJob.processedCount / updatedJob.totalOrders) * 100)
          : 0
      },
      hasMore
    };
  } catch (error) {
    console.error('[Order Sync Job] Batch processing failed:', error);

    // Update job with error
    await db.orderSyncJob.update({
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
        totalOrders: job.totalOrders,
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalOrders
          ? Math.round((job.processedCount / job.totalOrders) * 100)
          : 0
      },
      hasMore: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get current status of an order sync job
 */
export async function getOrderSyncJobStatus(shop: string): Promise<SyncJobResult | null> {
  // Get most recent job for this shop
  const job = await db.orderSyncJob.findFirst({
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
      totalOrders: job.totalOrders,
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      percentComplete: job.totalOrders
        ? Math.round((job.processedCount / job.totalOrders) * 100)
        : 0
    },
    hasMore: job.status === 'IN_PROGRESS',
    error: job.lastError || undefined
  };
}

/**
 * Resume a failed order sync job from where it left off
 */
export async function resumeOrderSyncJob(
  jobId: string,
  admin: AdminApiContext
): Promise<SyncJobResult> {
  const job = await db.orderSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    return {
      success: false,
      jobId,
      status: 'FAILED',
      progress: {
        processedCount: 0,
        totalOrders: null,
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
        totalOrders: job.totalOrders,
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        errorCount: job.errorCount,
        percentComplete: job.totalOrders
          ? Math.round((job.processedCount / job.totalOrders) * 100)
          : 0
      },
      hasMore: job.status === 'IN_PROGRESS',
      error: `Cannot resume job with status: ${job.status}`
    };
  }

  // Reset job to in-progress
  await db.orderSyncJob.update({
    where: { id: jobId },
    data: {
      status: 'IN_PROGRESS',
      lastError: null,
      lastActivityAt: new Date()
    }
  });

  console.log(`[Order Sync Job] Resumed job ${jobId} from cursor: ${job.lastCursor}`);

  // Process next batch
  return processOrderBatch(jobId, admin);
}

/**
 * Cancel an in-progress order sync job
 */
export async function cancelOrderSyncJob(jobId: string): Promise<boolean> {
  const job = await db.orderSyncJob.findUnique({
    where: { id: jobId }
  });

  if (!job || job.status !== 'IN_PROGRESS') {
    return false;
  }

  await db.orderSyncJob.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      lastActivityAt: new Date()
    }
  });

  console.log(`[Order Sync Job] Cancelled job ${jobId}`);
  return true;
}

/**
 * Get sync job by ID
 */
export async function getOrderSyncJobById(jobId: string): Promise<SyncJobResult | null> {
  const job = await db.orderSyncJob.findUnique({
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
      totalOrders: job.totalOrders,
      createdCount: job.createdCount,
      updatedCount: job.updatedCount,
      skippedCount: job.skippedCount,
      errorCount: job.errorCount,
      percentComplete: job.totalOrders
        ? Math.round((job.processedCount / job.totalOrders) * 100)
        : 0
    },
    hasMore: job.status === 'IN_PROGRESS',
    error: job.lastError || undefined
  };
}

// Helper functions

async function createNewOrder(
  shop: string,
  shopifyOrderId: string,
  orderData: any,
  customer: any
): Promise<void> {
  // Calculate cashback
  let cashbackPercent = 0;
  let cashbackAmount = 0;
  let tierIdAtOrder = null;
  let tierNameAtOrder = null;

  if (customer?.currentTier) {
    cashbackPercent = customer.currentTier.cashbackPercent;
    tierIdAtOrder = customer.currentTier.id;
    tierNameAtOrder = customer.currentTier.name;

    const subtotal = parseFloat(orderData.subtotalPriceSet?.shopMoney?.amount || "0");
    const discounts = parseFloat(orderData.totalDiscountsSet?.shopMoney?.amount || "0");
    const netAmount = subtotal - discounts;
    cashbackAmount = (netAmount * cashbackPercent) / 100;
  }

  const orderId = uuidv4();
  const now = new Date();

  await (db as any).order.create({
    data: {
      id: orderId,
      shop,
      shopifyOrderId,
      shopifyOrderNumber: orderData.name?.replace('#', '') || "",
      shopifyOrderName: orderData.name || "",
      customerId: customer.id,
      email: orderData.email || customer?.email || "",
      currency: orderData.currencyCode || "USD",
      subtotalPrice: parseFloat(orderData.subtotalPriceSet?.shopMoney?.amount || "0"),
      totalDiscounts: parseFloat(orderData.totalDiscountsSet?.shopMoney?.amount || "0"),
      totalShipping: parseFloat(orderData.totalShippingPriceSet?.shopMoney?.amount || "0"),
      totalTax: parseFloat(orderData.totalTaxSet?.shopMoney?.amount || "0"),
      totalPrice: parseFloat(orderData.totalPriceSet?.shopMoney?.amount || "0"),
      totalRefunded: parseFloat(orderData.totalRefundedSet?.shopMoney?.amount || "0"),
      netAmount: parseFloat(orderData.netPaymentSet?.shopMoney?.amount || orderData.totalPriceSet?.shopMoney?.amount || "0"),
      financialStatus: mapFinancialStatus(orderData.displayFinancialStatus),
      fulfillmentStatus: orderData.displayFulfillmentStatus || null,
      cashbackEligible: true,
      cashbackPercent,
      cashbackAmount,
      cashbackProcessed: false,
      tierIdAtOrder,
      tierNameAtOrder,
      shopifyCreatedAt: new Date(orderData.createdAt),
      shopifyUpdatedAt: new Date(orderData.updatedAt),
      processedAt: orderData.processedAt ? new Date(orderData.processedAt) : null,
      createdAt: now,
      updatedAt: now
    }
  });

  // Create historical ledger entry for cashback
  if (cashbackAmount > 0) {
    await db.storeCreditLedger.create({
      data: {
        id: uuidv4(),
        shop,
        customerId: customer.id,
        orderId: orderId,
        type: 'CASHBACK_EARNED',
        amount: cashbackAmount,
        balance: 0,
        metadata: {
          orderName: orderData.name,
          orderDate: orderData.createdAt,
          historical: true,
          tierName: tierNameAtOrder,
          cashbackPercent
        },
        createdAt: new Date(orderData.createdAt)
      }
    });
  }

  // Process line items
  if (orderData.lineItems?.edges) {
    for (const edge of orderData.lineItems.edges) {
      const item = edge.node;
      const shopifyLineItemId = item.id.replace('gid://shopify/LineItem/', '');

      const shopifyProductId = item.product?.id ?
        item.product.id.replace('gid://shopify/Product/', '') : null;
      const shopifyVariantId = item.variant?.id ?
        item.variant.id.replace('gid://shopify/ProductVariant/', '') : null;

      const unitPrice = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || "0");
      const totalDiscount = parseFloat(item.totalDiscountSet?.shopMoney?.amount || "0");

      await (db as any).orderLineItem.create({
        data: {
          id: uuidv4(),
          orderId,
          shopifyLineItemId,
          shopifyProductId,
          shopifyVariantId,
          title: item.title || "",
          variantTitle: item.variantTitle || null,
          sku: item.sku || null,
          vendor: item.vendor || null,
          quantity: item.quantity || 1,
          price: unitPrice,
          totalPrice: unitPrice * (item.quantity || 1),
          totalDiscount: totalDiscount,
          requiresShipping: item.requiresShipping !== false,
          taxable: item.taxable !== false,
          giftCard: false,
          isTierProduct: false,
          tierProductId: null,
          createdAt: now
        }
      });
    }
  }

  // Process refunds
  if (orderData.refunds?.length > 0) {
    for (const refund of orderData.refunds) {
      const shopifyRefundId = refund.id.replace('gid://shopify/Refund/', '');

      const existingRefund = await (db as any).orderRefund.findFirst({
        where: { orderId, shopifyRefundId }
      });

      if (!existingRefund) {
        const refundId = uuidv4();

        await (db as any).orderRefund.create({
          data: {
            id: refundId,
            orderId,
            shopifyRefundId,
            amount: parseFloat(refund.totalRefundedSet?.shopMoney?.amount || "0"),
            shippingAmount: 0,
            taxAmount: 0,
            reason: null,
            note: refund.note || null,
            cashbackAdjustment: null,
            cashbackProcessed: false,
            shopifyCreatedAt: new Date(refund.createdAt),
            processedAt: null,
            createdAt: now
          }
        });

        // Process refund line items
        if (refund.refundLineItems?.edges) {
          for (const edge of refund.refundLineItems.edges) {
            const item = edge.node;
            const shopifyLineItemId = item.lineItem?.id ?
              item.lineItem.id.replace('gid://shopify/LineItem/', '') : "";

            await (db as any).orderRefundLineItem.create({
              data: {
                id: uuidv4(),
                refundId,
                shopifyLineItemId,
                quantity: item.quantity || 1,
                subtotal: parseFloat(item.subtotalSet?.shopMoney?.amount || "0"),
                createdAt: now
              }
            });
          }
        }
      }
    }
  }
}

async function updateExistingOrder(orderId: string, orderData: any): Promise<void> {
  await (db as any).order.update({
    where: { id: orderId },
    data: {
      totalRefunded: parseFloat(orderData.totalRefundedSet?.shopMoney?.amount || "0"),
      netAmount: parseFloat(orderData.netPaymentSet?.shopMoney?.amount || orderData.totalPriceSet?.shopMoney?.amount || "0"),
      financialStatus: mapFinancialStatus(orderData.displayFinancialStatus),
      fulfillmentStatus: orderData.displayFulfillmentStatus || null,
      shopifyUpdatedAt: new Date(orderData.updatedAt),
      updatedAt: new Date()
    }
  });
}

function mapFinancialStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'PENDING': 'PENDING',
    'AUTHORIZED': 'AUTHORIZED',
    'PARTIALLY_PAID': 'PARTIALLY_PAID',
    'PAID': 'PAID',
    'PARTIALLY_REFUNDED': 'PARTIALLY_REFUNDED',
    'REFUNDED': 'REFUNDED',
    'VOIDED': 'VOIDED'
  };

  return statusMap[status] || 'PENDING';
}

async function updateCustomerSpendingTotals(shop: string): Promise<void> {
  console.log("[Order Sync Job] Updating customer spending totals...");

  const customers = await db.customer.findMany({
    where: { shop },
    select: { id: true }
  });

  for (const customer of customers) {
    const orderStats = await (db as any).order.aggregate({
      where: {
        shop,
        customerId: customer.id,
        financialStatus: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] }
      },
      _sum: {
        totalPrice: true,
        totalRefunded: true,
        cashbackAmount: true
      },
      _count: {
        id: true
      },
      _max: {
        shopifyCreatedAt: true
      }
    });

    await db.customer.update({
      where: { id: customer.id },
      data: {
        totalSpent: orderStats._sum.totalPrice || 0,
        totalRefunded: orderStats._sum.totalRefunded || 0,
        totalCashbackEarned: orderStats._sum.cashbackAmount || 0,
        netSpent: (orderStats._sum.totalPrice || 0) - (orderStats._sum.totalRefunded || 0),
        orderCount: orderStats._count.id || 0,
        lastOrderDate: orderStats._max.shopifyCreatedAt || null,
        updatedAt: new Date()
      }
    });
  }

  console.log(`[Order Sync Job] Updated spending totals for ${customers.length} customers`);
}
