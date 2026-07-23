/**
 * Comprehensive Error Recovery System for Shopify App
 * Handles authentication errors, network failures, and session issues
 */

import { useState, useCallback } from 'react';

export enum ErrorCode {
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SHOP_NOT_FOUND = 'SHOP_NOT_FOUND',
  APP_BRIDGE_ERROR = 'APP_BRIDGE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: any;
  recoverable: boolean;
  retryAfter?: number;
}

/**
 * Error recovery strategies
 */
export class ErrorRecoveryManager {
  private retryCount: Map<string, number> = new Map();
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second

  /**
   * Determine error type and recovery strategy
   */
  classifyError(error: any): AppError {
    // Network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        code: ErrorCode.NETWORK_ERROR,
        message: 'Network connection failed',
        details: error.message,
        recoverable: true
      };
    }

    // Response errors
    if (error.status) {
      switch (error.status) {
        case 401:
          return {
            code: ErrorCode.SESSION_EXPIRED,
            message: 'Session expired. Please refresh the page.',
            recoverable: true
          };
        
        case 403:
          return {
            code: ErrorCode.INVALID_TOKEN,
            message: 'Invalid authentication token',
            recoverable: false
          };
        
        case 429:
          const retryAfter = error.headers?.get('Retry-After');
          return {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many requests. Please wait.',
            recoverable: true,
            retryAfter: retryAfter ? parseInt(retryAfter) : 60
          };
        
        case 404:
          if (error.url?.includes('shop')) {
            return {
              code: ErrorCode.SHOP_NOT_FOUND,
              message: 'Shop not found or app not installed',
              recoverable: false
            };
          }
          break;
      }
    }

    // App Bridge errors
    if (error.message?.includes('App Bridge') || error.message?.includes('shopify')) {
      return {
        code: ErrorCode.APP_BRIDGE_ERROR,
        message: 'App Bridge initialization failed',
        details: error.message,
        recoverable: true
      };
    }

    // Default unknown error
    return {
      code: ErrorCode.UNKNOWN_ERROR,
      message: error.message || 'An unexpected error occurred',
      details: error,
      recoverable: false
    };
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(
    error: AppError,
    retryCallback: () => Promise<any>
  ): Promise<any> {
    const retryKey = `${error.code}-${Date.now()}`;
    const currentRetries = this.retryCount.get(retryKey) || 0;

    console.log(`[Error Recovery] Attempting recovery for ${error.code}`, {
      attempt: currentRetries + 1,
      maxRetries: this.maxRetries
    });

    if (!error.recoverable || currentRetries >= this.maxRetries) {
      console.error('[Error Recovery] Cannot recover:', error);
      throw new Error(error.message);
    }

    this.retryCount.set(retryKey, currentRetries + 1);

    switch (error.code) {
      case ErrorCode.SESSION_EXPIRED:
        return this.recoverFromSessionExpired(retryCallback);
      
      case ErrorCode.NETWORK_ERROR:
        return this.recoverFromNetworkError(retryCallback, currentRetries);
      
      case ErrorCode.RATE_LIMITED:
        return this.recoverFromRateLimit(retryCallback, error.retryAfter);
      
      case ErrorCode.APP_BRIDGE_ERROR:
        return this.recoverFromAppBridgeError(retryCallback);
      
      default:
        throw new Error(error.message);
    }
  }

  /**
   * Recover from session expiration
   */
  private async recoverFromSessionExpired(retryCallback: () => Promise<any>) {
    console.log('[Error Recovery] Recovering from session expiration...');
    
    // Wait for potential token refresh
    await this.delay(2000);
    
    try {
      // Retry the original request
      return await retryCallback();
    } catch (error) {
      // If still failing, reload the page
      console.error('[Error Recovery] Session recovery failed, reloading page...');
      window.location.reload();
      throw error;
    }
  }

  /**
   * Recover from network errors with exponential backoff
   */
  private async recoverFromNetworkError(
    retryCallback: () => Promise<any>,
    attemptNumber: number
  ) {
    const delay = this.baseDelay * Math.pow(2, attemptNumber);
    console.log(`[Error Recovery] Network error, retrying in ${delay}ms...`);
    
    await this.delay(delay);
    
    return retryCallback();
  }

  /**
   * Recover from rate limiting
   */
  private async recoverFromRateLimit(
    retryCallback: () => Promise<any>,
    retryAfter?: number
  ) {
    const delay = (retryAfter || 60) * 1000;
    console.log(`[Error Recovery] Rate limited, waiting ${delay}ms...`);
    
    await this.delay(delay);
    
    return retryCallback();
  }

  /**
   * Recover from App Bridge errors
   */
  private async recoverFromAppBridgeError(retryCallback: () => Promise<any>) {
    console.log('[Error Recovery] Recovering from App Bridge error...');
    
    // Check if we're in the right context
    if (window.self === window.top) {
      throw new Error('App must be loaded in Shopify Admin');
    }
    
    // Wait for App Bridge to potentially initialize
    await this.delay(3000);
    
    // Check if App Bridge is now available
    if (typeof (window as any).shopify === 'undefined') {
      // Try reloading once
      const hasReloaded = sessionStorage.getItem('app-bridge-error-reload');
      if (!hasReloaded) {
        sessionStorage.setItem('app-bridge-error-reload', 'true');
        window.location.reload();
      } else {
        sessionStorage.removeItem('app-bridge-error-reload');
        throw new Error('App Bridge initialization failed after reload');
      }
    }
    
    return retryCallback();
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear retry counts
   */
  clearRetryHistory() {
    this.retryCount.clear();
  }
}

/**
 * Global error recovery instance
 */
export const errorRecovery = new ErrorRecoveryManager();

/**
 * Wrap a function with automatic error recovery
 */
export function withErrorRecovery<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = errorRecovery.classifyError(error);
      
      if (appError.recoverable) {
        return errorRecovery.attemptRecovery(
          appError,
          () => fn(...args)
        );
      }
      
      throw error;
    }
  }) as T;
}

/**
 * React hook for error recovery
 */
export function useErrorRecovery() {
  const [error, setError] = useState<AppError | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  const handleError = useCallback(async (error: any, retryCallback?: () => Promise<any>) => {
    const appError = errorRecovery.classifyError(error);
    setError(appError);

    if (appError.recoverable && retryCallback) {
      setIsRecovering(true);
      try {
        await errorRecovery.attemptRecovery(appError, retryCallback);
        setError(null);
      } catch (recoveryError) {
        console.error('[useErrorRecovery] Recovery failed:', recoveryError);
      } finally {
        setIsRecovering(false);
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    errorRecovery.clearRetryHistory();
  }, []);

  return {
    error,
    isRecovering,
    handleError,
    clearError
  };
}
