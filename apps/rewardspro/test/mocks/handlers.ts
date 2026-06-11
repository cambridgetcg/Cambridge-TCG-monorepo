import { http, graphql, HttpResponse } from 'msw';

// Base URLs
const SHOPIFY_ADMIN_API = 'https://*.myshopify.com/admin/api/*';
const AWS_RDS_DATA_API = 'https://rds-data.*.amazonaws.com';

// Shopify Admin API handlers
export const shopifyHandlers = [
  // GraphQL endpoint
  graphql.link('https://test-shop.myshopify.com/admin/api/2024-01/graphql.json').query(
    'GetCustomers',
    () => {
      return HttpResponse.json({
        data: {
          customers: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/Customer/1',
                  email: 'test@example.com',
                  displayName: 'Test Customer',
                  metafields: {
                    edges: [],
                  },
                },
              },
            ],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        }
      });
    }
  ),

  // REST API endpoints
  http.get(`${SHOPIFY_ADMIN_API}/customers/:id.json`, ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      customer: {
        id: Number(id),
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'Customer',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    });
  }),

  http.get(`${SHOPIFY_ADMIN_API}/orders/:id.json`, ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      order: {
        id: Number(id),
        email: 'test@example.com',
        created_at: '2024-01-01T00:00:00Z',
        total_price: '100.00',
        currency: 'USD',
        financial_status: 'paid',
        customer: {
          id: 1,
          email: 'test@example.com',
        },
      },
    });
  }),

  // Webhook verification endpoint (mock)
  http.post('/webhooks/*', ({ request }) => {
    // Check for HMAC header
    const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
    if (!hmacHeader) {
      return HttpResponse.json(
        { error: 'Missing HMAC header' },
        { status: 401 }
      );
    }

    // Return success for valid webhook
    return HttpResponse.json({ success: true }, { status: 200 });
  }),
];

// AWS Data API handlers
export const awsHandlers = [
  http.post(AWS_RDS_DATA_API, async ({ request }) => {
    const body = await request.json();
    const target = request.headers.get('X-Amz-Target');

    // ExecuteStatement command
    if (target === 'RdsDataService.ExecuteStatement') {
      const { sql } = body;

      // Mock responses based on SQL patterns
      if (sql?.includes('SELECT')) {
        // Mock SELECT response
        return HttpResponse.json({
          numberOfRecordsUpdated: 0,
          records: [
            [
              { stringValue: 'test-id' },
              { stringValue: 'test-shop.myshopify.com' },
              { stringValue: 'test@example.com' },
            ],
          ],
          columnMetadata: [
            { name: 'id', typeName: 'varchar' },
            { name: 'shop', typeName: 'varchar' },
            { name: 'email', typeName: 'varchar' },
          ],
        });
      }

      if (sql?.includes('INSERT')) {
        // Mock INSERT response
        return HttpResponse.json({
          numberOfRecordsUpdated: 1,
          generatedFields: [{ stringValue: 'generated-id' }],
        });
      }

      if (sql?.includes('UPDATE')) {
        // Mock UPDATE response
        return HttpResponse.json({
          numberOfRecordsUpdated: 1,
        });
      }

      if (sql?.includes('DELETE')) {
        // Mock DELETE response
        return HttpResponse.json({
          numberOfRecordsUpdated: 1,
        });
      }
    }

    // BeginTransaction command
    if (target === 'RdsDataService.BeginTransaction') {
      return HttpResponse.json({
        transactionId: 'test-transaction-id-123',
      });
    }

    // CommitTransaction command
    if (target === 'RdsDataService.CommitTransaction') {
      return HttpResponse.json({
        transactionStatus: 'Transaction Committed',
      });
    }

    // RollbackTransaction command
    if (target === 'RdsDataService.RollbackTransaction') {
      return HttpResponse.json({
        transactionStatus: 'Rollback Complete',
      });
    }

    // Default response
    return HttpResponse.json({}, { status: 200 });
  }),
];

// Exchange Rate API handlers
export const exchangeRateHandlers = [
  http.get('https://v6.exchangerate-api.com/v6/*/latest/:base', ({ params }) => {
    const { base } = params;

    // Mock exchange rates
    const rates: Record<string, number> = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.73,
      JPY: 110.0,
      CAD: 1.25,
      AUD: 1.35,
    };

    // If base is not USD, adjust rates
    if (base !== 'USD' && typeof base === 'string' && base in rates) {
      const baseRate = rates[base as keyof typeof rates];
      Object.keys(rates).forEach(currency => {
        rates[currency] = rates[currency] / baseRate;
      });
    }

    return HttpResponse.json({
      result: 'success',
      base_code: base,
      conversion_rates: rates,
      time_last_update_utc: new Date().toISOString(),
    });
  }),
];

// Combine all handlers
export const handlers = [
  ...shopifyHandlers,
  ...awsHandlers,
  ...exchangeRateHandlers,
];