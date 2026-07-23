/**
 * Incremental Order Sync Service
 * Efficiently syncs only new/updated orders from Shopify
 * Avoids expensive full syncs by tracking sync state
 */

import prisma from '../db.server';
import { v4 as uuidv4 } from 'uuid';
import { updateCustomerToEffectiveTier } from './tier-resolution.server';

type AdminClient = { graphql: (...args: any[]) => Promise<any> };

// Helper function to extract numeric ID from GraphQL ID
function extractNumericId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  if (/^\d+$/.test(gid)) return gid;
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

// Helper function to map Shopify financial status
function mapFinancialStatus(displayStatus: string): any {
  const statusMap: Record<string, string> = {
    'PENDING': 'PENDING',
    'AUTHORIZED': 'AUTHORIZED',
    'PAID': 'PAID',
    'PARTIALLY_PAID': 'PARTIALLY_PAID',
    'REFUNDED': 'REFUNDED',
    'PARTIALLY_REFUNDED': 'PARTIALLY_REFUNDED',
    'VOIDED': 'VOIDED',
    'EXPIRED': 'EXPIRED'
  };
  return statusMap[displayStatus?.toUpperCase()] || 'PENDING';
}

interface SyncResult {
  success: boolean;
  totalProcessed: number;
  totalCreated: number;
  totalUpdated: number;
  totalSkipped: number;
  errors: string[];
  duration: number;
  nextSyncCursor?: string;
}

interface ProcessResult {
  created?: boolean;
  updated?: boolean;
  skipped?: boolean;
}

export class IncrementalOrderSync {
  private readonly BATCH_SIZE = 50;
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_SYNC_DAYS = 30; // Only sync last 30 days on first sync
  private readonly RATE_LIMIT_DELAY_MS = 200; // Delay between batches

  /**
   * Main sync orchestrator - determines what needs syncing
   */
  async syncOrders(shop: string, admin: AdminClient): Promise<SyncResult> {
    const startTime = Date.now();
    console.log(`[IncrementalSync] Starting sync for shop: ${shop}`);

    const syncStatus = await this.getSyncStatus(shop);

    let result: SyncResult;

    if (!syncStatus) {
      console.log(`[IncrementalSync] First sync for ${shop} - doing initial sync`);
      result = await this.initialSync(shop, admin);
    } else if (this.needsCatchUpSync(syncStatus)) {
      console.log(`[IncrementalSync] Catch-up sync needed for ${shop}`);
      result = await this.catchUpSync(shop, admin, syncStatus);
    } else {
      console.log(`[IncrementalSync] Regular incremental sync for ${shop}`);
      result = await this.incrementalSync(shop, admin, syncStatus);
    }

    result.duration = Date.now() - startTime;
    console.log(`[IncrementalSync] Sync completed for ${shop}:`, result);

    return result;
  }

  /**
   * Check if there are new orders since last sync (quick check)
   */
  async hasNewOrders(shop: string, admin: AdminClient): Promise<boolean> {
    const syncStatus = await this.getSyncStatus(shop);
    if (!syncStatus) return true; // First sync, definitely has orders

    const query = `updated_at:>'${syncStatus.lastSyncAt.toISOString()}'`;

    try {
      const response = await admin.graphql(COUNT_QUERY, {
        variables: { query }
      });

      const data = await response.json();
      const count = data.data?.ordersCount?.count || 0;

      console.log(`[IncrementalSync] ${count} new/updated orders for ${shop} since ${syncStatus.lastSyncAt}`);
      return count > 0;
    } catch (error) {
      console.error(`[IncrementalSync] Error checking for new orders:`, error);
      return true; // Assume there are orders to be safe
    }
  }

