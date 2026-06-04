import type { ApiResponse } from '../types/session';
import { logger } from './logger';
import { API_TIMEOUT, DEBUG_MODE, APP_HOST } from '../config';

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
    this.timeout = config.timeout || API_TIMEOUT;
    this.enableDebugLogs = config.enableDebugLogs ?? DEBUG_MODE;
  }

  /**
   * Constructs absolute URL for API calls.
   * Customer account extensions need absolute URLs, not relative paths — the
   * app is hosted on Vercel, not on the shop domain.
   *
   * Host comes from config.APP_HOST (not hardcoded here) so preview/staging
   * builds can override by editing one constant rather than searching the tree.
   */
  private getFullUrl(endpoint: string): string {
    // If baseUrl is already absolute, use it directly
    if (this.baseUrl && (this.baseUrl.startsWith('http://') || this.baseUrl.startsWith('https://'))) {
      return `${this.baseUrl}${endpoint}`;
    }

    const path = this.baseUrl || '';
    const fullUrl = `https://${APP_HOST}${path}${endpoint}`;

    if (this.enableDebugLogs) {
      logger.debug(`Constructed URL: ${fullUrl}`);
      logger.debug(`For shop: ${this.shopDomain || 'not set'}`);
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
        logger.debug(`[${requestId}] Starting request`);
        logger.debug(`[${requestId}] URL: ${fullUrl}`);
        logger.debug(`[${requestId}] Shop: ${this.shopDomain || 'not set'}`);
        logger.debug(`[${requestId}] Method: ${options.method || 'GET'}`);
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        if (this.enableDebugLogs) {
          logger.warn(`[${requestId}] Request timeout after ${this.timeout}ms`);
        }
        controller.abort();
      }, this.timeout);

      const startTime = Date.now();
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const requestDuration = Date.now() - startTime;

      if (this.enableDebugLogs) {
        logger.debug(`[${requestId}] Response: ${response.status} in ${requestDuration}ms`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (this.enableDebugLogs) {
          logger.error(`[${requestId}] Request failed:`, {
            status: response.status,
            error: errorText,
          });
        }

        return {
          success: false,
          error: `Request failed: ${response.status} ${response.statusText}`,
          message: errorText || 'An error occurred',
        };
      }

      const data = await response.json();

      if (this.enableDebugLogs) {
        logger.debug(`[${requestId}] Success:`, {
          enrolled: data.enrolled,
          balance: data.balance,
          tierName: data.tier?.name,
        });
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('aborted');

      logger.error(`[${requestId}] Request error:`, errorMessage);

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
    timeout: API_TIMEOUT,
    enableDebugLogs: DEBUG_MODE,
  };

  return new ApiClient({
    ...defaultConfig,
    ...config,
  });
}
