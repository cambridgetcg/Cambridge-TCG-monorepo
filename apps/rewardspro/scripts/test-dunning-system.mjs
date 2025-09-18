#!/usr/bin/env node

/**
 * Test script for the Dunning Management System
 * 
 * This script simulates payment failures and tests the retry logic
 * without requiring actual Shopify webhook calls.
 * 
 * Usage: node scripts/test-dunning-system.mjs
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Test configuration
const TEST_SHOP = 'test-shop.myshopify.com';
const TEST_CONTRACT_ID = 'gid://shopify/SubscriptionContract/TEST123';
const TEST_CUSTOMER_ID = 'test-customer-001';

/**
 * Create test subscription data
 */
async function createTestSubscription() {
  console.log('🔧 Creating test subscription...\n');
  
  // Create or update test customer
  const customer = await prisma.customer.upsert({
    where: {
      shop_shopifyCustomerId: {
        shop: TEST_SHOP,
        shopifyCustomerId: TEST_CUSTOMER_ID
      }
    },
    update: {},
    create: {
      shop: TEST_SHOP,
      shopifyCustomerId: TEST_CUSTOMER_ID,
      email: 'test@example.com',
      storeCredit: 0,
      totalSpent: 100,
      orderCount: 1,
      createdAt: new Date()
    }
  });

  // Create test tier
  const tier = await prisma.tier.upsert({
    where: {
      shop_name: {
        shop: TEST_SHOP,
        name: 'Gold'
      }
    },
    update: {},
    create: {
      shop: TEST_SHOP,
      name: 'Gold',
      minSpend: 100,
      cashbackPercent: 5,
      evaluationPeriod: 'ANNUAL',
      createdAt: new Date()
    }
  });

  // Create test subscription
  const subscription = await prisma.tierSubscription.upsert({
    where: {
      subscriptionContractId: TEST_CONTRACT_ID
    },
    update: {
      status: 'ACTIVE',
      failedPaymentCount: 0
    },
    create: {
      shop: TEST_SHOP,
      customerId: customer.id,
      tierId: tier.id,
      subscriptionContractId: TEST_CONTRACT_ID,
      sellingPlanId: 'test-selling-plan',
      sellingPlanGroupId: 'test-group',
      productVariantId: 'test-variant',
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      deliveryInterval: 'MONTHLY',
      basePrice: 29.99,
      discountPercentage: 10,
      finalPrice: 26.99,
      currency: 'USD',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date()
    }
  });

  console.log('✅ Test subscription created:');
  console.log(`   - Customer: ${customer.email}`);
  console.log(`   - Tier: ${tier.name}`);
  console.log(`   - Contract ID: ${TEST_CONTRACT_ID}`);
  console.log(`   - Status: ${subscription.status}\n`);

  return { customer, tier, subscription };
}

/**
 * Simulate a payment failure
 */
async function simulatePaymentFailure(attemptNumber = 1) {
  console.log(`🔴 Simulating payment failure (attempt ${attemptNumber})...\n`);

  // Create a retry record
  const retryDate = new Date();
  const daysToAdd = attemptNumber === 1 ? 1 : attemptNumber === 2 ? 3 : 7;
  retryDate.setDate(retryDate.getDate() + daysToAdd);

  const retry = await prisma.subscriptionRetry.create({
    data: {
      shop: TEST_SHOP,
      contractId: TEST_CONTRACT_ID,
      attemptNumber,
      scheduledFor: retryDate,
      status: 'PENDING',
      errorCode: 'PAYMENT_METHOD_DECLINED',
      errorMessage: 'Test payment failure',
      billingAmount: 26.99,
      createdAt: new Date()
    }
  });

  // Update subscription failure count
  await prisma.tierSubscription.update({
    where: {
      subscriptionContractId: TEST_CONTRACT_ID
    },
    data: {
      failedPaymentCount: attemptNumber,
      lastPaymentFailure: new Date()
    }
  });

  // Create event log
  await prisma.subscriptionEvent.create({
    data: {
      shop: TEST_SHOP,
      contractId: TEST_CONTRACT_ID,
      eventType: 'PAYMENT_FAILED',
      eventData: {
        attemptNumber,
        errorCode: 'PAYMENT_METHOD_DECLINED',
        retryScheduledFor: retryDate.toISOString()
      },
      createdAt: new Date()
    }
  });

  console.log('✅ Payment failure simulated:');
  console.log(`   - Attempt: ${attemptNumber}`);
  console.log(`   - Retry scheduled for: ${retryDate.toLocaleDateString()}`);
  console.log(`   - Days until retry: ${daysToAdd}\n`);

  return retry;
}

/**
 * Process scheduled retries
 */
