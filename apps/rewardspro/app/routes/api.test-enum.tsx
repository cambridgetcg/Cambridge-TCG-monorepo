import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Test endpoint to verify enum handling in Data API
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "test-shop.myshopify.com";
  
  console.log("=".repeat(80));
  console.log("🧪 ENUM TEST ENDPOINT");
  console.log("=".repeat(80));
  console.log("Shop:", shop);
  
  const result: any = {
    timestamp: new Date().toISOString(),
    shop,
    tests: {
      createTier: { attempted: false, success: false, error: null, data: null },
      updateTier: { attempted: false, success: false, error: null, data: null },
      createShopSettings: { attempted: false, success: false, error: null, data: null },
      createLedgerEntry: { attempted: false, success: false, error: null, data: null },
    },
    summary: null,
  };
  
  // Test 1: Create a tier with enum field
  try {
    result.tests.createTier.attempted = true;
    console.log("\n📊 Test 1: Creating tier with EvaluationPeriod enum...");
    
    const tier = await db.tier.create({
      data: {
        id: `test-tier-${Date.now()}`,
        shop,
        name: `Test Tier ${Date.now()}`,
        minSpend: 100,
        cashbackPercent: 5,
        evaluationPeriod: "ANNUAL", // This is the enum field
      },
    });
    
    result.tests.createTier.success = true;
    result.tests.createTier.data = tier;
    console.log("✅ Tier created successfully with enum:", tier.evaluationPeriod);
    
    // Clean up - delete the test tier
    await db.tier.delete({ where: { id: tier.id } });
    console.log("🧹 Test tier cleaned up");
  } catch (error: any) {
    result.tests.createTier.error = error.message;
    console.error("❌ Create tier test failed:", error.message);
  }
  
  // Test 2: Update a tier with enum field
  try {
    result.tests.updateTier.attempted = true;
    console.log("\n📊 Test 2: Updating tier with EvaluationPeriod enum...");
    
    // First create a tier
    const tempTier = await db.tier.create({
      data: {
        id: `test-tier-update-${Date.now()}`,
        shop,
        name: `Update Test ${Date.now()}`,
        minSpend: 200,
        cashbackPercent: 10,
        evaluationPeriod: "ANNUAL",
      },
    });
    
    // Now update it with a different enum value
    const updatedTier = await db.tier.update({
      where: { id: tempTier.id },
      data: {
        evaluationPeriod: "LIFETIME", // Change the enum value
      },
    });
    
    result.tests.updateTier.success = true;
    result.tests.updateTier.data = {
      before: tempTier.evaluationPeriod,
      after: updatedTier.evaluationPeriod,
    };
    console.log("✅ Tier updated successfully:", {
      before: tempTier.evaluationPeriod,
      after: updatedTier.evaluationPeriod,
    });
    
    // Clean up
    await db.tier.delete({ where: { id: tempTier.id } });
    console.log("🧹 Test tier cleaned up");
  } catch (error: any) {
    result.tests.updateTier.error = error.message;
    console.error("❌ Update tier test failed:", error.message);
  }
  
  // Test 3: Create shop settings with multiple enums
  try {
    result.tests.createShopSettings.attempted = true;
    console.log("\n📊 Test 3: Creating shop settings with Currency and CurrencyDisplayType enums...");
    
    const settings = await db.shopSettings.create({
      data: {
        id: `test-settings-${Date.now()}`,
        shop: `test-shop-${Date.now()}.myshopify.com`,
        storeName: "Test Store",
        storeUrl: "https://test-store.com",
        storeCurrency: "USD", // Currency enum
        currencyDisplayType: "SYMBOL", // CurrencyDisplayType enum
        timezone: "America/New_York",
      },
    });
    
    result.tests.createShopSettings.success = true;
    result.tests.createShopSettings.data = {
      currency: settings.storeCurrency,
      displayType: settings.currencyDisplayType,
    };
    console.log("✅ Shop settings created with enums:", {
      currency: settings.storeCurrency,
      displayType: settings.currencyDisplayType,
    });
    
    // Clean up
    await db.shopSettings.delete({ where: { id: settings.id } });
    console.log("🧹 Test settings cleaned up");
  } catch (error: any) {
    result.tests.createShopSettings.error = error.message;
    console.error("❌ Create shop settings test failed:", error.message);
  }
  
  // Test 4: Create ledger entry with enum
  try {
    result.tests.createLedgerEntry.attempted = true;
    console.log("\n📊 Test 4: Creating ledger entry with LedgerEntryType enum...");
    
    // First create a test customer
    const customer = await db.customer.create({
      data: {
        id: `test-customer-${Date.now()}`,
        shop,
        shopifyCustomerId: `test-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        storeCredit: 0,
      },
    });
    
    // Create ledger entry with enum
    const ledgerEntry = await db.storeCreditLedger.create({
      data: {
        id: `test-ledger-${Date.now()}`,
        customerId: customer.id,
        shop,
        amount: 10.50,
        balance: 10.50,
        type: "CASHBACK_EARNED", // LedgerEntryType enum
      },
    });
    
    result.tests.createLedgerEntry.success = true;
    result.tests.createLedgerEntry.data = {
      type: ledgerEntry.type,
    };
    console.log("✅ Ledger entry created with enum:", ledgerEntry.type);
    
    // Clean up
    await db.storeCreditLedger.delete({ where: { id: ledgerEntry.id } });
    await db.customer.delete({ where: { id: customer.id } });
    console.log("🧹 Test data cleaned up");
  } catch (error: any) {
    result.tests.createLedgerEntry.error = error.message;
    console.error("❌ Create ledger entry test failed:", error.message);
  }
  
  // Summary
  const successCount = Object.values(result.tests).filter((t: any) => t.success).length;
  const attemptedCount = Object.values(result.tests).filter((t: any) => t.attempted).length;
  
  result.summary = {
    testsRun: attemptedCount,
    testsPassed: successCount,
    testsFailed: attemptedCount - successCount,
    status: successCount === attemptedCount ? "✅ ALL ENUM TESTS PASSED" : 
            successCount === 0 ? "❌ ALL ENUM TESTS FAILED" : 
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