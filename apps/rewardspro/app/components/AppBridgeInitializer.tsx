import { useEffect } from "react";
import { initializePostMessageSecurity } from "../utils/postmessage-validator";

/**
 * Component to ensure App Bridge is properly initialized
 * Handles force reload and debugging
 */
export function AppBridgeInitializer() {
  useEffect(() => {
    // Initialize postMessage security
    const cleanupSecurity = initializePostMessageSecurity();
    
    console.log("=".repeat(60));
    console.log("🌉 APP BRIDGE INITIALIZER - COMMUNICATION DEBUGGING");
    console.log("=".repeat(60));
    
    // Log current URL and parameters
    const url = new URL(window.location.href);
    const shop = url.searchParams.get('shop');
    const host = url.searchParams.get('host');
    
    console.log("📍 Current URL:", window.location.href);
    console.log("🛍️ Shop parameter:", shop || "❌ MISSING");
    console.log("🏠 Host parameter:", host || "❌ MISSING");
    
    // Check if we're in an iframe (embedded context)
    const isEmbedded = window.top !== window.self;
    console.log("🖼️ Embedded in iframe:", isEmbedded);
    console.log("📄 Document referrer:", document.referrer);
    
    // Check if App Bridge is available
    const hasAppBridge = typeof window !== 'undefined' && window.shopify;
    console.log("🌉 App Bridge available:", hasAppBridge);
    
    if (hasAppBridge && window.shopify) {
      console.log("✅ App Bridge Details:");
      console.log("  - Config:", window.shopify.config);
      console.log("  - Environment:", window.shopify.environment);
      console.log("  - Loading:", window.shopify.loading);
      
      // Force App Bridge to reinitialize if needed
      if ('loading' in window.shopify && (window.shopify as any).loading) {
        console.log("⚠️ Forcing App Bridge reload...");
        (window.shopify as any).loading = false;
      }
    } else {
      console.error("❌ App Bridge NOT found!");
      
      // Check for the App Bridge script
      const scripts = Array.from(document.getElementsByTagName('script'));
      const appBridgeScript = scripts.find(s => s.src?.includes('app-bridge.js'));
      
      if (appBridgeScript) {
        console.log("📦 App Bridge script found:", appBridgeScript.src);
        console.log("  - API Key attribute:", appBridgeScript.dataset.apiKey || "❌ MISSING");
        console.log("  - Defer:", appBridgeScript.defer);
        console.log("  - Async:", appBridgeScript.async);
      } else {
        console.error("❌ App Bridge script NOT found in DOM!");
      }
      
      if (isEmbedded) {
        console.warn("⚠️ App Bridge not found but we're in embedded context!");
        
        // Try to reload after a delay
        setTimeout(() => {
          if (!window.shopify) {
            console.error("❌ App Bridge still not available after 2 seconds");
            
            // Try reloading the page once
            const hasReloaded = sessionStorage.getItem('app-bridge-reload');
            if (!hasReloaded) {
              sessionStorage.setItem('app-bridge-reload', 'true');
              console.log("🔄 Reloading page to initialize App Bridge...");
              window.location.reload();
            } else {
              console.error("❌ Already tried reloading. App Bridge initialization failed!");
              console.log("📋 Debugging steps:");
              console.log("1. Check browser console for errors");
              console.log("2. Verify SHOPIFY_API_KEY is set in environment");
              console.log("3. Check Network tab for failed script loads");
              console.log("4. Ensure accessing from Shopify Admin");
            }
          }
        }, 2000);
      }
    }
    
    // Log any console errors
    const originalError = console.error;
    console.error = function(...args) {
      console.log("❌ Console Error Captured:", ...args);
      originalError.apply(console, args);
    };
    
    // Intercept fetch to log API calls
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [url, options] = args;
      console.log("🌐 Fetch Request:", {
        url,
        method: options?.method || 'GET',
        hasAuth: !!(options?.headers as any)?.['Authorization'],
      });
      
      return originalFetch.apply(this, args as any).then(response => {
        console.log("📥 Fetch Response:", {
          url,
          status: response.status,
          ok: response.ok,
        });
        return response;
      }).catch(error => {
        console.error("❌ Fetch Error:", { url, error: error.message });
        throw error;
      });
    };
    
    // Clear reload flag after successful load
    if (hasAppBridge) {
      sessionStorage.removeItem('app-bridge-reload');
      console.log("✅ App Bridge initialized successfully!");
    }
    
    console.log("=".repeat(60));
    
    // Cleanup on unmount
    return () => {
      cleanupSecurity();
    };
  }, []);
  
  return null;
}

// Type declaration for window.shopify
declare global {
  interface Window {
    shopify?: {
      loading?: boolean;
      config?: any;
      environment?: {
        embedded?: boolean;
      };
    };
  }
}