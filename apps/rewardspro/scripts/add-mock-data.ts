/**
 * Add Mock Data to Test Store
 *
 * This script creates realistic mock customers and orders for a specific shop
 * using AWS Aurora Data API. Useful for testing and development.
 *
 * USAGE:
 *   npx tsx scripts/add-mock-data.ts <shop-domain> [options]
 *
 * OPTIONS:
 *   --customers <number>  Number of customers to create (default: 10)
 *   --orders <number>     Average orders per customer (default: 3)
 *
 * EXAMPLE:
 *   npx tsx scripts/add-mock-data.ts mystore.myshopify.com --customers=20 --orders=5
 *
 * WHAT IT CREATES:
 *   - Customers with realistic names and emails
 *   - Orders with various statuses and amounts
 *   - Order line items with products
 *   - Store credit ledger entries for cashback
 *   - Tier assignments based on spending
 */

import 'dotenv/config';
import { query, execute, param } from './lib/db.mjs';
import { randomUUID } from 'crypto';

// ============================================
// CONFIGURATION
// ============================================

// Mock data generators
const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'William', 'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia',
  'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander', 'Abigail', 'Michael',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White',
];

const PRODUCTS = [
  { title: 'Classic T-Shirt', price: 29.99, sku: 'TSHIRT-001' },
  { title: 'Premium Hoodie', price: 79.99, sku: 'HOODIE-001' },
  { title: 'Denim Jeans', price: 89.99, sku: 'JEANS-001' },
  { title: 'Leather Jacket', price: 249.99, sku: 'JACKET-001' },
  { title: 'Canvas Sneakers', price: 69.99, sku: 'SHOES-001' },
  { title: 'Wool Beanie', price: 24.99, sku: 'BEANIE-001' },
  { title: 'Cotton Socks (3-pack)', price: 15.99, sku: 'SOCKS-001' },
  { title: 'Leather Belt', price: 39.99, sku: 'BELT-001' },
  { title: 'Backpack', price: 99.99, sku: 'BACKPACK-001' },
  { title: 'Sunglasses', price: 149.99, sku: 'SUNGLASSES-001' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
const FINANCIAL_STATUSES = ['PAID', 'PENDING', 'PARTIALLY_PAID'];

// ============================================
// HELPER FUNCTIONS
// ============================================

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(min: number, max: number): string {
  return (Math.random() * (max - min) + min).toFixed(2);
}

function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'test.com'];
  const randomNum = randomInt(1, 999);
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}@${randomElement(domains)}`;
}

function generateShopifyId(): string {
  return `${randomInt(1000000000000, 9999999999999)}`;
}

function generateOrderNumber(): string {
  return `#${randomInt(1000, 9999)}`;
}

function randomPastDate(daysAgo: number): Date {
  const now = new Date();
  const pastDate = new Date(now.getTime() - randomInt(0, daysAgo) * 24 * 60 * 60 * 1000);
  return pastDate;
}

// ============================================
// DATA FETCH FUNCTIONS
// ============================================

async function getShopSettings(shop: string): Promise<any> {
  const rows = await query(
    'SELECT * FROM "ShopSettings" WHERE shop = :shop LIMIT 1',
    [param('shop', shop)]
  );

  if (rows.length === 0) return null;
  return { currency: rows[0].storeCurrency || 'USD' };
}

async function getTiers(shop: string): Promise<any[]> {
  return query(
    'SELECT id, name, "minSpend", "cashbackPercent" FROM "Tier" WHERE shop = :shop ORDER BY "minSpend" ASC',
    [param('shop', shop)]
  );
}

function assignTier(totalSpent: number, tiers: any[]): any | null {
  if (tiers.length === 0) return null;
  let assignedTier = null;
  for (const tier of tiers) {
    if (totalSpent >= tier.minSpend) {
      assignedTier = tier;
    }
  }
  return assignedTier;
}

// ============================================
// DATA CREATION FUNCTIONS
// ============================================

