import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createDataAPISessionStorage } from "~/utils/session-data-api-adapter";
import { Session } from "@shopify/shopify-api";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const storage = createDataAPISessionStorage();
    
    // Create a test session
    const testSession = new Session({
      id: `test-session-${Date.now()}`,
      shop: "test-shop.myshopify.com",
      state: "test-state",
      isOnline: false,
      scope: "read_products,write_products",
      accessToken: "test-access-token",
    });
    
    console.log("[Test] Attempting to store session:", testSession.id);
    
    // Test store
    const stored = await storage.storeSession(testSession);
    console.log("[Test] Session stored:", stored);
    
    // Test load
    const loaded = await storage.loadSession(testSession.id);
    console.log("[Test] Session loaded:", loaded ? "Success" : "Failed");
    
    // Test find by shop
    const shopSessions = await storage.findSessionsByShop("test-shop.myshopify.com");
    console.log("[Test] Sessions found for shop:", shopSessions.length);
    
    // Clean up - delete test session
    const deleted = await storage.deleteSession(testSession.id);
    console.log("[Test] Session deleted:", deleted);
    
    return json({
      success: true,
      test: "Data API Session Storage",
      operations: {
        store: stored,
        load: loaded !== undefined,
        findByShop: shopSessions.length > 0,
        delete: deleted,
      },
      sessionId: testSession.id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Test] Error testing Data API session storage:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
};