async function processScheduledRetries() {
  console.log('⏰ Processing scheduled retries...\n');

  const pendingRetries = await prisma.subscriptionRetry.findMany({
    where: {
      shop: TEST_SHOP,
      status: 'PENDING',
      scheduledFor: { lte: new Date() }
    }
  });

  console.log(`Found ${pendingRetries.length} pending retries\n`);

  for (const retry of pendingRetries) {
    console.log(`Processing retry ${retry.attemptNumber}...`);
    
    // Simulate processing
    await prisma.subscriptionRetry.update({
      where: { id: retry.id },
      data: {
        status: 'PROCESSING',
        updatedAt: new Date()
      }
    });

    // Simulate success/failure (50% chance)
    const success = Math.random() > 0.5;

    if (success) {
      await prisma.subscriptionRetry.update({
        where: { id: retry.id },
        data: {
          status: 'SUCCESS',
          executedAt: new Date()
        }
      });

      // Reset subscription failure count
      await prisma.tierSubscription.update({
        where: {
          subscriptionContractId: TEST_CONTRACT_ID
        },
        data: {
          failedPaymentCount: 0,
          status: 'ACTIVE'
        }
      });

      console.log(`   ✅ Retry ${retry.attemptNumber} successful\n`);
    } else {
      await prisma.subscriptionRetry.update({
        where: { id: retry.id },
        data: {
          status: 'FAILED',
          executedAt: new Date(),
          errorMessage: 'Payment method still declined'
        }
      });

      console.log(`   ❌ Retry ${retry.attemptNumber} failed\n`);
      
      // Simulate next failure if not at max
      if (retry.attemptNumber < 3) {
        await simulatePaymentFailure(retry.attemptNumber + 1);
      } else {
        // Max retries reached - pause subscription
        await prisma.tierSubscription.update({
          where: {
            subscriptionContractId: TEST_CONTRACT_ID
          },
          data: {
            status: 'PAUSED',
            pausedAt: new Date(),
            pauseReason: 'Max payment retries exceeded'
          }
        });

        console.log('   ⏸️ Subscription paused (max retries exceeded)\n');
      }
    }
  }
}

/**
 * View retry history
 */
async function viewRetryHistory() {
  console.log('📊 Retry History:\n');

  const retries = await prisma.subscriptionRetry.findMany({
    where: {
      shop: TEST_SHOP,
      contractId: TEST_CONTRACT_ID
    },
    orderBy: { createdAt: 'desc' }
  });

  for (const retry of retries) {
    console.log(`Attempt ${retry.attemptNumber}:`);
    console.log(`   - Status: ${retry.status}`);
    console.log(`   - Scheduled: ${retry.scheduledFor.toLocaleDateString()}`);
    console.log(`   - Executed: ${retry.executedAt?.toLocaleDateString() || 'Pending'}`);
    console.log(`   - Error: ${retry.errorMessage || 'N/A'}`);
    console.log('');
  }
}

/**
 * View subscription events
 */
async function viewEvents() {
  console.log('📋 Subscription Events:\n');

  const events = await prisma.subscriptionEvent.findMany({
    where: {
      shop: TEST_SHOP,
      contractId: TEST_CONTRACT_ID
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  for (const event of events) {
    console.log(`${event.eventType}:`);
    console.log(`   - Date: ${event.createdAt.toLocaleString()}`);
    if (event.eventData) {
      console.log(`   - Data: ${JSON.stringify(event.eventData, null, 2)}`);
    }
    console.log('');
  }
}

/**
 * Clean up test data
 */
async function cleanup() {
  console.log('🧹 Cleaning up test data...\n');

  // Delete in order to respect foreign keys
  await prisma.subscriptionEvent.deleteMany({
    where: { shop: TEST_SHOP }
  });

  await prisma.subscriptionRetry.deleteMany({
    where: { shop: TEST_SHOP }
  });

  await prisma.subscriptionBillingAttempt.deleteMany({
    where: { shop: TEST_SHOP }
  });

  await prisma.tierSubscription.deleteMany({
    where: { shop: TEST_SHOP }
  });

  await prisma.tier.deleteMany({
    where: { shop: TEST_SHOP }
  });

  await prisma.customer.deleteMany({
    where: { shop: TEST_SHOP }
  });

  console.log('✅ Test data cleaned up\n');
}

/**
 * Main test flow
 */
async function main() {
  console.log('=====================================');
  console.log('  Dunning Management System Test');
  console.log('=====================================\n');

  try {
    // Create test data
    await createTestSubscription();

    // Simulate payment failure
    await simulatePaymentFailure(1);

    // Process retries
    await processScheduledRetries();

    // View history
    await viewRetryHistory();
    await viewEvents();

    // Ask if cleanup is wanted
    console.log('Test completed!\n');
    console.log('Run with --cleanup flag to remove test data\n');

    if (process.argv.includes('--cleanup')) {
      await cleanup();
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
main();