// app/routes/api.admin.seed-test-data.tsx
// Admin endpoint to seed test data - accessible via /api/admin/seed-test-data
// SECURITY: Requires CRON_SECRET or ADMIN_API_TOKEN authentication

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { randomUUID } from "crypto";

// Configuration
const CONFIG = {
  shopDomain: "teststore12062025.myshopify.com",
  customerCount: 500,
  orderCount: 2000,
  tiers: [
    { name: "Bronze", minSpend: 0, cashbackPercent: 1, targetPercentage: 40 },
    { name: "Silver", minSpend: 500, cashbackPercent: 2, targetPercentage: 30 },
    { name: "Gold", minSpend: 1500, cashbackPercent: 3, targetPercentage: 20 },
    { name: "Platinum", minSpend: 3000, cashbackPercent: 5, targetPercentage: 10 }
  ]
};

// SECURITY: Authentication check function
function isAuthorizedRequest(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const cronSecret = request.headers.get('X-Cron-Secret');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const expectedCronSecret = process.env.CRON_SECRET;

  return !!(
    (expectedCronSecret && cronSecret === expectedCronSecret) ||
    (expectedCronSecret && auth === `Bearer ${expectedCronSecret}`) ||
    (adminToken && auth === `Bearer ${adminToken}`)
  );
}

// Helper functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateEmail(index: number): string {
  const domains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"];
  const names = ["john", "jane", "alex", "sarah", "mike", "emily", "david", "lisa", "chris", "anna"];
  const randomName = names[Math.floor(Math.random() * names.length)];
  const randomDomain = domains[Math.floor(Math.random() * domains.length)];
  return `${randomName}.customer${index}@${randomDomain}`;
}

function generateFirstName(): string {
  const names = ["John", "Jane", "Alex", "Sarah", "Mike", "Emily", "David", "Lisa", "Chris", "Anna",
                 "Tom", "Emma", "Ryan", "Olivia", "James", "Sophia", "Daniel", "Ava", "Matthew", "Mia"];
  return names[Math.floor(Math.random() * names.length)];
}

function generateLastName(): string {
  const names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
                 "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas"];
  return names[Math.floor(Math.random() * names.length)];
}

async function ensureTiersExist(logs: string[]) {
  logs.push("📊 Setting up membership tiers...");

  const existingTiers = await prisma.tier.findMany({
    where: { shop: CONFIG.shopDomain }
  });

  if (existingTiers.length > 0) {
    logs.push(`✅ Found ${existingTiers.length} existing tiers`);
    return existingTiers;
  }

  logs.push("Creating new tiers...");
  const createdTiers = [];

  for (const tierConfig of CONFIG.tiers) {
    const tier = await prisma.tier.create({
      data: {
        id: `${tierConfig.name.toLowerCase()}-${Date.now()}`,
        shop: CONFIG.shopDomain,
        name: tierConfig.name,
        minSpend: tierConfig.minSpend,
        cashbackPercent: tierConfig.cashbackPercent,
        evaluationPeriod: "ANNUAL"
      }
    });
    createdTiers.push(tier);
    logs.push(`  ✓ Created ${tier.name} tier (${tier.cashbackPercent}% cashback, $${tier.minSpend}+ spend)`);
  }

  return createdTiers;
}