  /**
   * Initial sync - limited to recent orders
   */
  private async initialSync(shop: string, admin: AdminClient): Promise<SyncResult> {
    const syncFromDate = new Date();
    syncFromDate.setDate(syncFromDate.getDate() - this.INITIAL_SYNC_DAYS);

    // Create sync status record
    const syncStatus = await prisma.syncStatus.create({
      data: {
        id: uuidv4(),
        shop,
        syncType: 'orders',
        lastSyncAt: syncFromDate,
        status: 'RUNNING',
        recordsProcessed: 0
      }
    });

    const query = `created_at:>'${syncFromDate.toISOString()}'`;
    return this.syncWithQuery(shop, admin, query, syncStatus);
  }

  /**
   * Catch-up sync for when there's been a long gap
   */
  private async catchUpSync(shop: string, admin: AdminClient, syncStatus: any): Promise<SyncResult> {
    // Update status to running
    await prisma.syncStatus.update({
      where: { id: syncStatus.id },
      data: { status: 'RUNNING' }
    });

    // Sync from last sync time, but limit to reasonable timeframe
    const maxLookback = new Date();
    maxLookback.setDate(maxLookback.getDate() - 7); // Max 7 days lookback

    const syncFrom = syncStatus.lastSyncAt > maxLookback ? syncStatus.lastSyncAt : maxLookback;
    const query = `updated_at:>'${syncFrom.toISOString()}'`;

    return this.syncWithQuery(shop, admin, query, syncStatus);
  }

  /**
   * Incremental sync - only new/updated orders
   */
  private async incrementalSync(shop: string, admin: AdminClient, syncStatus: any): Promise<SyncResult> {
    // Update status to running
    await prisma.syncStatus.update({
      where: { id: syncStatus.id },
      data: { status: 'RUNNING' }
    });

    // Query only orders updated since last sync
    const query = `updated_at:>'${syncStatus.lastSyncAt.toISOString()}'`;

    return this.syncWithQuery(shop, admin, query, syncStatus);
  }

  /**
   * Sync orders with specific query
   */
  private async syncWithQuery(
    shop: string,
    admin: AdminClient,
    query: string,
    syncStatus: any
  ): Promise<SyncResult> {
    let cursor = syncStatus.syncCursor;
    let hasNextPage = true;
    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    try {
      while (hasNextPage) {
        // Fetch batch from Shopify
        console.log(`[IncrementalSync] Fetching batch for ${shop}, cursor: ${cursor || 'start'}`);

        const response = await admin.graphql(ORDERS_QUERY, {
          variables: {
            first: this.BATCH_SIZE,
            query,
            after: cursor,
            sortKey: 'UPDATED_AT',
            reverse: false
          }
        });

        const data = await response.json();

        if (data.errors) {
          throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
        }

        const orders = data.data?.orders?.edges || [];
        console.log(`[IncrementalSync] Processing ${orders.length} orders`);

        // Process each order
        for (const edge of orders) {
          const order = edge.node;

          try {
            const result = await this.processOrder(shop, order);
            totalProcessed++;

            if (result.created) totalCreated++;
            if (result.updated) totalUpdated++;
            if (result.skipped) totalSkipped++;

            // Update sync cursor periodically (every 10 orders)
            if (totalProcessed % 10 === 0) {
              await prisma.syncStatus.update({
                where: { id: syncStatus.id },
                data: {
                  syncCursor: edge.cursor,
                  lastSuccessfulId: order.id,
                  recordsProcessed: totalProcessed
                }
              });
            }
          } catch (error: any) {
            errors.push(`Order ${order.name}: ${error.message}`);
            console.error(`[IncrementalSync] Failed to process order ${order.name}:`, error);
          }
        }

        // Check for next page
        hasNextPage = data.data?.orders?.pageInfo?.hasNextPage || false;
        cursor = data.data?.orders?.pageInfo?.endCursor;

        // Rate limit protection
        if (hasNextPage) {
          await this.sleep(this.RATE_LIMIT_DELAY_MS);
        }
      }

      // Update sync status on completion
      await prisma.syncStatus.update({
        where: { id: syncStatus.id },
        data: {
          status: 'COMPLETED',
          lastSyncAt: new Date(),
          syncCursor: null, // Reset cursor on successful completion
          recordsProcessed: totalProcessed,
          errorMessage: errors.length > 0 ? errors.slice(0, 10).join('; ') : null
        }
      });

      return {
        success: true,
        totalProcessed,
        totalCreated,
        totalUpdated,
        totalSkipped,
        errors,
        duration: 0 // Will be set by caller
      };

    } catch (error: any) {
      // Update sync status on failure
      await prisma.syncStatus.update({
        where: { id: syncStatus.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message
        }
      });

      throw error;
    }
  }

