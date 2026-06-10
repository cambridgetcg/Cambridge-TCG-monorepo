/**
 * Order Factory
 *
 * Generates realistic Shopify order webhook payloads for testing.
 * Matches the actual Shopify webhook payload structure.
 *
 * Usage:
 *   const payload = createOrderPayload({ totalPrice: 150 });
 *   const tierOrder = createTierProductOrderPayload(productId, variantId);
 */

// ============================================
// TYPES
// ============================================

export interface OrderFactoryOptions {
  /** Order ID (numeric or string) */
  id?: string | number;
  /** Order name (e.g., "#1001") */
  name?: string;
  /** Customer ID */
  customerId?: string | number;
  /** Customer email */
  email?: string;
  /** Total order price */
  totalPrice?: number;
  /** Subtotal price (before tax) */
  subtotalPrice?: number;
  /** Total tax amount */
  totalTax?: number;
  /** Total discount amount */
  totalDiscounts?: number;
  /** Currency code */
  currency?: string;
  /** Presentment currency (customer-facing) */
  presentmentCurrency?: string;
  /** Financial status */
  financialStatus?: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'voided';
  /** Fulfillment status */
  fulfillmentStatus?: 'fulfilled' | 'partial' | 'unfulfilled' | null;
  /** Order tags */
  tags?: string[];
  /** Line items */
  lineItems?: LineItemOptions[];
  /** Created at timestamp */
  createdAt?: Date | string;
  /** Cancelled at timestamp */
  cancelledAt?: Date | string | null;
  /** Cancel reason */
  cancelReason?: string | null;
}

export interface LineItemOptions {
  /** Line item ID */
  id?: string | number;
  /** Product ID */
  productId?: string | number;
  /** Variant ID */
  variantId?: string | number;
  /** SKU */
  sku?: string | null;
  /** Product title */
  title?: string;
  /** Item price */
  price?: number;
  /** Quantity */
  quantity?: number;
  /** Whether item is taxable */
  taxable?: boolean;
}

export interface CustomerOptions {
  id?: string | number;
  email?: string;
  firstName?: string;
  lastName?: string;
  ordersCount?: number;
  totalSpent?: number;
  tags?: string[];
}

// ============================================
// UTILITIES
// ============================================

let idCounter = 1000000000;

/**
 * Generate a unique numeric ID
 */
function generateId(): number {
  return idCounter++;
}

/**
 * Generate a random order number (4 digits)
 */
function generateOrderNumber(): number {
  return Math.floor(1000 + Math.random() * 9000);
}

/**
 * Generate a random alphanumeric string
 */
function randomString(length: number): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length)
    .toUpperCase();
}

/**
 * Format number as money string
 */
function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

// ============================================
// FACTORIES
// ============================================

/**
 * Create a realistic customer object for order payloads
 */
export function createCustomerPayload(options: CustomerOptions = {}): Record<string, unknown> {
  const customerId = options.id ? Number(options.id) : generateId();
  const email = options.email || `customer-${customerId}@example.com`;

  return {
    id: customerId,
    admin_graphql_api_id: `gid://shopify/Customer/${customerId}`,
    email,
    first_name: options.firstName || 'Test',
    last_name: options.lastName || 'Customer',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    orders_count: options.ordersCount || 1,
    total_spent: formatMoney(options.totalSpent || 0),
    tags: options.tags?.join(', ') || '',
    verified_email: true,
    accepts_marketing: false,
    state: 'enabled',
    currency: 'USD',
    default_address: {
      id: generateId(),
      customer_id: customerId,
      first_name: options.firstName || 'Test',
      last_name: options.lastName || 'Customer',
      address1: '123 Test Street',
      city: 'Test City',
      province: 'California',
      province_code: 'CA',
      country: 'United States',
      country_code: 'US',
      zip: '90210',
      phone: '+1234567890',
      default: true,
    },
  };
}

/**
 * Create a line item for order payloads
 */
export function createLineItemPayload(options: LineItemOptions = {}): Record<string, unknown> {
  const lineItemId = options.id ? Number(options.id) : generateId();
  const productId = options.productId ? Number(options.productId) : generateId();
  const variantId = options.variantId ? Number(options.variantId) : generateId();
  const price = options.price ?? 49.99;
  const quantity = options.quantity ?? 1;

  return {
    id: lineItemId,
    admin_graphql_api_id: `gid://shopify/LineItem/${lineItemId}`,
    title: options.title || 'Test Product',
    name: options.title || 'Test Product',
    product_id: productId,
    variant_id: variantId,
    sku: options.sku ?? `SKU-${randomString(8)}`,
    price: formatMoney(price),
    quantity,
    taxable: options.taxable ?? true,
    requires_shipping: true,
    fulfillable_quantity: quantity,
    fulfillment_status: null,
    gift_card: false,
    total_discount: '0.00',
    discount_allocations: [],
    price_set: {
      shop_money: { amount: formatMoney(price), currency_code: 'USD' },
      presentment_money: { amount: formatMoney(price), currency_code: 'USD' },
    },
    tax_lines: [
      {
        title: 'Tax',
        price: formatMoney(price * 0.1),
        rate: 0.1,
        price_set: {
          shop_money: { amount: formatMoney(price * 0.1), currency_code: 'USD' },
          presentment_money: { amount: formatMoney(price * 0.1), currency_code: 'USD' },
        },
      },
    ],
  };
}

