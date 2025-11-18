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
  console.log('║              TIER STRUCTURE - Test Store                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const tiers = await query(`
    SELECT id, name, "minSpend", "cashbackPercent", "evaluationPeriod"
    FROM "Tier"
    WHERE shop = :shop
    ORDER BY "minSpend" ASC
  `, [{ name: 'shop', value: { stringValue: shop } }]);

  console.log(`Found ${tiers.records.length} tiers:\n`);

  tiers.records.forEach((record: any, index: number) => {
    const id = record[0].stringValue;
    const name = record[1].stringValue;
    const minSpend = record[2].doubleValue !== undefined ? record[2].doubleValue : 0;
    const cashbackPercent = record[3].longValue !== undefined ? Number(record[3].longValue) : 0;
    const evaluationPeriod = record[4].stringValue;

    console.log(`${index + 1}. ${name}`);
    console.log(`   ID: ${id}`);
    console.log(`   Min Spend: $${minSpend.toFixed(2)}`);
    console.log(`   Cashback: ${cashbackPercent}%`);
    console.log(`   Evaluation: ${evaluationPeriod}`);
    console.log('');
  });

  // Export as JSON for the next script
  const tierData = tiers.records.map((record: any) => ({
    id: record[0].stringValue,
    name: record[1].stringValue,
    minSpend: record[2].doubleValue !== undefined ? record[2].doubleValue : 0,
    cashbackPercent: record[3].longValue !== undefined ? Number(record[3].longValue) : 0,
    evaluationPeriod: record[4].stringValue,
  }));

  console.log('JSON Output:');
  console.log(JSON.stringify(tierData, null, 2));
})();
