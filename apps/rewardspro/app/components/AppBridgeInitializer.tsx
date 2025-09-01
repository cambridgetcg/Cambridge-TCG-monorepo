import { useEffect } from "react";

/**
 * Component to ensure App Bridge is properly initialized
 * Handles force reload and debugging
 */
export function AppBridgeInitializer() {
  useEffect(() => {
    console.log("[AppBridgeInitializer] Checking App Bridge status...");
    
    // Check if we're in an iframe (embedded context)
    const isEmbedded = window.top !== window.self;
    console.log("[AppBridgeInitializer] Embedded context:", isEmbedded);
    
    // Check if App Bridge is available
    const hasAppBridge = typeof window !== 'undefined' && window.shopify;
    console.log("[AppBridgeInitializer] App Bridge available:", hasAppBridge);
    
    if (hasAppBridge) {
      // Force App Bridge to reinitialize if needed
      if (window.shopify && window.shopify.loading) {
        console.log("[AppBridgeInitializer] Forcing App Bridge reload...");
        window.shopify.loading = false;
      }
    } else if (isEmbedded) {
      console.warn("[AppBridgeInitializer] App Bridge not found in embedded context!");
      
      // Try to reload after a delay
      setTimeout(() => {
        if (!window.shopify) {
          console.error("[AppBridgeInitializer] App Bridge still not available after delay");
          // Try reloading the page once
          const hasReloaded = sessionStorage.getItem('app-bridge-reload');
          if (!hasReloaded) {
            sessionStorage.setItem('app-bridge-reload', 'true');
            console.log("[AppBridgeInitializer] Reloading page to initialize App Bridge...");
            window.location.reload();
          }
        }
      }, 2000);
    }
    
    // Clear reload flag after successful load
    if (hasAppBridge) {
      sessionStorage.removeItem('app-bridge-reload');
    }
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