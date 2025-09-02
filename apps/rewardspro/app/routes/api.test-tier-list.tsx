import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

/**
 * Test endpoint to verify tier listing works after creation
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "test-shop.myshopify.com";
  
  console.log("=".repeat(80));
  console.log("🧪 TIER LISTING TEST");
  console.log("=".repeat(80));
  console.log("Shop:", shop);
  
  const result: any = {
    timestamp: new Date().toISOString(),
    shop,
    tests: {
      listTiers: { attempted: false, success: false, error: null, data: null },
      dateHandling: { attempted: false, success: false, error: null, data: null },
    },
    summary: null,
  };
  
  // Test 1: List all tiers for the shop
  try {
    result.tests.listTiers.attempted = true;
    console.log("\n📊 Test 1: Listing tiers...");
    
    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    });
    
    result.tests.listTiers.success = true;
    result.tests.listTiers.data = {
      count: tiers.length,
      tiers: tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        minSpend: tier.minSpend,
        cashbackPercent: tier.cashbackPercent,
        evaluationPeriod: tier.evaluationPeriod,
        createdAt: tier.createdAt,
        createdAtType: typeof tier.createdAt,
        createdAtIsDate: tier.createdAt instanceof Date,
      })),
    };
    
    console.log(`✅ Found ${tiers.length} tiers`);
    console.log("First tier createdAt type:", tiers[0] ? typeof tiers[0].createdAt : "N/A");
    console.log("First tier createdAt is Date?", tiers[0] ? tiers[0].createdAt instanceof Date : "N/A");
  } catch (error: any) {
    result.tests.listTiers.error = error.message;
    console.error("❌ List tiers test failed:", error.message);
    console.error("Stack:", error.stack);
  }
  
  // Test 2: Date serialization
  try {
    result.tests.dateHandling.attempted = true;
    console.log("\n📊 Test 2: Testing date serialization...");
    
    const tiers = await db.tier.findMany({
      where: { shop },
      take: 1,
    });
    
    if (tiers.length > 0) {
      const tier = tiers[0];
      
      // Try to serialize like the route does
      const serialized = {
        ...tier,
        createdAt: tier.createdAt instanceof Date 
          ? tier.createdAt.toISOString() 
          : tier.createdAt,
      };
      
      result.tests.dateHandling.success = true;
      result.tests.dateHandling.data = {
        original: {
          value: tier.createdAt,
          type: typeof tier.createdAt,
          isDate: tier.createdAt instanceof Date,
        },
        serialized: {
          value: serialized.createdAt,
          type: typeof serialized.createdAt,
        },
      };
      
      console.log("✅ Date serialization successful");
    } else {
      result.tests.dateHandling.success = true;
      result.tests.dateHandling.data = "No tiers to test";
      console.log("⚠️ No tiers found to test date serialization");
    }
  } catch (error: any) {
    result.tests.dateHandling.error = error.message;
    console.error("❌ Date handling test failed:", error.message);
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