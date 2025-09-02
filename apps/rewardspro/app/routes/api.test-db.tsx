import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Test endpoint to verify database connectivity with Data API
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  console.log("=".repeat(80));
  console.log("🗄️ DATABASE TEST ENDPOINT");
  console.log("=".repeat(80));
  console.log("Shop:", shop || "NOT PROVIDED");
  
  const result: any = {
    timestamp: new Date().toISOString(),
    shop: shop || "NOT PROVIDED",
    tests: {
      basic: { attempted: false, success: false, error: null, data: null },
      customer: { attempted: false, success: false, error: null, data: null },
      tier: { attempted: false, success: false, error: null, data: null },
      aggregate: { attempted: false, success: false, error: null, data: null },
    },
    summary: null,
  };
  
  // Test 1: Basic connection test - count sessions
  try {
    result.tests.basic.attempted = true;
    console.log("\n📊 Test 1: Counting sessions...");
    
    const sessionCount = await db.session.count();
    
    result.tests.basic.success = true;
    result.tests.basic.data = { sessionCount };
    console.log(`✅ Found ${sessionCount} sessions`);
  } catch (error: any) {
    result.tests.basic.error = error.message;
    console.error("❌ Basic test failed:", error.message);
  }
  
  // Test 2: Customer query with includes (if shop provided)
  if (shop) {
    try {
      result.tests.customer.attempted = true;
      console.log("\n📊 Test 2: Fetching customers with includes...");
      
      const customers = await db.customer.findMany({
        where: { shop },
        take: 5,
        include: {
          currentTier: {
            select: {
              id: true,
              name: true,
              cashbackPercent: true,
            },
          },
          _count: {
            select: {
              creditLedger: true,
            },
          },
        },
      });
      
      result.tests.customer.success = true;
      result.tests.customer.data = {
        count: customers.length,
        sample: customers[0] || null,
      };
      console.log(`✅ Found ${customers.length} customers`);
    } catch (error: any) {
      result.tests.customer.error = error.message;
      console.error("❌ Customer test failed:", error.message);
    }
    
    // Test 3: Tier query
    try {
      result.tests.tier.attempted = true;
      console.log("\n📊 Test 3: Fetching tiers...");
      
      const tiers = await db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
      });
      
      result.tests.tier.success = true;
      result.tests.tier.data = {
        count: tiers.length,
        tiers: tiers.map(t => ({
          name: t.name,
          minSpend: t.minSpend,
          cashbackPercent: t.cashbackPercent,
        })),
      };
      console.log(`✅ Found ${tiers.length} tiers`);
    } catch (error: any) {
      result.tests.tier.error = error.message;
      console.error("❌ Tier test failed:", error.message);
    }
    
    // Test 4: Aggregate query
    try {
      result.tests.aggregate.attempted = true;
      console.log("\n📊 Test 4: Aggregate query...");
      
      const stats = await db.customer.aggregate({
        where: { shop },
        _count: true,
        _sum: {
          storeCredit: true,
        },
      });
      
      result.tests.aggregate.success = true;
      result.tests.aggregate.data = stats;
      console.log("✅ Aggregate query successful");
    } catch (error: any) {
      result.tests.aggregate.error = error.message;
      console.error("❌ Aggregate test failed:", error.message);
    }
  } else {
    console.log("⚠️ Skipping shop-specific tests (no shop parameter)");
  }
  
  // Summary
  const successCount = Object.values(result.tests).filter((t: any) => t.success).length;
  const attemptedCount = Object.values(result.tests).filter((t: any) => t.attempted).length;
  
  result.summary = {
    testsRun: attemptedCount,
    testsPassed: successCount,
    testsFailed: attemptedCount - successCount,
    status: successCount === attemptedCount ? "✅ ALL TESTS PASSED" : 
            successCount === 0 ? "❌ ALL TESTS FAILED" : 
            "⚠️ PARTIAL SUCCESS",
  };
  
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY:", result.summary.status);
  console.log(`Tests: ${successCount}/${attemptedCount} passed`);
  console.log("=".repeat(80));
  
  return json(result, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};