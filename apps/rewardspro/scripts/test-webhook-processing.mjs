#!/usr/bin/env node

/**
 * Test Webhook Processing
 *
 * This script tests if the webhook endpoints are working correctly
 * after the schema fixes have been applied.
 */

import https from 'https';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

// Test webhook data
const testOrder = {
  id: 9999999999999,
  email: "test@example.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  currency: "USD",
  total_price: "100.00",
  financial_status: "paid",
  name: "#TEST-1001",
  order_number: 1001,
  subtotal_price: "100.00",
  total_discounts: "0.00",
  total_shipping: "0.00",
  total_tax: "0.00",
  customer: {
    id: 9999999999999,
    email: "test@example.com",
    first_name: "Test",
    last_name: "Customer",
    orders_count: 1,
    total_spent: "100.00",
    tags: "test"
  },
  line_items: [
    {
      id: 1,
      title: "Test Product",
      quantity: 1,
      price: "100.00",
      product_id: 8888888888888,
      variant_id: 7777777777777
    }
  ]
};

async function testWebhook(endpoint, topic) {
  console.log(`\n📤 Testing ${endpoint} webhook...`);

  const webhookUrl = `https://rewardspro-production-nnwf.vercel.app${endpoint}`;
  const payload = JSON.stringify(testOrder);

  // Generate HMAC for webhook verification (if we had the webhook secret)
  // In production, Shopify would generate this
  const hmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET || 'test-secret')
    .update(payload, 'utf8')
    .digest('base64');

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-Shopify-Topic': topic,
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Shop-Domain': 'teststore.myshopify.com',
      'X-Shopify-Webhook-Id': crypto.randomUUID(),
      'X-Shopify-API-Version': '2025-07',
      'User-Agent': 'Shopify-Captain-Hook'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(webhookUrl, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`  Status: ${res.statusCode}`);

        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log(`  ✅ Webhook processed successfully`);
          try {
            const response = JSON.parse(data);
            console.log(`  Response:`, response);
          } catch {
            console.log(`  Response:`, data);
          }
        } else if (res.statusCode === 401) {
          console.log(`  ⚠️  Authentication failed (expected without valid HMAC)`);
          console.log(`  This is normal - production webhooks require valid HMAC from Shopify`);
        } else {
          console.log(`  ❌ Unexpected status code`);
          console.log(`  Response:`, data);
        }
        resolve(res.statusCode);
      });
    });

    req.on('error', (error) => {
      console.error(`  ❌ Request failed:`, error.message);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

async function checkHealth() {
  console.log("🏥 Checking API health...");

  return new Promise((resolve) => {
    https.get('https://rewardspro-production-nnwf.vercel.app/api/health', (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          console.log(`  ✅ API is healthy`);
          console.log(`  Version: ${health.environment.APP_VERSION}`);
          console.log(`  Database: ${health.dataAPI.connected ? 'Connected' : 'Not connected'}`);
          resolve(true);
        } catch (error) {
          console.error(`  ❌ Failed to parse health response`);
          resolve(false);
        }
      });
    }).on('error', (error) => {
      console.error(`  ❌ Health check failed:`, error.message);
      resolve(false);
    });
  });
}

async function runTests() {
  console.log("🧪 Testing Webhook Processing\n");
  console.log("=" .repeat(50));

  // Check API health first
  const isHealthy = await checkHealth();
  if (!isHealthy) {
    console.log("\n⚠️  API health check failed. Webhooks may not work properly.");
  }

  // Test different webhook endpoints
  console.log("\n" + "=".repeat(50));
  console.log("Testing Webhook Endpoints:");

  // Test orders/paid webhook
  await testWebhook('/webhooks/orders/paid', 'orders/paid');

  // Test orders/create webhook
  await testWebhook('/webhooks/orders/create', 'orders/create');

  console.log("\n" + "=".repeat(50));
  console.log("\n🎉 Testing complete!");
  console.log("\nNote: Webhooks will return 401 Unauthorized because we can't generate");
  console.log("valid Shopify HMAC signatures. In production, Shopify signs these properly.");
  console.log("\nTo test real webhook processing, create an order in your test store.");
}

runTests().catch(console.error);