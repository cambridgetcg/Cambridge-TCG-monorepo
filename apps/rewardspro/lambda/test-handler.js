/**
 * Test file for Lambda handler
 * Run with: node test-handler.js
 */

const { handler } = require('./process-customer-webhook.js');

// Mock EventBridge event for customers/create
const mockEvent = {
  version: '0',
  id: 'test-event-id',
  'detail-type': 'shopifyWebhook',
  source: 'aws.partner/shopify.com/test-app/webhooks',
  account: '043509841549',
  time: new Date().toISOString(),
  region: 'eu-north-1',
  detail: {
    metadata: {
      'X-Shopify-Topic': 'customers/create',
      'X-Shopify-Shop-Domain': 'test-store.myshopify.com',
      'X-Shopify-Webhook-Id': 'test-webhook-id',
      'X-Shopify-API-Version': '2025-01',
    },
    payload: {
      id: 1234567890,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'Customer',
      phone: '+1234567890',
      tags: 'vip, loyal',
      total_spent: '1500.00',
      orders_count: 5,
      last_order_id: 987654321,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
      verified_email: true,
      state: 'enabled',
      currency: 'USD',
      accepts_marketing: true,
      tax_exempt: false,
    },
  },
};

// Test the handler
async function testHandler() {
  console.log('Testing Lambda handler with mock event...\n');
  console.log('Mock Event:', JSON.stringify(mockEvent, null, 2));
  console.log('\n' + '='.repeat(60) + '\n');

  try {
    const result = await handler(mockEvent);
    console.log('✅ Handler executed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Handler failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run test if executed directly
if (require.main === module) {
  // Set test environment variables
  process.env.AWS_REGION = process.env.AWS_REGION || 'eu-north-1';
  process.env.AURORA_RESOURCE_ARN = process.env.AURORA_RESOURCE_ARN || 'arn:aws:rds:eu-north-1:043509841549:cluster:rewardspro-dev';
  process.env.AURORA_SECRET_ARN = process.env.AURORA_SECRET_ARN || 'arn:aws:secretsmanager:eu-north-1:043509841549:secret:test';
  process.env.AURORA_DATABASE_NAME = process.env.AURORA_DATABASE_NAME || 'rewardspro';

  console.log('Environment Variables:');
  console.log('AWS_REGION:', process.env.AWS_REGION);
  console.log('AURORA_RESOURCE_ARN:', process.env.AURORA_RESOURCE_ARN);
  console.log('AURORA_SECRET_ARN:', process.env.AURORA_SECRET_ARN);
  console.log('AURORA_DATABASE_NAME:', process.env.AURORA_DATABASE_NAME);
  console.log('\n' + '='.repeat(60) + '\n');

  testHandler();
}

module.exports = { mockEvent };