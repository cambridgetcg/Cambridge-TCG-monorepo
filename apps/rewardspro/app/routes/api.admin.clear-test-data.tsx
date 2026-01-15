// app/routes/api.admin.clear-test-data.tsx
// Admin endpoint to clear test data - accessible via /api/admin/clear-test-data
// SECURITY: Requires CRON_SECRET or ADMIN_API_TOKEN authentication

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

const CONFIG = {
  shopDomain: "teststore12062025.myshopify.com",
};

export async function loader({ request }: LoaderFunctionArgs) {
  // SECURITY: Require authentication via CRON_SECRET or ADMIN_API_TOKEN
  const auth = request.headers.get('authorization');
  const cronSecret = request.headers.get('X-Cron-Secret');
  const adminToken = process.env.ADMIN_API_TOKEN;
  const expectedCronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    (expectedCronSecret && cronSecret === expectedCronSecret) ||
    (expectedCronSecret && auth === `Bearer ${expectedCronSecret}`) ||
    (adminToken && auth === `Bearer ${adminToken}`);

  if (!isAuthorized) {
    console.warn('[AdminClearTestData] Unauthorized access attempt');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // SECURITY: Only allow in development/test environments
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_ENDPOINTS) {
    console.warn('[AdminClearTestData] Blocked in production environment');
    return json({ error: 'Not available in production' }, { status: 403 });
  }

  const logs: string[] = [];

  try {
    logs.push("🗑️  Clearing test data...");
    logs.push(`📍 Shop: ${CONFIG.shopDomain}`);
    logs.push("");

    // Count existing records
    const customerCount = await prisma.customer.count({
      where: { shop: CONFIG.shopDomain }
    });

    const orderCount = await prisma.order.count({
      where: { shop: CONFIG.shopDomain }
    });

    const tierCount = await prisma.tier.count({
      where: { shop: CONFIG.shopDomain }
    });

    logs.push("Current database state:");
    logs.push(`  Customers: ${customerCount}`);
    logs.push(`  Orders: ${orderCount}`);
    logs.push(`  Tiers: ${tierCount}`);
    logs.push("");

    if (customerCount === 0 && orderCount === 0 && tierCount === 0) {
      logs.push("✅ Database is already empty for this shop.");
      return json({
        success: true,
        logs,
        summary: {
          customersDeleted: 0,
          ordersDeleted: 0,
          tiersDeleted: 0
        }
      });
    }

    logs.push("Deleting records...");
    logs.push("");

    // Delete in correct order (respecting foreign key constraints)

    // 1. Delete orders first
    let deletedOrders = 0;
    if (orderCount > 0) {
      logs.push(`📦 Deleting ${orderCount} orders...`);
      const result = await prisma.order.deleteMany({
        where: { shop: CONFIG.shopDomain }
      });
      deletedOrders = result.count;
      logs.push(`  ✓ Deleted ${deletedOrders} orders`);
    }

    // 2. Delete store credit ledger entries
    const ledgerCount = await prisma.storeCreditLedger.count({
      where: { shop: CONFIG.shopDomain }
    });

    let deletedLedgers = 0;
    if (ledgerCount > 0) {
      logs.push(`💰 Deleting ${ledgerCount} store credit ledger entries...`);
      const result = await prisma.storeCreditLedger.deleteMany({
        where: { shop: CONFIG.shopDomain }
      });
      deletedLedgers = result.count;
      logs.push(`  ✓ Deleted ${deletedLedgers} ledger entries`);
    }

    // 3. Delete customers (cascades to membership history)
    let deletedCustomers = 0;
    if (customerCount > 0) {
      logs.push(`👥 Deleting ${customerCount} customers...`);
      const result = await prisma.customer.deleteMany({
        where: { shop: CONFIG.shopDomain }
      });
      deletedCustomers = result.count;
      logs.push(`  ✓ Deleted ${deletedCustomers} customers`);
    }

    // 4. Delete tiers
    let deletedTiers = 0;
    if (tierCount > 0) {
      logs.push(`📊 Deleting ${tierCount} tiers...`);
      const result = await prisma.tier.deleteMany({
        where: { shop: CONFIG.shopDomain }
      });
      deletedTiers = result.count;
      logs.push(`  ✓ Deleted ${deletedTiers} tiers`);
    }

    logs.push("");
    logs.push("✅ All test data has been cleared successfully!");

    return json({
      success: true,
      logs,
      summary: {
        customersDeleted: deletedCustomers,
        ordersDeleted: deletedOrders,
        tiersDeleted: deletedTiers
      }
    });

  } catch (error: any) {
    logs.push("");
    logs.push(`❌ Failed to clear test data: ${error.message}`);

    return json({
      success: false,
      error: error.message,
      logs
    }, {
      status: 500
    });
  }
}
