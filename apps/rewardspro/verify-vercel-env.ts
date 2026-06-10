/**
 * Verify Vercel Environment Variables
 * 
 * This script helps verify that environment variables
 * are correctly configured for each Vercel environment.
 */

import { config } from "dotenv";

// Load environment variables
config();

interface EnvironmentCheck {
  variable: string;
  required: {
    production: boolean;
    preview: boolean;
    development: boolean;
  };
  sensitive?: boolean;
}

const checks: EnvironmentCheck[] = [
  // Shopify Configuration
  {
    variable: "SHOPIFY_API_KEY",
    required: { production: true, preview: true, development: true },
  },
  {
    variable: "SHOPIFY_API_SECRET",
    required: { production: true, preview: true, development: true },
    sensitive: true,
  },
  {
    variable: "SCOPES",
    required: { production: true, preview: true, development: true },
  },
  {
    variable: "SHOPIFY_APP_URL",
    required: { production: true, preview: false, development: false },
  },
  
  // Database Configuration
  {
    variable: "DATABASE_URL",
    required: { production: true, preview: false, development: false },
    sensitive: true,
  },
  {
    variable: "DIRECT_URL",
    required: { production: true, preview: false, development: false },
    sensitive: true,
  },
  
  // Aurora Data API
  {
    variable: "AURORA_RESOURCE_ARN",
    required: { production: true, preview: true, development: true },
  },
  {
    variable: "AURORA_SECRET_ARN",
    required: { production: true, preview: true, development: true },
  },
  {
    variable: "AURORA_DATABASE_NAME",
    required: { production: true, preview: true, development: true },
  },
  
  // AWS Credentials
  {
    variable: "AWS_ACCESS_KEY_ID",
    required: { production: true, preview: true, development: true },
    sensitive: true,
  },
  {
    variable: "AWS_SECRET_ACCESS_KEY",
    required: { production: true, preview: true, development: true },
    sensitive: true,
  },
  {
    variable: "AWS_REGION",
    required: { production: true, preview: true, development: true },
  },
  
  // Connection Strategy Override
  {
    variable: "FORCE_DATA_API",
    required: { production: false, preview: true, development: false },
  },
  
  // Vercel Environment (auto-set by Vercel)
  {
    variable: "VERCEL_ENV",
    required: { production: false, preview: false, development: false },
  },
];

function verifyEnvironment() {
  console.log("🔍 Verifying Environment Variables\n");
  console.log("=" .repeat(60));
  
  // Detect current environment
  const vercelEnv = process.env.VERCEL_ENV || "local";
  const nodeEnv = process.env.NODE_ENV || "development";
  
  console.log("\n📊 Current Environment:");
  console.log(`   VERCEL_ENV: ${vercelEnv}`);
  console.log(`   NODE_ENV: ${nodeEnv}`);
  console.log("\n" + "=" .repeat(60));
  
  // Map Vercel environment to our check categories
  const envType = vercelEnv === "production" ? "production" :
                   vercelEnv === "preview" ? "preview" :
                   "development";
  
  console.log(`\n✅ Required | ⚠️ Optional | ❌ Should NOT be set\n`);
  
  const results = {
    required: { set: 0, missing: 0, variables: [] as string[] },
    optional: { set: 0, missing: 0 },
    shouldNotExist: { exists: 0, variables: [] as string[] },
  };
  
  for (const check of checks) {
    const value = process.env[check.variable];
    const isSet = value !== undefined && value !== "";
    const isRequired = check.required[envType as keyof typeof check.required];
    
    let status = "";
    let displayValue = "";
    
    if (isSet) {
      displayValue = check.sensitive ? "***SET***" : 
                     value.length > 50 ? value.substring(0, 47) + "..." : value;
    }
    
    if (isRequired) {
      if (isSet) {
        status = "✅";
        results.required.set++;
      } else {
        status = "❌";
        results.required.missing++;
        results.required.variables.push(check.variable);
      }
    } else {
      if (isSet) {
        // Check if this should NOT be set
        if (envType === "preview" && check.variable === "DATABASE_URL") {
          status = "⚠️ WARNING";
          results.shouldNotExist.exists++;
          results.shouldNotExist.variables.push(check.variable);
        } else {
          status = "⚠️";
          results.optional.set++;
        }
      } else {
        status = "⚠️";
        results.optional.missing++;
      }
    }
    
    console.log(`${status} ${check.variable.padEnd(30)} ${displayValue}`);
  }
  
  // Summary
  console.log("\n" + "=" .repeat(60));
  console.log("\n📋 Summary for", envType.toUpperCase(), "environment:\n");
  
  if (results.required.missing === 0) {
    console.log("✅ All required variables are set!");
  } else {
    console.log(`❌ Missing ${results.required.missing} required variables:`);
    results.required.variables.forEach(v => console.log(`   - ${v}`));
  }
  
  if (results.shouldNotExist.exists > 0) {
    console.log(`\n⚠️ WARNING: These variables should NOT be set in ${envType}:`);
    results.shouldNotExist.variables.forEach(v => console.log(`   - ${v}`));
  }
  
  // Connection strategy info
  console.log("\n🔌 Expected Connection Strategy:");
  switch (envType) {
    case "production":
      console.log("   - Will use DIRECT connections (max 5)");
      console.log("   - DATABASE_URL must be set");
      console.log("   - Can optionally use RDS Proxy");
      break;
    case "preview":
      console.log("   - Will use Data API (0 connections)");
      console.log("   - DATABASE_URL must NOT be set");
      console.log("   - FORCE_DATA_API should be true");
      break;
    case "development":
      console.log("   - Will use local database or Data API");
      console.log("   - Flexible configuration");
      break;
  }
  
  // Recommendations
  console.log("\n💡 Recommendations:");
  
  if (envType === "preview" && process.env.DATABASE_URL) {
    console.log("   ⚠️ Remove DATABASE_URL from preview environment!");
    console.log("      This prevents connection exhaustion.");
  }
  
  if (envType === "preview" && process.env.FORCE_DATA_API !== "true") {
    console.log("   ⚠️ Set FORCE_DATA_API=true for preview!");
    console.log("      This ensures Data API is always used.");
  }
  
  if (envType === "production" && !process.env.DATABASE_URL) {
    console.log("   ❌ Add DATABASE_URL to production environment!");
    console.log("      Production needs direct connections for performance.");
  }
  
  console.log("\n" + "=" .repeat(60));
  console.log("\n🎯 Next Steps:");
  console.log("1. Go to Vercel Dashboard → Settings → Environment Variables");
  console.log("2. Add missing variables for", envType, "environment");
  console.log("3. Deploy and check logs for connection strategy confirmation");
  console.log("\n");
}

// Run verification
verifyEnvironment();