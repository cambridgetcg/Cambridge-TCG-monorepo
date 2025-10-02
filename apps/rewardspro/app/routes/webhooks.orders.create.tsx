/**
 * Orders/Create Webhook Handler
 *
 * This webhook triggers when a new order is created in Shopify.
 * It syncs the customer's store credit from Shopify to our database.
 *
 * Flow:
 * 1. Receive order/create webhook
 * 2. Extract customer information
 * 3. Fetch current store credit from Shopify
 * 4. Update local database with synced credit
 * 5. Create ledger entry for the sync
 *
 * Note: Tier calculation has been removed from this webhook to prevent
 * duplicate processing. The orders/paid webhook handles tier progression
 * using complete order data from the local database.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface OrderWebhook {
  id: number;
  email?: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  customer: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
    orders_count: number;
    total_spent: string;
    tags?: string;
  };
  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price: string;
  }>;
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);
  
  if (!admin) {
    console.error('[OrdersCreateWebhook] No admin API access');
    return json({ success: false, error: 'No admin access' }, { status: 401 });
  }

  if (topic !== "ORDERS_CREATE") {
    return json({ success: false, error: 'Invalid topic' }, { status: 400 });
  }

  try {
    const order = payload as OrderWebhook;
    
    console.log(`[OrdersCreateWebhook] Processing order ${order.id} for shop ${shop}`);
    console.log(`[OrdersCreateWebhook] Customer: ${order.customer?.email || 'Guest'}`);
    
    // Skip if no customer (guest checkout)
    if (!order.customer || !order.customer.id) {
      console.log('[OrdersCreateWebhook] Skipping guest order');
      return json({ success: true, message: 'Guest order - no credit sync needed' });
    }
    
    const shopifyCustomerId = String(order.customer.id);
    
    // ========================================================================
    // SYNC STORE CREDIT FROM SHOPIFY
    // ========================================================================
    
    console.log(`[OrdersCreateWebhook] Starting credit sync for customer ${shopifyCustomerId}`);
    
    // GraphQL query to get store credit from Shopify
    const syncQuery = `#graphql
      query SyncCustomerStoreCredit($customerId: ID!) {
        customer(id: $customerId) {
          id
          email
          displayName
          firstName
          lastName
          totalSpent: metafield(namespace: "customer", key: "total_spent") {
            value
          }
          storeCreditAccounts(first: 10) {
            edges {
              node {
                id
                balance {
                  amount
                  currencyCode
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      }
    `;
    
    // Format customer ID as GID for GraphQL
    const gidCustomerId = `gid://shopify/Customer/${shopifyCustomerId}`;
    
    console.log(`[OrdersCreateWebhook] Querying Shopify with GID: ${gidCustomerId}`);
    
    const response = await admin.graphql(syncQuery, {
      variables: { customerId: gidCustomerId }
    });
    
    const responseJson = await response.json() as any;
    
    if (responseJson.errors) {
      console.error(`[OrdersCreateWebhook] GraphQL Errors:`, responseJson.errors);
      // Don't fail the webhook, just log the error
      return json({ 
        success: true, 
        warning: 'Could not sync store credit',
        error: responseJson.errors[0]?.message 
      });
    }
    
    const shopifyCustomer = responseJson.data?.customer;
    if (!shopifyCustomer) {
      console.error(`[OrdersCreateWebhook] Customer not found in Shopify for ID: ${shopifyCustomerId}`);
      return json({ 
        success: true, 
        warning: 'Customer not found in Shopify' 
      });
    }
    
    // Calculate total store credit from all accounts
    let totalStoreCredit = 0;
    const storeCreditAccounts = shopifyCustomer.storeCreditAccounts?.edges || [];
    
    console.log(`[OrdersCreateWebhook] Found ${storeCreditAccounts.length} store credit account(s)`);
    
    for (const edge of storeCreditAccounts) {
      const balanceStr = edge.node.balance.amount || "0";
      const balance = parseFloat(balanceStr);
      const currency = edge.node.balance.currencyCode;
      
      console.log(`[OrdersCreateWebhook] Account ${edge.node.id}: ${balanceStr} ${currency}`);
      
      // Validate balance is a valid number
      if (!isNaN(balance) && isFinite(balance) && balance >= 0) {
        totalStoreCredit += balance;
      } else {
        console.warn(`[OrdersCreateWebhook] Invalid balance value: ${balanceStr}`);
      }
    }
    
    console.log(`[OrdersCreateWebhook] Total store credit: ${totalStoreCredit}`);
    
    // ========================================================================
    // UPDATE DATABASE
    // ========================================================================
    
    // Find or create customer in database
    let dbCustomer = await db.customer.findFirst({
      where: {
        shop: shop,
        shopifyCustomerId: shopifyCustomerId
      }
    });
    
    if (!dbCustomer) {
      // Create new customer if doesn't exist
      console.log(`[OrdersCreateWebhook] Creating new customer in database`);
      
      dbCustomer = await db.customer.create({
        data: {
          id: uuidv4(),
          shop: shop,
          shopifyCustomerId: shopifyCustomerId,
          email: order.customer.email || shopifyCustomer.email || `customer_${shopifyCustomerId}@shop.com`,
          firstName: order.customer.first_name || shopifyCustomer.firstName || null,
          lastName: order.customer.last_name || shopifyCustomer.lastName || null,
          tags: order.customer.tags || '',
          storeCredit: totalStoreCredit,
          totalSpent: parseFloat(order.customer.total_spent || "0"),
          orderCount: order.customer.orders_count || 1,  // Fixed: orderCount not ordersCount
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      
      // Create initial ledger entry
      await db.storeCreditLedger.create({
        data: {
          id: uuidv4(),
          customerId: dbCustomer.id,
          shop: shop,
          amount: totalStoreCredit,
          balance: totalStoreCredit,
          type: "ORDER_PAYMENT",
          metadata: {
            source: 'orders/create webhook',
            orderId: order.id,
            initialSync: true,
            shopifyAccounts: storeCreditAccounts.length,
            syncedAt: new Date().toISOString()
          },
          createdAt: new Date()
        }
      });
      
      console.log(`[OrdersCreateWebhook] Created customer ${dbCustomer.id} with credit: ${totalStoreCredit}`);
    } else {
      // Update existing customer if credit changed
      const previousBalance = parseFloat(dbCustomer.storeCredit.toString());
      
      console.log(`[OrdersCreateWebhook] Existing customer found. Previous: ${previousBalance}, New: ${totalStoreCredit}`);
      
      if (Math.abs(previousBalance - totalStoreCredit) > 0.01) { // Check if difference > 1 cent
        // Create ledger entry for the sync
        await db.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId: dbCustomer.id,
            shop: shop,
            amount: totalStoreCredit - previousBalance,
            balance: totalStoreCredit,
            type: "ORDER_PAYMENT",
            metadata: {
              source: 'orders/create webhook',
              orderId: order.id,
              previousBalance,
              syncedBalance: totalStoreCredit,
              shopifyAccounts: storeCreditAccounts.length,
              syncedAt: new Date().toISOString()
            },
            createdAt: new Date()
          }
        });
        
        // Update customer balance
        await db.customer.update({
          where: { id: dbCustomer.id },
          data: {
            storeCredit: totalStoreCredit,
            totalSpent: parseFloat(order.customer.total_spent || "0"),
            orderCount: order.customer.orders_count || dbCustomer.orderCount,
            updatedAt: new Date()
          }
        });
        
        console.log(`[OrdersCreateWebhook] Updated customer credit from ${previousBalance} to ${totalStoreCredit}`);
      } else {
        // Just update order count and total spent
        await db.customer.update({
          where: { id: dbCustomer.id },
          data: {
            totalSpent: parseFloat(order.customer.total_spent || "0"),
            orderCount: order.customer.orders_count || dbCustomer.orderCount,
            updatedAt: new Date()
          }
        });
        
        console.log(`[OrdersCreateWebhook] Credit unchanged, updated customer stats only`);
      }
    }

    // ========================================================================
    // TIER CALCULATION REMOVED
    // ========================================================================
    // Tier calculation has been moved to the orders/paid webhook to avoid:
    // 1. Duplicate tier changes (create fires before paid)
    // 2. Race conditions between webhooks
    // 3. Inconsistent data (create uses Shopify API, paid uses local DB)
    // 4. Double notifications to customers
    //
    // The orders/paid webhook will handle tier progression after payment is confirmed
    // using the local database which includes the current order.

    // ========================================================================
    // RETURN SUCCESS
    // ========================================================================
    
    return json({
      success: true,
      message: 'Order processed and credit synced',
      customerId: dbCustomer.id,
      storeCredit: totalStoreCredit
    });
    
  } catch (error) {
    console.error('[OrdersCreateWebhook] Unexpected error:', error);
    
    // Return success to prevent Shopify from retrying
    // Log the error for debugging
    return json({
      success: true,
      warning: 'Error processing webhook',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// No GET method - webhooks are POST only
export async function loader() {
  return json({ message: 'Webhook endpoint - POST only' }, { status: 405 });
}