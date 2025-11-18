/**
 * Generate Bulk Mock Data for Testing
 *
 * Creates 500 customers and 2000 orders with realistic spending patterns
 * distributed across tiers with proper cashback calculations.
 *
 * USAGE:
 *   npx tsx scripts/generate-bulk-data.ts <shop-domain>
 *
 * EXAMPLE:
 *   npx tsx scripts/generate-bulk-data.ts teststore12062025.myshopify.com
 */

import 'dotenv/config';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { randomUUID } from 'crypto';

const client = new RDSDataClient({ region: process.env.AWS_REGION || 'eu-north-1' });
const databaseConfig = {
  resourceArn: process.env.AURORA_RESOURCE_ARN!,
  secretArn: process.env.AURORA_SECRET_ARN!,
  database: process.env.AURORA_DATABASE_NAME!,
};

// Configuration
const TOTAL_CUSTOMERS = 500;
const TOTAL_ORDERS = 2000;
const CUSTOMERS_PER_TIER = Math.floor(TOTAL_CUSTOMERS / 4); // 125 per tier

// Mock data
const firstNames = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'William', 'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia',
  'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander', 'Abigail', 'Michael',
  'Emily', 'Daniel', 'Elizabeth', 'Jacob', 'Sofia', 'Logan', 'Avery', 'Jackson',
  'Ella', 'Sebastian', 'Scarlett', 'Jack', 'Grace', 'Aiden', 'Chloe', 'Owen',
  'Victoria', 'Samuel', 'Riley', 'Matthew', 'Aria', 'Joseph', 'Lily', 'Levi',
  'Aubrey', 'Mateo', 'Zoey', 'David'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Walker', 'Hall',
  'Allen', 'Young', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill',
  'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts'
];

const products = [
  { name: 'Premium Cotton T-Shirt', basePrice: 29.99, variance: 10 },
  { name: 'Classic Denim Jeans', basePrice: 79.99, variance: 20 },
  { name: 'Leather Jacket', basePrice: 199.99, variance: 50 },
  { name: 'Running Sneakers', basePrice: 89.99, variance: 30 },
  { name: 'Winter Coat', basePrice: 149.99, variance: 40 },
  { name: 'Casual Hoodie', basePrice: 49.99, variance: 15 },
  { name: 'Designer Sunglasses', basePrice: 159.99, variance: 40 },
  { name: 'Canvas Backpack', basePrice: 69.99, variance: 20 },
  { name: 'Wool Scarf', basePrice: 34.99, variance: 10 },
  { name: 'Athletic Shorts', basePrice: 39.99, variance: 10 },
  { name: 'Silk Dress Shirt', basePrice: 89.99, variance: 20 },
  { name: 'Yoga Pants', basePrice: 59.99, variance: 15 },
  { name: 'Baseball Cap', basePrice: 24.99, variance: 10 },
  { name: 'Leather Belt', basePrice: 44.99, variance: 15 },
  { name: 'Winter Boots', basePrice: 129.99, variance: 30 },
];

async function executeQuery(sql: string, parameters: any[] = []): Promise<any> {
  const command = new ExecuteStatementCommand({
    ...databaseConfig,
    sql,
    parameters,
  });
  return await client.send(command);
}

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(base: number, variance: number): number {
  return Number((base + (Math.random() * variance * 2 - variance)).toFixed(2));
}

