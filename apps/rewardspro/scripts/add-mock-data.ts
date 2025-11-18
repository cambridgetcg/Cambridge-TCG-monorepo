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
 *   npx tsx scripts/add-mock-data.ts mystore.myshopify.com --customers 20 --orders 5
 *
 * WHAT IT CREATES:
 *   - Customers with realistic names and emails
 *   - Orders with various statuses and amounts
 *   - Order line items with products
 *   - Store credit ledger entries for cashback
 *   - Tier assignments based on spending
 */

import 'dotenv/config';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { randomUUID } from 'crypto';

// ============================================
// CONFIGURATION
// ============================================

const REQUIRED_ENV_VARS = [
  'AURORA_RESOURCE_ARN',
  'AURORA_SECRET_ARN',
  'AURORA_DATABASE_NAME',
  'AWS_REGION',
];

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

// Validate environment variables
function validateEnvironment(): void {
  const missing = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease ensure your .env file contains all required variables.');
    process.exit(1);
  }
}

// ============================================
// DATA API CLIENT
// ============================================

const client = new RDSDataClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const databaseConfig = {
  resourceArn: process.env.AURORA_RESOURCE_ARN!,
  secretArn: process.env.AURORA_SECRET_ARN!,
  database: process.env.AURORA_DATABASE_NAME!,
};

// ============================================
// DATABASE QUERY FUNCTIONS
// ============================================

/**
 * Execute a query using Data API
 *
 * IMPORTANT: Data API returns different field types based on database column type:
 * - Text/Varchar → stringValue
 * - Decimal/Numeric → doubleValue (NOT stringValue!)
 * - Integer/BigInt → longValue
 * - Boolean → booleanValue
 * - Timestamp → stringValue (ISO format)
 */
async function executeQuery(sql: string, parameters: any[] = []): Promise<any> {
  const command = new ExecuteStatementCommand({
    ...databaseConfig,
    sql,
    parameters,
  });

  try {
    const response = await client.send(command);
    return response;
  } catch (error: any) {
    console.error('❌ Database query error:', error);
    console.error('SQL:', sql);
    console.error('Parameters:', JSON.stringify(parameters, null, 2));
    throw error;
  }
}

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
  // Generate a realistic-looking Shopify ID (13-14 digits)
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
  const result = await executeQuery(
    'SELECT * FROM "ShopSettings" WHERE shop = :shop LIMIT 1',
    [{ name: 'shop', value: { stringValue: shop } }]
  );

  if (!result.records || result.records.length === 0) {
    return null;
  }

  // Parse the first record
  const record = result.records[0];
  return {
    currency: record.find((f: any) => f.name === 'storeCurrency')?.stringValue || 'USD',
  };
}

async function getTiers(shop: string): Promise<any[]> {
  const result = await executeQuery(
    'SELECT id, name, "minSpend", "cashbackPercent" FROM "Tier" WHERE shop = :shop ORDER BY "minSpend" ASC',
    [{ name: 'shop', value: { stringValue: shop } }]
  );

  if (!result.records || result.records.length === 0) {
    return [];
  }

  return result.records.map((record: any) => ({
    id: record[0].stringValue,
    name: record[1].stringValue,
    minSpend: record[2].doubleValue !== undefined ? record[2].doubleValue : 0,
    cashbackPercent: record[3].longValue !== undefined ? Number(record[3].longValue) : 0,
  }));
}

