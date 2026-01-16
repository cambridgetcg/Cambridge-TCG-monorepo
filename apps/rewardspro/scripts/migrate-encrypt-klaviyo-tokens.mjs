#!/usr/bin/env node

/**
 * Klaviyo Token Encryption Migration Script
 *
 * This script encrypts existing unencrypted Klaviyo OAuth tokens in the database.
 * It detects whether tokens are already encrypted by checking their format.
 *
 * Run with: node scripts/migrate-encrypt-klaviyo-tokens.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import crypto from "crypto";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// ============================================
// ENCRYPTION UTILITIES (copied from app/utils/encryption.ts)
// ============================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET || process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    throw new Error('No encryption secret available. Set ENCRYPTION_SECRET environment variable.');
  }

  const salt = process.env.ENCRYPTION_SALT
    ? Buffer.from(process.env.ENCRYPTION_SALT, 'hex')
    : crypto.createHash('sha256').update('shopify-app-salt').digest();

  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

function encrypt(text) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const key = crypto.pbkdf2Sync(
    getEncryptionKey(),
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, authTag, encrypted]);

  return combined.toString('base64');
}

function isAlreadyEncrypted(value) {
  if (!value) return false;

  // Encrypted tokens are base64 and contain salt+iv+tag+data
  // Minimum size: 64 (salt) + 16 (iv) + 16 (tag) + 1 (min data) = 97 bytes
  // Base64 encoded: ~130+ characters
  // Klaviyo tokens are typically shorter OAuth tokens like "pk_xxx" or JWT-style tokens

  try {
    const decoded = Buffer.from(value, 'base64');
    // Check if it's the right minimum length for our encryption format
    if (decoded.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
      // Try to see if it looks like valid base64 of correct length
      // Unencrypted Klaviyo tokens don't typically decode to this size
      return true;
    }
  } catch (e) {
    // Not valid base64, so not encrypted
  }

  // Additional heuristic: Klaviyo access tokens typically start with known patterns
  // or are JWT format (xxx.xxx.xxx)
  if (value.startsWith('pk_') || value.startsWith('sk_') || value.includes('.')) {
    return false; // Likely unencrypted Klaviyo token
  }

  // If it's a long base64 string without Klaviyo patterns, assume encrypted
  if (value.length > 150 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    return true;
  }

  return false;
}

// ============================================
// DATA API CLIENT
// ============================================

const client = new RDSDataClient({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const RESOURCE_ARN = process.env.AURORA_RESOURCE_ARN;
const SECRET_ARN = process.env.AURORA_SECRET_ARN;
const DATABASE = process.env.AURORA_DATABASE_NAME || "rewardspro";

async function executeQuery(sql, parameters = []) {
  const command = new ExecuteStatementCommand({
    resourceArn: RESOURCE_ARN,
    secretArn: SECRET_ARN,
    database: DATABASE,
    sql,
    parameters,
    includeResultMetadata: true,
  });

  return client.send(command);
}

async function executeUpdate(sql, parameters = []) {
  const command = new ExecuteStatementCommand({
    resourceArn: RESOURCE_ARN,
    secretArn: SECRET_ARN,
    database: DATABASE,
    sql,
    parameters,
  });

  return client.send(command);
}

// ============================================
// MIGRATION LOGIC
// ============================================

async function main() {
  console.log("🔐 Klaviyo Token Encryption Migration\n");
  console.log("Database:", DATABASE);
  console.log("Resource ARN:", RESOURCE_ARN ? "✓ Set" : "✗ Missing");
  console.log("Secret ARN:", SECRET_ARN ? "✓ Set" : "✗ Missing");
  console.log("Encryption Secret:", process.env.ENCRYPTION_SECRET ? "✓ Set" : "⚠️ Using SHOPIFY_API_SECRET fallback");

  if (!RESOURCE_ARN || !SECRET_ARN) {
    console.error("\n❌ Missing required environment variables!");
    process.exit(1);
  }

  // Verify encryption is working
  console.log("\n📋 Verifying encryption configuration...");
  try {
    const testEncrypted = encrypt("test");
    console.log("✅ Encryption working correctly\n");
  } catch (error) {
    console.error("❌ Encryption failed:", error.message);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Fetch all EmailSettings with Klaviyo tokens
  // ═══════════════════════════════════════════════════════════════════════

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("STEP 1: Fetching EmailSettings with Klaviyo tokens");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const result = await executeQuery(`
    SELECT "shop", "klaviyoAccessToken", "klaviyoRefreshToken"
    FROM "EmailSettings"
    WHERE "klaviyoAccessToken" IS NOT NULL
       OR "klaviyoRefreshToken" IS NOT NULL
  `);

  const records = result.records || [];
  console.log(`Found ${records.length} records with Klaviyo tokens\n`);

  if (records.length === 0) {
    console.log("✅ No tokens to migrate!");
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Process each record
  // ═══════════════════════════════════════════════════════════════════════

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("STEP 2: Processing records");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of records) {
    const shop = record[0]?.stringValue;
    const accessToken = record[1]?.stringValue;
    const refreshToken = record[2]?.stringValue;

    console.log(`\n📍 Processing: ${shop}`);

    // Check if already encrypted
    const accessAlreadyEncrypted = isAlreadyEncrypted(accessToken);
    const refreshAlreadyEncrypted = isAlreadyEncrypted(refreshToken);

    if (accessAlreadyEncrypted && refreshAlreadyEncrypted) {
      console.log(`   ⏭️  Tokens already encrypted, skipping`);
      skipped++;
      continue;
    }

    try {
      const updates = [];
      const params = [];

      if (accessToken && !accessAlreadyEncrypted) {
        const encryptedAccess = encrypt(accessToken);
        updates.push(`"klaviyoAccessToken" = :access`);
        params.push({ name: 'access', value: { stringValue: encryptedAccess } });
        console.log(`   🔐 Encrypting access token (${accessToken.substring(0, 10)}...)`);
      }

      if (refreshToken && !refreshAlreadyEncrypted) {
        const encryptedRefresh = encrypt(refreshToken);
        updates.push(`"klaviyoRefreshToken" = :refresh`);
        params.push({ name: 'refresh', value: { stringValue: encryptedRefresh } });
        console.log(`   🔐 Encrypting refresh token (${refreshToken.substring(0, 10)}...)`);
      }

      if (updates.length > 0) {
        params.push({ name: 'shop', value: { stringValue: shop } });

        await executeUpdate(
          `UPDATE "EmailSettings" SET ${updates.join(', ')} WHERE "shop" = :shop`,
          params
        );

        console.log(`   ✅ Updated successfully`);
        encrypted++;
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errors++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("MIGRATION COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`📊 Results:`);
  console.log(`   ✅ Encrypted: ${encrypted} records`);
  console.log(`   ⏭️  Skipped (already encrypted): ${skipped} records`);
  console.log(`   ❌ Errors: ${errors} records`);

  if (errors > 0) {
    console.log("\n⚠️  Some records failed. Please review the errors above.");
    process.exit(1);
  }

  console.log("\n🎉 All Klaviyo tokens are now encrypted!");
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
