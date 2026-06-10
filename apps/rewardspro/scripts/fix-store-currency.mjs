#!/usr/bin/env node

/**
 * Script to fix store currency for existing shops
 *
 * This script queries Shopify for the actual store currency and updates
 * ShopSettings if it differs from what's stored (typically USD default).
 *
 * Usage:
 *   node scripts/fix-store-currency.mjs <shop-domain>
 *   node scripts/fix-store-currency.mjs teststore12062025.myshopify.com
 *   node scripts/fix-store-currency.mjs --all  # Fix all USD stores
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Valid currency codes from Prisma enum
const VALID_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SEK', 'NZD',
  'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY', 'INR', 'RUB', 'BRL', 'ZAR',
  'AED', 'PLN', 'DKK', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP'
];

class StoreCurrencyFixer {
  constructor() {
    this.client = new RDSDataClient({
      region: process.env.AWS_REGION || "eu-north-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.resourceArn = process.env.AURORA_RESOURCE_ARN;
    this.secretArn = process.env.AURORA_SECRET_ARN;
    this.database = process.env.AURORA_DATABASE_NAME || "rewardspro";
  }

  async executeStatement(sql, parameters = []) {
    const result = await this.client.send(new ExecuteStatementCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql,
      parameters,
    }));
    return result;
  }

  async getShopSettings(shop) {
    const result = await this.executeStatement(
      `SELECT id, shop, "storeCurrency", "storeName" FROM "ShopSettings" WHERE shop = :shop`,
      [{ name: 'shop', value: { stringValue: shop } }]
    );

    if (result.records && result.records.length > 0) {
      const record = result.records[0];
      return {
        id: record[0]?.stringValue,
        shop: record[1]?.stringValue,
        storeCurrency: record[2]?.stringValue,
        storeName: record[3]?.stringValue,
      };
    }
    return null;
  }

  async getSession(shop) {
    const result = await this.executeStatement(
      `SELECT id, shop, "accessToken" FROM "Session" WHERE shop = :shop AND id LIKE 'offline_%' LIMIT 1`,
      [{ name: 'shop', value: { stringValue: shop } }]
    );

    if (result.records && result.records.length > 0) {
      const record = result.records[0];
      return {
        id: record[0]?.stringValue,
        shop: record[1]?.stringValue,
        accessToken: record[2]?.stringValue,
      };
    }
    return null;
  }

  async fetchShopifyCurrency(shop, accessToken) {
    const query = `
      query getShopCurrency {
        shop {
          currencyCode
          name
        }
      }
    `;

    const response = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      currencyCode: data.data?.shop?.currencyCode,
      name: data.data?.shop?.name,
    };
  }

  async updateStoreCurrency(shop, newCurrency) {
    // Validate currency
    if (!VALID_CURRENCIES.includes(newCurrency)) {
      console.log(`  ⚠️  Currency ${newCurrency} not in supported list, skipping`);
      return false;
    }

    await this.executeStatement(
      `UPDATE "ShopSettings" SET "storeCurrency" = :currency::text::"Currency", "updatedAt" = NOW() WHERE shop = :shop`,
      [
        { name: 'currency', value: { stringValue: newCurrency } },
        { name: 'shop', value: { stringValue: shop } },
      ]
    );
    return true;
  }

  async getAllUsdStores() {
    const result = await this.executeStatement(
      `SELECT shop, "storeCurrency", "storeName" FROM "ShopSettings" WHERE "storeCurrency" = 'USD'`
    );

    return (result.records || []).map(record => ({
      shop: record[0]?.stringValue,
      storeCurrency: record[1]?.stringValue,
      storeName: record[2]?.stringValue,
    }));
  }

  async fixStore(shop) {
    console.log(`\n🔍 Processing: ${shop}`);

    // Get current settings
    const settings = await this.getShopSettings(shop);
    if (!settings) {
      console.log(`  ❌ No ShopSettings found for ${shop}`);
      return false;
    }
    console.log(`  📋 Current currency: ${settings.storeCurrency}`);

    // Get session for API access
    const session = await this.getSession(shop);
    if (!session || !session.accessToken) {
      console.log(`  ❌ No valid session found for ${shop}`);
      return false;
    }

    // Fetch actual currency from Shopify
    try {
      const shopifyData = await this.fetchShopifyCurrency(shop, session.accessToken);
      console.log(`  🏪 Shopify reports: ${shopifyData.currencyCode}`);

      if (shopifyData.currencyCode === settings.storeCurrency) {
        console.log(`  ✅ Currency already correct`);
        return true;
      }

      // Update currency
      const updated = await this.updateStoreCurrency(shop, shopifyData.currencyCode);
      if (updated) {
        console.log(`  ✅ Updated currency: ${settings.storeCurrency} → ${shopifyData.currencyCode}`);
      }
      return updated;
    } catch (error) {
      console.log(`  ❌ Error fetching from Shopify: ${error.message}`);
      return false;
    }
  }

  async fixAllUsdStores() {
    console.log('🔍 Finding all stores with USD currency...\n');
    const stores = await this.getAllUsdStores();
    console.log(`Found ${stores.length} store(s) with USD currency\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const store of stores) {
      try {
        const result = await this.fixStore(store.shop);
        if (result) {
          fixed++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📊 Summary:`);
    console.log(`   ✅ Fixed: ${fixed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/fix-store-currency.mjs <shop-domain>');
    console.log('  node scripts/fix-store-currency.mjs teststore12062025.myshopify.com');
    console.log('  node scripts/fix-store-currency.mjs --all');
    process.exit(1);
  }

  const fixer = new StoreCurrencyFixer();

  if (args[0] === '--all') {
    await fixer.fixAllUsdStores();
  } else {
    let shop = args[0];
    // Add .myshopify.com if not present
    if (!shop.includes('.myshopify.com')) {
      shop = `${shop}.myshopify.com`;
    }
    await fixer.fixStore(shop);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