/**
 * Create a realistic Shopify order webhook payload
 */
export function createOrderPayload(options: OrderFactoryOptions = {}): Record<string, unknown> {
  const orderId = options.id ? Number(options.id) : generateId();
  const customerId = options.customerId ? Number(options.customerId) : generateId();
  const orderNumber = generateOrderNumber();
  const currency = options.currency || 'USD';
  const presentmentCurrency = options.presentmentCurrency || currency;

  // Calculate line items
  const lineItems = options.lineItems?.length
    ? options.lineItems.map((item) => createLineItemPayload(item))
    : [createLineItemPayload({ price: options.totalPrice ?? 99.99 })];

  // Calculate totals
  const subtotalFromItems = lineItems.reduce(
    (sum, item) => sum + parseFloat(item.price as string) * (item.quantity as number),
    0
  );
  const subtotalPrice = options.subtotalPrice ?? subtotalFromItems;
  const totalTax = options.totalTax ?? subtotalPrice * 0.1;
  const totalDiscounts = options.totalDiscounts ?? 0;
  const totalPrice = options.totalPrice ?? subtotalPrice + totalTax - totalDiscounts;

  const createdAt =
    options.createdAt instanceof Date
      ? options.createdAt.toISOString()
      : options.createdAt || new Date().toISOString();

  const cancelledAt =
    options.cancelledAt instanceof Date
      ? options.cancelledAt.toISOString()
      : options.cancelledAt || null;

  return {
    id: orderId,
    admin_graphql_api_id: `gid://shopify/Order/${orderId}`,
    app_id: 1234567,
    browser_ip: '192.168.1.1',
    buyer_accepts_marketing: false,
    cancel_reason: options.cancelReason ?? null,
    cancelled_at: cancelledAt,
    cart_token: null,
    checkout_id: generateId(),
    checkout_token: randomString(32),
    closed_at: null,
    confirmed: true,
    contact_email: options.email || `customer-${customerId}@example.com`,
    created_at: createdAt,
    currency,
    current_subtotal_price: formatMoney(subtotalPrice),
    current_subtotal_price_set: {
      shop_money: { amount: formatMoney(subtotalPrice), currency_code: currency },
      presentment_money: { amount: formatMoney(subtotalPrice), currency_code: presentmentCurrency },
    },
    current_total_discounts: formatMoney(totalDiscounts),
    current_total_discounts_set: {
      shop_money: { amount: formatMoney(totalDiscounts), currency_code: currency },
      presentment_money: {
        amount: formatMoney(totalDiscounts),
        currency_code: presentmentCurrency,
      },
    },
    current_total_price: formatMoney(totalPrice),
    current_total_price_set: {
      shop_money: { amount: formatMoney(totalPrice), currency_code: currency },
      presentment_money: { amount: formatMoney(totalPrice), currency_code: presentmentCurrency },
    },
    current_total_tax: formatMoney(totalTax),
    current_total_tax_set: {
      shop_money: { amount: formatMoney(totalTax), currency_code: currency },
      presentment_money: { amount: formatMoney(totalTax), currency_code: presentmentCurrency },
    },
    customer: createCustomerPayload({ id: customerId, email: options.email }),
    customer_locale: 'en',
    discount_applications: [],
    discount_codes: [],
    email: options.email || `customer-${customerId}@example.com`,
    estimated_taxes: false,
    financial_status: options.financialStatus || 'paid',
    fulfillment_status: options.fulfillmentStatus ?? null,
    fulfillments: [],
    gateway: 'shopify_payments',
    landing_site: null,
    landing_site_ref: null,
    line_items: lineItems,
    location_id: null,
    name: options.name || `#${orderNumber}`,
    note: null,
    note_attributes: [],
    number: orderNumber - 1000,
    order_number: orderNumber,
    order_status_url: `https://test-shop.myshopify.com/orders/${orderId}`,
    original_total_duties_set: null,
    payment_gateway_names: ['shopify_payments'],
    phone: null,
    presentment_currency: presentmentCurrency,
    processed_at: createdAt,
    processing_method: 'direct',
    reference: null,
    referring_site: null,
    refunds: [],
    shipping_address: {
      first_name: 'Test',
      last_name: 'Customer',
      address1: '123 Test Street',
      city: 'Test City',
      province: 'California',
      province_code: 'CA',
      country: 'United States',
      country_code: 'US',
      zip: '90210',
      phone: '+1234567890',
      name: 'Test Customer',
      company: null,
      latitude: 34.0522,
      longitude: -118.2437,
    },
    billing_address: {
      first_name: 'Test',
      last_name: 'Customer',
      address1: '123 Test Street',
      city: 'Test City',
      province: 'California',
      province_code: 'CA',
      country: 'United States',
      country_code: 'US',
      zip: '90210',
      phone: '+1234567890',
      name: 'Test Customer',
      company: null,
    },
    shipping_lines: [
      {
        id: generateId(),
        code: 'Standard',
        discount_allocations: [],
        price: '5.99',
        price_set: {
          shop_money: { amount: '5.99', currency_code: currency },
          presentment_money: { amount: '5.99', currency_code: presentmentCurrency },
        },
        source: 'shopify',
        title: 'Standard Shipping',
        tax_lines: [],
        carrier_identifier: null,
        requested_fulfillment_service_id: null,
      },
    ],
    source_identifier: null,
    source_name: 'web',
    source_url: null,
    subtotal_price: formatMoney(subtotalPrice),
    subtotal_price_set: {
      shop_money: { amount: formatMoney(subtotalPrice), currency_code: currency },
      presentment_money: { amount: formatMoney(subtotalPrice), currency_code: presentmentCurrency },
    },
    tags: options.tags?.join(', ') || '',
    tax_lines: [
      {
        price: formatMoney(totalTax),
        rate: 0.1,
        title: 'Tax',
        price_set: {
          shop_money: { amount: formatMoney(totalTax), currency_code: currency },
          presentment_money: { amount: formatMoney(totalTax), currency_code: presentmentCurrency },
        },
      },
    ],
    taxes_included: false,
    test: false,
    token: randomString(32),
    total_discounts: formatMoney(totalDiscounts),
    total_discounts_set: {
      shop_money: { amount: formatMoney(totalDiscounts), currency_code: currency },
      presentment_money: { amount: formatMoney(totalDiscounts), currency_code: presentmentCurrency },
    },
    total_line_items_price: formatMoney(subtotalPrice),
    total_line_items_price_set: {
      shop_money: { amount: formatMoney(subtotalPrice), currency_code: currency },
      presentment_money: { amount: formatMoney(subtotalPrice), currency_code: presentmentCurrency },
    },
    total_outstanding: '0.00',
    total_price: formatMoney(totalPrice),
    total_price_set: {
      shop_money: { amount: formatMoney(totalPrice), currency_code: currency },
      presentment_money: { amount: formatMoney(totalPrice), currency_code: presentmentCurrency },
    },
    total_shipping_price_set: {
      shop_money: { amount: '5.99', currency_code: currency },
      presentment_money: { amount: '5.99', currency_code: presentmentCurrency },
    },
    total_tax: formatMoney(totalTax),
    total_tax_set: {
      shop_money: { amount: formatMoney(totalTax), currency_code: currency },
      presentment_money: { amount: formatMoney(totalTax), currency_code: presentmentCurrency },
    },
    total_tip_received: '0.00',
    total_weight: 1000,
    updated_at: new Date().toISOString(),
    user_id: null,
  };
}

