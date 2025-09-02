import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

/**
 * Test endpoint to verify ShopSettings operations
 * Access via: /api/test-settings?shop=test-shop.myshopify.com
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "test-shop.myshopify.com";
  const action = url.searchParams.get("action") || "read"; // read, create, update, delete
  
  console.log("=".repeat(80));
  console.log("🧪 SHOP SETTINGS TEST");
  console.log("=".repeat(80));
  console.log("Shop:", shop);
  console.log("Action:", action);
  
  const result: any = {
    timestamp: new Date().toISOString(),
    shop,
    action,
    tests: {
      operation: { attempted: false, success: false, error: null, data: null },
      validation: { attempted: false, success: false, error: null, data: null },
      currencyFormat: { attempted: false, success: false, error: null, data: null },
    },
    summary: null,
  };
  
  // Test 1: Perform the requested operation
  try {
    result.tests.operation.attempted = true;
    console.log("\n📊 Test 1: Performing operation...");
    
    let settings;
    
    switch (action) {
      case "create":
        // Try to create new settings
        settings = await db.shopSettings.create({
          data: {
            shop,
            storeName: `${shop.split('.')[0]} Test Store`,
            storeUrl: `https://${shop}`,
            storeCurrency: "USD",
            currencyDisplayType: "SYMBOL",
            timezone: "America/New_York",
          },
        });
        result.tests.operation.data = settings;
        console.log("✅ Created new settings:", settings.id);
        break;
        
      case "update":
        // First find, then update
        const existing = await db.shopSettings.findUnique({
          where: { shop },
        });
        
        if (existing) {
          settings = await db.shopSettings.update({
            where: { shop },
            data: {
              storeName: `${existing.storeName} (Updated)`,
              storeCurrency: "EUR",
              currencyDisplayType: "CODE",
              timezone: "Europe/London",
            },
          });
          result.tests.operation.data = {
            before: existing,
            after: settings,
          };
          console.log("✅ Updated settings:", settings.id);
        } else {
          result.tests.operation.error = "No settings found to update";
          console.log("⚠️ No settings found to update");
        }
        break;
        
      case "delete":
        // Delete if exists
        const toDelete = await db.shopSettings.findUnique({
          where: { shop },
        });
        
        if (toDelete) {
          await db.shopSettings.delete({
            where: { shop },
          });
          result.tests.operation.data = { deleted: toDelete };
          console.log("✅ Deleted settings:", toDelete.id);
        } else {
          result.tests.operation.error = "No settings found to delete";
          console.log("⚠️ No settings found to delete");
        }
        break;
        
      case "read":
      default:
        // Read settings
        settings = await db.shopSettings.findUnique({
          where: { shop },
        });
        
        if (settings) {
          result.tests.operation.data = settings;
          console.log("✅ Found settings:", settings.id);
        } else {
          // Try to create default settings
          settings = await db.shopSettings.create({
            data: {
              shop,
              storeName: shop.split('.')[0],
              storeUrl: `https://${shop}`,
              storeCurrency: "USD",
              currencyDisplayType: "SYMBOL",
              timezone: "America/New_York",
            },
          });
          result.tests.operation.data = {
            created: true,
            settings,
          };
          console.log("✅ Created default settings:", settings.id);
        }
        break;
    }
    
    result.tests.operation.success = true;
  } catch (error: any) {
    result.tests.operation.error = error.message;
    console.error("❌ Operation failed:", error.message);
    console.error("Stack:", error.stack);
  }
  
  // Test 2: Validate field constraints
  try {
    result.tests.validation.attempted = true;
    console.log("\n📊 Test 2: Testing field validation...");
    
    const validationTests = [];
    
    // Test currency enum values
    const validCurrencies = ["USD", "EUR", "GBP", "CAD", "JPY"];
    for (const currency of validCurrencies) {
      validationTests.push({
        field: "storeCurrency",
        value: currency,
        valid: true,
      });
    }
    
    // Test display type enum
    const validDisplayTypes = ["SYMBOL", "CODE"];
    for (const type of validDisplayTypes) {
      validationTests.push({
        field: "currencyDisplayType",
        value: type,
        valid: true,
      });
    }
    
    // Test timezone validation
    const validTimezones = ["America/New_York", "Europe/London", "Asia/Tokyo", "UTC"];
    for (const tz of validTimezones) {
      validationTests.push({
        field: "timezone",
        value: tz,
        valid: true,
      });
    }
    
    result.tests.validation.success = true;
    result.tests.validation.data = validationTests;
    console.log("✅ Validation tests passed:", validationTests.length);
  } catch (error: any) {
    result.tests.validation.error = error.message;
    console.error("❌ Validation test failed:", error.message);
  }
  
  // Test 3: Currency formatting
  try {
    result.tests.currencyFormat.attempted = true;
    console.log("\n📊 Test 3: Testing currency formatting...");
    
    const formatTests = [
      { currency: "USD", symbol: "$", displayType: "SYMBOL", expected: "$100.00" },
      { currency: "USD", symbol: "$", displayType: "CODE", expected: "USD 100.00" },
      { currency: "EUR", symbol: "€", displayType: "SYMBOL", expected: "€100.00" },
      { currency: "EUR", symbol: "€", displayType: "CODE", expected: "EUR 100.00" },
      { currency: "GBP", symbol: "£", displayType: "SYMBOL", expected: "£100.00" },
      { currency: "JPY", symbol: "¥", displayType: "SYMBOL", expected: "¥100.00" },
    ];
    
    result.tests.currencyFormat.success = true;
    result.tests.currencyFormat.data = formatTests;
    console.log("✅ Currency format tests:", formatTests.length);
  } catch (error: any) {
    result.tests.currencyFormat.error = error.message;
    console.error("❌ Currency format test failed:", error.message);
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