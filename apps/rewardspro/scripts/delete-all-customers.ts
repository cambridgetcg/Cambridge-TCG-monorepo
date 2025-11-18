/**
 * Script to delete ALL customers from a shop via Aurora Data API
 * Usage: node --import tsx/esm --env-file=.env scripts/delete-all-customers.ts
 *
 * WARNING: This will delete ALL customers and their related data!
 */

import * as dotenv from 'dotenv';
dotenv.config();

import db from '../app/db.server';

const SHOP = 'themetester222.myshopify.com';

async function deleteAllCustomers() {
  console.log('⚠️  WARNING: This will delete ALL customers from the shop!');
  console.log('🔄 Starting customer deletion...');
  console.log(`📍 Shop: ${SHOP}`);

  try {
    // Get all customers for this shop
    const customers = await db.customer.findMany({
      where: { shop: SHOP },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (customers.length === 0) {
      console.log('✅ No customers found to delete.');
      return;
    }

    console.log(`\n📋 Found ${customers.length} customer(s) to delete`);

    const customerIds = customers.map(c => c.id);

    // Delete related records first (foreign key constraints)
    console.log('\n🗑️  Deleting related records...');

    // 1. Delete store credit ledger entries
    let deletedLedgers = 0;
    for (const customerId of customerIds) {
      const ledgers = await db.storeCreditLedger.findMany({
        where: { customerId: customerId, shop: SHOP }
      });
      for (const ledger of ledgers) {
        await db.storeCreditLedger.delete({ where: { id: ledger.id } });
        deletedLedgers++;
      }
    }
    console.log(`  ✅ Deleted ${deletedLedgers} ledger entries`);

    // 2. Delete tier change logs
    let deletedTierChanges = 0;
    for (const customerId of customerIds) {
      const tierChanges = await db.tierChangeLog.findMany({
        where: { customerId: customerId }
      });
      for (const change of tierChanges) {
        await db.tierChangeLog.delete({ where: { id: change.id } });
        deletedTierChanges++;
      }
    }
    console.log(`  ✅ Deleted ${deletedTierChanges} tier change logs`);

    // 3. Delete tier purchases
    let deletedTierPurchases = 0;
    for (const customerId of customerIds) {
      const purchases = await db.tierPurchase.findMany({
        where: { customerId: customerId }
      });
      for (const purchase of purchases) {
        await db.tierPurchase.delete({ where: { id: purchase.id } });
        deletedTierPurchases++;
      }
    }
    console.log(`  ✅ Deleted ${deletedTierPurchases} tier purchases`);

    // 4. Delete tier subscriptions
    let deletedSubscriptions = 0;
    for (const customerId of customerIds) {
      const subscriptions = await db.tierSubscription.findMany({
        where: { customerId: customerId }
      });
      for (const subscription of subscriptions) {
        await db.tierSubscription.delete({ where: { id: subscription.id } });
        deletedSubscriptions++;
      }
    }
    console.log(`  ✅ Deleted ${deletedSubscriptions} tier subscriptions`);

    // 5. Delete subscription events
    let deletedEvents = 0;
    for (const customerId of customerIds) {
      const events = await db.subscriptionEvent.findMany({
        where: { customerId: customerId }
      });
      for (const event of events) {
        await db.subscriptionEvent.delete({ where: { id: event.id } });
        deletedEvents++;
      }
    }
    console.log(`  ✅ Deleted ${deletedEvents} subscription events`);

    // 6. Delete order refunds for orders belonging to these customers
    let deletedRefunds = 0;
    for (const customerId of customerIds) {
      const orders = await db.order.findMany({
        where: { customerId: customerId, shop: SHOP },
        select: { id: true }
      });

      for (const order of orders) {
        const refunds = await db.orderRefund.findMany({
          where: { orderId: order.id }
        });
        for (const refund of refunds) {
          await db.orderRefund.delete({ where: { id: refund.id } });
          deletedRefunds++;
        }
      }
    }
    console.log(`  ✅ Deleted ${deletedRefunds} order refunds`);

    // 7. Delete orders
    let deletedOrders = 0;
    for (const customerId of customerIds) {
      const orders = await db.order.findMany({
        where: { customerId: customerId, shop: SHOP }
      });
      for (const order of orders) {
        await db.order.delete({ where: { id: order.id } });
        deletedOrders++;
      }
    }
    console.log(`  ✅ Deleted ${deletedOrders} orders`);

    // Finally, delete customers
    console.log('\n🗑️  Deleting customers...');
    let deletedCustomers = 0;
    for (const customer of customers) {
      await db.customer.delete({ where: { id: customer.id } });
      deletedCustomers++;
      if (deletedCustomers % 10 === 0) {
        console.log(`  Progress: ${deletedCustomers}/${customers.length} customers deleted...`);
      }
    }
    console.log(`✅ Deleted ${deletedCustomers} customer(s)`);

    console.log('\n🎉 All customers and related data deleted successfully!');
    console.log('\n📊 Summary:');
    console.log(`  - Customers: ${deletedCustomers}`);
    console.log(`  - Ledger entries: ${deletedLedgers}`);
    console.log(`  - Tier changes: ${deletedTierChanges}`);
    console.log(`  - Tier purchases: ${deletedTierPurchases}`);
    console.log(`  - Subscriptions: ${deletedSubscriptions}`);
    console.log(`  - Events: ${deletedEvents}`);
    console.log(`  - Orders: ${deletedOrders}`);
    console.log(`  - Refunds: ${deletedRefunds}`);

  } catch (error) {
    console.error('\n❌ Error deleting customers:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Run the script
deleteAllCustomers()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
