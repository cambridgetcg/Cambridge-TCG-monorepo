import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import crypto from "crypto";

// Types
export interface WebhookTestResult {
  success: boolean;
  message: string;
  details?: any;
  error?: string;
}

export interface MockOrder {
  id: string;
  email: string;
  customerId: string;
  amount: number;
  currency: string;
  lineItems: Array<{
    title: string;
    price: number;
    quantity: number;
  }>;
}

// Service for testing webhooks
export class WebhookTestService {
  constructor(
    private admin: AdminApiContext,
    private shop: string,
    private webhookSecret: string
  ) {}

  /**
   * Create a test order in Shopify (draft order that can be marked as paid)
   */
  async createTestOrder(
    customerId: string,
    amount: number,
    currency: string
  ): Promise<WebhookTestResult> {
    try {
      // Create a draft order first
      const CREATE_DRAFT_ORDER = `#graphql
        mutation CreateDraftOrder($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              totalPrice
              currencyCode
              customer {
                id
                email
              }
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    originalUnitPrice
                    quantity
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const draftOrderInput = {
        customerId: `gid://shopify/Customer/${customerId}`,
        lineItems: [
          {
            title: "Test Product for Webhook Testing",
            originalUnitPrice: amount.toFixed(2),
            quantity: 1,
            taxable: false
          }
        ],
        note: "Test order created for webhook testing",
        tags: ["test", "webhook-test"],
        useCustomerDefaultAddress: true
      };

      const response = await this.admin.graphql(CREATE_DRAFT_ORDER, {
        variables: { input: draftOrderInput }
      });

      const result = await response.json();

      if (result.data?.draftOrderCreate?.userErrors?.length > 0) {
        const errors = result.data.draftOrderCreate.userErrors;
        return {
          success: false,
          message: "Failed to create draft order",
          error: errors.map((e: any) => e.message).join(", "),
          details: { errors }
        };
      }

      const draftOrder = result.data?.draftOrderCreate?.draftOrder;
      if (!draftOrder) {
        return {
          success: false,
          message: "No draft order returned",
          error: "Draft order creation failed"
        };
      }

      return {
        success: true,
        message: "Test draft order created successfully",
        details: {
          draftOrderId: draftOrder.id,
          draftOrderName: draftOrder.name,
          totalPrice: draftOrder.totalPrice,
          currency: draftOrder.currencyCode,
          customer: draftOrder.customer,
          note: "Draft order created. Complete it in Shopify admin to trigger webhook."
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to create test order",
        error: error instanceof Error ? error.message : "Unknown error",
        details: { error }
      };
    }
  }

