import { getAuroraClient } from './app/utils/aurora-data-api.ts';
import dotenv from 'dotenv';

dotenv.config();

console.log('Testing Aurora Data API connection...');
console.log('AURORA_RESOURCE_ARN:', process.env.AURORA_RESOURCE_ARN ? 'Set' : 'Missing');
console.log('AURORA_SECRET_ARN:', process.env.AURORA_SECRET_ARN ? 'Set' : 'Missing');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Missing');
console.log('AWS_REGION:', process.env.AWS_REGION || 'eu-north-1');

try {
  const client = getAuroraClient();
  console.log('\nExecuting test query...');
  const result = await client.executeStatement('SELECT * FROM "Tier" LIMIT 1');
  console.log('✅ Connection successful!');
  console.log('Sample tier:', result.records[0] || 'No tiers found');
  
  // Try to list all tiers
  const allTiers = await client.executeStatement('SELECT id, shop, name, "minSpend", "cashbackPercent" FROM "Tier"');
  console.log(`\nFound ${allTiers.records.length} tiers in database`);
  if (allTiers.records.length > 0) {
    console.log('Tiers:', allTiers.records);
  }
  
  // Check sessions
  const sessions = await client.executeStatement('SELECT id, shop FROM "Session" LIMIT 5');
  console.log(`\nFound ${sessions.records.length} sessions`);
  if (sessions.records.length > 0) {
    console.log('Sessions:', sessions.records.map(s => ({ id: s.id, shop: s.shop })));
  }
} catch (error) {
  console.error('❌ Connection failed:', error.message);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
}