async function createCustomer(shop: string, currency: string): Promise<any> {
  const customerId = randomUUID();
  const shopifyCustomerId = generateShopifyId();
  const firstName = randomElement(FIRST_NAMES);
  const lastName = randomElement(LAST_NAMES);
  const email = generateEmail(firstName, lastName);
  const createdAt = randomPastDate(365);

  await execute(
    `INSERT INTO "Customer" (
      id, shop, "shopifyCustomerId", email, "firstName", "lastName",
      "storeCredit", "totalSpent", "totalCashbackEarned", "totalRefunded",
      "netSpent", "orderCount", "createdAt", "updatedAt"
    ) VALUES (
      :id, :shop, :shopifyCustomerId, :email, :firstName, :lastName,
      :storeCredit, :totalSpent, :totalCashbackEarned, :totalRefunded,
      :netSpent, :orderCount, :createdAt::timestamp, :updatedAt::timestamp
    )`,
    [
      param('id', customerId),
      param('shop', shop),
      param('shopifyCustomerId', shopifyCustomerId),
      param('email', email),
      param('firstName', firstName),
      param('lastName', lastName),
      param('storeCredit', 0),
      param('totalSpent', 0),
      param('totalCashbackEarned', 0),
      param('totalRefunded', 0),
      param('netSpent', 0),
      param('orderCount', 0),
      param('createdAt', createdAt),
      param('updatedAt', new Date()),
    ]
  );

  return { id: customerId, shopifyCustomerId, email, firstName, lastName, createdAt };
}

