/**
 * Customer Factory
 *
 * Generates realistic Shopify customer webhook payloads for testing.
 * Matches the actual Shopify webhook payload structure for customers/create and customers/update.
 *
 * Usage:
 *   const payload = createCustomerPayload({ email: 'test@example.com' });
 */

// ============================================
// TYPES
// ============================================

export interface CustomerFactoryOptions {
  /** Customer ID */
  id?: string | number;
  /** Email address */
  email?: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Phone number */
  phone?: string | null;
  /** Total orders count */
  ordersCount?: number;
  /** Total amount spent */
  totalSpent?: number;
  /** Currency for total spent */
  currency?: string;
  /** Customer tags */
  tags?: string[];
  /** Whether email is verified */
  verifiedEmail?: boolean;
  /** Marketing consent */
  acceptsMarketing?: boolean;
  /** Account state */
  state?: 'enabled' | 'disabled' | 'invited' | 'declined';
  /** Created at timestamp */
  createdAt?: Date | string;
  /** Include default address */
  includeAddress?: boolean;
}

export interface AddressOptions {
  id?: string | number;
  firstName?: string;
  lastName?: string;
  address1?: string;
  address2?: string | null;
  city?: string;
  province?: string;
  provinceCode?: string;
  country?: string;
  countryCode?: string;
  zip?: string;
  phone?: string | null;
  company?: string | null;
  isDefault?: boolean;
}

// ============================================
// UTILITIES
// ============================================

let idCounter = 3000000000;

function generateId(): number {
  return idCounter++;
}

function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

// ============================================
// FACTORIES
// ============================================

/**
 * Create a customer address
 */
export function createAddressPayload(
  customerId: string | number,
  options: AddressOptions = {}
): Record<string, unknown> {
  const addressId = options.id ? Number(options.id) : generateId();

  return {
    id: addressId,
    customer_id: Number(customerId),
    first_name: options.firstName || 'Test',
    last_name: options.lastName || 'Customer',
    company: options.company ?? null,
    address1: options.address1 || '123 Test Street',
    address2: options.address2 ?? null,
    city: options.city || 'Test City',
    province: options.province || 'California',
    province_code: options.provinceCode || 'CA',
    country: options.country || 'United States',
    country_code: options.countryCode || 'US',
    country_name: options.country || 'United States',
    zip: options.zip || '90210',
    phone: options.phone ?? '+1234567890',
    name: `${options.firstName || 'Test'} ${options.lastName || 'Customer'}`,
    default: options.isDefault ?? true,
  };
}

/**
 * Create a realistic Shopify customer webhook payload
 */
export function createCustomerPayload(
  options: CustomerFactoryOptions = {}
): Record<string, unknown> {
  const customerId = options.id ? Number(options.id) : generateId();
  const email = options.email || `customer-${customerId}@example.com`;
  const firstName = options.firstName || 'Test';
  const lastName = options.lastName || 'Customer';
  const currency = options.currency || 'USD';

  const createdAt =
    options.createdAt instanceof Date
      ? options.createdAt.toISOString()
      : options.createdAt || new Date().toISOString();

  const defaultAddress =
    options.includeAddress !== false
      ? createAddressPayload(customerId, { firstName, lastName })
      : null;

  return {
    id: customerId,
    admin_graphql_api_id: `gid://shopify/Customer/${customerId}`,
    email,
    first_name: firstName,
    last_name: lastName,
    phone: options.phone ?? null,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    orders_count: options.ordersCount ?? 0,
    state: options.state || 'enabled',
    total_spent: formatMoney(options.totalSpent ?? 0),
    last_order_id: null,
    note: null,
    verified_email: options.verifiedEmail ?? true,
    multipass_identifier: null,
    tax_exempt: false,
    tags: options.tags?.join(', ') || '',
    last_order_name: null,
    currency,
    accepts_marketing: options.acceptsMarketing ?? false,
    accepts_marketing_updated_at: null,
    marketing_opt_in_level: null,
    email_marketing_consent: {
      state: options.acceptsMarketing ? 'subscribed' : 'not_subscribed',
      opt_in_level: options.acceptsMarketing ? 'single_opt_in' : null,
      consent_updated_at: null,
    },
    sms_marketing_consent: null,
    addresses: defaultAddress ? [defaultAddress] : [],
    default_address: defaultAddress,
    tax_exemptions: [],
  };
}

// ============================================
// SPECIALIZED CUSTOMER FACTORIES
// ============================================

/**
 * Create a new customer payload (for customers/create webhook)
 */
export function createNewCustomerPayload(
  options: Omit<CustomerFactoryOptions, 'ordersCount' | 'totalSpent'> = {}
): Record<string, unknown> {
  return createCustomerPayload({
    ...options,
    ordersCount: 0,
    totalSpent: 0,
    createdAt: new Date(),
  });
}

/**
 * Create a returning customer payload (has order history)
 */
export function createReturningCustomerPayload(
  ordersCount: number,
  totalSpent: number,
  options: Omit<CustomerFactoryOptions, 'ordersCount' | 'totalSpent'> = {}
): Record<string, unknown> {
  return createCustomerPayload({
    ...options,
    ordersCount,
    totalSpent,
  });
}

/**
 * Create a VIP customer payload (high value)
 */
export function createVIPCustomerPayload(
  options: Omit<CustomerFactoryOptions, 'ordersCount' | 'totalSpent' | 'tags'> = {}
): Record<string, unknown> {
  return createCustomerPayload({
    ...options,
    ordersCount: 25,
    totalSpent: 5000,
    tags: ['vip', 'loyal', ...(options.tags || [])],
  });
}

/**
 * Create a customer with specific tags
 */
export function createTaggedCustomerPayload(
  tags: string[],
  options: Omit<CustomerFactoryOptions, 'tags'> = {}
): Record<string, unknown> {
  return createCustomerPayload({
    ...options,
    tags,
  });
}

/**
 * Create a customer update payload (for customers/update webhook)
 */
export function createCustomerUpdatePayload(
  existingId: string | number,
  updates: Partial<CustomerFactoryOptions> = {}
): Record<string, unknown> {
  return createCustomerPayload({
    id: existingId,
    ...updates,
  });
}

/**
 * Create a marketing-subscribed customer
 */
export function createMarketingCustomerPayload(
  options: Omit<CustomerFactoryOptions, 'acceptsMarketing'> = {}
): Record<string, unknown> {
  return createCustomerPayload({
    ...options,
    acceptsMarketing: true,
  });
}