// ============================================
// SPECIALIZED ORDER FACTORIES
// ============================================

/**
 * Create an order payload with a tier product
 */
export function createTierProductOrderPayload(
  productId: string | number,
  variantId: string | number,
  options: Omit<OrderFactoryOptions, 'lineItems'> = {}
): Record<string, unknown> {
  const price = options.totalPrice ?? 99.99;

  return createOrderPayload({
    ...options,
    lineItems: [
      {
        productId,
        variantId,
        title: 'VIP Tier Membership',
        price,
        quantity: 1,
      },
    ],
  });
}

/**
 * Create an order with a trial tier product (zero price)
 */
export function createTrialTierOrderPayload(
  productId: string | number,
  variantId: string | number,
  options: Omit<OrderFactoryOptions, 'lineItems' | 'totalPrice'> = {}
): Record<string, unknown> {
  return createOrderPayload({
    ...options,
    totalPrice: 0,
    subtotalPrice: 0,
    totalTax: 0,
    lineItems: [
      {
        productId,
        variantId,
        title: 'VIP Tier Trial',
        price: 0,
        quantity: 1,
      },
    ],
  });
}

/**
 * Create an order with multiple items (for cashback testing)
 */
export function createMultiItemOrderPayload(
  items: Array<{ title: string; price: number; quantity?: number }>,
  options: Omit<OrderFactoryOptions, 'lineItems'> = {}
): Record<string, unknown> {
  const lineItems = items.map((item) => ({
    title: item.title,
    price: item.price,
    quantity: item.quantity ?? 1,
  }));

  const total = items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);

  return createOrderPayload({
    ...options,
    totalPrice: total,
    lineItems,
  });
}

/**
 * Create a cancelled order payload
 */
export function createCancelledOrderPayload(
  options: Omit<OrderFactoryOptions, 'financialStatus' | 'cancelledAt'> = {}
): Record<string, unknown> {
  return createOrderPayload({
    ...options,
    financialStatus: 'voided',
    cancelledAt: new Date(),
    cancelReason: options.cancelReason ?? 'customer',
  });
}

/**
 * Create a multi-currency order (presentment != shop currency)
 */
export function createMultiCurrencyOrderPayload(
  shopCurrency: string,
  presentmentCurrency: string,
  options: Omit<OrderFactoryOptions, 'currency' | 'presentmentCurrency'> = {}
): Record<string, unknown> {
  return createOrderPayload({
    ...options,
    currency: shopCurrency,
    presentmentCurrency,
  });
}
