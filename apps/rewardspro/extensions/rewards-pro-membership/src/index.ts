// Hooks
export { useSessionToken } from './hooks/useSessionToken';
export { useApiClient } from './hooks/useApiClient';
export { useAuthenticatedCustomer } from './hooks/useAuthenticatedCustomer';

// Utils
export {
  decodeSessionToken,
  getCustomerIdFromToken,
  isTokenExpired,
  getTokenExpiryTime
} from './utils/sessionToken';
export { ApiClient, createApiClient } from './utils/apiClient';
export type { ApiClientConfig } from './utils/apiClient';

// Types
export type {
  SessionTokenClaims,
  DecodedSessionToken,
  ApiResponse,
  Customer,
  Company,
  CompanyLocation,
  PurchasingCompany,
  AuthenticatedAccountInfo
} from './types/session';
