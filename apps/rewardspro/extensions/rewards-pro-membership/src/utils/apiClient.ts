import type { ApiResponse } from '../types/session';

/**
 * Configuration for API client
 */
export interface ApiClientConfig {
  baseUrl?: string; // Optional - will be constructed from shop domain if not provided
  shopDomain?: string; // Shop domain to construct absolute URLs
  timeout?: number;
  enableDebugLogs?: boolean;
}

/**
 * API client with automatic session token management
 */
export class ApiClient {
  private baseUrl?: string;
  private shopDomain?: string;
  private timeout: number;
  private enableDebugLogs: boolean;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.shopDomain = config.shopDomain;
    this.timeout = config.timeout || 10000;
    this.enableDebugLogs = config.enableDebugLogs || false;
  }

  /**
   * Constructs absolute URL for API calls
   * Customer account extensions need absolute URLs, not relative paths
   *
   * The app is hosted on Vercel, not on the shop domain.
   * We always call rewardspro-production.vercel.app
   */
  private getFullUrl(endpoint: string): string {
    // If baseUrl is already absolute, use it directly
    if (this.baseUrl && (this.baseUrl.startsWith('http://') || this.baseUrl.startsWith('https://'))) {
      return `${this.baseUrl}${endpoint}`;
    }

    // Always use production Vercel URL for the app
    // The app is NOT hosted on shop domains (myshopify.com)
    const appDomain = 'rewardspro-production.vercel.app';
    const path = this.baseUrl || '';
    const fullUrl = `https://${appDomain}${path}${endpoint}`;

    if (this.enableDebugLogs) {
      console.log(`[ApiClient] Constructed URL: ${fullUrl}`);
      console.log(`[ApiClient] For shop: ${this.shopDomain || 'not set'}`);
    }

    return fullUrl;
  }

  /**
   * Makes an authenticated API request with session token
   */
  async request<T = unknown>(
    sessionToken: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullUrl = this.getFullUrl(endpoint);

    try {
      if (this.enableDebugLogs) {
        console.log(`[ApiClient:${requestId}] Starting request`);
        console.log(`[ApiClient:${requestId}] URL: ${fullUrl}`);
        console.log(`[ApiClient:${requestId}] Shop domain: ${this.shopDomain || 'not set'}`);
        console.log(`[ApiClient:${requestId}] Method: ${options.method || 'GET'}`);
        console.log(`[ApiClient:${requestId}] Timeout: ${this.timeout}ms`);
      }

      // Use the provided session token string
      if (this.enableDebugLogs) {
        console.log(`[ApiClient:${requestId}] Using session token, length: ${sessionToken.length}`);
        console.log(`[ApiClient:${requestId}] Token preview: ${sessionToken.substring(0, 50)}...`);
      }

      const token = sessionToken;

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        if (this.enableDebugLogs) {
          console.warn(`[ApiClient:${requestId}] Request timeout after ${this.timeout}ms`);
        }
        controller.abort();
      }, this.timeout);

      if (this.enableDebugLogs) {
        console.log(`[ApiClient:${requestId}] Sending fetch request...`);
      }

      const startTime = Date.now();
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const requestDuration = Date.now() - startTime;

      if (this.enableDebugLogs) {
        console.log(`[ApiClient:${requestId}] Response received in ${requestDuration}ms`);
        console.log(`[ApiClient:${requestId}] Status: ${response.status} ${response.statusText}`);
        console.log(`[ApiClient:${requestId}] Headers:`, Object.fromEntries(response.headers.entries()));
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (this.enableDebugLogs) {
          console.error(`[ApiClient:${requestId}] Request failed:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            duration: requestDuration,
          });
        }

        return {
          success: false,
          error: `Request failed: ${response.status} ${response.statusText}`,
          message: errorText || 'An error occurred',
        };
      }

      if (this.enableDebugLogs) {
        console.log(`[ApiClient:${requestId}] Parsing JSON response...`);
      }
      const data = await response.json();

      if (this.enableDebugLogs) {
        console.log(`[ApiClient:${requestId}] Request successful:`, {
          success: data.success,
          enrolled: data.enrolled,
          balance: data.balance,
          tierName: data.tier?.name,
          dataKeys: Object.keys(data),
          duration: requestDuration,
        });
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('aborted');

      if (this.enableDebugLogs) {
        console.error(`[ApiClient:${requestId}] Request error:`, {
          type: error instanceof Error ? error.constructor.name : 'Unknown',
          message: errorMessage,
          isTimeout,
          error,
        });
      }

      return {
        success: false,
        error: errorMessage,
        message: isTimeout ? 'Request timeout' : errorMessage,
      };
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(
    sessionToken: string,
    endpoint: string
  ): Promise<ApiResponse<T>> {
    return this.request<T>(sessionToken, endpoint, {
      method: 'GET',
    });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    sessionToken: string,
    endpoint: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    return this.request<T>(sessionToken, endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    sessionToken: string,
    endpoint: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    return this.request<T>(sessionToken, endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    sessionToken: string,
    endpoint: string
  ): Promise<ApiResponse<T>> {
    return this.request<T>(sessionToken, endpoint, {
      method: 'DELETE',
    });
  }
}

/**
 * Creates a configured API client instance
 */
export function createApiClient(config?: Partial<ApiClientConfig>): ApiClient {
  // Default configuration
  // shopDomain should be provided for customer account extensions
  const defaultConfig: ApiClientConfig = {
    baseUrl: '/api/customer-account/loyalty',
    shopDomain: undefined, // Must be provided by caller
    timeout: 10000,
    enableDebugLogs: false,
  };

  return new ApiClient({
    ...defaultConfig,
    ...config,
  });
}
