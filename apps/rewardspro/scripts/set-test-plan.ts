/**
 * Script to manually set a test plan in the database
 * Usage: npx tsx scripts/set-test-plan.ts
 */

import { db } from '../app/db.server';

async function setTestPlan() {
  const shop = 'teststore12062025.myshopify.com';
  const planName = 'RewardsPro Pro'; // Change this to test different plans

  console.log(`Setting ${shop} to plan: ${planName}`);

  try {
    // Update ShopSettings
    await db.shopSettings.update({
      where: { shop },
      data: {
        currentPlan: planName,
        billingStatus: 'ACTIVE',
        updatedAt: new Date()
      }
    });

    console.log('✅ ShopSettings updated');

    // Update or create BillingSubscription
    await db.billingSubscription.upsert({
      where: { shop },
      create: {
        id: crypto.randomUUID(),
        shop,
        subscriptionId: `test-subscription-${Date.now()}`,
        planName,
        status: 'ACTIVE',
        isTest: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      update: {
        planName,
        status: 'ACTIVE',
        isTest: true,
        updatedAt: new Date()
      }
    });

    console.log('✅ BillingSubscription updated');

    // Verify the change
    const settings = await db.shopSettings.findUnique({
      where: { shop },
      select: { currentPlan: true, billingStatus: true }
    });

    console.log('\nCurrent Settings:');
    console.log(settings);

    console.log('\n✅ Done! Reload your app to see the changes.');
    console.log('The getPlanDetails logs should now show:');
    console.log(`  - Selected Plan Name: ${planName}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

setTestPlan();