async function createOrder(
  customer: any,
  shop: string,
  currency: string,
  tiers: any[]
): Promise<any> {
  const orderId = randomUUID();
  const shopifyOrderId = generateShopifyId();
  const orderNumber = generateOrderNumber();
  const financialStatus = randomElement(FINANCIAL_STATUSES);

  const lineItemCount = randomInt(1, 5);
  const lineItems = [];
  let subtotal = 0;

  for (let i = 0; i < lineItemCount; i++) {
    const product = randomElement(PRODUCTS);
    const quantity = randomInt(1, 3);
    const price = product.price;
    const totalPrice = price * quantity;
    subtotal += totalPrice;
    lineItems.push({ product, quantity, price, totalPrice });
  }

  const totalDiscounts = Math.random() < 0.3 ? parseFloat(randomPrice(5, subtotal * 0.2)) : 0;
  const totalShipping = parseFloat(randomPrice(5, 15));
  const totalTax = parseFloat(randomPrice(subtotal * 0.05, subtotal * 0.15));
  const totalPrice = subtotal - totalDiscounts + totalShipping + totalTax;
  const netAmount = totalPrice;

  const currentTier = assignTier(parseFloat((await getCustomerTotalSpent(customer.id)).totalSpent), tiers);
  const cashbackPercent = currentTier ? currentTier.cashbackPercent : 0;
  const cashbackAmount = financialStatus === 'PAID' ? (totalPrice * cashbackPercent / 100) : 0;

  const orderDate = randomPastDate(180);

  await execute(
    `INSERT INTO "Order" (
      id, shop, "shopifyOrderId", "shopifyOrderNumber", "shopifyOrderName",
      "customerId", email, currency,
      "subtotalPrice", "totalDiscounts", "totalShipping", "totalTax", "totalPrice",
      "totalRefunded", "netAmount",
      "financialStatus", "fulfillmentStatus",
      "cashbackEligible", "cashbackPercent", "cashbackAmount", "cashbackProcessed",
      "tierIdAtOrder", "tierNameAtOrder",
      "shopifyCreatedAt", "shopifyUpdatedAt", "processedAt",
      "createdAt", "updatedAt"
    ) VALUES (
      :id, :shop, :shopifyOrderId, :shopifyOrderNumber, :shopifyOrderName,
      :customerId, :email, :currency::"Currency",
      :subtotalPrice, :totalDiscounts, :totalShipping, :totalTax, :totalPrice,
      :totalRefunded, :netAmount,
      :financialStatus, :fulfillmentStatus,
      :cashbackEligible, :cashbackPercent, :cashbackAmount, :cashbackProcessed,
      :tierIdAtOrder, :tierNameAtOrder,
      :shopifyCreatedAt::timestamp, :shopifyUpdatedAt::timestamp, :processedAt::timestamp,
      :createdAt::timestamp, :updatedAt::timestamp
    )`,
    [
      param('id', orderId),
      param('shop', shop),
      param('shopifyOrderId', shopifyOrderId),
      param('shopifyOrderNumber', orderNumber),
      param('shopifyOrderName', orderNumber),
      param('customerId', customer.id),
      param('email', customer.email),
      param('currency', currency),
      param('subtotalPrice', subtotal),
      param('totalDiscounts', totalDiscounts),
      param('totalShipping', totalShipping),
      param('totalTax', totalTax),
      param('totalPrice', totalPrice),
      param('totalRefunded', 0),
      param('netAmount', netAmount),
      param('financialStatus', financialStatus),
      param('fulfillmentStatus', 'fulfilled'),
      param('cashbackEligible', true),
      param('cashbackPercent', cashbackPercent),
      param('cashbackAmount', cashbackAmount),
      param('cashbackProcessed', financialStatus === 'PAID'),
      param('tierIdAtOrder', currentTier ? currentTier.id : null),
      param('tierNameAtOrder', currentTier ? currentTier.name : null),
      param('shopifyCreatedAt', orderDate),
      param('shopifyUpdatedAt', orderDate),
      param('processedAt', orderDate),
      param('createdAt', orderDate),
      param('updatedAt', new Date()),
    ]
  );

  // Create line items
  for (const item of lineItems) {
    const lineItemId = randomUUID();
    const shopifyLineItemId = generateShopifyId();

    await execute(
      `INSERT INTO "OrderLineItem" (
        id, "orderId", "shopifyLineItemId", "shopifyProductId", "shopifyVariantId",
        title, "variantTitle", sku, vendor,
        quantity, price, "totalPrice", "totalDiscount",
        "requiresShipping", taxable, "giftCard", "isTierProduct",
        "createdAt"
      ) VALUES (
        :id, :orderId, :shopifyLineItemId, :shopifyProductId, :shopifyVariantId,
        :title, :variantTitle, :sku, :vendor,
        :quantity, :price, :totalPrice, :totalDiscount,
        :requiresShipping, :taxable, :giftCard, :isTierProduct,
        :createdAt::timestamp
      )`,
      [
        param('id', lineItemId),
        param('orderId', orderId),
        param('shopifyLineItemId', shopifyLineItemId),
        param('shopifyProductId', generateShopifyId()),
        param('shopifyVariantId', generateShopifyId()),
        param('title', item.product.title),
        param('variantTitle', 'Default'),
        param('sku', item.product.sku),
        param('vendor', 'Test Vendor'),
        param('quantity', item.quantity),
        param('price', item.price),
        param('totalPrice', item.totalPrice),
        param('totalDiscount', 0),
        param('requiresShipping', true),
        param('taxable', true),
        param('giftCard', false),
        param('isTierProduct', false),
        param('createdAt', orderDate),
      ]
    );
  }

  // Create store credit ledger entry if cashback was earned
  if (financialStatus === 'PAID' && cashbackAmount > 0) {
    const currentBalance = await getCustomerStoreCredit(customer.id);
    const newBalance = currentBalance + cashbackAmount;

    await execute(
      `INSERT INTO "StoreCreditLedger" (
        id, "customerId", shop, amount, balance, type,
        "shopifyOrderId", "orderId",
        metadata, "createdAt"
      ) VALUES (
        :id, :customerId, :shop, :amount, :balance, :type::"LedgerEntryType",
        :shopifyOrderId, :orderId,
        :metadata::jsonb, :createdAt::timestamp
      )`,
      [
        param('id', randomUUID()),
        param('customerId', customer.id),
        param('shop', shop),
        param('amount', cashbackAmount),
        param('balance', newBalance),
        param('type', 'CASHBACK_EARNED'),
        param('shopifyOrderId', shopifyOrderId),
        param('orderId', orderId),
        param('metadata', JSON.stringify({
          orderAmount: totalPrice.toFixed(2),
          cashbackPercent,
          description: `${cashbackPercent}% cashback on order ${orderNumber}`,
        })),
        param('createdAt', orderDate),
      ]
    );

    // Update customer store credit
    await execute(
      'UPDATE "Customer" SET "storeCredit" = :storeCredit WHERE id = :id',
      [param('storeCredit', newBalance), param('id', customer.id)]
    );
  }

  return {
    id: orderId, shopifyOrderId, orderNumber, totalPrice,
    cashbackAmount, lineItems: lineItems.length,
  };
}

