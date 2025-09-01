import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

/**
 * Comprehensive test endpoint to debug authentication and communications
 * Access this directly to see all authentication details
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  
  console.log("=".repeat(80));
  console.log("🧪 TEST AUTH ENDPOINT - DEBUGGING BLANK PAGE");
  console.log("=".repeat(80));
  console.log("Request URL:", request.url);
  console.log("Shop:", shop || "NOT PROVIDED");
  console.log("Host:", host || "NOT PROVIDED");
  
  // Log all headers for debugging
  console.log("\n📋 Request Headers:");
  request.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log("=".repeat(80));
  
  const result: any = {
    timestamp: new Date().toISOString(),
    
    // Request details
    request: {
      url: request.url,
      method: request.method,
      shop: shop || "❌ MISSING",
      host: host || "❌ MISSING",
      hasAuthHeader: request.headers.has("authorization"),
      authHeader: request.headers.get("authorization") ? "Bearer token present" : "NONE",
      referer: request.headers.get("referer") || "NONE",
      isEmbedded: request.headers.get("sec-fetch-dest") === "iframe",
      userAgent: request.headers.get("user-agent"),
    },
    
    // Environment check
    environment: {
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ? "✅ SET" : "❌ MISSING",
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ? "✅ SET" : "❌ MISSING",
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "❌ NOT SET",
      SCOPES: process.env.SCOPES || "❌ NOT SET",
      DATABASE_URL: process.env.DATABASE_URL ? "✅ SET" : "❌ MISSING",
      AWS_REGION: process.env.AWS_REGION || "❌ NOT SET",
      AWS_RDS_RESOURCE_ARN: process.env.AWS_RDS_RESOURCE_ARN ? "✅ SET" : "❌ MISSING",
      AWS_RDS_SECRET_ARN: process.env.AWS_RDS_SECRET_ARN ? "✅ SET" : "❌ MISSING",
      NODE_ENV: process.env.NODE_ENV || "development",
    },
    
    // Authentication test
    authentication: {
      attempted: false,
      success: false,
      error: null,
      session: null,
    },
    
    // Database test
    database: {
      attempted: false,
      success: false,
      error: null,
      sessionCount: null,
      shopSessions: null,
    },
    
    // Issues detected
    issues: [],
    
    // Debug instructions
    debugSteps: [],
  };
  
  // Check for common issues
  if (!shop) {
    result.issues.push("⚠️ No 'shop' parameter - authentication will fail");
    result.debugSteps.push("Add ?shop=yourstore.myshopify.com to the URL");
  }
  
  if (!host && !request.headers.get("authorization")) {
    result.issues.push("⚠️ No 'host' parameter and no authorization header");
    result.debugSteps.push("This request is not coming from Shopify Admin");
  }
  
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
    result.issues.push("❌ CRITICAL: Shopify API credentials not configured in environment");
    result.debugSteps.push("Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to Vercel environment variables");
  }
  
  // Try authentication
  if (shop) {
    try {
      result.authentication.attempted = true;
      console.log("\n🔐 Attempting authentication for shop:", shop);
      
      const { session, admin } = await authenticate.admin(request);
      
      result.authentication.success = true;
      result.authentication.session = {
        id: session.id,
        shop: session.shop,
        state: session.state,
        isOnline: session.isOnline,
        scope: session.scope,
        expires: session.expires ? new Date(session.expires).toISOString() : null,
        hasAccessToken: !!session.accessToken,
        accessTokenLength: session.accessToken ? session.accessToken.length : 0,
      };
      
      console.log("✅ Authentication successful!");
      console.log("Session details:", JSON.stringify(result.authentication.session, null, 2));
    } catch (error: any) {
      result.authentication.success = false;
      result.authentication.error = {
        message: error.message,
        type: error.constructor.name,
        stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      };
      
      console.error("❌ Authentication failed:", error.message);
      result.issues.push(`❌ Authentication error: ${error.message}`);
      
      if (error.message.includes("shop")) {
        result.debugSteps.push("Make sure you're accessing from Shopify Admin");
      }
      if (error.message.includes("token")) {
        result.debugSteps.push("Session token may be expired or invalid");
      }
    }
  } else {
    result.authentication.error = "No shop parameter provided";
    result.debugSteps.push("Cannot authenticate without shop parameter");
  }
  
  // Try database connection
  try {
    result.database.attempted = true;
    console.log("\n🗄️ Testing database connection...");
    
    // Count all sessions
    const totalSessions = await db.session.count();
    result.database.sessionCount = totalSessions;
    
    console.log(`Found ${totalSessions} total sessions in database`);
    
    // If we have a shop, get its sessions
    if (shop) {
      const shopSessions = await db.session.findMany({
        where: { shop },
        select: {
          id: true,
          shop: true,
          isOnline: true,
          expires: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      
      result.database.shopSessions = shopSessions.map(s => ({
        ...s,
        expires: s.expires ? new Date(s.expires).toISOString() : null,
        createdAt: new Date(s.createdAt).toISOString(),
        updatedAt: new Date(s.updatedAt).toISOString(),
      }));
      
      result.database.success = true;
      console.log(`Found ${shopSessions.length} sessions for shop: ${shop}`);
      
      if (shopSessions.length === 0) {
        result.issues.push("⚠️ No sessions found for this shop in database");
        result.debugSteps.push("Shop may need to reinstall the app");
      }
    } else {
      result.database.success = true;
    }
  } catch (error: any) {
    result.database.success = false;
    result.database.error = {
      message: error.message,
      type: error.constructor.name,
    };
    
    console.error("❌ Database error:", error.message);
    result.issues.push(`❌ Database connection error: ${error.message}`);
    result.debugSteps.push("Check DATABASE_URL and AWS credentials in Vercel");
  }
  
  // Add final debugging recommendations
  if (result.issues.length === 0) {
    result.summary = "✅ All systems operational";
  } else {
    result.summary = "❌ Issues detected - see details below";
    
    // Add specific debugging steps based on issues
    if (!result.authentication.success && shop) {
      result.debugSteps.push("1. Open Chrome DevTools Network tab");
      result.debugSteps.push("2. Look for failed requests or 401/403 status codes");
      result.debugSteps.push("3. Check Console tab for JavaScript errors");
      result.debugSteps.push("4. Verify you're accessing from Shopify Admin");
    }
  }
  
  console.log("\n📊 TEST SUMMARY:");
  console.log("Issues found:", result.issues.length);
  console.log("Authentication:", result.authentication.success ? "✅" : "❌");
  console.log("Database:", result.database.success ? "✅" : "❌");
  console.log("=".repeat(80));
  
  return json(result, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      // Allow access from anywhere for testing
      "Access-Control-Allow-Origin": "*",
    },
  });
};