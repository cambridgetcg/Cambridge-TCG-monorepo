/**
 * Add test tier data for simulation
 * Creates a complete tier structure: Bronze, Silver, Gold, Platinum, Diamond
 * Shop: rewardspro-dev.myshopify.com
 */

import 'dotenv/config';
import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';

const prisma = createDataAPIPrismaClient();

async function main() {
  const shop = 'rewardspro-dev.myshopify.com';

  console.log('Creating test tier structure...');
  console.log('Shop:', shop);

  // Define tier structure with increasing benefits
  const tiers = [
    {
      name: 'Bronze',
      minSpend: 0,
      cashbackPercent: 2,
      description: 'Welcome tier - start earning cashback immediately'
    },
    {
      name: 'Silver',
      minSpend: 250,
      cashbackPercent: 3,
      description: 'Spend $250 to unlock 3% cashback'
    },
    {
      name: 'Gold',
      minSpend: 500,
      cashbackPercent: 5,
      description: 'Spend $500 to unlock 5% cashback'
    },
    {
      name: 'Platinum',
      minSpend: 1000,
      cashbackPercent: 7,
      description: 'Spend $1,000 to unlock 7% cashback'
    },
    {
      name: 'Diamond',
      minSpend: 2500,
      cashbackPercent: 10,
      description: 'Spend $2,500 to unlock 10% cashback and VIP benefits'
    }
  ];

  console.log('\nCreating/updating tiers...\n');

  for (const tierData of tiers) {
    // Check if tier already exists
    let tier = await prisma.tier.findFirst({
      where: {
        shop,
        name: tierData.name
      }
    });

    const now = new Date();

    if (tier) {
      // Update existing tier
      console.log(`Updating ${tierData.name} tier...`);
      tier = await prisma.tier.update({
        where: { id: tier.id },
        data: {
          minSpend: tierData.minSpend,
          cashbackPercent: tierData.cashbackPercent,
          updatedAt: now
        }
      });
      console.log(`✅ ${tierData.name} tier updated`);
    } else {
      // Create new tier
      console.log(`Creating ${tierData.name} tier...`);
      tier = await prisma.tier.create({
        data: {
          id: `tier_${tierData.name.toLowerCase()}_${Date.now()}`,
          shop,
          name: tierData.name,
          minSpend: tierData.minSpend,
          cashbackPercent: tierData.cashbackPercent,
          createdAt: now,
          updatedAt: now
        }
      });
      console.log(`✅ ${tierData.name} tier created`);
    }

    // Display tier details
    console.log(`   - Minimum spend: $${tierData.minSpend}`);
    console.log(`   - Cashback rate: ${tierData.cashbackPercent}%`);
    console.log(`   - ${tierData.description}\n`);
  }

  console.log('🎉 Test tier structure created successfully!\n');
  console.log('Tier Structure Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Tier       | Min Spend | Cashback Rate');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  tiers.forEach(t => {
    console.log(`${t.name.padEnd(10)} | $${String(t.minSpend).padStart(8)} | ${t.cashbackPercent}%`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