function assignTier(totalSpent: number, tiers: any[]): any | null {
  if (tiers.length === 0) return null;

  // Find the highest tier the customer qualifies for
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
  const createdAt = randomPastDate(365); // Created within last year

  const sql = `
    INSERT INTO "Customer" (
      id, shop, "shopifyCustomerId", email, "firstName", "lastName",
      "storeCredit", "totalSpent", "totalCashbackEarned", "totalRefunded",
      "netSpent", "orderCount", "createdAt", "updatedAt"
    ) VALUES (
      :id, :shop, :shopifyCustomerId, :email, :firstName, :lastName,
      :storeCredit, :totalSpent, :totalCashbackEarned, :totalRefunded,
      :netSpent, :orderCount, :createdAt::timestamp, :updatedAt::timestamp
    )
  `;

  const params = [
    { name: 'id', value: { stringValue: customerId } },
    { name: 'shop', value: { stringValue: shop } },
    { name: 'shopifyCustomerId', value: { stringValue: shopifyCustomerId } },
    { name: 'email', value: { stringValue: email } },
    { name: 'firstName', value: { stringValue: firstName } },
    { name: 'lastName', value: { stringValue: lastName } },
    { name: 'storeCredit', value: { doubleValue: 0 } },
    { name: 'totalSpent', value: { doubleValue: 0 } },
    { name: 'totalCashbackEarned', value: { doubleValue: 0 } },
    { name: 'totalRefunded', value: { doubleValue: 0 } },
    { name: 'netSpent', value: { doubleValue: 0 } },
    { name: 'orderCount', value: { longValue: 0 } },
    { name: 'createdAt', value: { stringValue: createdAt.toISOString() } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
  ];

  await executeQuery(sql, params);

  return {
    id: customerId,
    shopifyCustomerId,
    email,
    firstName,
    lastName,
    createdAt,
  };
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

  // Generate 1-5 line items
  const lineItemCount = randomInt(1, 5);
  const lineItems = [];
  let subtotal = 0;

  for (let i = 0; i < lineItemCount; i++) {
    const product = randomElement(PRODUCTS);
    const quantity = randomInt(1, 3);
    const price = product.price;
    const totalPrice = price * quantity;
    subtotal += totalPrice;

    lineItems.push({
      product,
      quantity,
      price,
      totalPrice,
    });
  }

  const totalDiscounts = Math.random() < 0.3 ? parseFloat(randomPrice(5, subtotal * 0.2)) : 0;
  const totalShipping = parseFloat(randomPrice(5, 15));
  const totalTax = parseFloat(randomPrice(subtotal * 0.05, subtotal * 0.15));
  const totalPrice = subtotal - totalDiscounts + totalShipping + totalTax;
  const netAmount = totalPrice;

  // Determine tier and cashback
  const currentTier = assignTier(parseFloat((await getCustomerTotalSpent(customer.id)).totalSpent), tiers);
  const cashbackPercent = currentTier ? currentTier.cashbackPercent : 0;
  const cashbackAmount = financialStatus === 'PAID' ? (totalPrice * cashbackPercent / 100) : 0;

  const orderDate = randomPastDate(180); // Orders within last 6 months

  // Create order
  const orderSql = `
    INSERT INTO "Order" (
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
    )
  `;

  const orderParams = [
    { name: 'id', value: { stringValue: orderId } },
    { name: 'shop', value: { stringValue: shop } },
    { name: 'shopifyOrderId', value: { stringValue: shopifyOrderId } },
    { name: 'shopifyOrderNumber', value: { stringValue: orderNumber } },
    { name: 'shopifyOrderName', value: { stringValue: orderNumber } },
    { name: 'customerId', value: { stringValue: customer.id } },
    { name: 'email', value: { stringValue: customer.email } },
    { name: 'currency', value: { stringValue: currency } },
    { name: 'subtotalPrice', value: { doubleValue: subtotal } },
    { name: 'totalDiscounts', value: { doubleValue: totalDiscounts } },
    { name: 'totalShipping', value: { doubleValue: totalShipping } },
    { name: 'totalTax', value: { doubleValue: totalTax } },
    { name: 'totalPrice', value: { doubleValue: totalPrice } },
    { name: 'totalRefunded', value: { doubleValue: 0 } },
    { name: 'netAmount', value: { doubleValue: netAmount } },
    { name: 'financialStatus', value: { stringValue: financialStatus } },
    { name: 'fulfillmentStatus', value: { stringValue: 'fulfilled' } },
    { name: 'cashbackEligible', value: { booleanValue: true } },
    { name: 'cashbackPercent', value: { longValue: cashbackPercent } },
    { name: 'cashbackAmount', value: { doubleValue: cashbackAmount } },
    { name: 'cashbackProcessed', value: { booleanValue: financialStatus === 'PAID' } },
    { name: 'tierIdAtOrder', value: currentTier ? { stringValue: currentTier.id } : { isNull: true } },
    { name: 'tierNameAtOrder', value: currentTier ? { stringValue: currentTier.name } : { isNull: true } },
    { name: 'shopifyCreatedAt', value: { stringValue: orderDate.toISOString() } },
    { name: 'shopifyUpdatedAt', value: { stringValue: orderDate.toISOString() } },
    { name: 'processedAt', value: { stringValue: orderDate.toISOString() } },
    { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
  ];

  await executeQuery(orderSql, orderParams);

  // Create line items
  for (const item of lineItems) {
    const lineItemId = randomUUID();
    const shopifyLineItemId = generateShopifyId();

    const lineItemSql = `
      INSERT INTO "OrderLineItem" (
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
      )
    `;

    const lineItemParams = [
      { name: 'id', value: { stringValue: lineItemId } },
      { name: 'orderId', value: { stringValue: orderId } },
      { name: 'shopifyLineItemId', value: { stringValue: shopifyLineItemId } },
      { name: 'shopifyProductId', value: { stringValue: generateShopifyId() } },
      { name: 'shopifyVariantId', value: { stringValue: generateShopifyId() } },
      { name: 'title', value: { stringValue: item.product.title } },
      { name: 'variantTitle', value: { stringValue: 'Default' } },
      { name: 'sku', value: { stringValue: item.product.sku } },
      { name: 'vendor', value: { stringValue: 'Test Vendor' } },
      { name: 'quantity', value: { longValue: item.quantity } },
      { name: 'price', value: { doubleValue: item.price } },
      { name: 'totalPrice', value: { doubleValue: item.totalPrice } },
      { name: 'totalDiscount', value: { doubleValue: 0 } },
      { name: 'requiresShipping', value: { booleanValue: true } },
      { name: 'taxable', value: { booleanValue: true } },
      { name: 'giftCard', value: { booleanValue: false } },
      { name: 'isTierProduct', value: { booleanValue: false } },
      { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
    ];

    await executeQuery(lineItemSql, lineItemParams);
  }

  // Create store credit ledger entry if cashback was earned
  if (financialStatus === 'PAID' && cashbackAmount > 0) {
    const ledgerId = randomUUID();
    const ledgerSql = `
      INSERT INTO "StoreCreditLedger" (
        id, "customerId", shop, amount, balance, type,
        "shopifyOrderId", "orderId",
        metadata, "createdAt"
      ) VALUES (
        :id, :customerId, :shop, :amount, :balance, :type::"LedgerEntryType",
        :shopifyOrderId, :orderId,
        :metadata::jsonb, :createdAt::timestamp
      )
    `;

    const currentBalance = await getCustomerStoreCredit(customer.id);
    const newBalance = currentBalance + cashbackAmount;

    const ledgerParams = [
      { name: 'id', value: { stringValue: ledgerId } },
      { name: 'customerId', value: { stringValue: customer.id } },
      { name: 'shop', value: { stringValue: shop } },
      { name: 'amount', value: { doubleValue: cashbackAmount } },
      { name: 'balance', value: { doubleValue: newBalance } },
      { name: 'type', value: { stringValue: 'CASHBACK_EARNED' } },
      { name: 'shopifyOrderId', value: { stringValue: shopifyOrderId } },
      { name: 'orderId', value: { stringValue: orderId } },
      { name: 'metadata', value: { stringValue: JSON.stringify({
        orderAmount: totalPrice.toFixed(2),
        cashbackPercent,
        description: `${cashbackPercent}% cashback on order ${orderNumber}`,
      }) } },
      { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
    ];

    await executeQuery(ledgerSql, ledgerParams);

    // Update customer store credit
    await executeQuery(
      'UPDATE "Customer" SET "storeCredit" = :storeCredit WHERE id = :id',
      [
        { name: 'storeCredit', value: { doubleValue: newBalance } },
        { name: 'id', value: { stringValue: customer.id } },
      ]
    );
  }

  return {
    id: orderId,
    shopifyOrderId,
    orderNumber,
    totalPrice,
    cashbackAmount,
    lineItems: lineItems.length,
  };
}

async function getCustomerStoreCredit(customerId: string): Promise<number> {
  const result = await executeQuery(
    'SELECT "storeCredit" FROM "Customer" WHERE id = :id',
    [{ name: 'id', value: { stringValue: customerId } }]
  );

  if (!result.records || result.records.length === 0) {
    return 0;
  }

  // Data API returns decimals as doubleValue, not stringValue
  const value = result.records[0][0];
  return value.doubleValue !== undefined ? value.doubleValue : 0;
}

async function getCustomerTotalSpent(customerId: string): Promise<any> {
  const result = await executeQuery(
    'SELECT "totalSpent", "totalCashbackEarned", "orderCount" FROM "Customer" WHERE id = :id',
    [{ name: 'id', value: { stringValue: customerId } }]
  );

  if (!result.records || result.records.length === 0) {
    return { totalSpent: 0, totalCashbackEarned: 0, orderCount: 0 };
  }

  const record = result.records[0];
  return {
    totalSpent: record[0].doubleValue !== undefined ? record[0].doubleValue : 0,
    totalCashbackEarned: record[1].doubleValue !== undefined ? record[1].doubleValue : 0,
    orderCount: record[2].longValue !== undefined ? record[2].longValue : 0,
  };
}

async function updateCustomerTotals(customerId: string, shop: string): Promise<void> {
  // Calculate totals from orders
  const orderStats = await executeQuery(
    `
    SELECT
      COUNT(*) as "orderCount",
      COALESCE(SUM("totalPrice"), 0) as "totalSpent",
      COALESCE(SUM("cashbackAmount"), 0) as "totalCashbackEarned",
      COALESCE(SUM("totalRefunded"), 0) as "totalRefunded",
      MAX("shopifyCreatedAt") as "lastOrderDate"
    FROM "Order"
    WHERE "customerId" = :customerId AND shop = :shop AND "financialStatus" = 'PAID'
    `,
    [
      { name: 'customerId', value: { stringValue: customerId } },
      { name: 'shop', value: { stringValue: shop } },
    ]
  );

  if (!orderStats.records || orderStats.records.length === 0) {
    return;
  }

  const record = orderStats.records[0];
  const orderCount = record[0].longValue !== undefined ? Number(record[0].longValue) : 0;
  const totalSpent = record[1].doubleValue !== undefined ? record[1].doubleValue : 0;
  const totalCashbackEarned = record[2].doubleValue !== undefined ? record[2].doubleValue : 0;
  const totalRefunded = record[3].doubleValue !== undefined ? record[3].doubleValue : 0;
  const lastOrderDate = record[4]?.stringValue || null;
  const netSpent = totalSpent - totalRefunded;

  await executeQuery(
    `
    UPDATE "Customer"
    SET
      "orderCount" = :orderCount,
      "totalSpent" = :totalSpent,
      "totalCashbackEarned" = :totalCashbackEarned,
      "totalRefunded" = :totalRefunded,
      "netSpent" = :netSpent,
      "lastOrderDate" = :lastOrderDate::timestamp,
      "updatedAt" = :updatedAt::timestamp
    WHERE id = :id
    `,
    [
      { name: 'orderCount', value: { longValue: orderCount } },
      { name: 'totalSpent', value: { doubleValue: totalSpent } },
      { name: 'totalCashbackEarned', value: { doubleValue: totalCashbackEarned } },
      { name: 'totalRefunded', value: { doubleValue: totalRefunded } },
      { name: 'netSpent', value: { doubleValue: netSpent } },
      { name: 'lastOrderDate', value: lastOrderDate ? { stringValue: lastOrderDate } : { isNull: true } },
      { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
      { name: 'id', value: { stringValue: customerId } },
    ]
  );
}

async function assignCustomerToTier(customerId: string, shop: string, tiers: any[]): Promise<void> {
  const customerData = await getCustomerTotalSpent(customerId);
  const totalSpent = Number(customerData.totalSpent) || 0;
  const assignedTier = assignTier(totalSpent, tiers);

  if (!assignedTier) {
    return;
  }

  // Update customer tier
  await executeQuery(
    'UPDATE "Customer" SET "currentTierId" = :tierId, "updatedAt" = :updatedAt::timestamp WHERE id = :id',
    [
      { name: 'tierId', value: { stringValue: assignedTier.id } },
      { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
      { name: 'id', value: { stringValue: customerId } },
    ]
  );

  // Create tier change log
  const logId = randomUUID();
  await executeQuery(
    `
    INSERT INTO "TierChangeLog" (
      id, "customerId", shop, "fromTierId", "fromTierName",
      "toTierId", "toTierName", "changeType", "triggerType",
      "totalSpending", "createdAt", "processedBy"
    ) VALUES (
      :id, :customerId, :shop, :fromTierId, :fromTierName,
      :toTierId, :toTierName, :changeType::"TierChangeType", :triggerType::"TierTriggerType",
      :totalSpending, :createdAt::timestamp, :processedBy
    )
    `,
    [
      { name: 'id', value: { stringValue: logId } },
      { name: 'customerId', value: { stringValue: customerId } },
      { name: 'shop', value: { stringValue: shop } },
      { name: 'fromTierId', value: { isNull: true } },
      { name: 'fromTierName', value: { isNull: true } },
      { name: 'toTierId', value: { stringValue: assignedTier.id } },
      { name: 'toTierName', value: { stringValue: assignedTier.name } },
      { name: 'changeType', value: { stringValue: 'INITIAL_ASSIGNMENT' } },
      { name: 'triggerType', value: { stringValue: 'SPENDING_MILESTONE' } },
      { name: 'totalSpending', value: { doubleValue: totalSpent } },
      { name: 'createdAt', value: { stringValue: new Date().toISOString() } },
      { name: 'processedBy', value: { stringValue: 'system' } },
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

  // Validate environment
  validateEnvironment();

  // Parse command line arguments
  const shop = process.argv[2];
  const customersToCreate = parseInt(process.argv.find(arg => arg.startsWith('--customers='))?.split('=')[1] || '10');
  const ordersPerCustomer = parseInt(process.argv.find(arg => arg.startsWith('--orders='))?.split('=')[1] || '3');

  if (!shop) {
    console.error('❌ Error: Shop domain is required\n');
    console.log('Usage:');
    console.log('  npx tsx scripts/add-mock-data.ts <shop-domain> [--customers=N] [--orders=N]\n');
    console.log('Example:');
    console.log('  npx tsx scripts/add-mock-data.ts mystore.myshopify.com --customers=20 --orders=5\n');
    process.exit(1);
  }

  // Validate shop domain format
  if (!shop.includes('.myshopify.com')) {
    console.error('❌ Error: Shop domain must be in format: yourstore.myshopify.com\n');
    process.exit(1);
  }

  console.log(`🏪 Shop: ${shop}`);
  console.log(`👥 Customers to create: ${customersToCreate}`);
  console.log(`📦 Avg orders per customer: ${ordersPerCustomer}`);
  console.log(`🌐 Region: ${process.env.AWS_REGION}`);
  console.log(`💾 Database: ${process.env.AURORA_DATABASE_NAME}\n`);

  try {
    const startTime = Date.now();

    // Get shop settings and tiers
    console.log('⚙️  Fetching shop configuration...');
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

    // Create customers and orders
    console.log('\n📊 Creating mock data...\n');

    let totalOrders = 0;
    let totalCashback = 0;

    for (let i = 0; i < customersToCreate; i++) {
      process.stdout.write(`   Creating customer ${i + 1}/${customersToCreate}... `);

      // Create customer
      const customer = await createCustomer(shop, currency);

      // Create orders for this customer (random variation)
      const orderCount = randomInt(
        Math.max(1, ordersPerCustomer - 2),
        ordersPerCustomer + 2
      );

      for (let j = 0; j < orderCount; j++) {
        const order = await createOrder(customer, shop, currency, tiers);
        totalOrders++;
        totalCashback += order.cashbackAmount;
      }

      // Update customer totals
      await updateCustomerTotals(customer.id, shop);

      // Assign tier based on spending
      if (tiers.length > 0) {
        await assignCustomerToTier(customer.id, shop, tiers);
      }

      console.log(`✓ (${orderCount} orders, ${customer.email})`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    CREATION SUMMARY                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    console.log(`✅ Successfully created mock data for shop: ${shop}`);
    console.log(`   Duration: ${duration}s\n`);
    console.log('Records created:');
    console.log(`   - Customers: ${customersToCreate}`);
    console.log(`   - Orders: ${totalOrders}`);
    console.log(`   - Total Cashback: ${currency} ${totalCashback.toFixed(2)}\n`);
    console.log('💡 You can now test the app with realistic data!\n');

  } catch (error) {
    console.error('\n❌ Error during creation:', error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
