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
  
  const result = await query(`
    SELECT COUNT(*) as count
    FROM "Customer"
    WHERE shop = :shop
  `, [{ name: 'shop', value: { stringValue: shop } }]);
  
  console.log(`Customers in database: ${result.records[0][0].longValue}`);
})();