async function getTiers(shop: string) {
  const result = await executeQuery(`
    SELECT id, name, "minSpend", "cashbackPercent"
    FROM "Tier"
    WHERE shop = :shop
    ORDER BY "minSpend" ASC
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  return result.records.map((record: any) => ({
    id: record[0].stringValue,
    name: record[1].stringValue,
    minSpend: parseFloat(record[2].stringValue || '0'),
    cashbackPercent: record[3].longValue !== undefined ? Number(record[3].longValue) : 0,
  }));
}

async function createCustomer(shop: string, tier: any, customerIndex: number) {
  const firstName = randomElement(firstNames);
  const lastName = randomElement(lastNames);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${customerIndex}@${randomElement(['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com'])}`;
  const customerId = randomUUID();
  const shopifyCustomerId = `gid://shopify/Customer/${1000000000000 + customerIndex}`;

  const now = new Date();
  const customerCreatedAt = new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000); // Random date within last year

  await executeQuery(`
    INSERT INTO "Customer" (
      id, shop, email, "firstName", "lastName", "shopifyCustomerId",
      "orderCount", "totalSpent", "storeCredit", "totalCashbackEarned",
      "currentTierId", "createdAt", "updatedAt"
    ) VALUES (
      :id, :shop, :email, :firstName, :lastName, :shopifyCustomerId,
      0, 0, 0, 0,
      :tierId, :createdAt::timestamp, :updatedAt::timestamp
    )
  `, [
    { name: 'id', value: { stringValue: customerId } },
    { name: 'shop', value: { stringValue: shop } },
    { name: 'email', value: { stringValue: email } },
    { name: 'firstName', value: { stringValue: firstName } },
    { name: 'lastName', value: { stringValue: lastName } },
    { name: 'shopifyCustomerId', value: { stringValue: shopifyCustomerId } },
    { name: 'tierId', value: { stringValue: tier.id } },
    { name: 'createdAt', value: { stringValue: customerCreatedAt.toISOString() } },
    { name: 'updatedAt', value: { stringValue: now.toISOString() } },
  ]);

  // Create tier change log
  await executeQuery(`
    INSERT INTO "TierChangeLog" (
      id, shop, "customerId", "fromTierId", "toTierId",
      "changeType", "triggerType", "createdAt"
    ) VALUES (
      :id, :shop, :customerId, NULL, :toTierId,
      'INITIAL_ASSIGNMENT'::"TierChangeType", 'ACCOUNT_CREATED'::"TierTriggerType", :createdAt::timestamp
    )
  `, [
    { name: 'id', value: { stringValue: randomUUID() } },
    { name: 'shop', value: { stringValue: shop } },
    { name: 'customerId', value: { stringValue: customerId } },
    { name: 'toTierId', value: { stringValue: tier.id } },
    { name: 'createdAt', value: { stringValue: now.toISOString() } },
  ]);

  return {
    customerId,
    email,
    firstName,
    lastName,
    tierName: tier.name,
    cashbackPercent: tier.cashbackPercent,
    createdAt: customerCreatedAt,
  };
}

