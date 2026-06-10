import 'dotenv/config';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

const client = new RDSDataClient({
  region: process.env.AWS_REGION || 'eu-north-1',
});

const databaseConfig = {
  resourceArn: process.env.AURORA_RESOURCE_ARN!,
  secretArn: process.env.AURORA_SECRET_ARN!,
  database: process.env.AURORA_DATABASE_NAME!,
};

async function executeQuery(sql: string, parameters: any[] = []): Promise<any> {
  const command = new ExecuteStatementCommand({
    ...databaseConfig,
    sql,
    parameters,
  });
  return await client.send(command);
}

async function queryTestStore() {
  const shop = 'teststore12062025.myshopify.com';

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           DATABASE QUERY - Test Store Data               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // 1. Customer Summary
  console.log('📊 CUSTOMER SUMMARY\n');
  const customerStats = await executeQuery(`
    SELECT
      COUNT(*) as total_customers,
      SUM("orderCount") as total_orders,
      SUM("totalSpent") as total_revenue,
      SUM("storeCredit") as total_store_credit,
      SUM("totalCashbackEarned") as total_cashback
    FROM "Customer"
    WHERE shop = :shop
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  const stats = customerStats.records[0];
  const totalCustomers = stats[0].longValue || 0;
  const totalOrders = stats[1].longValue || 0;
  const totalRevenue = parseFloat(stats[2].stringValue || '0');
  const totalCredit = parseFloat(stats[3].stringValue || '0');
  const totalCashback = parseFloat(stats[4].stringValue || '0');

  console.log(`   Total Customers: ${totalCustomers}`);
  console.log(`   Total Orders: ${totalOrders}`);
  console.log(`   Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`   Store Credit Balance: $${totalCredit.toFixed(2)}`);
  console.log(`   Total Cashback Earned: $${totalCashback.toFixed(2)}`);

  // 2. Tier Distribution
  console.log('\n\n🏆 TIER DISTRIBUTION\n');
  const tierDist = await executeQuery(`
    SELECT
      t.name as tier_name,
      COUNT(c.id) as customer_count,
      SUM(c."totalSpent") as tier_revenue
    FROM "Tier" t
    LEFT JOIN "Customer" c ON c."currentTierId" = t.id AND c.shop = :shop
    WHERE t.shop = :shop
    GROUP BY t.id, t.name, t."minSpend"
    ORDER BY t."minSpend" ASC
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  tierDist.records.forEach((record: any) => {
    const tierName = record[0].stringValue;
    const count = record[1].longValue || 0;
    const revenue = parseFloat(record[2].stringValue || '0');
    console.log(`   ${tierName}: ${count} customers, $${revenue.toFixed(2)} revenue`);
  });

  // 3. Top 5 Customers by Spending
  console.log('\n\n💎 TOP 5 CUSTOMERS BY SPENDING\n');
  const topCustomers = await executeQuery(`
    SELECT
      "firstName",
      "lastName",
      email,
      "totalSpent",
      "orderCount",
      "storeCredit"
    FROM "Customer"
    WHERE shop = :shop
    ORDER BY "totalSpent" DESC
    LIMIT 5
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  topCustomers.records.forEach((record: any, index: number) => {
    const firstName = record[0].stringValue;
    const lastName = record[1].stringValue;
    const email = record[2].stringValue;
    const totalSpent = parseFloat(record[3].stringValue || '0');
    const orderCount = record[4].longValue || 0;
    const storeCredit = parseFloat(record[5].stringValue || '0');
    console.log(`   ${index + 1}. ${firstName} ${lastName} (${email})`);
    console.log(`      Total Spent: $${totalSpent.toFixed(2)} | Orders: ${orderCount} | Credit: $${storeCredit.toFixed(2)}`);
  });

  // 4. Recent Orders
  console.log('\n\n📦 RECENT 5 ORDERS\n');
  const recentOrders = await executeQuery(`
    SELECT
      o."shopifyOrderNumber",
      c.email,
      o."totalPrice",
      o."financialStatus",
      o."cashbackAmount",
      o."shopifyCreatedAt"
    FROM "Order" o
    JOIN "Customer" c ON o."customerId" = c.id
    WHERE o.shop = :shop
    ORDER BY o."shopifyCreatedAt" DESC
    LIMIT 5
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  recentOrders.records.forEach((record: any) => {
    const orderNum = record[0].stringValue;
    const email = record[1].stringValue;
    const total = parseFloat(record[2].stringValue || '0');
    const status = record[3].stringValue;
    const cashback = parseFloat(record[4].stringValue || '0');
    const date = new Date(record[5].stringValue).toLocaleDateString();
    console.log(`   ${orderNum} - ${email}`);
    console.log(`      Amount: $${total.toFixed(2)} | Status: ${status} | Cashback: $${cashback.toFixed(2)} | Date: ${date}`);
  });

  // 5. Store Credit Ledger Activity
  console.log('\n\n💰 STORE CREDIT LEDGER (Last 5 Entries)\n');
  const ledgerEntries = await executeQuery(`
    SELECT
      c.email,
      scl.type,
      scl.amount,
      scl.balance,
      scl."createdAt"
    FROM "StoreCreditLedger" scl
    JOIN "Customer" c ON scl."customerId" = c.id
    WHERE scl.shop = :shop
    ORDER BY scl."createdAt" DESC
    LIMIT 5
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  ledgerEntries.records.forEach((record: any) => {
    const email = record[0].stringValue;
    const type = record[1].stringValue;
    const amount = parseFloat(record[2].stringValue || '0');
    const balance = parseFloat(record[3].stringValue || '0');
    const date = new Date(record[4].stringValue).toLocaleDateString();
    console.log(`   ${email} - ${type}`);
    console.log(`      Amount: $${amount.toFixed(2)} | New Balance: $${balance.toFixed(2)} | Date: ${date}`);
  });

  console.log('\n\n✅ Query completed successfully!\n');
}

queryTestStore().catch(console.error);
