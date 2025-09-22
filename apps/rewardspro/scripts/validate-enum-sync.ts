#!/usr/bin/env ts-node

/**
 * Script to validate that Prisma enums are in sync with TypeScript usage
 * Run this in CI/CD or as a pre-commit hook
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Read Prisma schema file
const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

// Extract enum definitions from Prisma schema
function extractPrismaEnums(schema: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const enumRegex = /enum\s+(\w+)\s*{([^}]+)}/g;

  let match;
  while ((match = enumRegex.exec(schema)) !== null) {
    const enumName = match[1];
    const enumBody = match[2];

    // Extract enum values (ignoring comments)
    const values = enumBody
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'))
      .map(line => line.split(/\s+/)[0]) // Get first word (enum value)
      .filter(Boolean);

    enums.set(enumName, values);
  }

  return enums;
}

// Validate that TypeScript imports match Prisma enums
async function validateEnumSync() {
  console.log('🔍 Validating Prisma enum synchronization...\n');

  const prismaEnums = extractPrismaEnums(schemaContent);
  const errors: string[] = [];

  // List the Prisma enums found
  console.log('📋 Prisma Enums Found:');
  for (const [enumName, values] of prismaEnums) {
    console.log(`  - ${enumName}: ${values.length} values`);
  }
  console.log('');

  // Check Currency enum specifically
  const prismaCurrencies = prismaEnums.get('Currency');
  if (prismaCurrencies) {
    console.log('💱 Validating Currency enum:');
    console.log(`  Prisma Currency values: ${prismaCurrencies.length}`);

    // Check if all files using Currency are importing from @prisma/client
    const filesToCheck = [
      'app/utils/currency.ts',
      'app/utils/currency-types.ts',
      'app/services/currency-normalization.server.ts'
    ];

    for (const file of filesToCheck) {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for Prisma import
        if (content.includes('from "@prisma/client"') || content.includes("from '@prisma/client'")) {
          console.log(`  ✅ ${file} imports from @prisma/client`);
        } else if (content.includes('Currency')) {
          console.log(`  ⚠️  ${file} uses Currency but doesn't import from @prisma/client`);
          errors.push(`${file} should import Currency from @prisma/client`);
        }

        // Check for hardcoded currency lists
        const hardcodedCurrencyRegex = /(?:USD|EUR|GBP|CAD|AUD|JPY).*(?:USD|EUR|GBP|CAD|AUD|JPY)/;
        if (hardcodedCurrencyRegex.test(content) && !content.includes('@prisma/client')) {
          console.log(`  ⚠️  ${file} appears to have hardcoded currency list`);
          errors.push(`${file} has hardcoded currencies instead of using Prisma enum`);
        }
      }
    }
  }

  console.log('\n📊 Validation Summary:');
  if (errors.length === 0) {
    console.log('✅ All enums are properly synchronized!');
    process.exit(0);
  } else {
    console.log(`❌ Found ${errors.length} synchronization issues:\n`);
    errors.forEach(error => console.log(`  - ${error}`));
    process.exit(1);
  }
}

// Run validation
validateEnumSync().catch(error => {
  console.error('Error during validation:', error);
  process.exit(1);
});