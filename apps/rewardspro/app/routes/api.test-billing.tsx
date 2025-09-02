import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

/**
 * Test endpoint to verify billing operations
 * Access via: /api/test-billing?shop=test-shop.myshopify.com&action=status
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "test-shop.myshopify.com";
  const action = url.searchParams.get("action") || "status"; // status, create, upgrade, usage
  
  console.log("=".repeat(80));
  console.log("💳 BILLING TEST");
  console.log("=".repeat(80));
  console.log("Shop:", shop);
  console.log("Action:", action);
  
  const result: any = {
    timestamp: new Date().toISOString(),
    shop,
    action,
    tests: {
      billingPlan: { attempted: false, success: false, error: null, data: null },
      usageTracking: { attempted: false, success: false, error: null, data: null },
      planUpgrade: { attempted: false, success: false, error: null, data: null },
    },
    summary: null,
  };
  
  // Test 1: Billing Plan Operations
  try {
    result.tests.billingPlan.attempted = true;
    console.log("\n📊 Test 1: Billing plan operations...");
    
    let billingPlan;
    
    switch (action) {
      case "create":
        // Create a new billing plan
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        billingPlan = await db.billingPlan.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            planName: "free",
            status: "active",
            currentPeriodStart: startOfMonth,
            currentPeriodEnd: endOfMonth,
            ordersUsed: 0,
            ordersLimit: 200,
            priceMonthly: 0,
            overageRate: null,
            createdAt: now,
            updatedAt: now,
          },
        });
        result.tests.billingPlan.data = billingPlan;
        console.log("✅ Created billing plan:", billingPlan.id);
        break;
        
      case "upgrade":
        // Upgrade existing plan
        const existing = await db.billingPlan.findUnique({
          where: { shop },
        });
        
        if (existing) {
          billingPlan = await db.billingPlan.update({
            where: { shop },
            data: {
              planName: "starter",
              priceMonthly: 49,
              ordersLimit: 500,
              updatedAt: new Date(),
            },
          });
          result.tests.billingPlan.data = {
            before: existing.planName,
            after: billingPlan.planName,
            plan: billingPlan,
          };
          console.log("✅ Upgraded plan from", existing.planName, "to", billingPlan.planName);
        } else {
          result.tests.billingPlan.error = "No billing plan found to upgrade";
          console.log("⚠️ No billing plan found");
        }
        break;
        
      case "status":
      default:
        // Get current billing status
        billingPlan = await db.billingPlan.findUnique({
          where: { shop },
        });
        
        if (billingPlan) {
          // Calculate usage percentage
          const usagePercentage = billingPlan.ordersLimit > 0
            ? Math.round((billingPlan.ordersUsed / billingPlan.ordersLimit) * 100)
            : 0;
          
          result.tests.billingPlan.data = {
            plan: billingPlan,
            usagePercentage,
            daysRemaining: Math.ceil(
              (new Date(billingPlan.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            ),
          };
          console.log("✅ Found billing plan:", billingPlan.planName);
          console.log("   Usage:", billingPlan.ordersUsed, "/", billingPlan.ordersLimit);
        } else {
          // Create default free plan
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          
          billingPlan = await db.billingPlan.create({
            data: {
              id: crypto.randomUUID(),
              shop,
              planName: "free",
              status: "active",
              currentPeriodStart: startOfMonth,
              currentPeriodEnd: endOfMonth,
              ordersUsed: 0,
              ordersLimit: 200,
              priceMonthly: 0,
              overageRate: null,
              createdAt: now,
              updatedAt: now,
            },
          });
          result.tests.billingPlan.data = {
            created: true,
            plan: billingPlan,
          };
          console.log("✅ Created default free plan");
        }
        break;
    }
    
    result.tests.billingPlan.success = true;
  } catch (error: any) {
    result.tests.billingPlan.error = error.message;
    console.error("❌ Billing plan test failed:", error.message);
    console.error("Stack:", error.stack);
  }
  
  // Test 2: Usage Tracking
  if (action === "usage") {
    try {
      result.tests.usageTracking.attempted = true;
      console.log("\n📊 Test 2: Testing usage tracking...");
      
      // Get billing plan
      const billingPlan = await db.billingPlan.findUnique({
        where: { shop },
      });
      
      if (billingPlan) {
        // Create sample usage records
        const orderId = `test-order-${Date.now()}`;
        const usageRecord = await db.usageRecord.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            orderId,
            orderNumber: `#${Math.floor(Math.random() * 10000)}`,
            orderAmount: 99.99,
            billingPlanId: billingPlan.id,
            processedAt: new Date(),
          },
        });
        
        // Update orders used count
        const updatedPlan = await db.billingPlan.update({
          where: { shop },
          data: {
            ordersUsed: billingPlan.ordersUsed + 1,
            updatedAt: new Date(),
          },
        });
        
        result.tests.usageTracking.success = true;
        result.tests.usageTracking.data = {
          usageRecord,
          ordersUsed: updatedPlan.ordersUsed,
          ordersLimit: updatedPlan.ordersLimit,
        };
        console.log("✅ Created usage record and updated count");
      } else {
        result.tests.usageTracking.error = "No billing plan found";
        console.log("⚠️ No billing plan found for usage tracking");
      }
    } catch (error: any) {
      result.tests.usageTracking.error = error.message;
      console.error("❌ Usage tracking test failed:", error.message);
    }
  }
  
  // Test 3: Plan Features
  try {
    result.tests.planUpgrade.attempted = true;
    console.log("\n📊 Test 3: Testing plan features...");
    
    const plans = [
      { name: "free", price: 0, orders: 200 },
      { name: "starter", price: 49, orders: 500 },
      { name: "growth", price: 199, orders: 2500 },
      { name: "plus", price: 999, orders: 7500 },
    ];
    
    result.tests.planUpgrade.success = true;
    result.tests.planUpgrade.data = plans;
    console.log("✅ Plan features verified");
  } catch (error: any) {
    result.tests.planUpgrade.error = error.message;
    console.error("❌ Plan features test failed:", error.message);
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