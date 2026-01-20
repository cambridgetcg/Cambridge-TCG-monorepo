/**
 * GA4Provider Component
 *
 * Client-side component that initializes Google Analytics 4.
 * Loads gtag.js and sets up user context.
 *
 * Place this component in the app shell to enable analytics.
 */

import { useEffect } from 'react';
import { useRouteLoaderData } from '@remix-run/react';
import type { AppLoaderData } from '~/routes/app';

interface GA4ProviderProps {
  measurementId: string;
  debug?: boolean;
  children?: React.ReactNode;
}

/**
 * GA4 Script Loader Component
 *
 * Renders the gtag.js script tag. Should be placed in document head.
 */
export function GA4Script({ measurementId, nonce }: { measurementId: string; nonce?: string }) {
  if (!measurementId) return null;

  return (
    <>
      {/* Google Analytics 4 - gtag.js */}
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        nonce={nonce}
      />
      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${measurementId}', {
              send_page_view: false,
              debug_mode: ${process.env.NODE_ENV === 'development'}
            });
            window.GA4_MEASUREMENT_ID = '${measurementId}';
          `,
        }}
      />
    </>
  );
}

/**
 * GA4Provider Component
 *
 * Initializes GA4 with user context from the app loader.
 * Should wrap the app content that needs analytics tracking.
 */
export function GA4Provider({ measurementId, debug = false, children }: GA4ProviderProps) {
  // Get app-level data for user context
  const appData = useRouteLoaderData<AppLoaderData>('routes/app');

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;
    if (!measurementId) return;

    // Wait for gtag to be available
    const checkGtag = () => {
      if (typeof window.gtag !== 'function') {
        setTimeout(checkGtag, 100);
        return;
      }

      // Set user properties based on app context
      if (appData?.shop) {
        window.gtag('set', 'user_properties', {
          shop_domain: appData.shop,
          current_plan: appData.currentPlan || 'free',
          customer_tier: appData.entitlements?.effectivePlan || 'none',
        });

        // Set user ID for cross-session tracking (hash the shop domain for privacy)
        window.gtag('config', measurementId, {
          user_id: hashString(appData.shop),
        });

        if (debug) {
          console.log('[GA4] User context set:', {
            shop: appData.shop,
            plan: appData.currentPlan,
            tier: appData.entitlements?.effectivePlan,
          });
        }
      }
    };

    checkGtag();
  }, [measurementId, appData, debug]);

  return <>{children}</>;
}

/**
 * Simple hash function for user ID (privacy-preserving)
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `shop_${Math.abs(hash).toString(16)}`;
}

export default GA4Provider;
