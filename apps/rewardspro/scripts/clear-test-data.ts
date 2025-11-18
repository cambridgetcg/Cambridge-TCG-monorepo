// scripts/clear-test-data.ts
// Clear all test data from the database

import prisma from "../app/db.server";

const CONFIG = {
  shopDomain: "teststore12062025.myshopify.com",
};

async function clearTestData() {
  console.log("🗑️  Clearing test data...");
  console.log(`📍 Shop: ${CONFIG.shopDomain}\n`);

  try {
    // Count existing records
    const customerCount = await prisma.customer.count({
      where: { shopDomain: CONFIG.shopDomain }
    });

    const orderCount = await prisma.order.count({
      where: { shopDomain: CONFIG.shopDomain }
    });

    const tierCount = await prisma.tier.count({
      where: { shopDomain: CONFIG.shopDomain }
    });

    console.log("Current database state:");
    console.log(`  Customers: ${customerCount}`);
    console.log(`  Orders: ${orderCount}`);
    console.log(`  Tiers: ${tierCount}\n`);

    if (customerCount === 0 && orderCount === 0 && tierCount === 0) {
      console.log("✅ Database is already empty for this shop.");
      return;
    }

    // Confirm before deletion
    console.log("⚠️  WARNING: This will delete ALL data for this shop!");
    console.log("Press Ctrl+C to cancel, or wait 3 seconds to proceed...\n");

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Delete in correct order (respecting foreign key constraints)
    console.log("Deleting records...\n");

    // 1. Delete orders first
    if (orderCount > 0) {
      console.log(`📦 Deleting ${orderCount} orders...`);
      const deletedOrders = await prisma.order.deleteMany({
        where: { shopDomain: CONFIG.shopDomain }
      });
      console.log(`  ✓ Deleted ${deletedOrders.count} orders`);
    }

    // 2. Delete membership history
    const membershipHistoryCount = await prisma.membershipHistory.count({
      where: { customer: { shopDomain: CONFIG.shopDomain } }
    });

    if (membershipHistoryCount > 0) {
      console.log(`🎖️  Deleting ${membershipHistoryCount} membership history records...`);
      const deletedHistory = await prisma.membershipHistory.deleteMany({
        where: { customer: { shopDomain: CONFIG.shopDomain } }
      });
      console.log(`  ✓ Deleted ${deletedHistory.count} membership history records`);
    }

    // 3. Delete customers
    if (customerCount > 0) {
      console.log(`👥 Deleting ${customerCount} customers...`);
      const deletedCustomers = await prisma.customer.deleteMany({
        where: { shopDomain: CONFIG.shopDomain }
      });
      console.log(`  ✓ Deleted ${deletedCustomers.count} customers`);
    }

    // 4. Delete tiers
    if (tierCount > 0) {
      console.log(`📊 Deleting ${tierCount} tiers...`);
      const deletedTiers = await prisma.tier.deleteMany({
        where: { shopDomain: CONFIG.shopDomain }
      });
      console.log(`  ✓ Deleted ${deletedTiers.count} tiers`);
    }

    console.log("\n✅ All test data has been cleared successfully!");

  } catch (error) {
    console.error("\n❌ Failed to clear test data:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
clearTestData().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
