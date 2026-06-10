/**
 * Script to add a mock customer to the database via Aurora Data API
 * Usage: npm run db:mock-customer
 *
 * Requires: DATABASE_URL environment variable
 */

import * as dotenv from 'dotenv';
dotenv.config();

import db from '../app/db.server';
import { randomUUID } from 'crypto';

const SHOP = 'themetester222.myshopify.com';

async function addMockCustomer() {
  console.log('🔄 Starting mock customer creation...');
  console.log(`📍 Shop: ${SHOP}`);

  try {
    // Get the first tier for this shop to assign the customer
    const tier = await db.tier.findFirst({
      where: { shop: SHOP },
      orderBy: { minSpend: 'asc' }
    });

    if (!tier) {
      console.error('❌ No tiers found for this shop. Please create tiers first.');
      return;
    }

    console.log(`✅ Found tier: ${tier.name} (ID: ${tier.id})`);

    // Generate a unique Shopify Customer ID
    const shopifyCustomerId = `gid://shopify/Customer/${Math.floor(Math.random() * 1000000000000)}`;
    const customerId = randomUUID();

    // Create mock customer with all fields populated
    // Note: Aurora Data API requires explicit timestamps (doesn't auto-handle @updatedAt)
    const now = new Date();
    const mockCustomer = await db.customer.create({
      data: {
        id: customerId,
        shop: SHOP,
        shopifyCustomerId: shopifyCustomerId,

        // Contact information
        email: `mock.customer.${Date.now()}@example.com`,
        firstName: 'John',
        lastName: 'Doe',
        tags: 'vip, mock-data, test-customer',

        // Credits and points
        storeCredit: 25.50,
        pointsBalance: 150.00,
        lifetimePoints: 500.00,

        // Spending tracking
        totalSpent: 850.00,
        annualSpent: 650.00,
        totalCashbackEarned: 42.50,
        totalRefunded: 50.00,
        netSpent: 800.00,
        orderCount: 8,
        lastOrderDate: new Date('2025-11-10T14:30:00Z'),

        // Tier relationship
        currentTierId: tier.id,

        // Subscription fields
        hasActiveSubscription: false,
        subscriptionTier: null,

        // Metafield ID (optional, for storefront auth)
        shopifyCustomerMetafieldId: null,

        // Timestamps (required for Aurora Data API)
        createdAt: now,
        updatedAt: now,
      }
    });

    console.log('\n✅ Mock customer created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 Email: ${mockCustomer.email}`);
    console.log(`👤 Name: ${mockCustomer.firstName} ${mockCustomer.lastName}`);
    console.log(`🆔 Customer ID: ${mockCustomer.id}`);
    console.log(`🛍️ Shopify ID: ${mockCustomer.shopifyCustomerId}`);
    console.log(`💰 Store Credit: $${mockCustomer.storeCredit}`);
    console.log(`⭐ Points Balance: ${mockCustomer.pointsBalance}`);
    console.log(`💵 Total Spent: $${mockCustomer.totalSpent}`);
    console.log(`📊 Cashback Earned: $${mockCustomer.totalCashbackEarned}`);
    console.log(`🛒 Order Count: ${mockCustomer.orderCount}`);
    console.log(`🏆 Tier: ${tier.name}`);
    console.log(`🏷️ Tags: ${mockCustomer.tags}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Optionally create some store credit ledger entries
    console.log('\n🔄 Creating store credit ledger entries...');

    const ledgerEntries = [
      {
        id: randomUUID(),
        customerId: customerId,
        shop: SHOP,
        amount: 15.00,
        balance: 15.00,
        type: 'CASHBACK_EARNED' as const,
        metadata: { description: 'Cashback from order #1001' },
        shopifyOrderId: null,
        orderId: null,
      },
      {
        id: randomUUID(),
        customerId: customerId,
        shop: SHOP,
        amount: 12.50,
        balance: 27.50,
        type: 'CASHBACK_EARNED' as const,
        metadata: { description: 'Cashback from order #1002' },
        shopifyOrderId: null,
        orderId: null,
      },
      {
        id: randomUUID(),
        customerId: customerId,
        shop: SHOP,
        amount: -2.00,
        balance: 25.50,
        type: 'ORDER_PAYMENT' as const,
        metadata: { description: 'Applied credit to order #1003' },
        shopifyOrderId: null,
        orderId: null,
      },
    ];

    // Create ledger entries individually (Aurora Data API doesn't support createMany)
    for (const entry of ledgerEntries) {
      await db.storeCreditLedger.create({
        data: entry
      });
    }

    console.log(`✅ Created ${ledgerEntries.length} ledger entries`);
    console.log('\n🎉 All done! Mock customer and transaction history created.');

  } catch (error) {
    console.error('\n❌ Error creating mock customer:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Run the script
addMockCustomer()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
