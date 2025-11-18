import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../db.server";
import { v4 as uuidv4 } from "uuid";

// Types
export interface OrderSyncOptions {
  shop: string;
  batchSize?: number;
  maxRetries?: number;
  onProgress?: (progress: OrderSyncProgress) => void;
  startDate?: Date;
  endDate?: Date;
  maxExecutionTime?: number; // Maximum execution time in milliseconds (default: 50 seconds for Vercel)
}

export interface OrderSyncProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: OrderSyncError[];
  currentBatch?: number;
  totalBatches?: number;
}

export interface OrderSyncError {
  orderId?: string;
  orderNumber?: string;
  error: string;
  timestamp: Date;
}

export interface OrderSyncResult {
  success: boolean;
  message: string;
  progress: OrderSyncProgress;
  completedAt: Date;
  duration: number;
}

// GraphQL Query for Orders - Updated for 2025-01 API
const ORDERS_BATCH_QUERY = `#graphql
  query GetOrdersBatch($cursor: String, $first: Int = 50, $query: String) {
    orders(first: $first, after: $cursor, query: $query, reverse: true) {
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

// Rate Limiter class for API throttling
class RateLimiter {
  private requests: number[] = [];
  private readonly limit: number;
  private readonly window: number;
  private costBuffer: number = 0;
  private readonly maxCost: number;

  constructor(limit = 2, window = 1000, maxCost = 1000) {
    this.limit = limit;
    this.window = window;
    this.maxCost = maxCost; // Shopify's query cost limit
  }

  async throttle(cost: number = 50): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside window
    this.requests = this.requests.filter(time => now - time < this.window);
    
    // Check query cost
    if (this.costBuffer + cost > this.maxCost) {
      // Wait for cost to reset (usually 1 second)
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.costBuffer = 0;
    }
    
    // If at limit, wait
    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0];
      const waitTime = this.window - (now - oldestRequest) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.throttle(cost);
    }
    
    this.requests.push(now);
    this.costBuffer += cost;
  }

  reset(): void {
    this.requests = [];
    this.costBuffer = 0;
  }
}

// Main Order Sync Service
export class OrderSyncService {
  private admin: AdminApiContext;
  private options: Required<OrderSyncOptions>;
  private rateLimiter: RateLimiter;
  private startTime: number = 0;

  constructor(admin: AdminApiContext, options: OrderSyncOptions) {
    this.admin = admin;
    this.options = {
      batchSize: 50,
      maxRetries: 3,
      onProgress: () => {},
      startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Default to 1 year ago
      endDate: new Date(),
      maxExecutionTime: 50000, // Default: 50 seconds (safe for Vercel 60s timeout)
      ...options
    };
    // Shopify allows 2 requests per second with max 1000 cost points
    this.rateLimiter = new RateLimiter(2, 1000, 1000);
  }

  /**
   * Sync all orders from Shopify to local database
   */
  async syncAllOrders(): Promise<OrderSyncResult> {
    console.log("[Order Sync] Starting sync service");
    this.startTime = Date.now();

    const progress: OrderSyncProgress = {
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      currentBatch: 0,
      totalBatches: 0
    };

    try {
      // Build query filter for date range and status
      const queryParts: string[] = [];

      // Add date filter
      const startDateStr = this.options.startDate.toISOString().split('T')[0];
      const endDateStr = this.options.endDate.toISOString().split('T')[0];
      queryParts.push(`created_at:>=${startDateStr}`);
      queryParts.push(`created_at:<=${endDateStr}`);

      // Only sync paid orders (for cashback calculation)
      queryParts.push(`financial_status:paid OR financial_status:partially_refunded OR financial_status:refunded`);

      const query = queryParts.join(' AND ');
      console.log(`[Order Sync] Date range: ${startDateStr} to ${endDateStr}, batch size: ${this.options.batchSize}`);

      let cursor: string | null = null;
      let hasNextPage = true;
      let estimatedTotal = 0;

      console.log("[SYNC] Starting batch processing loop");

      // Process orders in batches
      while (hasNextPage) {
        // Check if we're approaching timeout
        const elapsedTime = Date.now() - this.startTime;
        console.log(`[SYNC] Elapsed time: ${elapsedTime}ms / ${this.options.maxExecutionTime}ms`);

        if (elapsedTime > this.options.maxExecutionTime) {
          console.log(`[SYNC] ⚠️ Approaching timeout (${elapsedTime}ms), stopping sync gracefully...`);
          progress.errors.push({
            error: `Sync stopped after ${elapsedTime}ms to avoid timeout. Processed ${progress.processed} orders. Continue sync to process remaining orders.`,
            timestamp: new Date()
          });
          break;
        }

        progress.currentBatch = (progress.currentBatch || 0) + 1;
        console.log(`[SYNC] ========== BATCH ${progress.currentBatch} START ==========`);

        try {
          // Fetch batch with rate limiting
          console.log("[SYNC] Applying rate limit throttle...");
          await this.rateLimiter.throttle();
          console.log("[SYNC] Rate limit check passed");

          console.log("[SYNC] Fetching order batch from Shopify API...", {
            cursor: cursor || "null (first batch)",
            batchSize: this.options.batchSize
          });

          const batch = await this.fetchOrderBatch(cursor, query);

          console.log("[SYNC] Batch fetched successfully", {
            ordersCount: batch.orders?.length || 0,
            hasNextPage: batch.pageInfo?.hasNextPage
          });

          if (!batch.orders || batch.orders.length === 0) {
            console.log("[SYNC] No orders in batch, ending sync");
            break;
          }

          // Update estimated total
          if (estimatedTotal === 0 && batch.orders.length > 0) {
            // Rough estimate based on first batch
            estimatedTotal = batch.orders.length * 10; // Assume ~10 pages
            progress.total = estimatedTotal;
            console.log(`[SYNC] Estimated total orders: ${estimatedTotal}`);
          }

          // Process batch
          console.log(`[SYNC] Processing batch of ${batch.orders.length} orders...`);
          await this.processBatch(batch.orders, progress);
          console.log(`[SYNC] Batch processed. Progress: ${progress.processed}/${progress.total} (${progress.successful} successful, ${progress.failed} failed)`);

          cursor = batch.pageInfo.endCursor;
          hasNextPage = batch.pageInfo.hasNextPage;

          console.log("[SYNC] Batch pagination info:", {
            endCursor: cursor || "null",
            hasNextPage
          });

          // Report progress
          console.log("[SYNC] Calling onProgress callback");
          this.options.onProgress(progress);

          // Small delay between batches
          if (hasNextPage) {
            console.log("[SYNC] More pages available, waiting 100ms before next batch...");
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            console.log("[SYNC] No more pages, sync complete");
          }

          console.log(`[SYNC] ========== BATCH ${progress.currentBatch} END ==========`);
        } catch (error) {
          console.error(`[SYNC] ❌ Error processing batch ${progress.currentBatch}:`, error);
          console.error("[SYNC] Error details:", {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });

          // Add to errors but continue processing
          progress.errors.push({
            error: `Batch ${progress.currentBatch} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date()
          });

          // If too many errors, stop
          if (progress.errors.length > 10) {
            throw new Error("Too many errors encountered, stopping sync");
          }

          // Retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 2000 * progress.errors.length));

          if (hasNextPage && cursor) {
            continue;
          }
        }
      }

      // Update customer spending totals after all orders are synced
      console.log("[SYNC] Updating customer spending totals...");
      await this.updateCustomerSpendingTotals(progress);
      console.log("[SYNC] Customer spending totals updated");

      const duration = Date.now() - this.startTime;

      console.log("========================================");
      console.log("ORDER SYNC SERVICE - COMPLETE");
      console.log("========================================");
      console.log("[SYNC] Final stats:", {
        successful: progress.successful,
        failed: progress.failed,
        skipped: progress.skipped,
        total: progress.processed,
        duration: `${duration}ms`,
        errors: progress.errors.length
      });

      return {
        success: progress.successful > 0,
        message: this.generateSyncMessage(progress),
        progress,
        completedAt: new Date(),
        duration
      };
    } catch (error) {
      console.error("========================================");
      console.error("ORDER SYNC SERVICE - FAILED");
      console.error("========================================");
      console.error("[SYNC] ❌ Fatal error:", error);
      console.error("[SYNC] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      const duration = Date.now() - this.startTime;

      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to sync orders",
        progress,
        completedAt: new Date(),
        duration
      };
    }
  }

  /**
   * Fetch a batch of orders from Shopify with retry logic
   */
  private async fetchOrderBatch(cursor: string | null, query: string, retryCount = 0): Promise<any> {
    console.log("[FETCH] Fetching order batch...", {
      cursor: cursor || "null (first page)",
      batchSize: this.options.batchSize,
      retryCount
    });

    const variables = {
      cursor,
      first: this.options.batchSize,
      query
    };

    try {
      console.log("[FETCH] Sending GraphQL request to Shopify...");
      const response = await this.admin.graphql(ORDERS_BATCH_QUERY, { variables });
      console.log("[FETCH] Response received, parsing JSON...");
      const result = await response.json() as any;
      console.log("[FETCH] JSON parsed successfully");

      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map((e: any) => e.message).join(', ');

        // Check for rate limiting
        if (result.errors.some((e: any) => e.extensions?.code === 'THROTTLED')) {
          // Wait and retry with exponential backoff
          console.log("Rate limited, waiting 5 seconds...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          this.rateLimiter.reset();
          return this.fetchOrderBatch(cursor, query, retryCount);
        }

        throw new Error(`GraphQL errors: ${errorMessages}`);
      }

      // Extract orders from edges
      console.log("[FETCH] Extracting order data from response...");
      const edges = result.data?.orders?.edges || [];
      const orders = edges.map((edge: any) => edge.node);
      const pageInfo = result.data?.orders?.pageInfo || { hasNextPage: false, endCursor: null };

      console.log(`[FETCH] ✅ Successfully fetched ${orders.length} orders`, {
        ordersCount: orders.length,
        hasNextPage: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor ? "present" : "null"
      });

      return {
        orders,
        pageInfo
      };
    } catch (error: any) {
      console.error("[FETCH] ❌ Error fetching orders:", error);
      console.error("[FETCH] Error type:", error?.constructor?.name);
      console.error("[FETCH] Error message:", error?.message);

      // Retry on network errors with exponential backoff
      if (retryCount < this.options.maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`[FETCH] 🔄 Network error, retrying in ${waitTime}ms (attempt ${retryCount + 1}/${this.options.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.fetchOrderBatch(cursor, query, retryCount + 1);
      }

      console.error("[FETCH] ❌ Max retries exceeded, throwing error");
      throw error;
    }
  }

  /**
   * Process a batch of orders
   */
  private async processBatch(orders: any[], progress: OrderSyncProgress): Promise<void> {
    for (const order of orders) {
      try {
        await this.processOrder(order);
        progress.successful++;
        progress.processed++;
      } catch (error) {
        progress.failed++;
        progress.processed++;
        progress.errors.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
      }

      // Update total if we haven't reached it yet
      if (progress.total === 0 || progress.processed > progress.total) {
        progress.total = progress.processed;
      }
    }
  }

  /**
   * Process a single order and save to database
   */
  private async processOrder(order: any): Promise<void> {
    console.log(`[PROCESS] Processing order ${order.name}...`);

    // Extract Shopify order ID from GraphQL global ID
    const shopifyOrderId = order.id.replace('gid://shopify/Order/', '');

    // Extract customer ID if exists
    const shopifyCustomerId = order.customer?.id ?
      order.customer.id.replace('gid://shopify/Customer/', '') : null;

    console.log(`[PROCESS] Order IDs extracted`, {
      orderName: order.name,
      shopifyOrderId,
      shopifyCustomerId: shopifyCustomerId || "none"
    });

    // Check if order already exists
    console.log(`[PROCESS] Checking if order exists in database...`);
    const existingOrder = await (db as any).order.findFirst({
      where: {
        shop: this.options.shop,
        shopifyOrderId
      }
    });

    if (existingOrder) {
      console.log(`[PROCESS] Order ${order.name} already exists (ID: ${existingOrder.id}), updating...`);

      // Update existing order with latest data
      await this.updateOrder(existingOrder.id, order, shopifyCustomerId);
      console.log(`[PROCESS] ✅ Order ${order.name} updated successfully`);
      return;
    }

    console.log(`[PROCESS] Order ${order.name} does not exist, creating new record...`);

    // Find the customer in our database
    let customer = null;
    if (shopifyCustomerId) {
      console.log(`[PROCESS] Looking up customer in database...`, {
        shopifyCustomerId,
        shop: this.options.shop
      });

      customer = await db.customer.findFirst({
        where: {
          shop: this.options.shop,
          shopifyCustomerId
        },
        include: {
          currentTier: true
        }
      });

      if (customer) {
        console.log(`[PROCESS] Customer found:`, {
          customerId: customer.id,
          email: customer.email,
          hasTier: !!customer.currentTier,
          tierName: customer.currentTier?.name
        });
      } else {
        console.log(`[PROCESS] ⚠️ Customer NOT found in database - skipping order`, {
          shopifyCustomerId,
          orderName: order.name
        });
        return; // Skip orders for customers not in our database
      }
    } else {
      console.log(`[PROCESS] ⚠️ Skipping order - no customer ID (guest checkout)`);
      return; // Skip guest checkout orders - can't track rewards without customer
    }

    // Calculate cashback if customer has a tier
    console.log(`[PROCESS] Calculating cashback...`);
    let cashbackPercent = 0;
    let cashbackAmount = 0;
    let tierIdAtOrder = null;
    let tierNameAtOrder = null;

    if (customer?.currentTier) {
      cashbackPercent = customer.currentTier.cashbackPercent;
      tierIdAtOrder = customer.currentTier.id;
      tierNameAtOrder = customer.currentTier.name;

      // Calculate cashback on net amount (after discounts, before tax/shipping)
      const subtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0");
      const discounts = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0");
      const netAmount = subtotal - discounts;
      cashbackAmount = (netAmount * cashbackPercent) / 100;

      console.log(`[PROCESS] Cashback calculated:`, {
        tierName: tierNameAtOrder,
        cashbackPercent,
        subtotal,
        discounts,
        netAmount,
        cashbackAmount
      });
    } else {
      console.log(`[PROCESS] No tier assigned, cashback will be 0`);
    }

    // Create the order
    const orderId = uuidv4();
    const now = new Date();

    console.log(`[PROCESS] Creating order record in database...`, {
      orderId,
      orderName: order.name,
      customerId: customer.id,
      cashbackAmount
    });

    await (db as any).order.create({
      data: {
        id: orderId,
        shop: this.options.shop,
        shopifyOrderId,
        shopifyOrderNumber: order.name?.replace('#', '') || "",
        shopifyOrderName: order.name || "",
        customerId: customer.id,
        email: order.email || customer?.email || "",
        currency: order.currencyCode || "USD",
        subtotalPrice: parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0"),
        totalDiscounts: parseFloat(order.totalDiscountsSet?.shopMoney?.amount || "0"),
        totalShipping: parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0"),
        totalTax: parseFloat(order.totalTaxSet?.shopMoney?.amount || "0"),
        totalPrice: parseFloat(order.totalPriceSet?.shopMoney?.amount || "0"),
        totalRefunded: parseFloat(order.totalRefundedSet?.shopMoney?.amount || "0"),
        netAmount: parseFloat(order.netPaymentSet?.shopMoney?.amount || order.totalPriceSet?.shopMoney?.amount || "0"),
        financialStatus: this.mapFinancialStatus(order.displayFinancialStatus),
        fulfillmentStatus: order.displayFulfillmentStatus || null,
        cashbackEligible: true,
        cashbackPercent,
        cashbackAmount,
        cashbackProcessed: false, // Will be processed separately
        tierIdAtOrder,
        tierNameAtOrder,
        shopifyCreatedAt: new Date(order.createdAt),
        shopifyUpdatedAt: new Date(order.updatedAt),
        processedAt: order.processedAt ? new Date(order.processedAt) : null,
        createdAt: now,
        updatedAt: now
      }
    });

    console.log(`[PROCESS] ✅ Order record created successfully in database`);

    // Create historical ledger entry for cashback tracking (NOT added to customer balance)
    // This allows totalEarned calculation to work for historical orders
    if (cashbackAmount > 0) {
      console.log(`[PROCESS] Creating historical ledger entry for cashback tracking...`);
      await db.storeCreditLedger.create({
        data: {
          id: uuidv4(),
          shop: this.options.shop,
          customerId: customer.id,
          orderId: orderId,
          type: 'CASHBACK_EARNED',
          amount: cashbackAmount,
          balance: 0, // Historical - not added to balance
          description: `Historical cashback from order ${order.name} (synced from past orders)`,
          metadata: {
            orderName: order.name,
            orderDate: order.createdAt,
            historical: true, // Mark as historical sync
            tierName: tierNameAtOrder,
            cashbackPercent
          },
          createdAt: new Date(order.createdAt), // Use order date for proper chronological sorting
        }
      });
      console.log(`[PROCESS] Historical ledger entry created`);
    }

    // Process line items
    if (order.lineItems?.edges) {
      console.log(`[PROCESS] Processing ${order.lineItems.edges.length} line items...`);
      await this.processLineItems(orderId, order.lineItems.edges);
      console.log(`[PROCESS] Line items processed`);
    }

    // Process refunds if any
    if (order.refunds && order.refunds.length > 0) {
      console.log(`[PROCESS] Processing ${order.refunds.length} refunds...`);
      await this.processRefunds(orderId, order.refunds);
      console.log(`[PROCESS] Refunds processed`);
    }

    console.log(`[PROCESS] ✅ Order ${order.name} fully processed with cashback: ${cashbackAmount} ${order.currencyCode}`);
  }

  /**
   * Update an existing order
   */
  private async updateOrder(orderId: string, order: any, shopifyCustomerId: string | null): Promise<void> {
    // Update order with latest data
    await (db as any).order.update({
      where: { id: orderId },
      data: {
        totalRefunded: parseFloat(order.totalRefundedSet?.shopMoney?.amount || "0"),
        netAmount: parseFloat(order.netPaymentSet?.shopMoney?.amount || order.totalPriceSet?.shopMoney?.amount || "0"),
        financialStatus: this.mapFinancialStatus(order.displayFinancialStatus),
        fulfillmentStatus: order.displayFulfillmentStatus || null,
        shopifyUpdatedAt: new Date(order.updatedAt),
        updatedAt: new Date()
      }
    });

    // Process any new refunds
    if (order.refunds && order.refunds.length > 0) {
      await this.processRefunds(orderId, order.refunds);
    }
  }

  /**
   * Process order line items
   */
  private async processLineItems(orderId: string, lineItems: any[]): Promise<void> {
    for (const edge of lineItems) {
      const item = edge.node;
      const shopifyLineItemId = item.id.replace('gid://shopify/LineItem/', '');
      
      // Check if line item already exists
      const existingItem = await (db as any).orderLineItem.findFirst({
        where: {
          orderId,
          shopifyLineItemId
        }
      });

      if (existingItem) {
        continue;
      }

      // Extract product and variant IDs
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
          giftCard: false, // Will need to check product type
          isTierProduct: false, // Will implement tier product checking later
          tierProductId: null,
          createdAt: new Date()
        }
      });
    }
  }

  /**
   * Process order refunds
   */
  private async processRefunds(orderId: string, refunds: any[]): Promise<void> {
    for (const refund of refunds) {
      const shopifyRefundId = refund.id.replace('gid://shopify/Refund/', '');
      
      // Check if refund already exists
      const existingRefund = await (db as any).orderRefund.findFirst({
        where: {
          orderId,
          shopifyRefundId
        }
      });

      if (existingRefund) {
        continue;
      }

      // Create refund record
      const refundId = uuidv4();
      
      await (db as any).orderRefund.create({
        data: {
          id: refundId,
          orderId,
          shopifyRefundId,
          amount: parseFloat(refund.totalRefundedSet?.shopMoney?.amount || "0"),
          shippingAmount: 0, // Not available in this query
          taxAmount: 0, // Not available in this query
          reason: null,
          note: refund.note || null,
          cashbackAdjustment: null, // Will be calculated separately
          cashbackProcessed: false,
          shopifyCreatedAt: new Date(refund.createdAt),
          processedAt: null,
          createdAt: new Date()
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
              createdAt: new Date()
            }
          });
        }
      }
    }
  }

  /**
   * Map Shopify financial status to our enum
   */
  private mapFinancialStatus(status: string): string {
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

  /**
   * Update customer spending totals based on synced orders
   */
  private async updateCustomerSpendingTotals(progress: OrderSyncProgress): Promise<void> {
    console.log("Updating customer spending totals...");

    try {
      // Get all customers with orders
      const customers = await db.customer.findMany({
        where: { shop: this.options.shop },
        select: { id: true, shopifyCustomerId: true }
      });

      for (const customer of customers) {
        // Calculate totals from orders
        const orderStats = await (db as any).order.aggregate({
          where: {
            shop: this.options.shop,
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

        // Update customer record
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

      console.log(`Updated spending totals for ${customers.length} customers`);
    } catch (error) {
      console.error("Error updating customer spending totals:", error);
      progress.errors.push({
        error: `Failed to update customer totals: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      });
    }
  }

  /**
   * Generate sync summary message
   */
  private generateSyncMessage(progress: OrderSyncProgress): string {
    const parts = [`Processed ${progress.processed} orders`];
    
    if (progress.successful > 0) {
      parts.push(`${progress.successful} synced successfully`);
    }
    
    if (progress.failed > 0) {
      parts.push(`${progress.failed} failed`);
    }
    
    if (progress.skipped > 0) {
      parts.push(`${progress.skipped} skipped`);
    }
    
    return parts.join(", ");
  }

  /**
   * Sync a single order by ID
   */
  async syncSingleOrder(orderId: string): Promise<void> {
    const SINGLE_ORDER_QUERY = `#graphql
      query GetOrder($id: ID!) {
        order(id: $id) {
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
    `;

    await this.rateLimiter.throttle();
    
    const response = await this.admin.graphql(SINGLE_ORDER_QUERY, {
      variables: { id: orderId }
    });

    const result = await response.json() as any;
    
    if (result.errors) {
      throw new Error(`Failed to fetch order: ${result.errors[0].message}`);
    }

    if (!result.data?.order) {
      throw new Error("Order not found");
    }

    // Process the single order
    await this.processOrder(result.data.order);
  }
}

// Export helper function for creating service instance
export async function createOrderSyncService(
  admin: AdminApiContext,
  shop: string,
  options?: Partial<OrderSyncOptions>
): Promise<OrderSyncService> {
  return new OrderSyncService(admin, {
    shop,
    ...options
  });
}