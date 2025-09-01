/**
 * Session Token Manager for Shopify App Bridge 4.x
 * Handles automatic token refresh and authenticated requests
 * Based on 2024-2025 Shopify authentication best practices
 */

interface SessionTokenManagerOptions {
  apiKey: string;
  host: string | null;
}

export class SessionTokenManager {
  private currentToken: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<string> | null = null;
  private apiKey: string;
  private host: string | null;

  constructor(options: SessionTokenManagerOptions) {
    this.apiKey = options.apiKey;
    this.host = options.host;
    
    console.log("[SessionTokenManager] Initialized with:", {
      apiKey: this.apiKey ? "present" : "missing",
      host: this.host || "missing"
    });
    
    // Start automatic refresh cycle
    this.startRefreshCycle();
  }

  /**
   * Get a valid session token, refreshing if necessary
   */
  async getValidToken(): Promise<string> {
    // If we're already refreshing, wait for that to complete
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // If we don't have a token or it's about to expire, refresh
    if (!this.currentToken || this.isTokenExpiringSoon()) {
      return this.refreshToken();
    }

    return this.currentToken;
  }

  /**
   * Refresh the session token
   */
  private async refreshToken(): Promise<string> {
    // Prevent concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    console.log("[SessionTokenManager] Refreshing session token...");

    this.refreshPromise = new Promise<string>(async (resolve, reject) => {
      try {
        // For App Bridge 4.x, we need to use the authenticatedFetch approach
        // This will be handled by the AppProvider component
        const token = await this.requestSessionToken();
        
        this.currentToken = token;
        console.log("[SessionTokenManager] Token refreshed successfully");
        
        // Schedule next refresh 5 seconds before expiry (tokens last 60 seconds)
        this.scheduleNextRefresh(55000);
        
        resolve(token);
      } catch (error) {
        console.error("[SessionTokenManager] Token refresh failed:", error);
        reject(error);
      } finally {
        this.refreshPromise = null;
      }
    });

    return this.refreshPromise;
  }

  /**
   * Request a new session token from App Bridge
   */
  private async requestSessionToken(): Promise<string> {
    // This will be replaced by actual App Bridge implementation
    // For now, we'll simulate the token request
    return new Promise((resolve, reject) => {
      // In production, this would use:
      // const token = await getSessionToken(app);
      
      // For now, return a placeholder to prevent errors
      const mockToken = "mock-session-token-" + Date.now();
      resolve(mockToken);
    });
  }

  /**
   * Check if the current token is expiring soon
   */
  private isTokenExpiringSoon(): boolean {
    if (!this.currentToken) return true;

    try {
      // Parse JWT without verification (just to check expiry)
      const [, payloadBase64] = this.currentToken.split('.');
      if (!payloadBase64) return true;

      const payload = JSON.parse(atob(payloadBase64));
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = payload.exp - now;

      // Consider token expiring if less than 10 seconds remain
      return timeUntilExpiry < 10;
    } catch {
      // If we can't parse the token, consider it expired
      return true;
    }
  }

  /**
   * Schedule the next token refresh
   */
  private scheduleNextRefresh(delay: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshToken().catch(error => {
        console.error("[SessionTokenManager] Scheduled refresh failed:", error);
        // Retry after 5 seconds on failure
        this.scheduleNextRefresh(5000);
      });
    }, delay);
  }

  /**
   * Start the automatic refresh cycle
   */
  private startRefreshCycle(): void {
    // Initial token fetch
    this.refreshToken().catch(error => {
      console.error("[SessionTokenManager] Initial token fetch failed:", error);
    });
  }

  /**
   * Make an authenticated request with automatic token injection
   */
  async makeAuthenticatedRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await this.getValidToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle token expiry with automatic retry
    if (response.status === 401) {
      console.log("[SessionTokenManager] Received 401, refreshing token and retrying...");
      
      // Force token refresh
      this.currentToken = null;
      const newToken = await this.refreshToken();

      // Retry the request with the new token
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'application/json',
        },
      });
    }

    return response;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.currentToken = null;
    this.refreshPromise = null;
  }
}

/**
 * Create axios-like interceptor for automatic token injection
 */
export function createAuthenticatedFetch(manager: SessionTokenManager) {
  return async (url: string, options?: RequestInit): Promise<Response> => {
    return manager.makeAuthenticatedRequest(url, options);
  };
}

/**
 * Hook for using the session token manager in React components
 */
export function useSessionToken(apiKey: string, host: string | null) {
  const [manager, setManager] = useState<SessionTokenManager | null>(null);

  useEffect(() => {
    if (!apiKey) {
      console.error("[useSessionToken] No API key provided");
      return;
    }

    const tokenManager = new SessionTokenManager({ apiKey, host });
    setManager(tokenManager);

    return () => {
      tokenManager.destroy();
    };
  }, [apiKey, host]);

  return {
    manager,
    authenticatedFetch: manager 
      ? createAuthenticatedFetch(manager)
      : fetch,
  };
}

// Add React import for the hook
import { useEffect, useState } from 'react';