async function createCustomers(tiers: any[], logs: string[]) {
  logs.push(`👥 Creating ${CONFIG.customerCount} customers...`);

  const customers = [];
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2025-10-24");

  // Distribute customers across tiers
  const tierDistribution = CONFIG.tiers.map((tier, index) => ({
    tier: tiers[index],
    count: Math.floor(CONFIG.customerCount * (tier.targetPercentage / 100)),
    minSpend: tier.minSpend,
    maxSpend: CONFIG.tiers[index + 1]?.minSpend || 10000
  }));

  let customerIndex = 1000000;
  let createdCount = 0;

  for (const distribution of tierDistribution) {
    logs.push(`  Creating ${distribution.count} ${distribution.tier.name} tier customers...`);

    for (let i = 0; i < distribution.count; i++) {
      const shopifyCustomerId = `${customerIndex++}`;
      const email = generateEmail(customerIndex);
      const firstName = generateFirstName();
      const lastName = generateLastName();
      const memberSince = randomDate(startDate, endDate);

      const annualSpending = randomFloat(
        distribution.minSpend,
        Math.min(distribution.maxSpend, distribution.minSpend + 2000)
      );

      const cashbackPercent = distribution.tier.cashbackPercent;
      const totalEarned = annualSpending * (cashbackPercent / 100);

      const redemptionRate = Math.random();
      const storeCredit = redemptionRate < 0.3 ? totalEarned :
                          redemptionRate < 0.7 ? totalEarned * randomFloat(0.3, 0.7) :
                          totalEarned * randomFloat(0, 0.3);

      try {
        const customer = await prisma.customer.create({
          data: {
            id: randomUUID(),
            shop: CONFIG.shopDomain,
            shopifyCustomerId,
            email,
            firstName,
            lastName,
            storeCredit: Math.round(storeCredit * 100) / 100,
            totalCashbackEarned: Math.round(totalEarned * 100) / 100,
            totalSpent: Math.round(annualSpending * 100) / 100,
            netSpent: Math.round(annualSpending * 100) / 100,
            createdAt: memberSince,
            updatedAt: memberSince,
            currentTierId: distribution.tier.id
          }
        });

        customers.push({
          ...customer,
          tier: distribution.tier,
          annualSpending
        });

        createdCount++;

        if (createdCount % 50 === 0) {
          logs.push(`    ✓ Created ${createdCount}/${CONFIG.customerCount} customers`);
        }
      } catch (error: any) {
        logs.push(`    ❌ Failed to create customer ${shopifyCustomerId}: ${error.message}`);
      }
    }
  }

  logs.push(`✅ Created ${createdCount} customers`);
  return customers;
}

async function createOrders(customers: any[], logs: string[]) {
  logs.push(`📦 Creating ${CONFIG.orderCount} orders...`);

  const orders = [];
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2025-10-24");

  const ordersPerCustomer = Math.floor(CONFIG.orderCount / customers.length);
  const extraOrders = CONFIG.orderCount % customers.length;

  let orderNumber = 10000;
  let createdCount = 0;

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const customerOrderCount = ordersPerCustomer + (i < extraOrders ? 1 : 0);

    const avgOrderValue = customer.annualSpending / customerOrderCount;

    for (let j = 0; j < customerOrderCount; j++) {
      const orderDate = randomDate(
        new Date(Math.max(startDate.getTime(), customer.createdAt.getTime())),
        endDate
      );

      const orderAmount = avgOrderValue * randomFloat(0.6, 1.4);
      const cashbackEarned = orderAmount * (customer.tier.cashbackPercent / 100);

      const shopifyOrderId = `gid://shopify/Order/${orderNumber++}`;

      try {
        const subtotal = Math.round(orderAmount * 100) / 100;
        const tax = Math.round(subtotal * 0.08 * 100) / 100; // 8% tax
        const shipping = Math.round(randomFloat(5, 15) * 100) / 100;
        const total = Math.round((subtotal + tax + shipping) * 100) / 100;

        const order = await prisma.order.create({
          data: {
            id: randomUUID(),
            shop: CONFIG.shopDomain,
            customerId: customer.id,
            shopifyOrderId,
            shopifyOrderNumber: `#${orderNumber}`,
            shopifyOrderName: `#${orderNumber}`,
            email: customer.email,
            currency: "USD",
            subtotalPrice: subtotal,
            totalDiscounts: 0,
            totalShipping: shipping,
            totalTax: tax,
            totalPrice: total,
            netAmount: total,
            financialStatus: randomFloat(0, 1) > 0.05 ? "PAID" : "PENDING",
            fulfillmentStatus: "fulfilled",
            cashbackEligible: true,
            cashbackPercent: customer.tier.cashbackPercent,
            cashbackAmount: Math.round(cashbackEarned * 100) / 100,
            cashbackProcessed: true,
            tierIdAtOrder: customer.tier.id,
            tierNameAtOrder: customer.tier.name,
            shopifyCreatedAt: orderDate,
            shopifyUpdatedAt: orderDate,
            createdAt: orderDate,
            updatedAt: orderDate,
            processedAt: new Date(orderDate.getTime() + 1000 * 60 * 60)
          }
        });

        orders.push(order);
        createdCount++;

        if (createdCount % 200 === 0) {
          logs.push(`  ✓ Created ${createdCount}/${CONFIG.orderCount} orders`);
        }
      } catch (error: any) {
        logs.push(`  ❌ Failed to create order: ${error.message}`);
      }
    }
  }

  logs.push(`✅ Created ${createdCount} orders`);
  return orders;
}

