/**
 * Create Mock Customers for Each Tier
 *
 * This script creates customers distributed across all tiers with realistic
 * spending patterns for each tier level.
 *
 * USAGE:
 *   npx tsx scripts/create-tier-customers.ts <shop-domain>
 *
 * EXAMPLE:
 *   npx tsx scripts/create-tier-customers.ts mystore.myshopify.com
 */

import 'dotenv/config';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { randomUUID } from 'crypto';

// ============================================
// CONFIGURATION
// ============================================

const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'William', 'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia',
  'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee',
];

const PRODUCTS = [
  { title: 'Classic T-Shirt', price: 29.99, sku: 'TSHIRT-001' },
  { title: 'Premium Hoodie', price: 79.99, sku: 'HOODIE-001' },
  { title: 'Denim Jeans', price: 89.99, sku: 'JEANS-001' },
  { title: 'Leather Jacket', price: 249.99, sku: 'JACKET-001' },
  { title: 'Canvas Sneakers', price: 69.99, sku: 'SHOES-001' },
];

// ============================================
// DATA API CLIENT
// ============================================

const client = new RDSDataClient({
  region: process.env.AWS_REGION || 'eu-north-1',
});

const databaseConfig = {
  resourceArn: process.env.AURORA_RESOURCE_ARN!,
  secretArn: process.env.AURORA_SECRET_ARN!,
  database: process.env.AURORA_DATABASE_NAME!,
};

