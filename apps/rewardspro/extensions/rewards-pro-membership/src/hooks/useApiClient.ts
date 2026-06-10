import { useMemo } from 'react';
import { createApiClient, type ApiClient, type ApiClientConfig } from '../utils/apiClient';

/**
 * Hook to create and memoize an API client instance
 *
 * @param config - Optional configuration for the API client
 * @returns Memoized ApiClient instance
 */
export function useApiClient(config?: Partial<ApiClientConfig>): ApiClient {
  return useMemo(
    () => createApiClient(config),
    [config?.baseUrl, config?.timeout, config?.enableDebugLogs, config?.shopDomain]
  );
}
