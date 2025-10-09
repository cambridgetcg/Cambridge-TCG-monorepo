/**
 * Delete All Customers for a Shop
 *
 * This script safely removes all customers and related data for a specific shop
 * from the database using AWS Aurora Data API.
 *
 * USAGE:
 *   npx tsx scripts/delete-shop-customers.ts <shop-domain>
 *
 * EXAMPLE:
 *   npx tsx scripts/delete-shop-customers.ts mystore.myshopify.com
 *
 * WARNING: This is a DESTRUCTIVE operation that cannot be undone!
 * All customer data, store credit ledger entries, tier change logs,
 * subscriptions, and related records will be permanently deleted.
 */

import 'dotenv/config';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import * as readline from 'readline';

// ============================================
// CONFIGURATION
// ============================================

const REQUIRED_ENV_VARS = [
  'AURORA_RESOURCE_ARN',
  'AURORA_SECRET_ARN',
  'AURORA_DATABASE_NAME',
  'AWS_REGION',
];

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

async function executeQuery(sql: string, parameters: any[] = []): Promise<any> {
  const command = new ExecuteStatementCommand({
    ...databaseConfig,
    sql,
    parameters,
  });

  try {
    const response = await client.send(command);
    return response;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
}

async function getCustomerCount(shop: string): Promise<number> {
  const result = await executeQuery(
    'SELECT COUNT(*) as count FROM "Customer" WHERE shop = :shop',
    [{ name: 'shop', value: { stringValue: shop } }]
  );

  const count = result.records?.[0]?.[0]?.longValue ?? 0;
  return Number(count);
}

async function getRelatedCounts(shop: string): Promise<{
  storeCreditLedger: number;
  tierChangeLogs: number;
  tierSubscriptions: number;
  tierPurchases: number;
  orders: number;
  subscriptions: number;
  subscriptionEvents: number;
}> {
  const counts = {
    storeCreditLedger: 0,
    tierChangeLogs: 0,
    tierSubscriptions: 0,
    tierPurchases: 0,
    orders: 0,
    subscriptions: 0,
    subscriptionEvents: 0,
  };

  try {
    // Get customer IDs first
    const customerIdsResult = await executeQuery(
      'SELECT id FROM "Customer" WHERE shop = :shop',
      [{ name: 'shop', value: { stringValue: shop } }]
    );

    if (!customerIdsResult.records || customerIdsResult.records.length === 0) {
      return counts;
    }

    const customerIds = customerIdsResult.records.map((r: any) => r[0].stringValue);

    // Count related records
    const countQueries = [
      { key: 'storeCreditLedger', table: 'StoreCreditLedger', field: 'customerId' },
      { key: 'tierChangeLogs', table: 'TierChangeLog', field: 'customerId' },
      { key: 'tierSubscriptions', table: 'TierSubscription', field: 'customerId' },
      { key: 'tierPurchases', table: 'TierPurchase', field: 'customerId' },
      { key: 'orders', table: 'Order', field: 'customerId' },
      { key: 'subscriptions', table: 'Subscription', field: 'customerId' },
      { key: 'subscriptionEvents', table: 'SubscriptionEvent', field: 'customerId' },
    ];

    for (const query of countQueries) {
      const result = await executeQuery(
        `SELECT COUNT(*) as count FROM "${query.table}" WHERE "${query.field}" IN (${customerIds.map((_, i) => `:id${i}`).join(', ')})`,
        customerIds.map((id, i) => ({ name: `id${i}`, value: { stringValue: id } }))
      );
      counts[query.key as keyof typeof counts] = Number(result.records?.[0]?.[0]?.longValue ?? 0);
    }
  } catch (error) {
    console.error('⚠️  Warning: Could not count related records:', error);
  }

  return counts;
}

async function deleteCustomers(shop: string): Promise<{
  customersDeleted: number;
  relatedRecordsDeleted: {
    storeCreditLedger: number;
    tierChangeLogs: number;
    tierSubscriptions: number;
    tierPurchases: number;
    orders: number;
    subscriptions: number;
    subscriptionEvents: number;
  };
}> {
  console.log('\n🗑️  Deleting customers and related data...');

  const relatedRecordsDeleted = {
    storeCreditLedger: 0,
    tierChangeLogs: 0,
    tierSubscriptions: 0,
    tierPurchases: 0,
    orders: 0,
    subscriptions: 0,
    subscriptionEvents: 0,
  };

  // Get customer IDs
  const customerIdsResult = await executeQuery(
    'SELECT id FROM "Customer" WHERE shop = :shop',
    [{ name: 'shop', value: { stringValue: shop } }]
  );

  if (!customerIdsResult.records || customerIdsResult.records.length === 0) {
    console.log('✅ No customers found to delete');
    return { customersDeleted: 0, relatedRecordsDeleted };
  }

  const customerIds = customerIdsResult.records.map((r: any) => r[0].stringValue);
  const customerIdParams = customerIds.map((id, i) => ({ name: `id${i}`, value: { stringValue: id } }));
  const customerIdPlaceholders = customerIds.map((_, i) => `:id${i}`).join(', ');

  // Delete in correct order (respecting foreign key constraints)

  // 1. Delete SubscriptionEvents (references customer)
  const subscriptionEventsResult = await executeQuery(
    `DELETE FROM "SubscriptionEvent" WHERE "customerId" IN (${customerIdPlaceholders})`,
    customerIdParams
  );
  relatedRecordsDeleted.subscriptionEvents = Number(subscriptionEventsResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${relatedRecordsDeleted.subscriptionEvents} subscription events`);

  // 2. Delete Subscriptions (app-level subscriptions)
  const subscriptionsResult = await executeQuery(
    `DELETE FROM "Subscription" WHERE "customerId" IN (${customerIdPlaceholders})`,
    customerIdParams
  );
  relatedRecordsDeleted.subscriptions = Number(subscriptionsResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${relatedRecordsDeleted.subscriptions} subscriptions`);

  // 3. Delete TierSubscriptions (tier subscriptions)
  const tierSubscriptionsResult = await executeQuery(
    `DELETE FROM "TierSubscription" WHERE "customerId" IN (${customerIdPlaceholders})`,
    customerIdParams
  );
  relatedRecordsDeleted.tierSubscriptions = Number(tierSubscriptionsResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${relatedRecordsDeleted.tierSubscriptions} tier subscriptions`);

  // 4. Delete TierPurchases
  const tierPurchasesResult = await executeQuery(
    `DELETE FROM "TierPurchase" WHERE "customerId" IN (${customerIdPlaceholders})`,
    customerIdParams
  );
  relatedRecordsDeleted.tierPurchases = Number(tierPurchasesResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${relatedRecordsDeleted.tierPurchases} tier purchases`);

  // 5. Delete TierChangeLogs
  const tierChangeLogsResult = await executeQuery(
    `DELETE FROM "TierChangeLog" WHERE "customerId" IN (${customerIdPlaceholders})`,
    customerIdParams
  );
  relatedRecordsDeleted.tierChangeLogs = Number(tierChangeLogsResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${relatedRecordsDeleted.tierChangeLogs} tier change logs`);

  // 6. Delete OrderRefundLineItems first (child of OrderRefund)
  await executeQuery(
    `DELETE FROM "OrderRefundLineItem" WHERE "refundId" IN (
      SELECT r.id FROM "OrderRefund" r
      JOIN "Order" o ON r."orderId" = o.id
      WHERE o."customerId" IN (${customerIdPlaceholders})
    )`,
    customerIdParams
  );

  // 7. Delete OrderRefunds (child of Order)
  await executeQuery(
    `DELETE FROM "OrderRefund" WHERE "orderId" IN (
      SELECT id FROM "Order" WHERE "customerId" IN (${customerIdPlaceholders})
    )`,
    customerIdParams
  );

  // 8. Delete OrderLineItems (child of Order)
  await executeQuery(
    `DELETE FROM "OrderLineItem" WHERE "orderId" IN (
      SELECT id FROM "Order" WHERE "customerId" IN (${customerIdPlaceholders})
    )`,
    customerIdParams
  );

  // 9. Delete StoreCreditLedger entries
  const storeCreditResult = await executeQuery(
    `DELETE FROM "StoreCreditLedger" WHERE "customerId" IN (${customerIdPlaceholders})`,
    customerIdParams
  );
  relatedRecordsDeleted.storeCreditLedger = Number(storeCreditResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${relatedRecordsDeleted.storeCreditLedger} store credit ledger entries`);

  // 10. Delete Orders
  const ordersResult = await executeQuery(
    `DELETE FROM "Order" WHERE "customerId" IN (${customerIdPlaceholders})`,
    customerIdParams
  );
  relatedRecordsDeleted.orders = Number(ordersResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${relatedRecordsDeleted.orders} orders`);

  // 11. Finally, delete Customers
  const customersResult = await executeQuery(
    'DELETE FROM "Customer" WHERE shop = :shop',
    [{ name: 'shop', value: { stringValue: shop } }]
  );
  const customersDeleted = Number(customersResult.numberOfRecordsUpdated ?? 0);
  console.log(`   ✓ Deleted ${customersDeleted} customers`);

  return { customersDeleted, relatedRecordsDeleted };
}

// ============================================
// MAIN SCRIPT
// ============================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     DELETE ALL CUSTOMERS FOR SHOP - Data API Script      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Validate environment
  validateEnvironment();

  // Get shop domain from command line
  const shop = process.argv[2];

  if (!shop) {
    console.error('❌ Error: Shop domain is required\n');
    console.log('Usage:');
    console.log('  npx tsx scripts/delete-shop-customers.ts <shop-domain>\n');
    console.log('Example:');
    console.log('  npx tsx scripts/delete-shop-customers.ts mystore.myshopify.com\n');
    process.exit(1);
  }

  // Validate shop domain format
  if (!shop.includes('.myshopify.com')) {
    console.error('❌ Error: Shop domain must be in format: yourstore.myshopify.com\n');
    process.exit(1);
  }

  console.log(`🏪 Shop: ${shop}`);
  console.log(`🌐 Region: ${process.env.AWS_REGION}`);
  console.log(`💾 Database: ${process.env.AURORA_DATABASE_NAME}\n`);

  try {
    // Get current counts
    console.log('📊 Fetching current data...');
    const customerCount = await getCustomerCount(shop);

    if (customerCount === 0) {
      console.log('\n✅ No customers found for this shop. Nothing to delete.\n');
      process.exit(0);
    }

    console.log(`   Found ${customerCount} customers`);

    // Get related record counts
    const relatedCounts = await getRelatedCounts(shop);
    console.log(`   Related records:`);
    console.log(`   - Store Credit Ledger: ${relatedCounts.storeCreditLedger}`);
    console.log(`   - Tier Change Logs: ${relatedCounts.tierChangeLogs}`);
    console.log(`   - Tier Subscriptions: ${relatedCounts.tierSubscriptions}`);
    console.log(`   - Tier Purchases: ${relatedCounts.tierPurchases}`);
    console.log(`   - Orders: ${relatedCounts.orders}`);
    console.log(`   - Subscriptions: ${relatedCounts.subscriptions}`);
    console.log(`   - Subscription Events: ${relatedCounts.subscriptionEvents}`);

    const totalRecords = customerCount +
      relatedCounts.storeCreditLedger +
      relatedCounts.tierChangeLogs +
      relatedCounts.tierSubscriptions +
      relatedCounts.tierPurchases +
      relatedCounts.orders +
      relatedCounts.subscriptions +
      relatedCounts.subscriptionEvents;

    console.log(`\n⚠️  WARNING: This will delete ${totalRecords} total records!`);
    console.log('⚠️  This operation CANNOT be undone!\n');

    // Confirmation prompt
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(`Type the shop domain '${shop}' to confirm deletion: `, resolve);
    });
    rl.close();

    if (answer.trim() !== shop) {
      console.log('\n❌ Deletion cancelled. Shop domain did not match.\n');
      process.exit(0);
    }

    // Perform deletion
    const startTime = Date.now();
    const result = await deleteCustomers(shop);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    DELETION SUMMARY                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    console.log(`✅ Successfully deleted data for shop: ${shop}`);
    console.log(`   Duration: ${duration}s\n`);
    console.log('Records deleted:');
    console.log(`   - Customers: ${result.customersDeleted}`);
    console.log(`   - Store Credit Ledger: ${result.relatedRecordsDeleted.storeCreditLedger}`);
    console.log(`   - Tier Change Logs: ${result.relatedRecordsDeleted.tierChangeLogs}`);
    console.log(`   - Tier Subscriptions: ${result.relatedRecordsDeleted.tierSubscriptions}`);
    console.log(`   - Tier Purchases: ${result.relatedRecordsDeleted.tierPurchases}`);
    console.log(`   - Orders: ${result.relatedRecordsDeleted.orders}`);
    console.log(`   - Subscriptions: ${result.relatedRecordsDeleted.subscriptions}`);
    console.log(`   - Subscription Events: ${result.relatedRecordsDeleted.subscriptionEvents}\n`);

    const totalDeleted = result.customersDeleted +
      result.relatedRecordsDeleted.storeCreditLedger +
      result.relatedRecordsDeleted.tierChangeLogs +
      result.relatedRecordsDeleted.tierSubscriptions +
      result.relatedRecordsDeleted.tierPurchases +
      result.relatedRecordsDeleted.orders +
      result.relatedRecordsDeleted.subscriptions +
      result.relatedRecordsDeleted.subscriptionEvents;

    console.log(`📊 Total records deleted: ${totalDeleted}\n`);

  } catch (error) {
    console.error('\n❌ Error during deletion:', error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
