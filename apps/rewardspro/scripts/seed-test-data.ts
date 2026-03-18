// scripts/seed-test-data.ts
// Seed script to populate database with test customers and orders

import prisma from "../app/db.server";

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

async function ensureTiersExist() {
  console.log("\n📊 Setting up membership tiers...");

  const existingTiers = await prisma.tier.findMany({
    where: { shopDomain: CONFIG.shopDomain }
  });

  if (existingTiers.length > 0) {
    console.log(`✅ Found ${existingTiers.length} existing tiers`);
    return existingTiers;
  }

  console.log("Creating new tiers...");
  const createdTiers = [];

  for (const tierConfig of CONFIG.tiers) {
    const tier = await prisma.tier.create({
      data: {
        shopDomain: CONFIG.shopDomain,
        name: tierConfig.name,
        minSpend: tierConfig.minSpend,
        cashbackPercent: tierConfig.cashbackPercent,
        isActive: true,
        evaluationPeriod: "ANNUAL"
      }
    });
    createdTiers.push(tier);
    console.log(`  ✓ Created ${tier.name} tier (${tier.cashbackPercent}% cashback, $${tier.minSpend}+ spend)`);
  }

  return createdTiers;
}

function determineTierForSpending(totalSpent: number, tiers: any[]) {
  // Sort tiers by minSpend descending
  const sortedTiers = [...tiers].sort((a, b) => b.minSpend - a.minSpend);

  for (const tier of sortedTiers) {
    if (totalSpent >= tier.minSpend) {
      return tier;
    }
  }

  return sortedTiers[sortedTiers.length - 1]; // Return lowest tier if nothing matches
}

async function createCustomers(tiers: any[]) {
  console.log(`\n👥 Creating ${CONFIG.customerCount} customers...`);

  const customers = [];
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2025-10-24");

  // Distribute customers across tiers based on target percentages
  const tierDistribution = CONFIG.tiers.map((tier, index) => ({
    tier: tiers[index],
    count: Math.floor(CONFIG.customerCount * (tier.targetPercentage / 100)),
    minSpend: tier.minSpend,
    maxSpend: CONFIG.tiers[index + 1]?.minSpend || 10000
  }));

  let customerIndex = 1000000; // Start at 1M for realistic Shopify IDs
  let createdCount = 0;

  for (const distribution of tierDistribution) {
    console.log(`  Creating ${distribution.count} ${distribution.tier.name} tier customers...`);

    for (let i = 0; i < distribution.count; i++) {
      const shopifyCustomerId = `${customerIndex++}`;
      const email = generateEmail(customerIndex);
      const firstName = generateFirstName();
      const lastName = generateLastName();
      const memberSince = randomDate(startDate, endDate);

      // Generate spending amount within tier range
      const annualSpending = randomFloat(
        distribution.minSpend,
        Math.min(distribution.maxSpend, distribution.minSpend + 2000)
      );

      // Calculate rewards based on tier cashback
      const cashbackPercent = distribution.tier.cashbackPercent;
      const totalEarned = annualSpending * (cashbackPercent / 100);

      // Some customers have redeemed some credit, others haven't
      const redemptionRate = Math.random();
      const storeCredit = redemptionRate < 0.3 ? totalEarned : // 30% haven't redeemed
                          redemptionRate < 0.7 ? totalEarned * randomFloat(0.3, 0.7) : // 40% partially redeemed
                          totalEarned * randomFloat(0, 0.3); // 30% mostly redeemed

      try {
        const customer = await prisma.customer.create({
          data: {
            shopDomain: CONFIG.shopDomain,
            shopifyCustomerId,
            email,
            firstName,
            lastName,
            storeCredit: Math.round(storeCredit * 100) / 100,
            totalEarned: Math.round(totalEarned * 100) / 100,
            annualSpending: Math.round(annualSpending * 100) / 100,
            lifetimeSpending: Math.round(annualSpending * randomFloat(1, 1.5) * 100) / 100,
            createdAt: memberSince,
            membershipHistory: {
              create: {
                tierId: distribution.tier.id,
                isActive: true,
                assignmentType: annualSpending >= distribution.minSpend ? "AUTOMATIC" : "MANUAL",
                startDate: memberSince
              }
            }
          }
        });

        customers.push({
          ...customer,
          tier: distribution.tier,
          annualSpending
        });

        createdCount++;

        if (createdCount % 50 === 0) {
          console.log(`    ✓ Created ${createdCount}/${CONFIG.customerCount} customers`);
        }
      } catch (error) {
        console.error(`    ❌ Failed to create customer ${shopifyCustomerId}:`, (error as Error).message);
      }
    }
  }

  console.log(`✅ Created ${createdCount} customers`);
  return customers;
}

