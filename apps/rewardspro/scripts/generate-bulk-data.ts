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
import { query, execute, param } from './lib/db.mjs';
import { randomUUID } from 'crypto';

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
  return query(`
    SELECT id, name, "minSpend", "cashbackPercent"
    FROM "Tier"
    WHERE shop = :shop
    ORDER BY "minSpend" ASC
  `, [param('shop', shop)]);
}

async function createCustomer(shop: string, tier: any, customerIndex: number) {
  const firstName = randomElement(firstNames);
  const lastName = randomElement(lastNames);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${customerIndex}@${randomElement(['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com'])}`;
  const customerId = randomUUID();
  const shopifyCustomerId = `gid://shopify/Customer/${1000000000000 + customerIndex}`;

  const now = new Date();
  const customerCreatedAt = new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000);

  await execute(`
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
    param('id', customerId),
    param('shop', shop),
    param('email', email),
    param('firstName', firstName),
    param('lastName', lastName),
    param('shopifyCustomerId', shopifyCustomerId),
    param('tierId', tier.id),
    param('createdAt', customerCreatedAt),
    param('updatedAt', now),
  ]);

  // Create tier change log
  await execute(`
    INSERT INTO "TierChangeLog" (
      id, shop, "customerId", "fromTierId", "toTierId",
      "changeType", "triggerType", "createdAt"
    ) VALUES (
      :id, :shop, :customerId, NULL, :toTierId,
      'INITIAL_ASSIGNMENT'::"TierChangeType", 'ACCOUNT_CREATED'::"TierTriggerType", :createdAt::timestamp
    )
  `, [
    param('id', randomUUID()),
    param('shop', shop),
    param('customerId', customerId),
    param('toTierId', tier.id),
    param('createdAt', now),
  ]);

  return {
    customerId, email, firstName, lastName,
    tierName: tier.name,
    cashbackPercent: tier.cashbackPercent || 0,
    createdAt: customerCreatedAt,
  };
}

async function createOrder(shop: string, customer: any, orderNumber: number) {
  const orderId = randomUUID();
  const shopifyOrderId = `gid://shopify/Order/${5000000000000 + orderNumber}`;
  const shopifyOrderNumber = `#${1000 + orderNumber}`;

  const now = new Date();
  const orderDate = new Date(
    customer.createdAt.getTime() +
    Math.random() * (now.getTime() - customer.createdAt.getTime())
  );

  const numItems = randomInt(1, 4);
  const lineItems = [];
  let subtotal = 0;

  for (let i = 0; i < numItems; i++) {
    const product = randomElement(products);
    const quantity = randomInt(1, 3);
    const price = randomPrice(product.basePrice, product.variance);
    const itemTotal = Number((price * quantity).toFixed(2));
    lineItems.push({ product, quantity, price, itemTotal });
    subtotal += itemTotal;
  }

  const discount = Math.random() < 0.3 ? Number((subtotal * randomInt(5, 20) / 100).toFixed(2)) : 0;
  const shipping = Number((5 + Math.random() * 10).toFixed(2));
  const tax = Number((subtotal * randomInt(5, 15) / 100).toFixed(2));
  const totalPrice = Number((subtotal - discount + shipping + tax).toFixed(2));
  const cashbackAmount = Number((totalPrice * customer.cashbackPercent / 100).toFixed(2));

  await execute(`
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
    param('id', orderId),
    param('shop', shop),
    param('customerId', customer.customerId),
    param('shopifyOrderId', shopifyOrderId),
    param('shopifyOrderNumber', shopifyOrderNumber),
    param('shopifyOrderName', shopifyOrderNumber),
    param('email', customer.email),
    param('currency', 'USD'),
    param('totalPrice', totalPrice),
    param('subtotalPrice', subtotal),
    param('totalDiscounts', discount),
    param('totalShipping', shipping),
    param('totalTax', tax),
    param('totalRefunded', 0),
    param('netAmount', totalPrice),
    param('cashbackAmount', cashbackAmount),
    param('cashbackPercent', customer.cashbackPercent),
    param('shopifyCreatedAt', orderDate),
    param('shopifyUpdatedAt', orderDate),
    param('createdAt', orderDate),
    param('updatedAt', orderDate),
  ]);

  // Create line items
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    await execute(`
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
      param('id', randomUUID()),
      param('orderId', orderId),
      param('lineItemId', `${shopifyOrderId}/line_${i}`),
      param('productId', `gid://shopify/Product/${7000000000000 + Math.floor(Math.random() * 1000)}`),
      param('variantId', `gid://shopify/ProductVariant/${8000000000000 + Math.floor(Math.random() * 1000)}`),
      param('title', item.product.name),
      param('variantTitle', randomElement(['Small', 'Medium', 'Large', 'X-Large'])),
      param('sku', `SKU-${randomInt(10000, 99999)}`),
      param('vendor', randomElement(['Premium Brand', 'Classic Co', 'Urban Style', 'Active Wear'])),
      param('quantity', item.quantity),
      param('price', item.price),
      param('totalPrice', item.itemTotal),
      param('totalDiscount', 0),
      param('createdAt', orderDate),
    ]);
  }

  // Create ledger entry for cashback
  if (cashbackAmount > 0) {
    await execute(`
      INSERT INTO "StoreCreditLedger" (
        id, shop, "customerId", type, amount, balance,
        "orderId", "createdAt"
      ) VALUES (
        :id, :shop, :customerId, 'CASHBACK_EARNED'::"LedgerEntryType",
        :amount, :balance, :orderId, :createdAt::timestamp
      )
    `, [
      param('id', randomUUID()),
      param('shop', shop),
      param('customerId', customer.customerId),
      param('amount', cashbackAmount),
      param('balance', cashbackAmount),
      param('orderId', orderId),
      param('createdAt', orderDate),
    ]);
  }

  return { orderId, totalPrice, cashbackAmount, lineItemCount: lineItems.length };
}

