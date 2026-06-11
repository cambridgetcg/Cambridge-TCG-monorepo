import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new RDSDataClient({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const command = new ExecuteStatementCommand({
  resourceArn: process.env.AURORA_RESOURCE_ARN,
  secretArn: process.env.AURORA_SECRET_ARN,
  database: process.env.AURORA_DATABASE_NAME || 'rewardspro',
  sql: `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE 'Email%'
    ORDER BY table_name;
  `
});

try {
  const response = await client.send(command);
  console.log('Email marketing tables:');
  if (response.records && response.records.length > 0) {
    response.records.forEach(record => {
      console.log('  -', record[0].stringValue);
    });
    console.log(`\nTotal: ${response.records.length} tables`);
  } else {
    console.log('  (none found - migration may have rolled back)');
  }
} catch (error) {
  console.error('Error:', error.message);
}