async function createOrder(shop: string, customer: any, orderNumber: number) {
  const orderId = randomUUID();
  const shopifyOrderId = `gid://shopify/Order/${5000000000000 + orderNumber}`;
  const shopifyOrderNumber = `#${1000 + orderNumber}`;

  // Random date between customer creation and now
  const now = new Date();
  const orderDate = new Date(
    customer.createdAt.getTime() +
    Math.random() * (now.getTime() - customer.createdAt.getTime())
  );

  // Generate 1-4 line items per order
  const numItems = randomInt(1, 4);
  const lineItems = [];
  let subtotal = 0;

  for (let i = 0; i < numItems; i++) {
    const product = randomElement(products);
    const quantity = randomInt(1, 3);
    const price = randomPrice(product.basePrice, product.variance);
    const itemTotal = Number((price * quantity).toFixed(2));

    lineItems.push({
      product,
      quantity,
      price,
      itemTotal,
    });

    subtotal += itemTotal;
  }

  // Calculate order totals
  const discount = Math.random() < 0.3 ? Number((subtotal * randomInt(5, 20) / 100).toFixed(2)) : 0;
  const shipping = Number((5 + Math.random() * 10).toFixed(2));
  const tax = Number((subtotal * randomInt(5, 15) / 100).toFixed(2));
  const totalPrice = Number((subtotal - discount + shipping + tax).toFixed(2));

  // Calculate cashback
  const cashbackAmount = Number((totalPrice * customer.cashbackPercent / 100).toFixed(2));

  // Create order
  await executeQuery(`
    INSERT INTO "Order" (
      id, shop, "customerId", "shopifyOrderId", "shopifyOrderNumber", "shopifyOrderName",
      email, currency, "totalPrice", "subtotalPrice", "totalDiscounts", "totalShipping", "totalTax",
      "totalRefunded", "netAmount", "cashbackAmount", "cashbackPercent", "financialStatus", "fulfillmentStatus",
      "shopifyCreatedAt", "shopifyUpdatedAt", "createdAt", "updatedAt"
    ) VALUES (
      :id, :shop, :customerId, :shopifyOrderId, :shopifyOrderNumber, :shopifyOrderName,
      :email, :currency, :totalPrice, :subtotalPrice, :totalDiscounts, :totalShipping, :totalTax,
      :totalRefunded, :netAmount, :cashbackAmount, :cashbackPercent, 'PAID', 'FULFILLED',
      :shopifyCreatedAt::timestamp, :shopifyUpdatedAt::timestamp, :createdAt::timestamp, :updatedAt::timestamp
    )
  `, [
    { name: 'id', value: { stringValue: orderId } },
    { name: 'shop', value: { stringValue: shop } },
    { name: 'customerId', value: { stringValue: customer.customerId } },
    { name: 'shopifyOrderId', value: { stringValue: shopifyOrderId } },
    { name: 'shopifyOrderNumber', value: { stringValue: shopifyOrderNumber } },
    { name: 'shopifyOrderName', value: { stringValue: shopifyOrderNumber } },
    { name: 'email', value: { stringValue: customer.email } },
    { name: 'currency', value: { stringValue: 'USD' } },
    { name: 'totalPrice', value: { doubleValue: totalPrice } },
    { name: 'subtotalPrice', value: { doubleValue: subtotal } },
    { name: 'totalDiscounts', value: { doubleValue: discount } },
    { name: 'totalShipping', value: { doubleValue: shipping } },
    { name: 'totalTax', value: { doubleValue: tax } },
    { name: 'totalRefunded', value: { doubleValue: 0 } },
    { name: 'netAmount', value: { doubleValue: totalPrice } },
    { name: 'cashbackAmount', value: { doubleValue: cashbackAmount } },
    { name: 'cashbackPercent', value: { longValue: customer.cashbackPercent } },
    { name: 'shopifyCreatedAt', value: { stringValue: orderDate.toISOString() } },
    { name: 'shopifyUpdatedAt', value: { stringValue: orderDate.toISOString() } },
    { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
    { name: 'updatedAt', value: { stringValue: orderDate.toISOString() } },
  ]);

  // Create line items
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    await executeQuery(`
      INSERT INTO "OrderLineItem" (
        id, "orderId", "shopifyLineItemId", "shopifyProductId", "shopifyVariantId",
        title, "variantTitle", sku, vendor,
        quantity, price, "totalPrice", "totalDiscount",
        "createdAt"
      ) VALUES (
        :id, :orderId, :lineItemId, :productId, :variantId,
        :title, :variantTitle, :sku, :vendor,
        :quantity, :price, :totalPrice, :totalDiscount,
        :createdAt::timestamp
      )
    `, [
      { name: 'id', value: { stringValue: randomUUID() } },
      { name: 'orderId', value: { stringValue: orderId } },
      { name: 'lineItemId', value: { stringValue: `${shopifyOrderId}/line_${i}` } },
      { name: 'productId', value: { stringValue: `gid://shopify/Product/${7000000000000 + Math.floor(Math.random() * 1000)}` } },
      { name: 'variantId', value: { stringValue: `gid://shopify/ProductVariant/${8000000000000 + Math.floor(Math.random() * 1000)}` } },
      { name: 'title', value: { stringValue: item.product.name } },
      { name: 'variantTitle', value: { stringValue: randomElement(['Small', 'Medium', 'Large', 'X-Large']) } },
      { name: 'sku', value: { stringValue: `SKU-${randomInt(10000, 99999)}` } },
      { name: 'vendor', value: { stringValue: randomElement(['Premium Brand', 'Classic Co', 'Urban Style', 'Active Wear']) } },
      { name: 'quantity', value: { longValue: item.quantity } },
      { name: 'price', value: { doubleValue: item.price } },
      { name: 'totalPrice', value: { doubleValue: item.itemTotal } },
      { name: 'totalDiscount', value: { doubleValue: 0 } },
      { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
    ]);
  }

  // Create ledger entry for cashback
  if (cashbackAmount > 0) {
    await executeQuery(`
      INSERT INTO "StoreCreditLedger" (
        id, shop, "customerId", type, amount, balance,
        "orderId", "createdAt"
      ) VALUES (
        :id, :shop, :customerId, 'CASHBACK_EARNED'::"LedgerEntryType",
        :amount, :balance, :orderId, :createdAt::timestamp
      )
    `, [
      { name: 'id', value: { stringValue: randomUUID() } },
      { name: 'shop', value: { stringValue: shop } },
      { name: 'customerId', value: { stringValue: customer.customerId } },
      { name: 'amount', value: { doubleValue: cashbackAmount } },
      { name: 'balance', value: { doubleValue: cashbackAmount } }, // Will be updated in batch
      { name: 'orderId', value: { stringValue: orderId } },
      { name: 'createdAt', value: { stringValue: orderDate.toISOString() } },
    ]);
  }

  return {
    orderId,
    totalPrice,
    cashbackAmount,
    lineItemCount: lineItems.length,
  };
}

async function updateCustomerTotals(shop: string, customerId: string) {
  // Get order totals
  const orderTotals = await executeQuery(`
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM("totalPrice"), 0) as total_spent
    FROM "Order"
    WHERE "customerId" = :customerId AND shop = :shop
  `, [
    { name: 'customerId', value: { stringValue: customerId } },
    { name: 'shop', value: { stringValue: shop } },
  ]);

  const orderCount = orderTotals.records[0][0].longValue || 0;
  const totalSpent = parseFloat(orderTotals.records[0][1].stringValue || '0');

  // Get cashback totals
  const cashbackTotals = await executeQuery(`
    SELECT COALESCE(SUM(amount), 0) as total_cashback
    FROM "StoreCreditLedger"
    WHERE "customerId" = :customerId AND shop = :shop
  `, [
    { name: 'customerId', value: { stringValue: customerId } },
    { name: 'shop', value: { stringValue: shop } },
  ]);

  const totalCashback = parseFloat(cashbackTotals.records[0][0].stringValue || '0');

  // Update customer
  await executeQuery(`
    UPDATE "Customer"
    SET
      "orderCount" = :orderCount,
      "totalSpent" = :totalSpent,
      "storeCredit" = :storeCredit,
      "totalCashbackEarned" = :totalCashback,
      "updatedAt" = :updatedAt::timestamp
    WHERE id = :customerId AND shop = :shop
  `, [
    { name: 'orderCount', value: { longValue: orderCount } },
    { name: 'totalSpent', value: { doubleValue: totalSpent } },
    { name: 'storeCredit', value: { doubleValue: totalCashback } },
    { name: 'totalCashback', value: { doubleValue: totalCashback } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'customerId', value: { stringValue: customerId } },
    { name: 'shop', value: { stringValue: shop } },
  ]);

  return { orderCount, totalSpent, totalCashback };
}

async function main() {
  const shop = process.argv[2];

  if (!shop) {
    console.error('❌ Error: Shop domain is required');
    console.error('Usage: npx tsx scripts/generate-bulk-data.ts <shop-domain>');
    process.exit(1);
  }

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           BULK DATA GENERATION - 500 Customers           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`🏪 Shop: ${shop}`);
  console.log(`👥 Customers: ${TOTAL_CUSTOMERS}`);
  console.log(`📦 Orders: ${TOTAL_ORDERS}`);
  console.log(`📊 Distribution: ${CUSTOMERS_PER_TIER} customers per tier\n`);

  const startTime = Date.now();

  // Get tiers
  console.log('📋 Fetching tiers...');
  const tiers = await getTiers(shop);
  console.log(`   Found ${tiers.length} tiers\n`);

  // Create customers
  console.log('👥 Creating customers...');
  const customers: any[] = [];
  let globalCustomerIndex = 0;

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
    const tier = tiers[tierIndex];
    console.log(`\n   🏆 ${tier.name} (${tier.cashbackPercent}% cashback):`);

    for (let i = 0; i < CUSTOMERS_PER_TIER; i++) {
      const customer = await createCustomer(shop, tier, globalCustomerIndex);
      customers.push(customer);
      globalCustomerIndex++;

      if ((i + 1) % 25 === 0) {
        process.stdout.write(`      ✓ ${i + 1}/${CUSTOMERS_PER_TIER} customers created\r`);
      }
    }
    console.log(`      ✓ ${CUSTOMERS_PER_TIER}/${CUSTOMERS_PER_TIER} customers created`);
  }

  console.log(`\n✅ Created ${customers.length} customers\n`);

  // Create orders
  console.log('📦 Creating orders...');
  let ordersCreated = 0;
  let totalRevenue = 0;
  let totalCashback = 0;

  // Distribute orders across customers (some get more, some get less)
  const ordersPerCustomer: number[] = [];
  let remainingOrders = TOTAL_ORDERS;

  for (let i = 0; i < customers.length; i++) {
    if (i === customers.length - 1) {
      // Last customer gets remaining orders
      ordersPerCustomer.push(remainingOrders);
    } else {
      // Random orders between 1 and 8, but ensure we don't run out
      const maxOrders = Math.min(8, remainingOrders - (customers.length - i - 1));
      const orders = randomInt(1, maxOrders);
      ordersPerCustomer.push(orders);
      remainingOrders -= orders;
    }
  }

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const numOrders = ordersPerCustomer[i];

    for (let j = 0; j < numOrders; j++) {
      const order = await createOrder(shop, customer, ordersCreated);
      ordersCreated++;
      totalRevenue += order.totalPrice;
      totalCashback += order.cashbackAmount;

      if (ordersCreated % 100 === 0) {
        process.stdout.write(`   ✓ ${ordersCreated}/${TOTAL_ORDERS} orders created ($${totalRevenue.toFixed(2)} revenue)\r`);
      }
    }
  }

  console.log(`   ✓ ${ordersCreated}/${TOTAL_ORDERS} orders created ($${totalRevenue.toFixed(2)} revenue)`);
  console.log(`\n✅ Created ${ordersCreated} orders with ${totalCashback.toFixed(2)} total cashback\n`);

  // Update customer totals
  console.log('💰 Updating customer totals...');
  for (let i = 0; i < customers.length; i++) {
    await updateCustomerTotals(shop, customers[i].customerId);

    if ((i + 1) % 50 === 0) {
      process.stdout.write(`   ✓ ${i + 1}/${customers.length} customers updated\r`);
    }
  }
  console.log(`   ✓ ${customers.length}/${customers.length} customers updated`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                  GENERATION COMPLETE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`✅ Successfully created:`);
  console.log(`   - ${customers.length} customers`);
  console.log(`   - ${ordersCreated} orders`);
  console.log(`   - ${ordersCreated} ledger entries`);
  console.log(`   - ${customers.length} tier change logs`);
  console.log(`\n📊 Statistics:`);
  console.log(`   - Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`   - Total Cashback: $${totalCashback.toFixed(2)}`);
  console.log(`   - Avg Order Value: $${(totalRevenue / ordersCreated).toFixed(2)}`);
  console.log(`   - Avg Orders/Customer: ${(ordersCreated / customers.length).toFixed(1)}`);
  console.log(`\n⏱️  Duration: ${duration}s\n`);
}

main().catch(console.error);
