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

import 'dotenv/config';
import { query, execute, param } from './lib/db.mjs';

// Get shop domain from command line
const shopDomain = process.argv[2];

if (!shopDomain) {
  console.error('Usage: npx tsx scripts/delete-all-orders.ts <shop-domain>');
  console.error('Example: npx tsx scripts/delete-all-orders.ts my-store.myshopify.com');
  process.exit(1);
}

if (!shopDomain.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
  console.error('Invalid shop domain format. Must be: your-store.myshopify.com');
  process.exit(1);
}

async function deleteAllOrders(shop: string) {
  console.log(`\nChecking orders for shop: ${shop}`);

  try {
    const rows = await query(
      'SELECT COUNT(*) as count FROM "Order" WHERE shop = :shop',
      [param('shop', shop)]
    );

    const orderCount = (rows as any)[0]?.count || 0;

    if (orderCount === 0) {
      console.log('No orders found for this shop. Nothing to delete.');
      return;
    }

    console.log(`\nFound ${orderCount} orders for ${shop}`);
    console.log('This will also delete all related:');
    console.log('   - Order line items');
    console.log('   - Order refunds');
    console.log('   - Store credit ledger entries (cashback)');
    console.log('\nThis action CANNOT be undone!');
    console.log('\nStarting deletion in 5 seconds... Press Ctrl+C to cancel.\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Deleting orders and related data...\n');

    // Delete in correct order to respect foreign key constraints

    // 1. Delete order line items
    console.log('   Deleting order line items...');
    const lineItemsResult = await execute(
      'DELETE FROM "OrderLineItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE shop = :shop)',
      [param('shop', shop)]
    );
    console.log(`   Deleted ${(lineItemsResult as any).numberOfRecordsUpdated || 0} line items`);

    // 2. Delete order refunds
    console.log('   Deleting order refunds...');
    const refundsResult = await execute(
      'DELETE FROM "OrderRefund" WHERE "orderId" IN (SELECT id FROM "Order" WHERE shop = :shop)',
      [param('shop', shop)]
    );
    console.log(`   Deleted ${(refundsResult as any).numberOfRecordsUpdated || 0} refunds`);

    // 3. Delete store credit ledger entries related to orders
    console.log('   Deleting store credit ledger entries...');
    const ledgerResult = await execute(
      'DELETE FROM "StoreCreditLedger" WHERE "orderId" IN (SELECT id FROM "Order" WHERE shop = :shop)',
      [param('shop', shop)]
    );
    console.log(`   Deleted ${(ledgerResult as any).numberOfRecordsUpdated || 0} ledger entries`);

    // 4. Finally, delete the orders themselves
    console.log('   Deleting orders...');
    const ordersResult = await execute(
      'DELETE FROM "Order" WHERE shop = :shop',
      [param('shop', shop)]
    );
    console.log(`   Deleted ${(ordersResult as any).numberOfRecordsUpdated || 0} orders`);

    console.log('\nSuccessfully deleted all orders and related data!');

  } catch (error) {
    console.error('\nError deleting orders:', error);
    throw error;
  }
}

deleteAllOrders(shopDomain)
  .then(() => {
    console.log('\nScript completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
