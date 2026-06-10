import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function checkTierProducts() {
  const client = new RDSDataClient({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const resourceArn = process.env.AURORA_RESOURCE_ARN;
  const secretArn = process.env.AURORA_SECRET_ARN;
  const database = process.env.AURORA_DATABASE_NAME || "rewardspro";

  console.log("🔍 Checking TierProduct table\n");

  try {
    // Get all tier products
    const result = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT id, shop, "shopifyProductId", "shopifyVariantId", "productHandle", sku, "purchaseType", duration, price, "isActive", "createdAt"
            FROM "TierProduct"
            ORDER BY "createdAt" DESC
            LIMIT 10`,
    }));

    if (!result.records || result.records.length === 0) {
      console.log("❌ No tier products found in database\n");
      return;
    }

    console.log(`✅ Found ${result.records.length} tier product(s):\n`);

    result.records.forEach((record, idx) => {
      console.log(`${idx + 1}. Tier Product:`);
      console.log(`   ID: ${record[0].stringValue}`);
      console.log(`   Shop: ${record[1].stringValue}`);
      console.log(`   Shopify Product ID: ${record[2].stringValue}`);
      console.log(`   Shopify Variant ID: ${record[3].stringValue}`);
      console.log(`   Product Handle: ${record[4].stringValue || 'NULL'}`);
      console.log(`   SKU: ${record[5].stringValue}`);
      console.log(`   Purchase Type: ${record[6].stringValue}`);
      console.log(`   Duration: ${record[7].stringValue || 'NULL'}`);
      console.log(`   Price: ${record[8].stringValue}`);
      console.log(`   Active: ${record[9].booleanValue}`);
      console.log(`   Created: ${record[10].stringValue}`);
      console.log('');
    });

  } catch (error) {
    console.error("❌ Error checking tier products:", error.message);
  }
}

checkTierProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Failed:", error);
    process.exit(1);
  });
