/**
 * CRITICAL: Client-only navigation utilities for Shopify embedded apps
 * These functions must only run in the browser, not during SSR
 *
 * Purpose: Preserve shop and host query parameters during navigation to maintain
 * Shopify embedded app context and prevent authentication redirects.
 */

// Track if we've logged App Bridge fallback to prevent console spam
let hasLoggedAppBridgeFallback = false;

/**
 * Type guard to check if we're in browser context
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Navigate to a path while preserving Shopify embedded context
 * SSR-SAFE: Includes typeof window check
 *
 * @param path - The app path to navigate to (e.g., '/app/customers')
 * @param options - Navigation options
 *
 * @example
 * // In non-React code or when App Bridge is not available
 * navigateToApp('/app/customers');
 * navigateToApp('/app/settings', { replace: true });
 */
export function navigateToApp(
  path: string,
  options?: {
    newContext?: boolean;
    replace?: boolean;
  }
): void {
  // SSR GUARD - Critical for Remix
  if (!isBrowser()) {
    console.warn('[navigateToApp] Called during SSR, skipping navigation');
    return;
  }

  // Ensure path starts with /app
  const normalizedPath = path.startsWith('/app') ? path : `/app${path}`;

  // ALWAYS preserve query string (shop/host)
  const currentSearch = window.location.search;
  const fullPath = currentSearch
    ? `${normalizedPath}${currentSearch}`
    : normalizedPath;

  // Warn in development if shop/host are missing
  if (process.env.NODE_ENV === 'development' && !currentSearch.includes('shop=')) {
    console.warn(
      '[navigateToApp] Missing shop/host in URL. Embedded context may be lost.',
      { currentUrl: window.location.href, targetPath: fullPath }
    );
  }

  if (options?.replace) {
    window.location.replace(fullPath);
  } else {
    window.location.href = fullPath;
  }
}

/**
 * Hook for App Bridge navigation (for React components)
 * MUST be used inside <AppProvider> (wrapped in app/routes/app.tsx)
 *
 * IMPORTANT: Only import App Bridge inside the hook to avoid SSR issues
 *
 * @example
 * function MyComponent() {
 *   const { navigate } = useShopifyNavigation();
 *
 *   return (
 *     <Button onClick={() => navigate('/app/customers')}>
 *       View Customers
 *     </Button>
 *   );
 * }
 */
export function useShopifyNavigation() {
  // Lazy import to avoid SSR crash
  let app: any = null;

  try {
    // Only try to use App Bridge in browser context
    if (isBrowser()) {
      // Dynamic require to avoid SSR issues
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAppBridge: getAppBridge } = require('@shopify/app-bridge-react');
      app = getAppBridge();
    }
  } catch (error) {
    // App Bridge not available or not inside AppProvider
    // This is expected in some contexts, use fallback
    if (!hasLoggedAppBridgeFallback && isBrowser()) {
      console.info('[useShopifyNavigation] App Bridge not available, using fallback navigation');
      hasLoggedAppBridgeFallback = true;
    }
  }

  const navigate = (path: string, options?: { newContext?: boolean }) => {
    // SSR guard
    if (!isBrowser()) {
      console.warn('[navigate] Called during SSR, skipping navigation');
      return;
    }

    const normalizedPath = path.startsWith('/app') ? path : `/app${path}`;

    // Try App Bridge first
    if (app) {
      try {
        // CRITICAL: App Bridge Redirect might not preserve query string automatically
        // So we explicitly append it to ensure shop/host are maintained
        const currentSearch = window.location.search;
        const pathWithContext = currentSearch
          ? `${normalizedPath}${currentSearch}`
          : normalizedPath;

        // Import Redirect action lazily
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Redirect } = require('@shopify/app-bridge/actions');
        const redirect = Redirect.create(app);

        if (options?.newContext) {
          // Open in new context/tab
          redirect.dispatch(Redirect.Action.REMOTE, pathWithContext);
        } else {
          // Navigate within the app
          redirect.dispatch(Redirect.Action.APP, pathWithContext);
        }
        return; // Success, exit early
      } catch (error) {
        // Log once, don't spam
        if (!hasLoggedAppBridgeFallback) {
          console.warn('[navigate] App Bridge navigation failed, using fallback:', error);
          hasLoggedAppBridgeFallback = true;
        }
        // Fall through to fallback
      }
    }

    // Fallback to manual navigation with query string preservation
    navigateToApp(path, options);
  };

  return { navigate };
}

/**
 * Get current shop and host from URL
 * SSR-SAFE: Returns null values during SSR
 *
 * @returns Object with shop and host from query parameters
 *
 * @example
 * const { shop, host } = getShopifyContext();
 * if (shop && host) {
 *   console.log('Embedded in Shopify admin for:', shop);
 * }
 */
export function getShopifyContext(): { shop: string | null; host: string | null } {
  if (!isBrowser()) {
    return { shop: null, host: null };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    shop: params.get('shop'),
    host: params.get('host'),
  };
}

/**
 * Build URL with Shopify context preserved
 * SSR-SAFE: Works without window
 *
 * @param path - The app path
 * @param searchParams - Optional search params (uses current window.location.search if not provided)
 * @returns Full URL path with query parameters
 *
 * @example
 * const url = buildAppUrl('/app/customers');
 * // Returns: '/app/customers?shop=...&host=...'
 */
export function buildAppUrl(path: string, searchParams?: string): string {
  const normalizedPath = path.startsWith('/app') ? path : `/app${path}`;

  // Use provided searchParams or get from window if available
  const search = searchParams || (isBrowser() ? window.location.search : '');

  return search ? `${normalizedPath}${search}` : normalizedPath;
}
