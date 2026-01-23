/**
 * Refund Factory
 *
 * Generates realistic Shopify refund webhook payloads for testing.
 * Matches the actual Shopify webhook payload structure for orders/refunded.
 *
 * Usage:
 *   const payload = createRefundPayload('order-123', 50.00);
 *   const fullRefund = createFullRefundPayload('order-123', 100.00);
 */

// ============================================
// TYPES
// ============================================

export interface RefundFactoryOptions {
  /** Refund ID */
  id?: string | number;
  /** Order ID this refund belongs to */
  orderId: string | number;
  /** Total refund amount */
  amount: number;
  /** Currency code */
  currency?: string;
  /** Refund note */
  note?: string;
  /** Whether items should be restocked */
  restock?: boolean;
  /** Refund reason */
  reason?: string;
  /** Line items being refunded */
  refundLineItems?: RefundLineItemOptions[];
  /** Created at timestamp */
  createdAt?: Date | string;
}

export interface RefundLineItemOptions {
  /** Original line item ID */
  lineItemId: string | number;
  /** Product ID */
  productId?: string | number;
  /** Variant ID */
  variantId?: string | number;
  /** Quantity being refunded */
  quantity: number;
  /** Subtotal being refunded for this item */
  subtotal: number;
  /** Tax being refunded for this item */
  totalTax?: number;
}

// ============================================
// UTILITIES
// ============================================

let idCounter = 2000000000;

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
 * Create a refund line item
 */
export function createRefundLineItemPayload(
  options: RefundLineItemOptions
): Record<string, unknown> {
  const refundLineItemId = generateId();
  const productId = options.productId ? Number(options.productId) : generateId();
  const variantId = options.variantId ? Number(options.variantId) : generateId();
  const totalTax = options.totalTax ?? options.subtotal * 0.1;

  return {
    id: refundLineItemId,
    line_item_id: Number(options.lineItemId),
    location_id: null,
    quantity: options.quantity,
    restock_type: 'no_restock',
    subtotal: formatMoney(options.subtotal),
    subtotal_set: {
      shop_money: { amount: formatMoney(options.subtotal), currency_code: 'USD' },
      presentment_money: { amount: formatMoney(options.subtotal), currency_code: 'USD' },
    },
    total_tax: formatMoney(totalTax),
    total_tax_set: {
      shop_money: { amount: formatMoney(totalTax), currency_code: 'USD' },
      presentment_money: { amount: formatMoney(totalTax), currency_code: 'USD' },
    },
    line_item: {
      id: Number(options.lineItemId),
      admin_graphql_api_id: `gid://shopify/LineItem/${options.lineItemId}`,
      product_id: productId,
      variant_id: variantId,
      title: 'Refunded Product',
      price: formatMoney(options.subtotal / options.quantity),
      quantity: options.quantity,
    },
  };
}

/**
 * Create a refund transaction
 */
export function createRefundTransactionPayload(
  orderId: string | number,
  amount: number,
  currency: string = 'USD'
): Record<string, unknown> {
  const transactionId = generateId();

  return {
    id: transactionId,
    admin_graphql_api_id: `gid://shopify/OrderTransaction/${transactionId}`,
    order_id: Number(orderId),
    kind: 'refund',
    gateway: 'shopify_payments',
    status: 'success',
    message: 'Refund',
    amount: formatMoney(amount),
    currency,
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    source_name: 'web',
    test: false,
    authorization: null,
    parent_id: generateId(),
    receipt: {},
    error_code: null,
    payment_details: null,
  };
}

/**
 * Create a realistic Shopify refund webhook payload
 */
export function createRefundPayload(options: RefundFactoryOptions): Record<string, unknown> {
  const refundId = options.id ? Number(options.id) : generateId();
  const orderId = Number(options.orderId);
  const currency = options.currency || 'USD';

  const createdAt =
    options.createdAt instanceof Date
      ? options.createdAt.toISOString()
      : options.createdAt || new Date().toISOString();

  const refundLineItems = options.refundLineItems?.map((item) =>
    createRefundLineItemPayload(item)
  ) || [];

  return {
    id: refundId,
    admin_graphql_api_id: `gid://shopify/Refund/${refundId}`,
    order_id: orderId,
    created_at: createdAt,
    processed_at: createdAt,
    note: options.note || null,
    restock: options.restock ?? true,
    user_id: null,
    duties: [],
    order_adjustments: [
      {
        id: generateId(),
        order_id: orderId,
        refund_id: refundId,
        amount: formatMoney(-options.amount),
        tax_amount: '0.00',
        kind: 'refund_discrepancy',
        reason: options.reason || 'Refund',
      },
    ],
    refund_line_items: refundLineItems,
    transactions: [createRefundTransactionPayload(orderId, options.amount, currency)],
    refund_duties: [],
    return: null,
    total_duties_set: {
      shop_money: { amount: '0.00', currency_code: currency },
      presentment_money: { amount: '0.00', currency_code: currency },
    },
  };
}

// ============================================
// SPECIALIZED REFUND FACTORIES
// ============================================

/**
 * Create a full refund payload (entire order amount)
 */
export function createFullRefundPayload(
  orderId: string | number,
  orderTotal: number,
  options: Partial<Omit<RefundFactoryOptions, 'orderId' | 'amount'>> = {}
): Record<string, unknown> {
  return createRefundPayload({
    ...options,
    orderId,
    amount: orderTotal,
    note: options.note ?? 'Full refund',
  });
}

/**
 * Create a partial refund payload
 */
export function createPartialRefundPayload(
  orderId: string | number,
  refundAmount: number,
  reason: string = 'Partial refund',
  options: Partial<Omit<RefundFactoryOptions, 'orderId' | 'amount'>> = {}
): Record<string, unknown> {
  return createRefundPayload({
    ...options,
    orderId,
    amount: refundAmount,
    reason,
    note: options.note ?? reason,
  });
}

/**
 * Create a refund with specific line items
 */
export function createLineItemRefundPayload(
  orderId: string | number,
  lineItems: Array<{
    lineItemId: string | number;
    productId?: string | number;
    variantId?: string | number;
    quantity: number;
    price: number;
  }>,
  options: Partial<Omit<RefundFactoryOptions, 'orderId' | 'amount' | 'refundLineItems'>> = {}
): Record<string, unknown> {
  const refundLineItems: RefundLineItemOptions[] = lineItems.map((item) => ({
    lineItemId: item.lineItemId,
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    subtotal: item.price * item.quantity,
  }));

  const totalAmount = lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return createRefundPayload({
    ...options,
    orderId,
    amount: totalAmount,
    refundLineItems,
  });
}

/**
 * Create a tier product refund payload
 */
export function createTierProductRefundPayload(
  orderId: string | number,
  tierProductPrice: number,
  tierProductLineItemId: string | number,
  tierProductId: string | number,
  tierVariantId: string | number,
  options: Partial<Omit<RefundFactoryOptions, 'orderId' | 'amount' | 'refundLineItems'>> = {}
): Record<string, unknown> {
  return createRefundPayload({
    ...options,
    orderId,
    amount: tierProductPrice,
    note: options.note ?? 'Tier membership refund',
    refundLineItems: [
      {
        lineItemId: tierProductLineItemId,
        productId: tierProductId,
        variantId: tierVariantId,
        quantity: 1,
        subtotal: tierProductPrice,
      },
    ],
  });
}