async function getCustomerStoreCredit(customerId: string): Promise<number> {
  const rows = await query(
    'SELECT "storeCredit" FROM "Customer" WHERE id = :id',
    [param('id', customerId)]
  );
  return rows.length > 0 ? (rows[0].storeCredit || 0) : 0;
}

async function getCustomerTotalSpent(customerId: string): Promise<any> {
  const rows = await query(
    'SELECT "totalSpent", "totalCashbackEarned", "orderCount" FROM "Customer" WHERE id = :id',
    [param('id', customerId)]
  );
  if (rows.length === 0) return { totalSpent: 0, totalCashbackEarned: 0, orderCount: 0 };
  return rows[0];
}

async function updateCustomerTotals(customerId: string, shop: string): Promise<void> {
  const rows = await query(
    `SELECT
      COUNT(*) as "orderCount",
      COALESCE(SUM("totalPrice"), 0) as "totalSpent",
      COALESCE(SUM("cashbackAmount"), 0) as "totalCashbackEarned",
      COALESCE(SUM("totalRefunded"), 0) as "totalRefunded",
      MAX("shopifyCreatedAt") as "lastOrderDate"
    FROM "Order"
    WHERE "customerId" = :customerId AND shop = :shop AND "financialStatus" = 'PAID'`,
    [param('customerId', customerId), param('shop', shop)]
  );

  if (rows.length === 0) return;

  const r = rows[0];
  const netSpent = (r.totalSpent || 0) - (r.totalRefunded || 0);

  await execute(
    `UPDATE "Customer"
    SET "orderCount" = :orderCount, "totalSpent" = :totalSpent,
        "totalCashbackEarned" = :totalCashbackEarned, "totalRefunded" = :totalRefunded,
        "netSpent" = :netSpent, "lastOrderDate" = :lastOrderDate::timestamp,
        "updatedAt" = :updatedAt::timestamp
    WHERE id = :id`,
    [
      param('orderCount', r.orderCount || 0),
      param('totalSpent', r.totalSpent || 0),
      param('totalCashbackEarned', r.totalCashbackEarned || 0),
      param('totalRefunded', r.totalRefunded || 0),
      param('netSpent', netSpent),
      param('lastOrderDate', r.lastOrderDate || null),
      param('updatedAt', new Date()),
      param('id', customerId),
    ]
  );
}

