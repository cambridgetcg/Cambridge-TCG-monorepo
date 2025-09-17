import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function testOrderSync() {
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

  console.log("🔍 Testing Order Sync - Checking Database Tables\n");

  try {
    // 1. Check if Order table exists and has data
    console.log("Step 1: Checking Order table...");
    const orderCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count, MIN("shopifyCreatedAt") as oldest, MAX("shopifyCreatedAt") as newest FROM "Order"`,
      includeResultMetadata: true,
    }));

    const orderCount = orderCheck.records?.[0]?.[0]?.longValue || 0;
    const oldestOrder = orderCheck.records?.[0]?.[1]?.stringValue;
    const newestOrder = orderCheck.records?.[0]?.[2]?.stringValue;

    console.log(`  ✓ Order table exists`);
    console.log(`  - Total orders: ${orderCount}`);
    if (oldestOrder) {
      console.log(`  - Date range: ${oldestOrder} to ${newestOrder}`);
    }

    // 2. Check OrderLineItem table
    console.log("\nStep 2: Checking OrderLineItem table...");
    const lineItemCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count FROM "OrderLineItem"`,
    }));

    const lineItemCount = lineItemCheck.records?.[0]?.[0]?.longValue || 0;
    console.log(`  ✓ OrderLineItem table exists`);
    console.log(`  - Total line items: ${lineItemCount}`);

    // 3. Check OrderRefund table
    console.log("\nStep 3: Checking OrderRefund table...");
    const refundCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count FROM "OrderRefund"`,
    }));

    const refundCount = refundCheck.records?.[0]?.[0]?.longValue || 0;
    console.log(`  ✓ OrderRefund table exists`);
    console.log(`  - Total refunds: ${refundCount}`);

    // 4. Check customer spending totals
    console.log("\nStep 4: Checking Customer spending totals...");
    const customerCheck = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) as count FROM "Customer" WHERE "totalSpent" > 0`,
    }));

    const customersWithSpending = customerCheck.records?.[0]?.[0]?.longValue || 0;
    console.log(`  ✓ Customer spending fields exist`);
    console.log(`  - Customers with spending data: ${customersWithSpending}`);

    // 5. Sample order data
    if (orderCount > 0) {
      console.log("\nStep 5: Sample order data...");
      const sampleOrder = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT 
                "shopifyOrderName", 
                "totalPrice", 
                "cashbackAmount", 
                "cashbackPercent",
                "tierNameAtOrder"
              FROM "Order" 
              WHERE "cashbackAmount" > 0 
              LIMIT 3`,
        includeResultMetadata: true,
      }));

      if (sampleOrder.records && sampleOrder.records.length > 0) {
        console.log("  Sample orders with cashback:");
        sampleOrder.records.forEach(record => {
          const orderName = record[0]?.stringValue;
          const totalPrice = record[1]?.stringValue;
          const cashback = record[2]?.stringValue;
          const percent = record[3]?.longValue;
          const tier = record[4]?.stringValue;
          console.log(`    - ${orderName}: $${totalPrice} | Cashback: $${cashback} (${percent}% from ${tier || 'No Tier'})`);
        });
      } else {
        console.log("  No orders with cashback found yet");
      }
    }

    // 6. Check for any sync errors in metadata
    console.log("\nStep 6: Checking for sync issues...");
    const orphanedOrders = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) FROM "Order" WHERE "customerId" = 'unknown'`,
    }));

    const orphanCount = orphanedOrders.records?.[0]?.[0]?.longValue || 0;
    if (orphanCount > 0) {
      console.log(`  ⚠️ Found ${orphanCount} orders without customer association`);
    } else {
      console.log(`  ✓ All orders properly associated with customers`);
    }

    // Summary
    console.log("\n📊 Order Sync Summary:");
    console.log("========================");
    console.log(`Orders synced: ${orderCount}`);
    console.log(`Line items: ${lineItemCount}`);
    console.log(`Refunds: ${refundCount}`);
    console.log(`Customers with spending data: ${customersWithSpending}`);
    
    if (orderCount === 0) {
      console.log("\n💡 No orders found. Run the order sync from the admin panel:");
      console.log("   Navigate to: /app/orders-sync");
      console.log("   Click 'Sync Orders' to import historical data");
    } else {
      console.log("\n✅ Order sync appears to be working correctly!");
    }

  } catch (error) {
    console.error("❌ Error testing order sync:", error.message);
    
    if (error.message.includes("Relation") && error.message.includes("does not exist")) {
      console.log("\n💡 Order tables not found. Make sure to:");
      console.log("   1. Run the migration: node scripts/apply-order-tracking-migration.mjs");
      console.log("   2. Then sync orders from the admin panel");
    }
  }
}

// Run the test
testOrderSync().catch(console.error);