async function createOrders(customers: any[]) {
  console.log(`\n📦 Creating ${CONFIG.orderCount} orders...`);

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

    // Calculate average order value based on customer's annual spending
    const avgOrderValue = customer.annualSpending / customerOrderCount;

    for (let j = 0; j < customerOrderCount; j++) {
      const orderDate = randomDate(
        new Date(Math.max(startDate.getTime(), customer.createdAt.getTime())),
        endDate
      );

      // Vary order amount ±40% from average
      const orderAmount = avgOrderValue * randomFloat(0.6, 1.4);
      const cashbackEarned = orderAmount * (customer.tier.cashbackPercent / 100);

      const shopifyOrderId = `gid://shopify/Order/${orderNumber++}`;

      try {
        const order = await prisma.order.create({
          data: {
            shopDomain: CONFIG.shopDomain,
            customerId: customer.id,
            shopifyOrderId,
            orderNumber: `#${orderNumber}`,
            totalAmount: Math.round(orderAmount * 100) / 100,
            cashbackEarned: Math.round(cashbackEarned * 100) / 100,
            cashbackPercent: customer.tier.cashbackPercent,
            tierIdAtPurchase: customer.tier.id,
            status: randomFloat(0, 1) > 0.05 ? "COMPLETED" : "PENDING", // 95% completed
            isPaid: true,
            isProcessed: true,
            createdAt: orderDate,
            processedAt: new Date(orderDate.getTime() + 1000 * 60 * 60) // 1 hour later
          }
        });

        orders.push(order);
        createdCount++;

        if (createdCount % 200 === 0) {
          console.log(`  ✓ Created ${createdCount}/${CONFIG.orderCount} orders`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to create order for customer ${customer.shopifyCustomerId}:`, (error as Error).message);
      }
    }
  }

  console.log(`✅ Created ${createdCount} orders`);
  return orders;
}

async function generateStats(customers: any[], orders: any[]) {
  console.log("\n📈 Database Statistics:");
  console.log("=" .repeat(50));

  // Customer stats by tier
  const tierStats = CONFIG.tiers.map(tierConfig => {
    const tierCustomers = customers.filter(c => c.tier.name === tierConfig.name);
    const tierOrders = orders.filter(o => {
      const customer = customers.find(c => c.id === o.customerId);
      return customer?.tier.name === tierConfig.name;
    });

    const totalRevenue = tierOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalCashback = tierOrders.reduce((sum, o) => sum + o.cashbackEarned, 0);

    return {
      tier: tierConfig.name,
      customers: tierCustomers.length,
      orders: tierOrders.length,
      revenue: totalRevenue,
      cashback: totalCashback
    };
  });

  tierStats.forEach(stat => {
    console.log(`\n${stat.tier} Tier:`);
    console.log(`  Customers: ${stat.customers}`);
    console.log(`  Orders: ${stat.orders}`);
    console.log(`  Total Revenue: $${stat.revenue.toFixed(2)}`);
    console.log(`  Total Cashback: $${stat.cashback.toFixed(2)}`);
    console.log(`  Avg Order Value: $${(stat.revenue / stat.orders).toFixed(2)}`);
  });

  // Overall stats
  const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalCashback = orders.reduce((sum, o) => sum + o.cashbackEarned, 0);
  const totalStoreCredit = customers.reduce((sum, c) => sum + c.storeCredit, 0);

  console.log("\n" + "=".repeat(50));
  console.log("Overall Statistics:");
  console.log(`  Total Customers: ${customers.length}`);
  console.log(`  Total Orders: ${orders.length}`);
  console.log(`  Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`  Total Cashback Earned: $${totalCashback.toFixed(2)}`);
  console.log(`  Available Store Credit: $${totalStoreCredit.toFixed(2)}`);
  console.log(`  Avg Revenue per Customer: $${(totalRevenue / customers.length).toFixed(2)}`);
  console.log(`  Avg Orders per Customer: ${(orders.length / customers.length).toFixed(1)}`);
  console.log("=".repeat(50));
}

async function main() {
  console.log("🚀 Starting database seeding...");
  console.log(`📍 Shop: ${CONFIG.shopDomain}`);
  console.log(`👥 Target Customers: ${CONFIG.customerCount}`);
  console.log(`📦 Target Orders: ${CONFIG.orderCount}`);

  try {
    // Step 1: Ensure tiers exist
    const tiers = await ensureTiersExist();

    // Step 2: Create customers
    const customers = await createCustomers(tiers);

    if (customers.length === 0) {
      throw new Error("No customers were created. Aborting order creation.");
    }

    // Step 3: Create orders
    const orders = await createOrders(customers);

    // Step 4: Generate statistics
    await generateStats(customers, orders);

    console.log("\n✅ Database seeding completed successfully!");

  } catch (error) {
    console.error("\n❌ Seeding failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
