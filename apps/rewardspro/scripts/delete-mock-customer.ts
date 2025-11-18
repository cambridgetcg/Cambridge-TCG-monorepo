/**
 * Script to delete mock customers from the database via Aurora Data API
 * Usage: npx tsx scripts/delete-mock-customer.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import db from '../app/db.server';

const SHOP = 'themetester222.myshopify.com';

async function deleteMockCustomers() {
  console.log('🔄 Starting mock customer deletion...');
  console.log(`📍 Shop: ${SHOP}`);

  try {
    // Find all mock customers (by email pattern)
    // Note: Aurora Data API has limited support for some Prisma filters
    const allCustomers = await db.customer.findMany({
      where: { shop: SHOP },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        tags: true
      }
    });

    // Filter in-memory for mock customers
    const mockCustomers = allCustomers.filter(c =>
      c.email?.includes('mock.customer') ||
      c.tags?.includes('mock-data')
    );

    if (mockCustomers.length === 0) {
      console.log('✅ No mock customers found to delete.');
      return;
    }

    console.log(`\n📋 Found ${mockCustomers.length} mock customer(s):`);
    mockCustomers.forEach(c => {
      console.log(`  - ${c.firstName} ${c.lastName} (${c.email})`);
    });

    const customerIds = mockCustomers.map(c => c.id);

    // Delete ledger entries first (foreign key constraint)
    console.log('\n🗑️  Deleting store credit ledger entries...');
    let deletedLedgersCount = 0;
    for (const customerId of customerIds) {
      const ledgers = await db.storeCreditLedger.findMany({
        where: {
          customerId: customerId,
          shop: SHOP
        }
      });

      for (const ledger of ledgers) {
        await db.storeCreditLedger.delete({
          where: { id: ledger.id }
        });
        deletedLedgersCount++;
      }
    }
    console.log(`✅ Deleted ${deletedLedgersCount} ledger entries`);

    // Delete customers individually (Aurora Data API limitation)
    console.log('🗑️  Deleting customers...');
    let deletedCustomersCount = 0;
    for (const customer of mockCustomers) {
      await db.customer.delete({
        where: { id: customer.id }
      });
      deletedCustomersCount++;
    }
    console.log(`✅ Deleted ${deletedCustomersCount} customer(s)`);

    console.log('\n🎉 Mock customer cleanup completed!');

  } catch (error) {
    console.error('\n❌ Error deleting mock customers:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Run the script
deleteMockCustomers()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
