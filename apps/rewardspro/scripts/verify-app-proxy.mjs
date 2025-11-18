#!/usr/bin/env node

/**
 * App Proxy Verification Script
 *
 * Helps verify that the app proxy is correctly configured and working
 * Run after configuring app proxy in Partner Dashboard
 *
 * Usage:
 *   node scripts/verify-app-proxy.mjs <shop-domain> [customer-id]
 *
 * Example:
 *   node scripts/verify-app-proxy.mjs rewardspro-dev.myshopify.com clx123abc
 */

import https from 'https';

const [,, shopDomain, customerId] = process.argv;

if (!shopDomain) {
  console.error(`
❌ Error: Shop domain is required

Usage:
  node scripts/verify-app-proxy.mjs <shop-domain> [customer-id]

Example:
  node scripts/verify-app-proxy.mjs rewardspro-dev.myshopify.com clx123abc
`);
  process.exit(1);
}

// Normalize shop domain
const normalizedShop = shopDomain
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

const shopWithDomain = normalizedShop.endsWith('.myshopify.com')
  ? normalizedShop
  : `${normalizedShop}.myshopify.com`;

console.log(`
╭─ App Proxy Verification ──────────────────────────────────────╮
│                                                                │
│  Testing app proxy configuration...                           │
│                                                                │
│  Shop:        ${shopWithDomain.padEnd(48)} │
│  Customer ID: ${(customerId || 'Not provided (will get 400)').padEnd(48)} │
│                                                                │
╰────────────────────────────────────────────────────────────────╯
`);

// Test 1: Check if app proxy route exists (basic connectivity)
console.log('📡 Test 1: App proxy route connectivity...');

const testUrl = `https://${shopWithDomain}/apps/rewardspro/loyalty${customerId ? `?customerId=${customerId}` : ''}`;

const options = {
  hostname: shopWithDomain,
  path: `/apps/rewardspro/loyalty${customerId ? `?customerId=${customerId}` : ''}`,
  method: 'GET',
  headers: {
    'User-Agent': 'RewardsPro-Verification-Script/1.0',
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`\n📊 Response Status: ${res.statusCode}`);
    console.log(`📋 Response Headers:`);
    console.log(`   - Content-Type: ${res.headers['content-type']}`);
    console.log(`   - Cache-Control: ${res.headers['cache-control']}`);

    // Check for Shopify app proxy headers
    const hasShopifyHeaders = res.headers['x-shopify-shop'] || res.headers['x-shopify-api-version'];
    console.log(`   - Shopify Headers: ${hasShopifyHeaders ? '✅ Present' : '⚠️  Not detected'}`);

    console.log(`\n📄 Response Body:`);
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));

      // Analyze response
      console.log(`\n╭─ Analysis ─────────────────────────────────────────────────────╮`);

      if (res.statusCode === 404) {
        console.log(`│ ❌ Status: App proxy NOT configured                           │`);
        console.log(`│                                                                │`);
        console.log(`│    Possible causes:                                            │`);
        console.log(`│    1. Partner Dashboard app proxy not configured               │`);
        console.log(`│    2. DNS not propagated (wait 2-3 minutes)                    │`);
        console.log(`│    3. App not installed on this store                          │`);
        console.log(`│                                                                │`);
        console.log(`│    Next steps:                                                 │`);
        console.log(`│    → Configure in Partner Dashboard                            │`);
        console.log(`│    → See: PARTNER_DASHBOARD_APP_PROXY_SETUP.md                 │`);
      } else if (res.statusCode === 403) {
        console.log(`│ ⚠️  Status: App proxy working, app not installed              │`);
        console.log(`│                                                                │`);
        console.log(`│    The app proxy is configured correctly, but:                 │`);
        console.log(`│    → App not installed on ${shopWithDomain.padEnd(28)} │`);
        console.log(`│                                                                │`);
        console.log(`│    Next steps:                                                 │`);
        console.log(`│    → Install app from Shopify Admin                            │`);
      } else if (res.statusCode === 400) {
        console.log(`│ ✅ Status: App proxy working! (Missing customer ID)           │`);
        console.log(`│                                                                │`);
        console.log(`│    App proxy is correctly configured.                          │`);
        console.log(`│    Need to provide customer ID to test full flow.              │`);
        console.log(`│                                                                │`);
        console.log(`│    Next steps:                                                 │`);
        console.log(`│    → Run with customer ID to test fully                        │`);
        console.log(`│    → node scripts/verify-app-proxy.mjs ${shopWithDomain} clx123  │`);
      } else if (res.statusCode === 200) {
        console.log(`│ ✅ Status: App proxy fully working!                           │`);
        console.log(`│                                                                │`);
        console.log(`│    Response data:                                              │`);
        console.log(`│    → Balance: ${String(json.balance || 0).padEnd(48)} │`);
        console.log(`│    → Tier: ${String(json.tier?.name || 'None').padEnd(51)} │`);
        console.log(`│    → Progress: ${String(json.progress?.percentage || 0).padEnd(47)}% │`);
        console.log(`│                                                                │`);
        console.log(`│    🎉 Everything is working correctly!                         │`);
      } else {
        console.log(`│ ⚠️  Status: Unexpected response code                          │`);
        console.log(`│                                                                │`);
        console.log(`│    Status: ${String(res.statusCode).padEnd(55)} │`);
        console.log(`│    Check backend logs for details.                             │`);
      }

      console.log(`╰────────────────────────────────────────────────────────────────╯`);

    } catch (e) {
      console.log(data);
      console.log(`\n❌ Error: Response is not valid JSON`);
      console.log(`   This might indicate a server error or misconfiguration.`);
    }

    // Additional recommendations
    if (res.statusCode !== 200) {
      console.log(`\n📚 Documentation:`);
      console.log(`   → PARTNER_DASHBOARD_APP_PROXY_SETUP.md`);
      console.log(`   → APP_PROXY_MIGRATION_PLAN.md`);
      console.log(`\n🔍 Debug commands:`);
      console.log(`   → vercel logs rewardspro-production --follow`);
      console.log(`   → shopify app versions list`);
    }
  });
});

req.on('error', (e) => {
  console.error(`\n❌ Network Error: ${e.message}`);
  console.error(`\nPossible causes:`);
  console.error(`  - Shop domain incorrect`);
  console.error(`  - Network connectivity issue`);
  console.error(`  - Shop doesn't exist`);
  process.exit(1);
});

req.end();
