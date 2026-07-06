/**
 * Authenticated Fetch Component for App Bridge 4.x
 * Provides automatic session token injection and retry logic
 */

import { createContext, useContext, useCallback, useRef } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';

interface AuthenticatedFetchContextType {
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthenticatedFetchContext = createContext<AuthenticatedFetchContextType | null>(null);

/**
 * Provider component that sets up authenticated fetch with App Bridge 4.x
 */
export function AuthenticatedFetchProvider({ children }: { children: React.ReactNode }) {
  const app = useAppBridge();
  const retryCountRef = useRef<Map<string, number>>(new Map());

  const authenticatedFetch = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    console.log("[AuthenticatedFetch] Making request to:", url);

    // App Bridge 4.x automatically injects session tokens
    // We just need to use the authenticatedFetch from the app instance
    const appAuthenticatedFetch = (app as any).authenticatedFetch;
    
    if (!appAuthenticatedFetch) {
      console.error("[AuthenticatedFetch] authenticatedFetch not available on app instance");
      // Fallback to regular fetch
      return fetch(url, options);
    }

    try {
      // Make the initial request
      const response = await appAuthenticatedFetch(url, options);

      // Log response details
      console.log("[AuthenticatedFetch] Response:", {
        url,
        status: response.status,
        ok: response.ok
      });

      // Handle 401 with automatic retry
      if (response.status === 401) {
        const requestKey = `${url}-${JSON.stringify(options)}`;
        // Nullish coalescing, not || : a stored 0 is a real retry count,
        // not a missing entry. `|| 0` made "could not read" and "read 0"
        // indistinguishable — a substrate-honesty lie (whitehack CS#2).
        const retryCount = retryCountRef.current.get(requestKey) ?? 0;

        if (retryCount < 2) {
          console.log(`[AuthenticatedFetch] Received 401, retrying (attempt ${retryCount + 1}/2)...`);
          
          retryCountRef.current.set(requestKey, retryCount + 1);
          
          // Wait a bit for token refresh
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Retry the request
          const retryResponse = await appAuthenticatedFetch(url, options);
          
          // Clear retry count on success
          if (retryResponse.ok) {
            retryCountRef.current.delete(requestKey);
          }
          
          return retryResponse;
        } else {
          console.error("[AuthenticatedFetch] Max retries reached for 401 response");
          retryCountRef.current.delete(requestKey);
        }
      }

      return response;
    } catch (error) {
      console.error("[AuthenticatedFetch] Request failed:", error);
      throw error;
    }
  }, [app]);

  return (
    <AuthenticatedFetchContext.Provider value={{ authenticatedFetch }}>
      {children}
    </AuthenticatedFetchContext.Provider>
  );
}

/**
 * Hook to use authenticated fetch in components
 */
export function useAuthenticatedFetch() {
  const context = useContext(AuthenticatedFetchContext);
  
  if (!context) {
    throw new Error('useAuthenticatedFetch must be used within AuthenticatedFetchProvider');
  }
  
  return context.authenticatedFetch;
}

/**
 * Wrapper for creating an axios-like interceptor
 */
export function createAuthenticatedAxios(authenticatedFetch: Function) {
  return {
    get: (url: string, options?: RequestInit) => 
      authenticatedFetch(url, { ...options, method: 'GET' }),
    
    post: (url: string, data?: any, options?: RequestInit) => 
      authenticatedFetch(url, {
        ...options,
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        }
      }),
    
    put: (url: string, data?: any, options?: RequestInit) => 
      authenticatedFetch(url, {
        ...options,
        method: 'PUT',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        }
      }),
    
    delete: (url: string, options?: RequestInit) => 
      authenticatedFetch(url, { ...options, method: 'DELETE' }),
    
    patch: (url: string, data?: any, options?: RequestInit) => 
      authenticatedFetch(url, {
        ...options,
        method: 'PATCH',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        }
      })
  };
}