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
    // Config objects are commonly created inline; these scalar fields are the
    // complete ApiClientConfig contract and intentionally control identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config?.baseUrl, config?.timeout, config?.enableDebugLogs, config?.shopDomain]
  );
}
