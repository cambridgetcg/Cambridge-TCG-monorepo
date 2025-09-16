import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyOrderTrackingMigration() {
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

  console.log("🚀 Applying Order Tracking Migration to Aurora Database\n");

  // Start transaction for atomicity
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  console.log("Starting transaction...");

  try {
    // Execute migration in logical steps
    await executeMigrationSteps(client, resourceArn, secretArn, database, transactionId);
    
    // Commit if all successful
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  // Step 1: Update Customer table with new spending fields
  console.log("Step 1: Adding spending tracking fields to Customer table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "Customer" 
          ADD COLUMN IF NOT EXISTS "totalSpent" DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "totalCashbackEarned" DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "totalRefunded" DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "netSpent" DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "orderCount" INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "lastOrderDate" TIMESTAMP(3)`,
    transactionId,
  }));
  console.log("  ✓ Customer fields added");

  // Step 2: Update StoreCreditLedger with order relations
  console.log("Step 2: Adding order relations to StoreCreditLedger...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "StoreCreditLedger" 
          ADD COLUMN IF NOT EXISTS "orderId" TEXT,
          ADD COLUMN IF NOT EXISTS "refundId" TEXT`,
    transactionId,
  }));
  console.log("  ✓ StoreCreditLedger fields added");

  // Step 3: Create Order table
  console.log("Step 3: Creating Order table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "Order" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "shopifyOrderId" TEXT NOT NULL,
            "shopifyOrderNumber" TEXT NOT NULL,
            "shopifyOrderName" TEXT NOT NULL,
            "customerId" TEXT NOT NULL,
            "email" TEXT NOT NULL,
            "currency" TEXT NOT NULL,
            "subtotalPrice" DECIMAL(10,2) NOT NULL,
            "totalDiscounts" DECIMAL(10,2) NOT NULL,
            "totalShipping" DECIMAL(10,2) NOT NULL,
            "totalTax" DECIMAL(10,2) NOT NULL,
            "totalPrice" DECIMAL(10,2) NOT NULL,
            "totalRefunded" DECIMAL(10,2) NOT NULL DEFAULT 0,
            "netAmount" DECIMAL(10,2) NOT NULL,
            "financialStatus" TEXT NOT NULL,
            "fulfillmentStatus" TEXT,
            "cashbackEligible" BOOLEAN NOT NULL DEFAULT true,
            "cashbackPercent" INTEGER,
            "cashbackAmount" DECIMAL(10,2),
            "cashbackProcessed" BOOLEAN NOT NULL DEFAULT false,
            "tierIdAtOrder" TEXT,
            "tierNameAtOrder" TEXT,
            "shopifyCreatedAt" TIMESTAMP(3) NOT NULL,
            "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
            "processedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ Order table created");

  // Step 4: Create OrderLineItem table
  console.log("Step 4: Creating OrderLineItem table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "OrderLineItem" (
            "id" TEXT NOT NULL,
            "orderId" TEXT NOT NULL,
            "shopifyLineItemId" TEXT NOT NULL,
            "shopifyProductId" TEXT,
            "shopifyVariantId" TEXT,
            "title" TEXT NOT NULL,
            "variantTitle" TEXT,
            "sku" TEXT,
            "vendor" TEXT,
            "quantity" INTEGER NOT NULL,
            "price" DECIMAL(10,2) NOT NULL,
            "totalPrice" DECIMAL(10,2) NOT NULL,
            "totalDiscount" DECIMAL(10,2) NOT NULL,
            "requiresShipping" BOOLEAN NOT NULL DEFAULT true,
            "taxable" BOOLEAN NOT NULL DEFAULT true,
            "giftCard" BOOLEAN NOT NULL DEFAULT false,
            "isTierProduct" BOOLEAN NOT NULL DEFAULT false,
            "tierProductId" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ OrderLineItem table created");

  // Step 5: Create OrderRefund table
  console.log("Step 5: Creating OrderRefund table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "OrderRefund" (
            "id" TEXT NOT NULL,
            "orderId" TEXT NOT NULL,
            "shopifyRefundId" TEXT NOT NULL,
            "amount" DECIMAL(10,2) NOT NULL,
            "shippingAmount" DECIMAL(10,2) NOT NULL,
            "taxAmount" DECIMAL(10,2) NOT NULL,
            "reason" TEXT,
            "note" TEXT,
            "cashbackAdjustment" DECIMAL(10,2),
            "cashbackProcessed" BOOLEAN NOT NULL DEFAULT false,
            "shopifyCreatedAt" TIMESTAMP(3) NOT NULL,
            "processedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ OrderRefund table created");

  // Step 6: Create OrderRefundLineItem table
  console.log("Step 6: Creating OrderRefundLineItem table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "OrderRefundLineItem" (
            "id" TEXT NOT NULL,
            "refundId" TEXT NOT NULL,
            "shopifyLineItemId" TEXT NOT NULL,
            "quantity" INTEGER NOT NULL,
            "subtotal" DECIMAL(10,2) NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "OrderRefundLineItem_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ OrderRefundLineItem table created");

  // Step 7: Create indexes for Order table
  console.log("Step 7: Creating indexes for Order table...");
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "Order_shop_shopifyOrderId_key" ON "Order"("shop", "shopifyOrderId")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "Order_shop_customerId_idx" ON "Order"("shop", "customerId")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "Order_shop_shopifyCreatedAt_idx" ON "Order"("shop", "shopifyCreatedAt")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "Order_shop_financialStatus_idx" ON "Order"("shop", "financialStatus")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "Order_customerId_shopifyCreatedAt_idx" ON "Order"("customerId", "shopifyCreatedAt")`,
    transactionId,
  }));
  console.log("  ✓ Order indexes created");

  // Step 8: Create indexes for OrderLineItem
  console.log("Step 8: Creating indexes for OrderLineItem...");
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "OrderLineItem_orderId_shopifyLineItemId_key" ON "OrderLineItem"("orderId", "shopifyLineItemId")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "OrderLineItem_orderId_idx" ON "OrderLineItem"("orderId")`,
    transactionId,
  }));
  console.log("  ✓ OrderLineItem indexes created");

  // Step 9: Create indexes for OrderRefund
  console.log("Step 9: Creating indexes for OrderRefund...");
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "OrderRefund_orderId_shopifyRefundId_key" ON "OrderRefund"("orderId", "shopifyRefundId")`,
    transactionId,
  }));
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "OrderRefund_orderId_idx" ON "OrderRefund"("orderId")`,
    transactionId,
  }));
  console.log("  ✓ OrderRefund indexes created");

  // Step 10: Create index for OrderRefundLineItem
  console.log("Step 10: Creating index for OrderRefundLineItem...");
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "OrderRefundLineItem_refundId_idx" ON "OrderRefundLineItem"("refundId")`,
    transactionId,
  }));
  console.log("  ✓ OrderRefundLineItem index created");

  // Step 11: Add unique constraint to StoreCreditLedger for refundId
  console.log("Step 11: Adding unique constraint for refundId...");
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "StoreCreditLedger_refundId_key" ON "StoreCreditLedger"("refundId")`,
    transactionId,
  }));
  console.log("  ✓ Unique constraint added");

  // Step 12: Add foreign key constraints
  console.log("Step 12: Adding foreign key constraints...");
  
  // Order -> Customer
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "Order" 
          ADD CONSTRAINT "Order_customerId_fkey" 
          FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE`,
    transactionId,
  }));
  
  // OrderLineItem -> Order
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "OrderLineItem" 
          ADD CONSTRAINT "OrderLineItem_orderId_fkey" 
          FOREIGN KEY ("orderId") REFERENCES "Order"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE`,
    transactionId,
  }));
  
  // OrderRefund -> Order
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "OrderRefund" 
          ADD CONSTRAINT "OrderRefund_orderId_fkey" 
          FOREIGN KEY ("orderId") REFERENCES "Order"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE`,
    transactionId,
  }));
  
  // OrderRefundLineItem -> OrderRefund
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "OrderRefundLineItem" 
          ADD CONSTRAINT "OrderRefundLineItem_refundId_fkey" 
          FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE`,
    transactionId,
  }));
  
  // StoreCreditLedger -> Order
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "StoreCreditLedger" 
          ADD CONSTRAINT "StoreCreditLedger_orderId_fkey" 
          FOREIGN KEY ("orderId") REFERENCES "Order"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE`,
    transactionId,
  }));
  
  // StoreCreditLedger -> OrderRefund
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "StoreCreditLedger" 
          ADD CONSTRAINT "StoreCreditLedger_refundId_fkey" 
          FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE`,
    transactionId,
  }));
  
  console.log("  ✓ Foreign key constraints added");

  // Step 13: Record migration in Prisma's tracking table
  console.log("Step 13: Recording migration...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = '20250916_add_order_tracking_models';
  
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations" 
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 13)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: "order_tracking_migration_v1" }},
      { name: "name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log("  ✓ Migration recorded");

  console.log("\n  ✓ All migration steps completed successfully");
}

// Run the migration
applyOrderTrackingMigration().catch(console.error);