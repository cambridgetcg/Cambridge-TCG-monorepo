import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import path from "path";
import fs from "fs/promises";

/**
 * App Proxy Route for Serving Translation Files
 * URL: /apps/rewardspro/locales/{locale}.json
 * 
 * This endpoint serves localized translation files for the rewards widget,
 * allowing the widget to dynamically load translations based on the shop's locale.
 */

// Supported locales mapping
const SUPPORTED_LOCALES: Record<string, string> = {
  'en': 'en.default.json',
  'en-us': 'en.default.json',
  'en-gb': 'en.default.json',
  'en-ca': 'en.default.json',
  'en-au': 'en.default.json',
  'fr': 'fr.json',
  'fr-ca': 'fr.json',
  'fr-fr': 'fr.json',
  'es': 'es.json',
  'es-es': 'es.json',
  'es-mx': 'es.json',
  'de': 'de.json',
  'de-de': 'de.json',
  'de-at': 'de.json',
  'de-ch': 'de.json'
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = params.locale?.toLowerCase() || 'en';
  
  // Map locale to supported translation file
  const translationFile = SUPPORTED_LOCALES[locale] || SUPPORTED_LOCALES['en'];
  
  try {
    // Build path to translation file
    const translationPath = path.join(
      process.cwd(),
      'extensions',
      'rewards-widget',
      'locales',
      translationFile
    );
    
    // Read translation file
    const translationContent = await fs.readFile(translationPath, 'utf-8');
    const translations = JSON.parse(translationContent);
    
    // Return with appropriate caching headers
    return json(translations, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // App proxies handle origin validation
        'Access-Control-Allow-Methods': 'GET',
        'X-Content-Type-Options': 'nosniff'
      }
    });
    
  } catch (error) {
    console.error(`Failed to load translations for locale ${locale}:`, error);
    
    // Return default English translations as fallback
    const defaultTranslations = {
      widget: {
        title: 'Rewards Center',
        close: 'Close rewards widget',
        open: 'Open rewards widget',
        loading: 'Loading your rewards...',
        error: {
          title: 'Unable to load rewards data',
          retry: 'Try Again'
        },
        guest: {
          message: 'Join our rewards program and earn cashback on every purchase!',
          benefits: {
            cashback: 'Earn cashback on every order',
            tiers: 'Unlock exclusive member tiers',
            rewards: 'Get personalized rewards'
          },
          signin: 'Sign In',
          register: 'Join Now'
        },
        member: {
          balance: {
            label: 'Store Credit Balance',
            currency: '{{amount}}'
          },
          tier: {
            current: '{{tier}} Member',
            cashback: 'Earning {{rate}}% cashback',
            progress: 'Progress to {{nextTier}}',
            remaining: '{{amount}} to go'
          },
          stats: {
            earned: {
              value: '{{amount}}',
              label: 'Lifetime Earned'
            },
            spent: {
              value: '{{amount}}',
              label: 'Total Spent'
            },
            rewards: {
              value: '{{count}}',
              label: 'Rewards Available'
            }
          },
          actions: {
            dashboard: 'View Full Dashboard',
            shop: 'Continue Shopping',
            redeem: 'Redeem Rewards'
          }
        },
        accessibility: {
          minimized: 'Rewards widget minimized',
          opened: 'Rewards widget opened',
          loading: 'Loading rewards data',
          error: 'Error loading rewards'
        }
      }
    };
    
    return json(defaultTranslations, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache fallback for 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
}

// Handle OPTIONS requests for CORS preflight
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  
  return json(
    { error: 'Method not allowed' },
    { 
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}