async function executeQuery(sql: string, parameters: any[] = []): Promise<any> {
  const command = new ExecuteStatementCommand({
    ...databaseConfig,
    sql,
    parameters,
  });
  return await client.send(command);
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

function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com'];
  const randomNum = randomInt(1, 999);
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}@${randomElement(domains)}`;
}

function generateShopifyId(): string {
  return `${randomInt(1000000000000, 9999999999999)}`;
}

function randomPastDate(daysAgo: number): Date {
  const now = new Date();
  return new Date(now.getTime() - randomInt(0, daysAgo) * 24 * 60 * 60 * 1000);
}

// ============================================
// TIER FUNCTIONS
// ============================================

async function getTiers(shop: string) {
  const result = await executeQuery(
    `SELECT id, name, "minSpend", "cashbackPercent" FROM "Tier" WHERE shop = :shop ORDER BY "minSpend" ASC`,
    [{ name: 'shop', value: { stringValue: shop } }]
  );

  return result.records.map((record: any) => ({
    id: record[0].stringValue,
    name: record[1].stringValue,
    minSpend: record[2].doubleValue !== undefined ? record[2].doubleValue : 0,
    cashbackPercent: record[3].longValue !== undefined ? Number(record[3].longValue) : 0,
  }));
}

// ============================================
// CUSTOMER CREATION
// ============================================

async function createCustomerForTier(
  shop: string,
  tier: any,
  targetSpending: number,
  currency: string
) {
  const customerId = randomUUID();
  const shopifyCustomerId = generateShopifyId();
  const firstName = randomElement(FIRST_NAMES);
  const lastName = randomElement(LAST_NAMES);
  const email = generateEmail(firstName, lastName);
  const createdAt = randomPastDate(180);

  // Create customer
  await executeQuery(
    `INSERT INTO "Customer" (
      id, shop, "shopifyCustomerId", email, "firstName", "lastName",
      "storeCredit", "totalSpent", "totalCashbackEarned", "totalRefunded",
      "netSpent", "orderCount", "currentTierId", "createdAt", "updatedAt"
    ) VALUES (
      :id, :shop, :shopifyCustomerId, :email, :firstName, :lastName,
      :storeCredit, :totalSpent, :totalCashbackEarned, :totalRefunded,
      :netSpent, :orderCount, :tierId, :createdAt::timestamp, :updatedAt::timestamp
    )`,
    [
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
      { name: 'tierId', value: { stringValue: tier.id } },
      { name: 'createdAt', value: { stringValue: createdAt.toISOString() } },
      { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    ]
  );

  // Create tier change log
  const logId = randomUUID();
  await executeQuery(
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
      { name: 'id', value: { stringValue: logId } },
      { name: 'customerId', value: { stringValue: customerId } },
      { name: 'shop', value: { stringValue: shop } },
      { name: 'fromTierId', value: { isNull: true } },
      { name: 'fromTierName', value: { isNull: true } },
      { name: 'toTierId', value: { stringValue: tier.id } },
      { name: 'toTierName', value: { stringValue: tier.name } },
      { name: 'changeType', value: { stringValue: 'INITIAL_ASSIGNMENT' } },
      { name: 'triggerType', value: { stringValue: 'ACCOUNT_CREATED' } },
      { name: 'totalSpending', value: { doubleValue: 0 } },
      { name: 'createdAt', value: { stringValue: createdAt.toISOString() } },
      { name: 'processedBy', value: { stringValue: 'system' } },
    ]
  );

  // Create orders to reach target spending
  let currentSpending = 0;
  let orderCount = 0;
  let totalCashback = 0;

  while (currentSpending < targetSpending) {
    const remaining = targetSpending - currentSpending;
    const orderTotal = Math.min(remaining, randomInt(50, 300));

    const orderId = randomUUID();
    const shopifyOrderId = generateShopifyId();
    const orderNumber = `#${randomInt(1000, 9999)}`;
    const orderDate = randomPastDate(120);
    const financialStatus = 'PAID';

    const cashbackAmount = (orderTotal * tier.cashbackPercent) / 100;
    totalCashback += cashbackAmount;

    // Create order
    await executeQuery(
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
        { name: 'id', value: { stringValue: orderId } },
        { name: 'shop', value: { stringValue: shop } },
        { name: 'shopifyOrderId', value: { stringValue: shopifyOrderId } },
        { name: 'shopifyOrderNumber', value: { stringValue: orderNumber } },
        { name: 'shopifyOrderName', value: { stringValue: orderNumber } },
        { name: 'customerId', value: { stringValue: customerId } },
        { name: 'email', value: { stringValue: email } },
        { name: 'currency', value: { stringValue: currency } },
        { name: 'subtotalPrice', value: { doubleValue: orderTotal } },
        { name: 'totalDiscounts', value: { doubleValue: 0 } },
        { name: 'totalShipping', value: { doubleValue: 0 } },
        { name: 'totalTax', value: { doubleValue: 0 } },
        { name: 'totalPrice', value: { doubleValue: orderTotal } },
        { name: 'totalRefunded', value: { doubleValue: 0 } },
        { name: 'netAmount', value: { doubleValue: orderTotal } },
        { name: 'financialStatus', value: { stringValue: financialStatus } },
        { name: 'fulfillmentStatus', value: { stringValue: 'fulfilled' } },
        { name: 'cashbackEligible', value: { booleanValue: true } },
        { name: 'cashbackPercent', value: { longValue: tier.cashbackPercent } },
        { name: 'cashbackAmount', value: { doubleValue: cashbackAmount } },
        { name: 'cashbackProcessed', value: { booleanValue: true } },
        { name: 'tierIdAtOrder', value: { stringValue: tier.id } },
        { name: 'tierNameAtOrder', value: { stringValue: tier.name } },
        { name: 'shopifyCreatedAt', value: { stringValue: orderDate.toISOString() } },
        { name: 'shopifyUpdatedAt', value: { stringValue: orderDate.toISOString() } },
        { name: 'processedAt', value: { stringValue: orderDate.toISOString() } },
        { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
        { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
      ]
    );

    // Create order line item
    const lineItemId = randomUUID();
    const product = randomElement(PRODUCTS);

    await executeQuery(
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
        { name: 'id', value: { stringValue: lineItemId } },
        { name: 'orderId', value: { stringValue: orderId } },
        { name: 'shopifyLineItemId', value: { stringValue: generateShopifyId() } },
        { name: 'shopifyProductId', value: { stringValue: generateShopifyId() } },
        { name: 'shopifyVariantId', value: { stringValue: generateShopifyId() } },
        { name: 'title', value: { stringValue: product.title } },
        { name: 'variantTitle', value: { stringValue: 'Default' } },
        { name: 'sku', value: { stringValue: product.sku } },
        { name: 'vendor', value: { stringValue: 'Test Vendor' } },
        { name: 'quantity', value: { longValue: 1 } },
        { name: 'price', value: { doubleValue: orderTotal } },
        { name: 'totalPrice', value: { doubleValue: orderTotal } },
        { name: 'totalDiscount', value: { doubleValue: 0 } },
        { name: 'requiresShipping', value: { booleanValue: true } },
        { name: 'taxable', value: { booleanValue: true } },
        { name: 'giftCard', value: { booleanValue: false } },
        { name: 'isTierProduct', value: { booleanValue: false } },
        { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
      ]
    );

    // Create store credit ledger entry
    const ledgerId = randomUUID();
    const currentBalance = totalCashback;

    await executeQuery(
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
        { name: 'id', value: { stringValue: ledgerId } },
        { name: 'customerId', value: { stringValue: customerId } },
        { name: 'shop', value: { stringValue: shop } },
        { name: 'amount', value: { doubleValue: cashbackAmount } },
        { name: 'balance', value: { doubleValue: currentBalance } },
        { name: 'type', value: { stringValue: 'CASHBACK_EARNED' } },
        { name: 'shopifyOrderId', value: { stringValue: shopifyOrderId } },
        { name: 'orderId', value: { stringValue: orderId } },
        { name: 'metadata', value: { stringValue: JSON.stringify({
          orderAmount: orderTotal.toFixed(2),
          cashbackPercent: tier.cashbackPercent,
          description: `${tier.cashbackPercent}% cashback on order ${orderNumber}`,
        }) } },
        { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
      ]
    );

    currentSpending += orderTotal;
    orderCount++;
  }

  // Update customer totals
  await executeQuery(
    `UPDATE "Customer"
    SET
      "orderCount" = :orderCount,
      "totalSpent" = :totalSpent,
      "totalCashbackEarned" = :totalCashbackEarned,
      "storeCredit" = :storeCredit,
      "netSpent" = :netSpent,
      "updatedAt" = :updatedAt::timestamp
    WHERE id = :id`,
    [
      { name: 'orderCount', value: { longValue: orderCount } },
      { name: 'totalSpent', value: { doubleValue: currentSpending } },
      { name: 'totalCashbackEarned', value: { doubleValue: totalCashback } },
      { name: 'storeCredit', value: { doubleValue: totalCashback } },
      { name: 'netSpent', value: { doubleValue: currentSpending } },
      { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
      { name: 'id', value: { stringValue: customerId } },
    ]
  );

  return {
    email,
    tier: tier.name,
    spending: currentSpending,
    orders: orderCount,
    cashback: totalCashback,
  };
}