  /**
   * Process a single order
   */
  private async processOrder(shop: string, orderData: any): Promise<ProcessResult> {
    const orderId = extractNumericId(orderData.id) || orderData.legacyResourceId;

    if (!orderId) {
      throw new Error(`Invalid order ID: ${orderData.id}`);
    }

    // Check if order exists
    const existingOrder = await prisma.order.findFirst({
      where: {
        shop,
        shopifyOrderId: orderId
      }
    });

    if (existingOrder) {
      // Check if update is needed
      const shopifyUpdatedAt = new Date(orderData.updatedAt);

      if (existingOrder.shopifyUpdatedAt && existingOrder.shopifyUpdatedAt >= shopifyUpdatedAt) {
        // Order hasn't changed - skip
        return { skipped: true };
      }

      // Update existing order
      await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          shopifyOrderName: orderData.name,
          financialStatus: mapFinancialStatus(orderData.displayFinancialStatus),
          fulfillmentStatus: orderData.displayFulfillmentStatus || null,
          totalPrice: parseFloat(orderData.currentTotalPriceSet?.shopMoney?.amount || '0'),
          subtotalPrice: parseFloat(orderData.currentSubtotalPriceSet?.shopMoney?.amount || '0'),
          totalTax: parseFloat(orderData.currentTotalTaxSet?.shopMoney?.amount || '0'),
          totalShipping: parseFloat(orderData.totalShippingPriceSet?.shopMoney?.amount || '0'),
          totalDiscounts: parseFloat(orderData.currentTotalDiscountsSet?.shopMoney?.amount || '0'),
          totalRefunded: parseFloat(orderData.totalRefundedSet?.shopMoney?.amount || '0'),
          netAmount: parseFloat(orderData.currentTotalPriceSet?.shopMoney?.amount || '0') -
                    parseFloat(orderData.totalRefundedSet?.shopMoney?.amount || '0'),
          shopifyUpdatedAt,
          syncedAt: new Date(),
          syncVersion: (existingOrder.syncVersion || 0) + 1,
          updatedAt: new Date()
        }
      });

      // Process line items if needed
      await this.syncLineItems(existingOrder.id, orderData.lineItems?.edges || []);

      // Resolve orphaned orders: if customerId is "unknown" but Shopify has customer data,
      // find or create the customer and link the order. This fixes orders created by
      // webhooks.orders.paid before the customer record existed.
      let resolvedCustomerId = existingOrder.customerId;
      if (existingOrder.customerId === 'unknown' && orderData.customer?.id) {
        const shopifyCustomerId = extractNumericId(orderData.customer.id) || orderData.customer.id;
        const resolvedCustomer = await prisma.customer.findFirst({
          where: { shop, shopifyCustomerId },
          select: { id: true }
        });
        if (resolvedCustomer) {
          await prisma.order.update({
            where: { id: existingOrder.id },
            data: { customerId: resolvedCustomer.id }
          });
          resolvedCustomerId = resolvedCustomer.id;
          console.log(`[IncrementalSync] Linked orphaned order ${orderId} to customer ${resolvedCustomer.id}`);
        }
      }

      // Update customer spending totals after order update
      if (resolvedCustomerId && resolvedCustomerId !== 'unknown') {
        // Aggregate all-time spending
        const orderStats = await prisma.order.aggregate({
          where: {
            shop,
            customerId: resolvedCustomerId,
            financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }
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

        // Calculate annual spending (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        console.log(`[IncrementalSync] 📅 Calculating annual spending from ${twelveMonthsAgo.toISOString()} to now`);

        // Get the list of orders included in annual calculation for logging
        const annualOrders = await prisma.order.findMany({
          where: {
            shop,
            customerId: resolvedCustomerId,
            shopifyCreatedAt: { gte: twelveMonthsAgo },
            financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }
          },
          select: {
            shopifyOrderName: true,
            shopifyCreatedAt: true,
            totalPrice: true,
            totalRefunded: true,
            financialStatus: true
          },
          orderBy: {
            shopifyCreatedAt: 'desc'
          }
        });

        console.log(`[IncrementalSync] 📦 Found ${annualOrders.length} orders in last 12 months:`);
        annualOrders.forEach(order => {
          const netAmount = Number(order.totalPrice) - Number(order.totalRefunded);
          console.log(`  - ${order.shopifyOrderName} (${order.shopifyCreatedAt.toISOString().split('T')[0]}): ${order.totalPrice} - ${order.totalRefunded} = ${netAmount} [${order.financialStatus}]`);
        });

        // Now do the aggregation
        const annualOrderStats = await prisma.order.aggregate({
          where: {
            shop,
            customerId: resolvedCustomerId,
            shopifyCreatedAt: { gte: twelveMonthsAgo },
            financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }
          },
          _sum: {
            totalPrice: true,
            totalRefunded: true
          }
        });

        const annualSpent = (annualOrderStats._sum.totalPrice || 0) - (annualOrderStats._sum.totalRefunded || 0);

        console.log(`[IncrementalSync] 💰 Annual spending calculation: ${annualOrderStats._sum.totalPrice} - ${annualOrderStats._sum.totalRefunded} = ${annualSpent}`);

        await prisma.customer.update({
          where: { id: resolvedCustomerId },
          data: {
            totalSpent: orderStats._sum.totalPrice || 0,
            annualSpent,
            totalRefunded: orderStats._sum.totalRefunded || 0,
            netSpent: (orderStats._sum.totalPrice || 0) - (orderStats._sum.totalRefunded || 0),
            orderCount: orderStats._count.id || 0,
            lastOrderDate: orderStats._max.shopifyCreatedAt || null,
            updatedAt: new Date()
          }
        });

        console.log(`[IncrementalSync] ✅ Updated spending totals for customer ${resolvedCustomerId}:`);
        console.log(`[IncrementalSync]    - totalSpent (all-time): ${orderStats._sum.totalPrice}`);
        console.log(`[IncrementalSync]    - annualSpent (12 months): ${annualSpent}`);
        console.log(`[IncrementalSync]    - netSpent: ${(orderStats._sum.totalPrice || 0) - (orderStats._sum.totalRefunded || 0)}`);
        console.log(`[IncrementalSync]    - totalRefunded: ${orderStats._sum.totalRefunded}`);
        console.log(`[IncrementalSync]    - orderCount: ${orderStats._count.id}`);
      }

      return { updated: true };
    } else {
      // Create new order in a transaction
      return await prisma.$transaction(async (tx) => {
        // Check if customer exists in database
        const customerId = await this.findCustomer(shop, orderData.customer, orderData.email);

        if (!customerId) {
          console.log(`[IncrementalSync] Skipping order ${orderData.name} - customer not in database`);
          return { skipped: true };
        }

        // Import tier management functions
        const { assignDefaultTierToCustomer, calculateAndAssignTier } = await import('./tier-management.server');

        // Ensure customer has a tier (assign base tier if needed)
        await assignDefaultTierToCustomer(customerId, shop, true); // skipLog for order processing

        // Get customer with tier to calculate cashback
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          include: { currentTier: true }
        });

        // Calculate cashback based on customer's tier with currency normalization
        const netAmount = parseFloat(orderData.currentTotalPriceSet?.shopMoney?.amount || '0') -
                         parseFloat(orderData.totalRefundedSet?.shopMoney?.amount || '0');
        const orderCurrency = orderData.currencyCode || 'USD';

        // Import currency normalization
        const { normalizeToBaseCurrency, calculateCashbackInCurrency } = await import('./currency-normalization.server');

        // Normalize amounts for tier calculation
        void normalizeToBaseCurrency(netAmount, orderCurrency, 'USD');

        let cashbackPercent = 0;
        let cashbackAmount = 0;
        // cashbackAmountNormalized reserved for future multi-currency aggregation
        let tierIdAtOrder: string | null = null;
        let tierNameAtOrder: string | null = null;

        // Customer should always have a tier now (at least base tier)
        if (customer?.currentTier && !orderData.test) {
          cashbackPercent = customer.currentTier.cashbackPercent;

          // Calculate cashback in order currency
          const cashbackResult = calculateCashbackInCurrency(
            netAmount,
            orderCurrency,
            cashbackPercent,
            orderCurrency // Keep cashback in order currency
          );

          cashbackAmount = cashbackResult.cashbackAmount;
          // normalizedAmount available in cashbackResult for multi-currency aggregation

          tierIdAtOrder = customer.currentTier.id;
          tierNameAtOrder = customer.currentTier.name;
        } else if (!customer?.currentTier) {
          console.error(`[Order Sync] Customer ${customerId} has no tier assigned - this should not happen`);
        }

        // Multi-currency tracking
        const shopCurrencyCode = orderData.currentTotalPriceSet?.shopMoney?.currencyCode ||
                                 orderData.currentSubtotalPriceSet?.shopMoney?.currencyCode ||
                                 orderData.currencyCode || 'USD';
        const presentmentCurrencyCode = orderData.currentTotalPriceSet?.presentmentMoney?.currencyCode ||
                                         orderData.currentSubtotalPriceSet?.presentmentMoney?.currencyCode ||
                                         orderData.currencyCode;
        const shopAmount = parseFloat(orderData.currentTotalPriceSet?.shopMoney?.amount || '0');
        const presentmentAmount = parseFloat(orderData.currentTotalPriceSet?.presentmentMoney?.amount || '0');
        const isMultiCurrency = shopCurrencyCode && presentmentCurrencyCode && shopCurrencyCode !== presentmentCurrencyCode;

        // Calculate exchange rate: shop / presentment to convert presentment→shop
        // e.g., €100 presentment → £86.21 shop gives rate = 86.21/100 = 0.8621
        // Usage: presentmentAmount * exchangeRate = shopAmount
        const exchangeRate = isMultiCurrency && presentmentAmount > 0
          ? shopAmount / presentmentAmount
          : null;

        if (isMultiCurrency) {
          console.log(`[IncrementalSync] Multi-currency order ${orderData.name}: ${presentmentCurrencyCode} ${presentmentAmount} → ${shopCurrencyCode} ${shopAmount} (rate: ${exchangeRate?.toFixed(4)})`);
        }

        const newOrder = await tx.order.create({
        data: {
          id: uuidv4(),
          shop,
          shopifyOrderId: orderId,
          shopifyOrderNumber: orderData.name.replace('#', ''),
          shopifyOrderName: orderData.name,
          customerId,
          email: orderData.email || orderData.customer?.email || '',
          // Use shop currency to match shopMoney amounts (currencyCode is presentment)
          currency: shopCurrencyCode,
          subtotalPrice: parseFloat(orderData.currentSubtotalPriceSet?.shopMoney?.amount || '0'),
          totalDiscounts: parseFloat(orderData.currentTotalDiscountsSet?.shopMoney?.amount || '0'),
          totalShipping: parseFloat(orderData.totalShippingPriceSet?.shopMoney?.amount || '0'),
          totalTax: parseFloat(orderData.currentTotalTaxSet?.shopMoney?.amount || '0'),
          totalPrice: shopAmount,
          totalRefunded: parseFloat(orderData.totalRefundedSet?.shopMoney?.amount || '0'),
          netAmount,
          // Multi-currency tracking fields
          presentmentCurrency: isMultiCurrency ? presentmentCurrencyCode : null,
          presentmentTotal: isMultiCurrency ? presentmentAmount : null,
          exchangeRate: exchangeRate,
          financialStatus: mapFinancialStatus(orderData.displayFinancialStatus),
          fulfillmentStatus: orderData.displayFulfillmentStatus || null,
          cashbackEligible: !orderData.test,
          cashbackPercent,
          cashbackPercentAtOrder: cashbackPercent, // Store exact percent for recalculation
          cashbackAmount,
          tierIdAtOrder,
          tierNameAtOrder,
          shopifyCreatedAt: new Date(orderData.createdAt),
          shopifyUpdatedAt: new Date(orderData.updatedAt),
          processedAt: orderData.processedAt ? new Date(orderData.processedAt) : null,
          syncedAt: new Date(),
          syncVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date()
          }
        });

        // Process line items within transaction
        if (orderData.lineItems?.edges) {
          for (const edge of orderData.lineItems.edges) {
            const lineItem = edge.node;
            if (!lineItem) continue;

            const isGiftCard = lineItem.title?.toLowerCase().includes('gift card') || false;

            await tx.orderLineItem.create({
              data: {
                id: uuidv4(),
                orderId: newOrder.id,
                shopifyLineItemId: lineItem.id,
                shopifyProductId: extractNumericId(lineItem.product?.id),
                shopifyVariantId: extractNumericId(lineItem.variant?.id),
                title: lineItem.title || '',
                variantTitle: lineItem.variantTitle || null,
                sku: lineItem.sku || lineItem.variant?.sku || null,
                vendor: lineItem.vendor || null,
                quantity: lineItem.quantity,
                price: parseFloat(lineItem.originalUnitPriceSet?.shopMoney?.amount || '0'),
                totalPrice: parseFloat(lineItem.discountedTotalSet?.shopMoney?.amount || '0'),
                totalDiscount: (parseFloat(lineItem.originalUnitPriceSet?.shopMoney?.amount || '0') * lineItem.quantity) -
                              parseFloat(lineItem.discountedTotalSet?.shopMoney?.amount || '0'),
                requiresShipping: lineItem.requiresShipping || false,
                taxable: lineItem.taxable || false,
                giftCard: isGiftCard,
                isTierProduct: false, // Will be checked separately
                createdAt: new Date()
              }
            });
          }
        }

        // Update customer spending totals and recalculate tier within transaction
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalSpent: { increment: newOrder.totalPrice },
            netSpent: { increment: newOrder.netAmount },
            orderCount: { increment: 1 },
            lastOrderDate: newOrder.shopifyCreatedAt
          }
        });

        // Recalculate tier after order
        await calculateAndAssignTier(shop, customerId, 'ORDER');

        return { created: true };
      });
    }
  }

  /**
   * Sync line items for an order
   */
  private async syncLineItems(orderId: string, lineItemEdges: any[]): Promise<void> {
    for (const edge of lineItemEdges) {
      const lineItem = edge.node;

      const isGiftCard = lineItem.product?.productType?.toLowerCase() === 'gift card' ||
                         lineItem.product?.productType?.toLowerCase() === 'gift_card';

      await prisma.orderLineItem.upsert({
        where: {
          orderId_shopifyLineItemId: {
            orderId,
            shopifyLineItemId: lineItem.id
          }
        },
        update: {
          quantity: lineItem.quantity,
          price: parseFloat(lineItem.originalUnitPriceSet?.shopMoney?.amount || '0'),
          totalPrice: parseFloat(lineItem.discountedTotalSet?.shopMoney?.amount || '0'),
          giftCard: isGiftCard
        },
        create: {
          id: uuidv4(),
          orderId,
          shopifyLineItemId: lineItem.id,
          shopifyProductId: extractNumericId(lineItem.product?.id),
          shopifyVariantId: extractNumericId(lineItem.variant?.id),
          title: lineItem.title || '',
          variantTitle: lineItem.variantTitle || null,
          sku: lineItem.sku || lineItem.variant?.sku || null,
          vendor: lineItem.vendor || null,
          quantity: lineItem.quantity,
          price: parseFloat(lineItem.originalUnitPriceSet?.shopMoney?.amount || '0'),
          totalPrice: parseFloat(lineItem.discountedTotalSet?.shopMoney?.amount || '0'),
          totalDiscount: (parseFloat(lineItem.originalUnitPriceSet?.shopMoney?.amount || '0') * lineItem.quantity) -
                        parseFloat(lineItem.discountedTotalSet?.shopMoney?.amount || '0'),
          requiresShipping: lineItem.requiresShipping || false,
          taxable: lineItem.taxable || false,
          giftCard: isGiftCard,
          isTierProduct: false, // Will be checked separately
          createdAt: new Date()
        }
      });
    }
  }

  /**
   * Find customer in database (without creating)
   * Returns customer ID if found, null if not found
   */
  private async findCustomer(shop: string, customerData: any, _orderEmail?: string): Promise<string | null> {
    // Handle guest customers - skip them
    if (!customerData) {
      console.log(`[IncrementalSync] No customer data - skipping guest order`);
      return null;
    }

    // Extract customer ID
    const customerId = extractNumericId(customerData.id) || customerData.legacyResourceId;
    if (!customerId) {
      console.log(`[IncrementalSync] No customer ID - skipping order`);
      return null;
    }

    // Check if customer exists in our database
    const existingCustomer = await prisma.customer.findFirst({
      where: { shop, shopifyCustomerId: customerId }
    });

    if (existingCustomer) {
      return existingCustomer.id;
    }

    console.log(`[IncrementalSync] Customer ${customerId} not found in database - skipping order`);
    return null;
  }

  /**
   * Get or create customer with transaction support
   * DEPRECATED: Use findCustomer instead to skip orders without customers
   */
  private async getOrCreateCustomer(shop: string, customerData: any, orderEmail?: string): Promise<string> {
    // Handle guest customers
    if (!customerData) {
      return await prisma.$transaction(async (tx) => {
        // Try to find or create a guest customer based on email if provided
        if (orderEmail) {
          const existingGuest = await tx.customer.findFirst({
            where: {
              shop,
              email: orderEmail,
              shopifyCustomerId: 'guest'
            }
          });

          if (existingGuest) return existingGuest.id;

          // Create a guest customer with the email
          const guestCustomer = await tx.customer.create({
            data: {
              id: uuidv4(),
              shop,
              shopifyCustomerId: 'guest',
              email: orderEmail,
              firstName: 'Guest',
              lastName: 'Customer',
              storeCredit: 0,
              totalSpent: 0,
              totalCashbackEarned: 0,
              totalRefunded: 0,
              netSpent: 0,
              orderCount: 0,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });

          // Use resolver to assign tier after transaction (don't bypass tier resolution)
          // The resolver will be called after transaction commits
          setTimeout(async () => {
            try {
              await updateCustomerToEffectiveTier(shop, guestCustomer.id, {
                triggeredBy: 'order_sync_guest_created'
              });
            } catch (err) {
              console.error(`[IncrementalSync] Failed to resolve tier for guest customer:`, err);
            }
          }, 0);

          return guestCustomer.id;
        }

        // No customer data and no email - create a generic unknown customer
        const unknownCustomer = await tx.customer.findFirst({
          where: {
            shop,
            shopifyCustomerId: 'unknown'
          }
        });

        if (unknownCustomer) return unknownCustomer.id;

        // Create system placeholder for orders without customer data (POS, guest checkout)
        // Email uses shop domain to clearly indicate this is not a real customer
        const placeholderEmail = `unknown-customer@${shop.replace('.myshopify.com', '')}.internal`;
        const newUnknownCustomer = await tx.customer.create({
          data: {
            id: uuidv4(),
            shop,
            shopifyCustomerId: 'unknown',
            email: placeholderEmail,
            firstName: 'Unknown',
            lastName: 'Customer',
            storeCredit: 0,
            totalSpent: 0,
            totalCashbackEarned: 0,
            totalRefunded: 0,
            netSpent: 0,
            orderCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

        // Use resolver to assign tier after transaction (don't bypass tier resolution)
        setTimeout(async () => {
          try {
            await updateCustomerToEffectiveTier(shop, newUnknownCustomer.id, {
              triggeredBy: 'order_sync_unknown_created'
            });
          } catch (err) {
            console.error(`[IncrementalSync] Failed to resolve tier for unknown customer:`, err);
          }
        }, 0);

        return newUnknownCustomer.id;
      });
    }

    // Normal customer with data
    const customerId = extractNumericId(customerData.id) || customerData.legacyResourceId;
    if (!customerId) {
      // Customer data exists but no ID - shouldn't happen but handle it
      return this.getOrCreateCustomer(shop, null, customerData.email);
    }

    return await prisma.$transaction(async (tx) => {
      const existingCustomer = await tx.customer.findFirst({
        where: { shop, shopifyCustomerId: customerId }
      });

      if (existingCustomer) return existingCustomer.id;

      const newCustomer = await tx.customer.create({
        data: {
          id: uuidv4(),
          shop,
          shopifyCustomerId: customerId,
          email: customerData.email || `customer${customerId}@example.com`,
          firstName: customerData.firstName || '',
          lastName: customerData.lastName || '',
          storeCredit: 0,
          totalSpent: parseFloat(customerData.amountSpent?.amount || '0'),
          totalCashbackEarned: 0,
          totalRefunded: 0,
          netSpent: parseFloat(customerData.amountSpent?.amount || '0'),
          orderCount: customerData.numberOfOrders || 0,
          createdAt: new Date(customerData.createdAt || Date.now()),
          updatedAt: new Date()
        }
      });

      // Use resolver to assign tier after transaction (don't bypass tier resolution)
      setTimeout(async () => {
        try {
          await updateCustomerToEffectiveTier(shop, newCustomer.id, {
            triggeredBy: 'order_sync_customer_created'
          });
        } catch (err) {
          console.error(`[IncrementalSync] Failed to resolve tier for new customer:`, err);
        }
      }, 0);

      return newCustomer.id;
    });
  }

  /**
   * Determine if catch-up sync is needed
   */
  private needsCatchUpSync(syncStatus: any): boolean {
    const hoursSinceLastSync =
      (Date.now() - syncStatus.lastSyncAt.getTime()) / (1000 * 60 * 60);

    // If more than 24 hours since last sync, do catch-up
    return hoursSinceLastSync > 24;
  }

  /**
   * Get or create sync status
   */
  private async getSyncStatus(shop: string): Promise<any | null> {
    return await prisma.syncStatus.findFirst({
      where: {
        shop,
        syncType: 'orders'
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// GraphQL queries
const ORDERS_QUERY = `#graphql
  query IncrementalOrdersSync(
    $first: Int!
    $after: String
    $query: String
    $sortKey: OrderSortKeys
    $reverse: Boolean
  ) {
    orders(
      first: $first
      after: $after
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      edges {
        cursor
        node {
          id
          legacyResourceId
          name
          createdAt
          updatedAt
          processedAt
          cancelledAt
          test
          email
          currencyCode

          displayFinancialStatus
          displayFulfillmentStatus
          returnStatus

          currentSubtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
            presentmentMoney {
              amount
              currencyCode
            }
          }
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
            presentmentMoney {
              amount
              currencyCode
            }
          }
          currentTotalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          currentTotalDiscountsSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }

          customer {
            id
            legacyResourceId
            email
            firstName
            lastName
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            createdAt
            updatedAt
          }

          lineItems(first: 250) {
            edges {
              node {
                id
                title
                variantTitle
                quantity
                sku
                vendor
                requiresShipping
                taxable

                product {
                  id
                  productType
                }

                variant {
                  id
                  sku
                  price
                }

                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
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

const COUNT_QUERY = `#graphql
  query GetOrdersCount($query: String) {
    ordersCount(query: $query) {
      count
      precision
    }
  }
`;

export default IncrementalOrderSync;
