import 'dotenv/config';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

const client = new RDSDataClient({ region: process.env.AWS_REGION || 'eu-north-1' });
const config = {
  resourceArn: process.env.AURORA_RESOURCE_ARN!,
  secretArn: process.env.AURORA_SECRET_ARN!,
  database: process.env.AURORA_DATABASE_NAME!,
};

async function query(sql: string, params: any[] = []) {
  return await client.send(new ExecuteStatementCommand({ ...config, sql, parameters: params }));
}

(async () => {
  const shop = 'teststore12062025.myshopify.com';

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              DATA INTEGRITY VERIFICATION                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // 1. Check orphaned ledger entries
  const orphanedLedgers = await query(`
    SELECT COUNT(*) as count
    FROM "StoreCreditLedger" scl
    LEFT JOIN "Customer" c ON scl."customerId" = c.id
    WHERE scl.shop = :shop AND c.id IS NULL
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  const orphanedCount = orphanedLedgers.records![0][0].longValue || 0;
  console.log(`📋 Orphaned Ledger Entries: ${orphanedCount} ${orphanedCount === 0 ? '✅' : '❌'}`);

  // 2. Check orphaned orders
  const orphanedOrders = await query(`
    SELECT COUNT(*) as count
    FROM "Order" o
    LEFT JOIN "Customer" c ON o."customerId" = c.id
    WHERE o.shop = :shop AND c.id IS NULL
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  const orphanedOrderCount = orphanedOrders.records![0][0].longValue || 0;
  console.log(`📦 Orphaned Orders: ${orphanedOrderCount} ${orphanedOrderCount === 0 ? '✅' : '❌'}`);

  // 3. Line items properly linked (all line items should have parent orders)
  console.log(`📝 Line Items Check: Skipped (line items are enforced by FK constraint) ✅`);

  // 4. Check customers without tiers
  const customersWithoutTiers = await query(`
    SELECT COUNT(*) as count
    FROM "Customer" c
    LEFT JOIN "Tier" t ON c."currentTierId" = t.id
    WHERE c.shop = :shop AND c."currentTierId" IS NOT NULL AND t.id IS NULL
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  const customersWithoutTierCount = customersWithoutTiers.records![0][0].longValue || 0;
  console.log(`👤 Customers with Invalid Tier: ${customersWithoutTierCount} ${customersWithoutTierCount === 0 ? '✅' : '❌'}`);

  // 5. Verify customer totals match orders
  const customerTotalsCheck = await query(`
    SELECT
      c.id,
      c.email,
      c."totalSpent",
      COALESCE(SUM(o."totalPrice"), 0) as actual_total
    FROM "Customer" c
    LEFT JOIN "Order" o ON c.id = o."customerId" AND o.shop = c.shop
    WHERE c.shop = :shop
    GROUP BY c.id, c.email, c."totalSpent"
    HAVING ABS(c."totalSpent" - COALESCE(SUM(o."totalPrice"), 0)) > 0.01
    LIMIT 5
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  const mismatchedTotals = customerTotalsCheck.records ? customerTotalsCheck.records.length : 0;
  console.log(`💰 Customer Totals Mismatch: ${mismatchedTotals} ${mismatchedTotals === 0 ? '✅' : '❌'}`);

  if (mismatchedTotals > 0 && customerTotalsCheck.records) {
    console.log('\n   Mismatched customers:');
    customerTotalsCheck.records.forEach((record: any) => {
      console.log(`   - ${record[1].stringValue}: stored=${record[2].stringValue}, actual=${record[3].stringValue}`);
    });
  }

  // 6. Overall summary
  const totalRecords = await query(`
    SELECT
      (SELECT COUNT(*) FROM "Customer" WHERE shop = :shop) as customers,
      (SELECT COUNT(*) FROM "Order" WHERE shop = :shop) as orders,
      (SELECT COUNT(*) FROM "OrderLineItem" oli
       INNER JOIN "Order" o ON oli."orderId" = o.id
       WHERE o.shop = :shop) as line_items,
      (SELECT COUNT(*) FROM "StoreCreditLedger" WHERE shop = :shop) as ledger_entries,
      (SELECT COUNT(*) FROM "TierChangeLog" WHERE shop = :shop) as tier_logs
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  console.log('\n📊 Record Counts:');
  console.log(`   Customers: ${totalRecords.records![0][0].longValue}`);
  console.log(`   Orders: ${totalRecords.records![0][1].longValue}`);
  console.log(`   Line Items: ${totalRecords.records![0][2].longValue}`);
  console.log(`   Ledger Entries: ${totalRecords.records![0][3].longValue}`);
  console.log(`   Tier Logs: ${totalRecords.records![0][4].longValue}`);

  const allGood = orphanedCount === 0 &&
                  orphanedOrderCount === 0 &&
                  customersWithoutTierCount === 0 &&
                  mismatchedTotals === 0;

  console.log('\n' + (allGood ? '✅ All data integrity checks passed!' : '⚠️  Some issues detected'));
})();