// ============================================
// MAIN SCRIPT
// ============================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       CREATE TIER-SPECIFIC CUSTOMERS - Data API          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const shop = process.argv[2];

  if (!shop || !shop.includes('.myshopify.com')) {
    console.error('❌ Error: Valid shop domain required\n');
    console.log('Usage: npx tsx scripts/create-tier-customers.ts <shop-domain>\n');
    process.exit(1);
  }

  console.log(`🏪 Shop: ${shop}\n`);

  const startTime = Date.now();

  // Get tiers
  const tiers = await getTiers(shop);
  console.log(`Found ${tiers.length} tiers:\n`);
  tiers.forEach((tier: any, idx: number) => {
    console.log(`   ${idx + 1}. ${tier.name}: ${tier.cashbackPercent}% cashback`);
  });

  console.log('\n📊 Creating customers for each tier...\n');

  const currency = 'USD';
  const customersPerTier = 5;
  const spendingRanges = [
    { min: 100, max: 300 },   // Bronze
    { min: 300, max: 700 },   // Silver
    { min: 700, max: 1500 },  // Gold
    { min: 1500, max: 3000 }, // Platinum
  ];

  let totalCustomers = 0;
  let totalRevenue = 0;
  let totalCashback = 0;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const range = spendingRanges[i] || spendingRanges[spendingRanges.length - 1];

    console.log(`\n🏆 Creating ${customersPerTier} ${tier.name} customers...`);

    for (let j = 0; j < customersPerTier; j++) {
      const targetSpending = randomInt(range.min, range.max);
      const customer = await createCustomerForTier(shop, tier, targetSpending, currency);

      console.log(`   ✓ ${customer.email}`);
      console.log(`     Spending: $${customer.spending.toFixed(2)} | Orders: ${customer.orders} | Cashback: $${customer.cashback.toFixed(2)}`);

      totalCustomers++;
      totalRevenue += customer.spending;
      totalCashback += customer.cashback;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    CREATION SUMMARY                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`✅ Successfully created ${totalCustomers} customers`);
  console.log(`   Duration: ${duration}s\n`);
  console.log('Distribution:');
  tiers.forEach((tier: any) => {
    console.log(`   - ${tier.name}: ${customersPerTier} customers`);
  });
  console.log(`\n   Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`   Total Cashback: $${totalCashback.toFixed(2)}\n`);
}

main().catch(console.error);