async function assignCustomerToTier(customerId: string, shop: string, tiers: any[]): Promise<void> {
  const customerData = await getCustomerTotalSpent(customerId);
  const totalSpent = Number(customerData.totalSpent) || 0;
  const assignedTier = assignTier(totalSpent, tiers);

  if (!assignedTier) return;

  await execute(
    'UPDATE "Customer" SET "currentTierId" = :tierId, "updatedAt" = :updatedAt::timestamp WHERE id = :id',
    [param('tierId', assignedTier.id), param('updatedAt', new Date()), param('id', customerId)]
  );

  await execute(
    `INSERT INTO "TierChangeLog" (
      id, "customerId", shop, "fromTierId", "fromTierName",
      "toTierId", "toTierName", "changeType", "triggerType",
      "totalSpending", "createdAt", "processedBy"
    ) VALUES (
      :id, :customerId, :shop, :fromTierId, :fromTierName,
      :toTierId, :toTierName, :changeType::"TierChangeType", :triggerType::"TierTriggerType",
      :totalSpending, :createdAt::timestamp, :processedBy
    )`,
    [
      param('id', randomUUID()),
      param('customerId', customerId),
      param('shop', shop),
      param('fromTierId', null),
      param('fromTierName', null),
      param('toTierId', assignedTier.id),
      param('toTierName', assignedTier.name),
      param('changeType', 'INITIAL_ASSIGNMENT'),
      param('triggerType', 'SPENDING_MILESTONE'),
      param('totalSpending', totalSpent),
      param('createdAt', new Date()),
      param('processedBy', 'system'),
    ]
  );
}

// ============================================
// MAIN SCRIPT
// ============================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         ADD MOCK DATA TO TEST STORE - Data API           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const shop = process.argv[2];
  const customersToCreate = parseInt(process.argv.find(arg => arg.startsWith('--customers='))?.split('=')[1] || '10');
  const ordersPerCustomer = parseInt(process.argv.find(arg => arg.startsWith('--orders='))?.split('=')[1] || '3');

  if (!shop) {
    console.error('Error: Shop domain is required\n');
    console.log('Usage:');
    console.log('  npx tsx scripts/add-mock-data.ts <shop-domain> [--customers=N] [--orders=N]\n');
    process.exit(1);
  }

  if (!shop.includes('.myshopify.com')) {
    console.error('Error: Shop domain must be in format: yourstore.myshopify.com\n');
    process.exit(1);
  }

  console.log(`Shop: ${shop}`);
  console.log(`Customers to create: ${customersToCreate}`);
  console.log(`Avg orders per customer: ${ordersPerCustomer}`);
  console.log(`Region: ${process.env.AWS_REGION}`);
  console.log(`Database: ${process.env.AURORA_DATABASE_NAME}\n`);

  try {
    const startTime = Date.now();

    console.log('Fetching shop configuration...');
    const shopSettings = await getShopSettings(shop);
    const currency = shopSettings ? shopSettings.currency : 'USD';
    console.log(`   Currency: ${currency}`);

    const tiers = await getTiers(shop);
    console.log(`   Found ${tiers.length} tiers`);
    if (tiers.length > 0) {
      tiers.forEach(tier => {
        console.log(`      - ${tier.name}: ${tier.minSpend}+ spend, ${tier.cashbackPercent}% cashback`);
      });
    }

    console.log('\nCreating mock data...\n');

    let totalOrders = 0;
    let totalCashback = 0;

    for (let i = 0; i < customersToCreate; i++) {
      process.stdout.write(`   Creating customer ${i + 1}/${customersToCreate}... `);
      const customer = await createCustomer(shop, currency);

      const orderCount = randomInt(
        Math.max(1, ordersPerCustomer - 2),
        ordersPerCustomer + 2
      );

      for (let j = 0; j < orderCount; j++) {
        const order = await createOrder(customer, shop, currency, tiers);
        totalOrders++;
        totalCashback += order.cashbackAmount;
      }

      await updateCustomerTotals(customer.id, shop);
      if (tiers.length > 0) {
        await assignCustomerToTier(customer.id, shop, tiers);
      }

      console.log(`done (${orderCount} orders, ${customer.email})`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n--- CREATION SUMMARY ---\n');
    console.log(`Successfully created mock data for shop: ${shop}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Customers: ${customersToCreate}`);
    console.log(`   Orders: ${totalOrders}`);
    console.log(`   Total Cashback: ${currency} ${totalCashback.toFixed(2)}\n`);

  } catch (error) {
    console.error('\nError during creation:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