async function updateCustomerTotals(shop: string, customerId: string) {
  const orderTotals = await query(`
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM("totalPrice"), 0) as total_spent
    FROM "Order"
    WHERE "customerId" = :customerId AND shop = :shop
  `, [param('customerId', customerId), param('shop', shop)]);

  const orderCount = (orderTotals as any)[0]?.order_count || 0;
  const totalSpent = (orderTotals as any)[0]?.total_spent || 0;

  const cashbackTotals = await query(`
    SELECT COALESCE(SUM(amount), 0) as total_cashback
    FROM "StoreCreditLedger"
    WHERE "customerId" = :customerId AND shop = :shop
  `, [param('customerId', customerId), param('shop', shop)]);

  const totalCashback = (cashbackTotals as any)[0]?.total_cashback || 0;

  await execute(`
    UPDATE "Customer"
    SET
      "orderCount" = :orderCount,
      "totalSpent" = :totalSpent,
      "storeCredit" = :storeCredit,
      "totalCashbackEarned" = :totalCashback,
      "updatedAt" = :updatedAt::timestamp
    WHERE id = :customerId AND shop = :shop
  `, [
    param('orderCount', orderCount),
    param('totalSpent', totalSpent),
    param('storeCredit', totalCashback),
    param('totalCashback', totalCashback),
    param('updatedAt', new Date()),
    param('customerId', customerId),
    param('shop', shop),
  ]);

  return { orderCount, totalSpent, totalCashback };
}

async function main() {
  const shop = process.argv[2];

  if (!shop) {
    console.error('Error: Shop domain is required');
    console.error('Usage: npx tsx scripts/generate-bulk-data.ts <shop-domain>');
    process.exit(1);
  }

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           BULK DATA GENERATION - 500 Customers           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`Shop: ${shop}`);
  console.log(`Customers: ${TOTAL_CUSTOMERS}`);
  console.log(`Orders: ${TOTAL_ORDERS}`);
  console.log(`Distribution: ${CUSTOMERS_PER_TIER} customers per tier\n`);

  const startTime = Date.now();

  console.log('Fetching tiers...');
  const tiers = await getTiers(shop);
  console.log(`   Found ${tiers.length} tiers\n`);

  console.log('Creating customers...');
  const customers: any[] = [];
  let globalCustomerIndex = 0;

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
    const tier = tiers[tierIndex];
    console.log(`\n   ${(tier as any).name} (${(tier as any).cashbackPercent || 0}% cashback):`);

    for (let i = 0; i < CUSTOMERS_PER_TIER; i++) {
      const customer = await createCustomer(shop, tier, globalCustomerIndex);
      customers.push(customer);
      globalCustomerIndex++;

      if ((i + 1) % 25 === 0) {
        process.stdout.write(`      ${i + 1}/${CUSTOMERS_PER_TIER} customers created\r`);
      }
    }
    console.log(`      ${CUSTOMERS_PER_TIER}/${CUSTOMERS_PER_TIER} customers created`);
  }

  console.log(`\nCreated ${customers.length} customers\n`);

  console.log('Creating orders...');
  let ordersCreated = 0;
  let totalRevenue = 0;
  let totalCashback = 0;

  const ordersPerCustomer: number[] = [];
  let remainingOrders = TOTAL_ORDERS;

  for (let i = 0; i < customers.length; i++) {
    if (i === customers.length - 1) {
      ordersPerCustomer.push(remainingOrders);
    } else {
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
        process.stdout.write(`   ${ordersCreated}/${TOTAL_ORDERS} orders created ($${totalRevenue.toFixed(2)} revenue)\r`);
      }
    }
  }

  console.log(`   ${ordersCreated}/${TOTAL_ORDERS} orders created ($${totalRevenue.toFixed(2)} revenue)`);
  console.log(`\nCreated ${ordersCreated} orders with ${totalCashback.toFixed(2)} total cashback\n`);

  console.log('Updating customer totals...');
  for (let i = 0; i < customers.length; i++) {
    await updateCustomerTotals(shop, customers[i].customerId);

    if ((i + 1) % 50 === 0) {
      process.stdout.write(`   ${i + 1}/${customers.length} customers updated\r`);
    }
  }
  console.log(`   ${customers.length}/${customers.length} customers updated`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n--- GENERATION COMPLETE ---\n');
  console.log(`Successfully created:`);
  console.log(`   - ${customers.length} customers`);
  console.log(`   - ${ordersCreated} orders`);
  console.log(`   - ${ordersCreated} ledger entries`);
  console.log(`   - ${customers.length} tier change logs`);
  console.log(`\nStatistics:`);
  console.log(`   - Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`   - Total Cashback: $${totalCashback.toFixed(2)}`);
  console.log(`   - Avg Order Value: $${(totalRevenue / ordersCreated).toFixed(2)}`);
  console.log(`   - Avg Orders/Customer: ${(ordersCreated / customers.length).toFixed(1)}`);
  console.log(`\nDuration: ${duration}s\n`);
}

main().catch(console.error);
