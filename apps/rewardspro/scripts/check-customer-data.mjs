import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

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

const result = await client.send(new ExecuteStatementCommand({
  resourceArn,
  secretArn,
  database,
  sql: `SELECT id, email, "storeCredit", "pointsBalance", "lifetimePoints", "shopifyCustomerMetafieldId"
        FROM "Customer"
        WHERE "storeCredit" > 0
        LIMIT 5`,
  includeResultMetadata: true,
}));

console.log("Customers with store credit:");
if (result.records && result.records.length > 0) {
  result.records.forEach((record, i) => {
    const email = record[1]?.stringValue;
    const id = record[0]?.stringValue;
    const storeCredit = record[2]?.stringValue || record[2]?.doubleValue || 0;
    const pointsBalance = record[3]?.stringValue || record[3]?.doubleValue || 0;
    const lifetimePoints = record[4]?.stringValue || record[4]?.doubleValue || 0;
    const metafieldId = record[5]?.stringValue || 'null';

    console.log(`\n${i+1}. ${email}`);
    console.log(`   ID: ${id}`);
    console.log(`   Store Credit: ${storeCredit}`);
    console.log(`   Points Balance: ${pointsBalance}`);
    console.log(`   Lifetime Points: ${lifetimePoints}`);
    console.log(`   Metafield ID: ${metafieldId}`);
  });
} else {
  console.log("No customers with store credit > 0");
}
