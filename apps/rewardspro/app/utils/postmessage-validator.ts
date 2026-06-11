/**
 * PostMessage Origin Validator for Shopify App Bridge
 * Ensures secure communication between embedded app and Shopify Admin
 */

// Allowed origins for Shopify Admin
const ALLOWED_ORIGINS = [
  'https://admin.shopify.com',
  'https://partners.shopify.com',
  /^https:\/\/[a-zA-Z0-9-]+\.myshopify\.com$/,
  /^https:\/\/[a-zA-Z0-9-]+\.spin\.dev$/,  // Shopify development stores
  /^https:\/\/[a-zA-Z0-9-]+\.shopifypreview\.com$/, // Preview stores
];

/**
 * Check if an origin is allowed for postMessage communication
 */
export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.some(allowed => {
    if (typeof allowed === 'string') {
      return origin === allowed;
    }
    return allowed.test(origin);
  });
}

/**
 * Validate a postMessage event
 */
export function validatePostMessage(event: MessageEvent): boolean {
  // Check origin
  if (!isAllowedOrigin(event.origin)) {
    console.warn('[PostMessage Validator] Rejected message from untrusted origin:', event.origin);
    return false;
  }

  // Check data structure
  if (!event.data || typeof event.data !== 'object') {
    console.warn('[PostMessage Validator] Invalid message data structure');
    return false;
  }

  // Check for required App Bridge fields
  if (!event.data.type || !event.data.payload) {
    console.warn('[PostMessage Validator] Missing required App Bridge fields');
    return false;
  }

  console.log('[PostMessage Validator] Valid message from:', event.origin, 'Type:', event.data.type);
  return true;
}

/**
 * Setup postMessage listener with validation
 */
export function setupPostMessageListener(
  callback: (data: any) => void,
  messageTypes?: string[]
): () => void {
  const listener = (event: MessageEvent) => {
    // Validate the message
    if (!validatePostMessage(event)) {
      return;
    }

    // Filter by message type if specified
    if (messageTypes && !messageTypes.includes(event.data.type)) {
      return;
    }

    // Log the message for debugging
    console.log('[PostMessage Listener] Received:', {
      type: event.data.type,
      origin: event.origin,
      payload: event.data.payload
    });

    // Call the callback with validated data
    callback(event.data);
  };

  // Add the listener
  window.addEventListener('message', listener);

  // Return cleanup function
  return () => {
    window.removeEventListener('message', listener);
  };
}

/**
 * Monitor App Bridge session token messages
 */
export function monitorSessionTokenMessages(): () => void {
  return setupPostMessageListener(
    (data) => {
      if (data.type === 'APP::SESSION_TOKEN_RESPOND') {
        console.log('[Session Token Monitor] Token received:', {
          hasToken: !!data.payload?.token,
          timestamp: new Date().toISOString()
        });
      } else if (data.type === 'APP::SESSION_TOKEN_REQUEST') {
        console.log('[Session Token Monitor] Token requested:', {
          timestamp: new Date().toISOString()
        });
      }
    },
    ['APP::SESSION_TOKEN_RESPOND', 'APP::SESSION_TOKEN_REQUEST']
  );
}

/**
 * Setup comprehensive postMessage debugging
 */
export function setupPostMessageDebugging(): () => void {
  const cleanup1 = setupPostMessageListener((data) => {
    console.group('[PostMessage Debug] Message Received');
    console.log('Type:', data.type);
    console.log('Payload:', data.payload);
    console.log('Timestamp:', new Date().toISOString());
    console.groupEnd();
  });

  // Also log outgoing messages
  const originalPostMessage = window.parent.postMessage;
  window.parent.postMessage = function(...args) {
    console.group('[PostMessage Debug] Message Sent');
    console.log('Data:', args[0]);
    console.log('Target Origin:', args[1]);
    console.log('Timestamp:', new Date().toISOString());
    console.groupEnd();
    
    return originalPostMessage.apply(window.parent, args as unknown as [any, WindowPostMessageOptions?]);
  };

  return () => {
    cleanup1();
    window.parent.postMessage = originalPostMessage;
  };
}

/**
 * Validate Content Security Policy frame-ancestors
 */
export function validateCSPFrameAncestors(): boolean {
  try {
    // Check if we're in an iframe
    if (window.self === window.top) {
      console.warn('[CSP Validator] Not in iframe context');
      return false;
    }

    // Check document referrer
    const referrer = document.referrer;
    if (!referrer) {
      console.warn('[CSP Validator] No referrer found');
      return false;
    }

    const referrerUrl = new URL(referrer);
    if (!isAllowedOrigin(referrerUrl.origin)) {
      console.error('[CSP Validator] Invalid referrer origin:', referrerUrl.origin);
      return false;
    }

    console.log('[CSP Validator] Valid embedded context from:', referrerUrl.origin);
    return true;
  } catch (error) {
    console.error('[CSP Validator] Error validating CSP:', error);
    return false;
  }
}

/**
 * Initialize all postMessage security features
 */
export function initializePostMessageSecurity(): () => void {
  console.log('[PostMessage Security] Initializing...');

  // Validate CSP on load
  const isValidCSP = validateCSPFrameAncestors();
  if (!isValidCSP) {
    console.warn('[PostMessage Security] CSP validation failed - app may not work correctly');
  }

  // Setup monitoring
  const cleanupMonitor = monitorSessionTokenMessages();
  
  // Setup debugging in development
  let cleanupDebug: (() => void) | null = null;
  if (process.env.NODE_ENV === 'development') {
    cleanupDebug = setupPostMessageDebugging();
  }

  console.log('[PostMessage Security] Initialized successfully');

  // Return cleanup function
  return () => {
    cleanupMonitor();
    if (cleanupDebug) {
      cleanupDebug();
    }
  };
}