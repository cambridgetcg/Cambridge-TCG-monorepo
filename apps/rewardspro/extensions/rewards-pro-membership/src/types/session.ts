/**
 * Session token claims structure
 * The contents of the token are signed using your shared app secret.
 */
export interface SessionTokenClaims {
  /** Shopify URL */
  dest: string;
  /** The Client ID of your app */
  aud: string;
  /** When the token expires (timestamp in seconds) */
  exp: number;
  /** When the token was activated (timestamp in seconds) */
  nbf: number;
  /** When the token was issued (timestamp in seconds) */
  iat: number;
  /** A unique identifier (nonce) to prevent replay attacks */
  jti: string;
  /**
   * Optional claim present when a customer is logged in
   * and your app has permissions to read customer data
   * Format: gid://shopify/Customer/<customerId>
   */
  sub?: string;
}

/**
 * Decoded session token information
 */
export interface DecodedSessionToken {
  claims: SessionTokenClaims;
  token: string;
  isExpired: boolean;
  customerId?: string;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Authenticated customer information
 * Requires access to protected customer data
 */
export interface Customer {
  /** Customer ID in GID format (e.g., 'gid://shopify/Customer/123') */
  id: string;
}

/**
 * Company information for B2B customers
 */
export interface Company {
  /** Company ID */
  id: string;
}

/**
 * Company location information for B2B customers
 */
export interface CompanyLocation {
  /** Company location ID */
  id: string;
}

/**
 * Purchasing company information for authenticated business customers
 */
export interface PurchasingCompany {
  /** Information about the company of the logged in business customer */
  company: Company;
  /** Information about the company location of the logged in business customer */
  location?: CompanyLocation;
}

/**
 * Authenticated account information
 */
export interface AuthenticatedAccountInfo {
  /** Customer information (undefined if not authenticated) */
  customer?: Customer;
  /** Company information (undefined if not a B2B customer) */
  purchasingCompany?: PurchasingCompany;
}
