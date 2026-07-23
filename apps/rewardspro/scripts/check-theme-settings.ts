/**
 * Check theme settings in database for a shop
 *
 * Run with: npx tsx scripts/check-theme-settings.ts [shop-domain]
 */

import "dotenv/config";

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

const resourceArn = process.env.AURORA_RESOURCE_ARN!;
const secretArn = process.env.AURORA_SECRET_ARN!;
const database = process.env.AURORA_DATABASE_NAME || "rewardspro";

async function checkThemeSettings(shopDomain?: string) {
  console.log("🔍 Checking theme settings in database...\n");

  let sql: string;
  if (shopDomain) {
    sql = `
      SELECT
        shop,
        "widgetThemeMode",
        "widgetPrimaryColor",
        "widgetBackgroundColor",
        "widgetTextColor",
        "widgetAccentColor",
        "widgetBorderRadius",
        "widgetFontFamily",
        "updatedAt"
      FROM "ShopSettings"
      WHERE shop = '${shopDomain}'
    `;
  } else {
    sql = `
      SELECT
        shop,
        "widgetThemeMode",
        "widgetPrimaryColor",
        "widgetBackgroundColor",
        "widgetTextColor",
        "widgetAccentColor",
        "widgetBorderRadius",
        "widgetFontFamily",
        "updatedAt"
      FROM "ShopSettings"
      ORDER BY "updatedAt" DESC
      LIMIT 5
    `;
  }

  try {
    const command = new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
      includeResultMetadata: true,
    });

    const result = await client.send(command);

    if (!result.records || result.records.length === 0) {
      console.log("❌ No shop settings found");
      return;
    }

    const columns = result.columnMetadata?.map(c => c.name) || [];

    console.log("📊 Theme Settings:\n");
    console.log("=".repeat(80));

    for (const record of result.records) {
      const row: any = {};
      record.forEach((field, index) => {
        const colName = columns[index];
        if (field.isNull) {
          row[colName!] = null;
        } else if (field.stringValue !== undefined) {
          row[colName!] = field.stringValue;
        } else if (field.longValue !== undefined) {
          row[colName!] = field.longValue;
        } else if (field.booleanValue !== undefined) {
          row[colName!] = field.booleanValue;
        }
      });

      console.log(`\n🏪 Shop: ${row.shop}`);
      console.log(`   Theme Mode:       ${row.widgetThemeMode || '(not set)'}`);
      console.log(`   Primary Color:    ${row.widgetPrimaryColor || '(not set)'}`);
      console.log(`   Background Color: ${row.widgetBackgroundColor || '(not set)'}`);
      console.log(`   Text Color:       ${row.widgetTextColor || '(not set)'}`);
      console.log(`   Accent Color:     ${row.widgetAccentColor || '(not set)'}`);
      console.log(`   Border Radius:    ${row.widgetBorderRadius || '(not set)'}`);
      console.log(`   Font Family:      ${row.widgetFontFamily || '(not set)'}`);
      console.log(`   Last Updated:     ${row.updatedAt || '(not set)'}`);
    }

    console.log("\n" + "=".repeat(80));

  } catch (error: any) {
    console.error("❌ Error:", error.message);
  }
}

const shopArg = process.argv[2];
checkThemeSettings(shopArg);