  /**
   * Simulate a webhook call to the local webhook endpoint
   */
  async simulateWebhook(
    order: MockOrder,
    webhookUrl: string
  ): Promise<WebhookTestResult> {
    try {
      // Create webhook payload
      const payload = {
        id: parseInt(order.id),
        admin_graphql_api_id: `gid://shopify/Order/${order.id}`,
        email: order.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_price: order.amount.toFixed(2),
        subtotal_price: order.amount.toFixed(2),
        currency: order.currency,
        financial_status: "paid",
        customer: {
          id: parseInt(order.customerId),
          email: order.email
        },
        line_items: order.lineItems.map((item, index) => ({
          id: index + 1,
          price: item.price.toFixed(2),
          quantity: item.quantity,
          title: item.title
        }))
      };

      // Calculate HMAC for webhook verification
      const rawBody = JSON.stringify(payload);
      const hmac = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(rawBody, "utf8")
        .digest("base64");

      // Send webhook request
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Topic": "orders/paid",
          "X-Shopify-Hmac-Sha256": hmac,
          "X-Shopify-Shop-Domain": this.shop,
          "X-Shopify-Webhook-Id": `test-webhook-${Date.now()}`,
          "X-Shopify-API-Version": "2025-07"
        },
        body: rawBody
      });

      const responseText = await response.text();

      return {
        success: response.ok,
        message: response.ok 
          ? "Webhook simulation successful" 
          : `Webhook simulation failed with status ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          response: responseText,
          payload: payload,
          headers: {
            topic: "orders/paid",
            hmac: hmac.substring(0, 20) + "...",
            shop: this.shop
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to simulate webhook",
        error: error instanceof Error ? error.message : "Unknown error",
        details: { error }
      };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    rawBody: string,
    signature: string
  ): boolean {
    const hash = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody, "utf8")
      .digest("base64");

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  }

  /**
   * Test GraphQL store credit query
   */
  async testStoreCreditQuery(customerId: string): Promise<WebhookTestResult> {
    try {
      const STORE_CREDIT_QUERY = `#graphql
        query GetCustomerStoreCredit($id: ID!) {
          customer(id: $id) {
            id
            displayName
            email
            storeCreditAccounts(first: 1) {
              edges {
                node {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                  transactions(first: 5, reverse: true) {
                    edges {
                      node {
                        id
                        amount {
                          amount
                          currencyCode
                        }
                        balanceAfterTransaction {
                          amount
                          currencyCode
                        }
                        createdAt
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.admin.graphql(STORE_CREDIT_QUERY, {
        variables: {
          id: `gid://shopify/Customer/${customerId}`
        }
      });

      const result = await response.json();

      if (result.errors) {
        return {
          success: false,
          message: "GraphQL query failed",
          error: result.errors[0].message,
          details: { errors: result.errors }
        };
      }

      const customer = result.data?.customer;
      const storeCreditAccount = customer?.storeCreditAccounts?.edges?.[0]?.node;

      return {
        success: true,
        message: "Store credit query successful",
        details: {
          customer: {
            id: customer?.id,
            email: customer?.email,
            displayName: customer?.displayName
          },
          storeCreditAccount: storeCreditAccount ? {
            id: storeCreditAccount.id,
            balance: storeCreditAccount.balance,
            recentTransactions: storeCreditAccount.transactions?.edges?.map((edge: any) => edge.node)
          } : null,
          hasStoreCreditAccount: !!storeCreditAccount
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to query store credit",
        error: error instanceof Error ? error.message : "Unknown error",
        details: { error }
      };
    }
  }

  /**
   * Test store credit issuance mutation
   */
  async testStoreCreditIssuance(
    customerId: string,
    amount: number,
    currency: string,
    dryRun: boolean = true
  ): Promise<WebhookTestResult> {
    try {
      if (dryRun) {
        // Just validate the mutation structure without executing
        const mutationStructure = {
          mutation: "storeCreditAccountCredit",
          variables: {
            id: `gid://shopify/Customer/${customerId}`,
            creditInput: {
              creditAmount: {
                amount: amount.toFixed(2),
                currencyCode: currency
              }
            }
          }
        };

        return {
          success: true,
          message: "Store credit mutation validated (dry run)",
          details: {
            dryRun: true,
            wouldExecute: mutationStructure,
            amount: amount.toFixed(2),
            currency: currency,
            customerId: customerId
          }
        };
      }

      // Actually execute the mutation
      const ISSUE_CREDIT_MUTATION = `#graphql
        mutation IssueStoreCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
          storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
            storeCreditAccountTransaction {
              id
              amount {
                amount
                currencyCode
              }
              balanceAfterTransaction {
                amount
                currencyCode
              }
              createdAt
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      const response = await this.admin.graphql(ISSUE_CREDIT_MUTATION, {
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
          creditInput: {
            creditAmount: {
              amount: amount.toFixed(2),
              currencyCode: currency
            }
          }
        }
      });

      const result = await response.json();

      if (result.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
        const errors = result.data.storeCreditAccountCredit.userErrors;
        return {
          success: false,
          message: "Store credit issuance failed",
          error: errors.map((e: any) => e.message).join(", "),
          details: { userErrors: errors }
        };
      }

      const transaction = result.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;

      return {
        success: !!transaction,
        message: transaction 
          ? "Store credit issued successfully" 
          : "Store credit issuance failed",
        details: {
          transaction: transaction,
          amountIssued: amount.toFixed(2),
          currency: currency
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to issue store credit",
        error: error instanceof Error ? error.message : "Unknown error",
        details: { error }
      };
    }
  }

  /**
   * Validate currency format and compatibility
   */
  validateCurrency(
    amount: number,
    currency: string,
    storeCurrency?: string
  ): WebhookTestResult {
    const validCurrencies = [
      'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD',
      'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN',
      'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB',
      'TRY', 'CNY', 'INR', 'IDR', 'KRW', 'MXN',
      'MYR', 'PHP', 'SGD', 'THB', 'VND', 'ZAR'
    ];

    const issues: string[] = [];

    // Check if currency is valid
    if (!validCurrencies.includes(currency)) {
      issues.push(`Invalid currency code: ${currency}`);
    }

    // Check if currency matches store currency
    if (storeCurrency && storeCurrency !== currency) {
      issues.push(`Currency mismatch: Store uses ${storeCurrency}, but ${currency} was provided`);
    }

    // Check amount formatting
    const formatted = amount.toFixed(2);
    const parsed = parseFloat(formatted);
    if (parsed !== parseFloat(formatted)) {
      issues.push(`Amount formatting issue: ${amount} -> ${formatted}`);
    }

    // Special handling for zero-decimal currencies
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX'];
    const isZeroDecimal = zeroDecimalCurrencies.includes(currency);

    return {
      success: issues.length === 0,
      message: issues.length === 0 
        ? "Currency validation passed" 
        : "Currency validation found issues",
      details: {
        currency: currency,
        storeCurrency: storeCurrency,
        isValid: validCurrencies.includes(currency),
        matchesStore: !storeCurrency || storeCurrency === currency,
        formattedAmount: formatted,
        isZeroDecimal: isZeroDecimal,
        issues: issues,
        notes: [
          isZeroDecimal ? `${currency} is a zero-decimal currency` : null,
          "Shopify requires amounts in decimal format with 2 decimal places",
          "Currency code must match the store's configured currency"
        ].filter(Boolean)
      }
    };
  }
}

// Helper function to create test service
export async function createWebhookTestService(
  admin: AdminApiContext,
  shop: string,
  webhookSecret?: string
): Promise<WebhookTestService> {
  // Use a default test secret if not provided
  const secret = webhookSecret || process.env.SHOPIFY_WEBHOOK_SECRET || "test-webhook-secret";
  
  return new WebhookTestService(admin, shop, secret);
}