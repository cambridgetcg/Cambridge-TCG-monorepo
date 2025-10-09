/**
 * Delete All Orders Script
 *
 * WARNING: This script will delete ALL orders and related data for a specific shop.
 * Use with caution - this action cannot be undone!
 *
 * Usage:
 *   npx tsx scripts/delete-all-orders.ts <shop-domain>
 *
 * Example:
 *   npx tsx scripts/delete-all-orders.ts my-store.myshopify.com
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

// Validate environment variables
const requiredEnvVars = [
  'AURORA_RESOURCE_ARN',
  'AURORA_SECRET_ARN',
  'AURORA_DATABASE_NAME',
  'AWS_REGION'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Get shop domain from command line
const shopDomain = process.argv[2];

if (!shopDomain) {
  console.error('❌ Usage: npx tsx scripts/delete-all-orders.ts <shop-domain>');
  console.error('❌ Example: npx tsx scripts/delete-all-orders.ts my-store.myshopify.com');
  process.exit(1);
}

// Validate shop domain format
if (!shopDomain.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
  console.error('❌ Invalid shop domain format. Must be: your-store.myshopify.com');
  process.exit(1);
}

const client = new RDSDataClient({
  region: process.env.AWS_REGION || 'eu-north-1',
});

const config = {
  resourceArn: process.env.AURORA_RESOURCE_ARN!,
  secretArn: process.env.AURORA_SECRET_ARN!,
  database: process.env.AURORA_DATABASE_NAME!,
};

async function executeSQL(sql: string, parameters: any[] = []) {
  const command = new ExecuteStatementCommand({
    resourceArn: config.resourceArn,
    secretArn: config.secretArn,
    database: config.database,
    sql,
    parameters,
  });

  return await client.send(command);
}

async function deleteAllOrders(shop: string) {
  console.log(`\n🔍 Checking orders for shop: ${shop}`);

  try {
    // First, count the orders
    const countResult = await executeSQL(
      'SELECT COUNT(*) as count FROM "Order" WHERE shop = :shop',
      [{ name: 'shop', value: { stringValue: shop } }]
    );

    const orderCount = countResult.records?.[0]?.[0]?.longValue || 0;

    if (orderCount === 0) {
      console.log('✅ No orders found for this shop. Nothing to delete.');
      return;
    }

    console.log(`\n⚠️  Found ${orderCount} orders for ${shop}`);
    console.log('⚠️  This will also delete all related:');
    console.log('   - Order line items');
    console.log('   - Order refunds');
    console.log('   - Store credit ledger entries (cashback)');
    console.log('\n❗ This action CANNOT be undone!');
    console.log('\nStarting deletion in 5 seconds... Press Ctrl+C to cancel.\n');

    // Give user time to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🗑️  Deleting orders and related data...\n');

    // Delete in correct order to respect foreign key constraints

    // 1. Delete order line items
    console.log('   Deleting order line items...');
    const lineItemsResult = await executeSQL(
      'DELETE FROM "OrderLineItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE shop = :shop)',
      [{ name: 'shop', value: { stringValue: shop } }]
    );
    console.log(`   ✓ Deleted ${lineItemsResult.numberOfRecordsUpdated || 0} line items`);

    // 2. Delete order refunds
    console.log('   Deleting order refunds...');
    const refundsResult = await executeSQL(
      'DELETE FROM "OrderRefund" WHERE "orderId" IN (SELECT id FROM "Order" WHERE shop = :shop)',
      [{ name: 'shop', value: { stringValue: shop } }]
    );
    console.log(`   ✓ Deleted ${refundsResult.numberOfRecordsUpdated || 0} refunds`);

    // 3. Delete store credit ledger entries related to orders
    console.log('   Deleting store credit ledger entries...');
    const ledgerResult = await executeSQL(
      'DELETE FROM "StoreCreditLedger" WHERE "orderId" IN (SELECT id FROM "Order" WHERE shop = :shop)',
      [{ name: 'shop', value: { stringValue: shop } }]
    );
    console.log(`   ✓ Deleted ${ledgerResult.numberOfRecordsUpdated || 0} ledger entries`);

    // 4. Finally, delete the orders themselves
    console.log('   Deleting orders...');
    const ordersResult = await executeSQL(
      'DELETE FROM "Order" WHERE shop = :shop',
      [{ name: 'shop', value: { stringValue: shop } }]
    );
    console.log(`   ✓ Deleted ${ordersResult.numberOfRecordsUpdated || 0} orders`);

    console.log('\n✅ Successfully deleted all orders and related data!');
    console.log('✅ You can now test the order sync/import function.');

  } catch (error) {
    console.error('\n❌ Error deleting orders:', error);
    throw error;
  }
}

// Run the script
deleteAllOrders(shopDomain)
  .then(() => {
    console.log('\n✨ Script completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