function generateStats(customers: any[], orders: any[], logs: string[]) {
  logs.push("");
  logs.push("📈 Database Statistics:");
  logs.push("=".repeat(50));

  const tierStats = CONFIG.tiers.map(tierConfig => {
    const tierCustomers = customers.filter(c => c.tier.name === tierConfig.name);
    const tierOrders = orders.filter(o => {
      const customer = customers.find(c => c.id === o.customerId);
      return customer?.tier.name === tierConfig.name;
    });

    const totalRevenue = tierOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
    const totalCashback = tierOrders.reduce((sum, o) => sum + Number(o.cashbackAmount || 0), 0);

    return {
      tier: tierConfig.name,
      customers: tierCustomers.length,
      orders: tierOrders.length,
      revenue: totalRevenue,
      cashback: totalCashback
    };
  });

  tierStats.forEach(stat => {
    logs.push("");
    logs.push(`${stat.tier} Tier:`);
    logs.push(`  Customers: ${stat.customers}`);
    logs.push(`  Orders: ${stat.orders}`);
    logs.push(`  Total Revenue: $${stat.revenue.toFixed(2)}`);
    logs.push(`  Total Cashback: $${stat.cashback.toFixed(2)}`);
    logs.push(`  Avg Order Value: $${(stat.revenue / stat.orders).toFixed(2)}`);
  });

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
  const totalCashback = orders.reduce((sum, o) => sum + Number(o.cashbackAmount || 0), 0);
  const totalStoreCredit = customers.reduce((sum, c) => sum + Number(c.storeCredit), 0);

  logs.push("");
  logs.push("=".repeat(50));
  logs.push("Overall Statistics:");
  logs.push(`  Total Customers: ${customers.length}`);
  logs.push(`  Total Orders: ${orders.length}`);
  logs.push(`  Total Revenue: $${totalRevenue.toFixed(2)}`);
  logs.push(`  Total Cashback Earned: $${totalCashback.toFixed(2)}`);
  logs.push(`  Available Store Credit: $${totalStoreCredit.toFixed(2)}`);
  logs.push(`  Avg Revenue per Customer: $${(totalRevenue / customers.length).toFixed(2)}`);
  logs.push(`  Avg Orders per Customer: ${(orders.length / customers.length).toFixed(1)}`);
  logs.push("=".repeat(50));
}

export async function loader({ request }: LoaderFunctionArgs) {
  // SECURITY: Require authentication
  if (!isAuthorizedRequest(request)) {
    console.warn('[AdminSeedTestData] Unauthorized access attempt');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // SECURITY: Only allow in development/test environments
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_ENDPOINTS) {
    console.warn('[AdminSeedTestData] Blocked in production environment');
    return json({ error: 'Not available in production' }, { status: 403 });
  }

  const logs: string[] = [];

  try {
    logs.push("🚀 Starting database seeding...");
    logs.push(`📍 Shop: ${CONFIG.shopDomain}`);
    logs.push(`👥 Target Customers: ${CONFIG.customerCount}`);
    logs.push(`📦 Target Orders: ${CONFIG.orderCount}`);
    logs.push("");

    // Step 1: Ensure tiers exist
    const tiers = await ensureTiersExist(logs);

    // Step 2: Create customers
    const customers = await createCustomers(tiers, logs);

    if (customers.length === 0) {
      throw new Error("No customers were created. Aborting order creation.");
    }

    // Step 3: Create orders
    const orders = await createOrders(customers, logs);

    // Step 4: Generate statistics
    generateStats(customers, orders, logs);

    logs.push("");
    logs.push("✅ Database seeding completed successfully!");

    return json({
      success: true,
      logs,
      summary: {
        customersCreated: customers.length,
        ordersCreated: orders.length,
        tiersCreated: tiers.length
      }
    }, {
      headers: {
        "Content-Type": "application/json"
      }
    });

  } catch (error: any) {
    logs.push("");
    logs.push(`❌ Seeding failed: ${error.message}`);

    return json({
      success: false,
      error: error.message,
      logs
    }, {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}
