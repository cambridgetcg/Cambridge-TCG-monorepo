# Comprehensive Technical Guide to Shopify GraphQL API

## GraphQL Supersedes REST as Shopify's Definitive API

As of September 2025, Shopify has made GraphQL its primary API standard, marking REST Admin API as legacy. **All new public apps submitted after April 1, 2025, must use GraphQL exclusively**. The latest stable version is 2025-07, offering complete feature parity with REST plus significant enhancements including support for 2048 product variants (versus 100 in REST) and cost-based rate limiting that provides better performance at scale.

## 1. GraphQL Operation Types and Examples

### Queries - Data Fetching Operations

Shopify GraphQL queries use a **cost-based system** where each field has a point value. Standard queries retrieve data without modification:

```graphql
query GetProductsWithFullDetails($first: Int!, $query: String) {
  products(first: $first, query: $query) {
    edges {
      node {
        id
        title
        handle
        descriptionHtml
        status
        vendor
        productType
        seo {
          title
          description
        }
        featuredImage {
          url
          altText
        }
        metafields(first: 10) {
          edges {
            node {
              namespace
              key
              value
              type
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              id
              price
              compareAtPrice
              sku
              inventoryQuantity
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Mutations - Data Modification Operations

Mutations modify store data and always return both the modified object and potential user errors:

```graphql
mutation CreateProductWithVariants($productSet: ProductSetInput!, $synchronous: Boolean!) {
  productSet(synchronous: $synchronous, input: $productSet) {
    product {
      id
      title
      handle
      options {
        name
        position
        optionValues {
          name
          hasVariants
        }
      }
      variants(first: 20) {
        nodes {
          id
          title
          price
          selectedOptions {
            name
            optionValue {
              name
            }
          }
        }
      }
    }
    userErrors {
      code
      field
      message
    }
  }
}
```

**Variables for product creation:**
```json
{
  "synchronous": true,
  "productSet": {
    "title": "Premium Water Bottle",
    "descriptionHtml": "<p>Double-wall insulated stainless steel</p>",
    "productType": "Drinkware",
    "vendor": "EcoBottle Co",
    "productOptions": [
      {
        "name": "Size",
        "values": [{"name": "16oz"}, {"name": "20oz"}, {"name": "32oz"}]
      },
      {
        "name": "Color",
        "values": [{"name": "Forest Green"}, {"name": "Ocean Blue"}]
      }
    ],
    "variants": [
      {
        "optionValues": [
          {"optionName": "Size", "name": "16oz"},
          {"optionName": "Color", "name": "Forest Green"}
        ],
        "price": 24.99,
        "sku": "ECO-16-GREEN",
        "inventoryQuantities": [
          {
            "locationId": "gid://shopify/Location/123456",
            "name": "available",
            "quantity": 100
          }
        ]
      }
    ]
  }
}
```

### Subscriptions - Webhook-Based Events

Shopify doesn't support traditional GraphQL subscriptions but uses webhook subscriptions for real-time updates:

```graphql
mutation CreateWebhookSubscription($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription {
      id
      topic
      endpoint {
        ... on WebhookHttpEndpoint {
          callbackUrl
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

## 2. Access Scopes and Permissions

### Comprehensive Scope Mapping

Access scopes define API permissions granularly. **Protected customer data requires additional approval** and compliance with GDPR requirements:

| Resource Type | Read Scope | Write Scope | Special Requirements |
|--------------|------------|-------------|---------------------|
| **Products** | `read_products` | `write_products` | None |
| **Orders** | `read_orders` (60 days) | `write_orders` | `read_all_orders` requires approval |
| **Customers** | `read_customers` | `write_customers` | Protected data approval for PII |
| **Inventory** | `read_inventory` | `write_inventory` | `read_locations` for location data |
| **Discounts** | `read_discounts` | `write_discounts` | None |
| **Fulfillments** | `read_fulfillments` | `write_fulfillments` | Multiple specialized scopes available |

### Scope Configuration in Apps

**Required vs Optional Scopes (API 2024-10+):**
```toml
[access_scopes]
scopes = "read_products,write_products,read_orders"
optional_scopes = ["write_orders", "read_customers", "read_analytics"]
```

Apps can request optional scopes dynamically after installation using App Bridge API. The new `app/scopes_update` webhook notifies apps of scope changes.

## 3. Exact API Call Format

### Required Headers and Authentication

**Admin API Headers:**
```http
POST /admin/api/2025-07/graphql.json HTTP/1.1
Host: your-store.myshopify.com
Content-Type: application/json
X-Shopify-Access-Token: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Node.js Implementation:**
```javascript
import { shopifyApi } from "@shopify/shopify-api";
import { authenticate } from "../shopify.server.js";

const { admin } = await authenticate.admin(request);
const response = await admin.graphql(`
  #graphql
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          variants(first: 5) {
            edges {
              node {
                price
                inventoryQuantity
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`, {
  variables: { first: 25 }
});
```

### Response Structure

**Successful responses** always return HTTP 200 with data and optional extensions:

```json
{
  "data": {
    "products": {
      "edges": [
        {
          "node": {
            "id": "gid://shopify/Product/123456789",
            "title": "Example Product"
          }
        }
      ],
      "pageInfo": {
        "hasNextPage": true,
        "endCursor": "eyJsYXN0X2lkIjoxMjM0NTY3ODk..."
      }
    }
  },
  "extensions": {
    "cost": {
      "requestedQueryCost": 15,
      "actualQueryCost": 12,
      "throttleStatus": {
        "maximumAvailable": 1000,
        "currentlyAvailable": 988,
        "restoreRate": 50
      }
    }
  }
}
```

**Error responses** include detailed error information while maintaining HTTP 200:

```json
{
  "data": {
    "productCreate": {
      "product": null,
      "userErrors": [
        {
          "field": ["input", "title"],
          "message": "Title can't be blank"
        }
      ]
    }
  }
}
```

## 4. Response Formats and Data Structures

### Pagination with PageInfo

All connection types use **cursor-based pagination** with consistent PageInfo structure:

```graphql
type PageInfo {
  startCursor: String
  endCursor: String
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}
```

**Implementation example:**
```javascript
async function getAllProducts() {
  let allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await admin.graphql(query, {
      variables: {
        first: 250, // Maximum per request
        after: cursor
      }
    });

    const data = await response.json();
    const products = data.data.products;
    
    allProducts.push(...products.edges.map(edge => edge.node));
    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  return allProducts;
}
```

## 5. React Apollo Client Implementation

### Production-Ready Apollo Setup

```typescript
import { ApolloClient, InMemoryCache, from, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { authenticatedFetch } from '@shopify/app-bridge-utils';

export function createApolloClient({ app, shopDomain }) {
  const httpLink = createHttpLink({
    uri: `/admin/api/2025-07/graphql.json`,
    fetch: authenticatedFetch(app),
    credentials: 'include',
  });

  const authLink = setContext((_, { headers }) => ({
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }));

  const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
    if (graphQLErrors) {
      graphQLErrors.forEach(({ message, extensions }) => {
        if (extensions?.code === 'THROTTLED') {
          console.warn('Rate limit exceeded, implementing backoff');
        }
      });
    }

    if (networkError?.statusCode === 401) {
      window.location.reload(); // Trigger session refresh
    }
  });

  const retryLink = new RetryLink({
    delay: {
      initial: 300,
      max: Infinity,
      jitter: true
    },
    attempts: {
      max: 3,
      retryIf: (error) => !!error && !error.message.includes('Access denied')
    }
  });

  const cache = new InMemoryCache({
    typePolicies: {
      Product: {
        fields: {
          variants: {
            merge(existing = { edges: [] }, incoming) {
              return {
                ...incoming,
                edges: [...existing.edges, ...incoming.edges]
              };
            }
          }
        }
      },
      Query: {
        fields: {
          products: {
            keyArgs: ['query', 'sortKey'],
            merge(existing, incoming, { args }) {
              if (args?.after) {
                return {
                  ...incoming,
                  edges: [...(existing?.edges || []), ...incoming.edges]
                };
              }
              return incoming;
            }
          }
        }
      }
    }
  });

  return new ApolloClient({
    link: from([retryLink, errorLink, authLink, httpLink]),
    cache,
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all'
      }
    }
  });
}
```

### Pagination Hook with Infinite Scroll

```typescript
export function usePagination({ query, variables = {}, pageSize = 50, getConnection }) {
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data, loading, error, fetchMore } = useQuery(query, {
    variables: { ...variables, first: pageSize },
    notifyOnNetworkStatusChange: true
  });

  const connection = data ? getConnection(data) : null;
  const items = connection?.edges?.map(edge => edge.node) || [];
  const pageInfo = connection?.pageInfo;

  const loadMore = useCallback(async () => {
    if (!pageInfo?.hasNextPage || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      await fetchMore({
        variables: {
          ...variables,
          first: pageSize,
          after: pageInfo.endCursor
        }
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [pageInfo, isLoadingMore, fetchMore, variables, pageSize]);

  return { items, loading, hasMore, isLoadingMore, loadMore };
}
```

### Optimistic Updates Pattern

```typescript
const [updateProduct] = useMutation(UPDATE_PRODUCT, {
  update: (cache, { data }) => {
    if (data?.productUpdate?.product) {
      cache.writeFragment({
        id: cache.identify(data.productUpdate.product),
        fragment: PRODUCT_FRAGMENT,
        data: data.productUpdate.product
      });
    }
  },
  optimisticResponse: {
    productUpdate: {
      product: {
        __typename: 'Product',
        id: productId,
        ...updates
      },
      userErrors: []
    }
  }
});
```

## 6. Current API Versions and Changes

### Version Timeline

- **2025-07**: Current stable version (July 2025)
- **2025-10**: Release candidate available for testing
- **Support Duration**: Minimum 12 months per version
- **Migration Overlap**: 9-month minimum between versions

### Major 2024-2025 Updates

**GraphQL Mandate Changes:**
- REST Admin API marked legacy (October 1, 2024)
- New public apps must use GraphQL (April 1, 2025)
- Product API supports 2048 variants (vs 100 in REST)
- Rate limits doubled across all plans
- Connection query costs reduced by 75%

## 7. Production Code Examples

### Fetching Products with Variants

```javascript
const GET_PRODUCTS = gql`
  query GetProducts($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          totalInventory
          variants(first: 50) {
            edges {
              node {
                id
                price
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
```

### Creating Orders Programmatically

```graphql
mutation CreateDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id
      name
      invoiceUrl
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### Inventory Management

```graphql
mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    inventoryAdjustmentGroup {
      id
      changes {
        name
        delta
        quantityAfterChange
        item {
          sku
        }
        location {
          name
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

## 8. Webhook Integration

### Creating Webhook Subscriptions

```javascript
export const action = async ({ request }) => {
  const { payload, topic, admin } = await authenticate.webhook(request);
  
  switch (topic) {
    case "ORDERS_CREATE":
      await handleOrderCreated(payload, admin);
      break;
    case "BULK_OPERATIONS_FINISH":
      await handleBulkOperationComplete(payload, admin);
      break;
  }
  
  return new Response("OK", { status: 200 });
};
```

### HMAC Verification

```javascript
function verifyWebhook(body, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  const hash = hmac.digest('base64');
  return hash === signature;
}
```

## 9. Store Credit Management via Gift Cards

### Introduction

Shopify doesn't have built-in "store credit" per customer. The standard approach is using gift cards as store credit. This section covers reading balances, creating credit, and managing adjustments via the Admin GraphQL API.

### Reading Store Credit Balance

#### Query Gift Card by ID
```graphql
query GetGiftCardBalance($id: ID!) {
  giftCard(id: $id) {
    id
    balance {
      amount
      currencyCode
    }
    initialValue {
      amount
    }
    expiresOn
    customer {
      id
      email
    }
  }
}
```

#### Search by Code
```graphql
query FindGiftCardByCode($code: String!) {
  giftCards(first: 1, query: $code) {
    nodes {
      id
      balance { 
        amount 
        currencyCode 
      }
      displayCode  # Masked version for security
    }
  }
}
```

### Creating Store Credit (Issuing Gift Cards)

```graphql
mutation CreateStoreCredit($input: GiftCardCreateInput!) {
  giftCardCreate(input: $input) {
    giftCard {
      id
      balance {
        amount
        currencyCode
      }
      initialValue {
        amount
      }
      customer {
        id
      }
    }
    giftCardCode  # Actual code - treat as sensitive!
    userErrors {
      field
      message
    }
  }
}

# Variables:
{
  "input": {
    "initialValue": "100.00",
    "customerId": "gid://shopify/Customer/331283560",
    "note": "Loyalty reward credit"
  }
}
```

### Updating Store Credit Balance

#### Adding Credit
```graphql
mutation CreditStoreCredit($id: ID!, $creditInput: GiftCardCreditInput!) {
  giftCardCredit(id: $id, creditInput: $creditInput) {
    giftCardCreditTransaction {
      id
      amount {
        amount
        currencyCode
      }
      processedAt
      note
      giftCard {
        id
        balance {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      message
      field
      code
    }
  }
}

# Variables:
{
  "id": "gid://shopify/GiftCard/1063936323",
  "creditInput": {
    "creditAmount": { 
      "amount": "10.00", 
      "currencyCode": "USD" 
    },
    "note": "Customer service credit adjustment",
    "processedAt": "2025-09-08T15:00:00Z"
  }
}
```

#### Deducting Credit
```graphql
mutation DebitStoreCredit($id: ID!, $debitInput: GiftCardDebitInput!) {
  giftCardDebit(id: $id, debitInput: $debitInput) {
    giftCardDebitTransaction {
      id
      amount {
        amount
        currencyCode
      }
      processedAt
      note
      giftCard {
        id
        balance {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      message
      field
      code
    }
  }
}
```

### Store Credit Accounts (Shopify Plus - Preview)

For Shopify Plus stores with the new Store Credit Accounts feature:

```graphql
# Query store credit account
query GetStoreCreditAccount($customerId: ID!) {
  customer(id: $customerId) {
    storeCreditAccount {
      id
      balance {
        amount
        currencyCode
      }
    }
  }
}

# Credit store credit account
mutation CreditStoreCreditAccount($accountId: ID!, $creditInput: StoreCreditAccountCreditInput!) {
  storeCreditAccountCredit(id: $accountId, creditInput: $creditInput) {
    storeCreditAccountTransaction {
      id
      amount {
        amount
        currencyCode
      }
      account {
        balance {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### TypeScript Implementation

```typescript
// app/utils/store-credit.ts
import { authenticate } from "~/shopify.server";

export class StoreCreditManager {
  private shop: string;
  private accessToken: string;

  constructor(shop: string, accessToken: string) {
    this.shop = shop;
    this.accessToken = accessToken;
  }

  async getBalance(giftCardId: string): Promise<StoreCreditBalance> {
    const query = `
      query GetGiftCardBalance($id: ID!) {
        giftCard(id: $id) {
          id
          balance {
            amount
            currencyCode
          }
        }
      }
    `;

    const response = await this.graphqlRequest(query, { id: giftCardId });
    return response.data.giftCard.balance;
  }

  async createStoreCredit(customerId: string, amount: string, note?: string): Promise<GiftCard> {
    const mutation = `
      mutation CreateStoreCredit($input: GiftCardCreateInput!) {
        giftCardCreate(input: $input) {
          giftCard {
            id
            balance { amount currencyCode }
            initialValue { amount }
          }
          giftCardCode
          userErrors { field message }
        }
      }
    `;

    const variables = {
      input: {
        initialValue: amount,
        customerId,
        note: note || "Store credit issued"
      }
    };

    const response = await this.graphqlRequest(mutation, variables);
    
    if (response.data.giftCardCreate.userErrors?.length > 0) {
      throw new Error(response.data.giftCardCreate.userErrors[0].message);
    }

    // Store the gift card ID and code securely
    const giftCard = response.data.giftCardCreate.giftCard;
    const code = response.data.giftCardCreate.giftCardCode;
    
    // Save to database (encrypted)
    await this.saveGiftCardToDatabase(customerId, giftCard.id, code);
    
    return giftCard;
  }

  async addCredit(giftCardId: string, amount: string, note: string): Promise<void> {
    const mutation = `
      mutation CreditStoreCredit($id: ID!, $creditInput: GiftCardCreditInput!) {
        giftCardCredit(id: $id, creditInput: $creditInput) {
          giftCardCreditTransaction {
            id
            giftCard {
              balance { amount currencyCode }
            }
          }
          userErrors { message field }
        }
      }
    `;

    const variables = {
      id: giftCardId,
      creditInput: {
        creditAmount: { 
          amount, 
          currencyCode: "USD" 
        },
        note
      }
    };

    const response = await this.graphqlRequest(mutation, variables);
    
    if (response.data.giftCardCredit.userErrors?.length > 0) {
      throw new Error(response.data.giftCardCredit.userErrors[0].message);
    }
  }

  private async graphqlRequest(query: string, variables: any) {
    const response = await fetch(
      `https://${this.shop}/admin/api/2025-07/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.accessToken
        },
        body: JSON.stringify({ query, variables })
      }
    );

    return response.json();
  }

  private async saveGiftCardToDatabase(customerId: string, giftCardId: string, code: string) {
    // Encrypt the code before storing
    const encryptedCode = await encryptSensitiveData(code);
    
    await db.storeCredit.upsert({
      where: { customerId },
      update: { 
        giftCardId,
        encryptedCode,
        updatedAt: new Date()
      },
      create: {
        customerId,
        giftCardId,
        encryptedCode,
        createdAt: new Date()
      }
    });
  }
}
```

### Security Best Practices for Store Credit

1. **Never expose gift card codes client-side** - Treat codes like passwords
2. **Store only gift card IDs** - Query by ID, not code
3. **Encrypt sensitive data** - If storing codes, encrypt them
4. **Use server-side calls only** - Never expose admin tokens to frontend
5. **Validate all inputs** - Check amounts are positive and within limits
6. **Use notes for audit trail** - Document all adjustments
7. **One card per customer** - Simplifies management
8. **Mask codes in UI** - Show only last 4 digits when displaying

### Required OAuth Scopes

- `read_gift_cards` - Read gift card information
- `write_gift_cards` - Create and update gift cards  
- `write_gift_card_transactions` - Adjust balances (credit/debit)
- `read_customers` - Optional, for customer lookups

### Testing Store Credit Implementation

```typescript
// tests/store-credit.test.ts
describe('Store Credit Management', () => {
  const testShop = 'test-shop.myshopify.com';
  const testToken = 'test-access-token';
  
  beforeEach(() => {
    // Enable gift cards on dev store
    // Install app with proper scopes
  });

  it('should create store credit for customer', async () => {
    const manager = new StoreCreditManager(testShop, testToken);
    const credit = await manager.createStoreCredit(
      'gid://shopify/Customer/123',
      '100.00',
      'Welcome bonus'
    );
    
    expect(credit.balance.amount).toBe('100.00');
    expect(credit.customer.id).toBe('gid://shopify/Customer/123');
  });

  it('should handle insufficient balance gracefully', async () => {
    const manager = new StoreCreditManager(testShop, testToken);
    
    // Try to debit more than available
    await expect(
      manager.deductCredit(giftCardId, '500.00', 'Test debit')
    ).rejects.toThrow('Insufficient balance');
  });

  it('should track adjustment history', async () => {
    const history = await manager.getTransactionHistory(giftCardId);
    expect(history).toContainEqual(
      expect.objectContaining({
        type: 'CREDIT',
        amount: '10.00',
        note: 'Customer service credit'
      })
    );
  });

  it('should handle expiration correctly', async () => {
    const expiredCard = await manager.getBalance('expired-card-id');
    expect(expiredCard.status).toBe('EXPIRED');
    
    // Attempting to use expired card should fail
    await expect(
      manager.addCredit('expired-card-id', '10.00', 'Test')
    ).rejects.toThrow('Gift card is expired');
  });
});
```

### Common Edge Cases and Solutions

1. **Multiple Currencies**: Always specify currencyCode in mutations
2. **Expired Cards**: Check expiresOn field before operations
3. **Disabled Cards**: Handle status field in queries
4. **Overdraft Prevention**: API prevents negative balances automatically
5. **Duplicate Codes**: Shopify ensures unique codes per shop
6. **Transaction Limits**: Consider implementing daily/monthly limits

### Development Store Testing Checklist

- [ ] Enable gift cards feature in dev store
- [ ] Install app with required scopes
- [ ] Create test gift card via GraphiQL
- [ ] Verify balance queries work
- [ ] Test credit operations
- [ ] Test debit operations  
- [ ] Verify checkout integration
- [ ] Test edge cases (expiry, disable)
- [ ] Validate frontend integration
- [ ] Clean up test data

## 10. Rate Limiting and Performance

### Cost-Based Rate Limits

**Current limits by plan (2025):**
- **Standard**: 50 points/second, 1,000 point bucket
- **Advanced**: 100 points/second, 2,000 point bucket
- **Shopify Plus**: 500 points/second, 10,000 point bucket
- **Maximum query cost**: 1,000 points regardless of plan

### Exponential Backoff Implementation

```typescript
class GraphQLClient {
  async queryWithRetry(query: string, variables?: any, retryCount = 0): Promise<any> {
    try {
      const response = await this.executeQuery(query, variables);
      
      if (response.extensions?.cost?.throttleStatus?.currentlyAvailable < 100) {
        console.warn('Approaching rate limit');
        await this.delay(2000);
      }
      
      return response;
    } catch (error) {
      if (this.isRateLimitError(error) && retryCount < 3) {
        const delay = 1000 * Math.pow(2, retryCount) + Math.random() * 1000;
        await this.delay(delay);
        return this.queryWithRetry(query, variables, retryCount + 1);
      }
      throw error;
    }
  }
}
```

### Bulk Operations for Large Datasets

```graphql
mutation RunBulkQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
```

**Bulk operations** are ideal when querying >1000 records or when single query cost would exceed limits. Results are delivered as JSONL files via webhook notification.

## 11. Testing Strategies

### Unit Testing with Mock Provider

```typescript
import { MockedProvider } from '@apollo/client/testing';

const mocks = [
  {
    request: {
      query: GET_PRODUCTS,
      variables: { first: 10 }
    },
    result: {
      data: {
        products: {
          edges: [
            {
              node: {
                id: '1',
                title: 'Test Product',
                handle: 'test-product'
              }
            }
          ]
        }
      }
    }
  }
];

test('renders product list', async () => {
  render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <ProductList />
    </MockedProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });
});
```

### Integration Testing Pattern

```typescript
describe('Product queries', () => {
  it('fetches product data', async () => {
    const graphQL = createGraphQL({
      GetProduct: {
        product: {
          id: 'gid://shopify/Product/1',
          title: 'Test Product',
          variants: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/ProductVariant/1',
                  price: '19.99'
                }
              }
            ]
          }
        }
      }
    });

    const result = await graphQL.query({
      query: GET_PRODUCT_QUERY,
      variables: { id: 'gid://shopify/Product/1' }
    });

    expect(result.data.product.title).toBe('Test Product');
  });
});
```

### Performance Testing

```javascript
export default function() {
  const query = `
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            variants(first: 10) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = http.post('https://your-store.myshopify.com/admin/api/2025-07/graphql.json', 
    JSON.stringify({ query }), 
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': __ENV.ACCESS_TOKEN,
      },
    }
  );

  check(response, {
    'status is 200': (r) => r.status === 200,
    'no GraphQL errors': (r) => !JSON.parse(r.body).errors,
    'within cost limits': (r) => {
      const extensions = JSON.parse(r.body).extensions;
      return extensions?.cost?.actualQueryCost < 500;
    },
  });
}
```

## 12. RewardsPro Implementation Examples

### Customer Store Credit Query

```graphql
query GetCustomerStoreCredit($customerId: ID!) {
  customer(id: $customerId) {
    id
    email
    displayName
    metafields(namespace: "rewards_pro", first: 10) {
      edges {
        node {
          id
          key
          value
          type
          updatedAt
        }
      }
    }
    orders(first: 10, reverse: true) {
      edges {
        node {
          id
          name
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          createdAt
        }
      }
    }
  }
}
```

### Update Customer Store Credit

```graphql
mutation UpdateCustomerStoreCredit($input: CustomerInput!) {
  customerUpdate(input: $input) {
    customer {
      id
      metafields(namespace: "rewards_pro", first: 10) {
        edges {
          node {
            key
            value
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
```

**Variables:**
```json
{
  "input": {
    "id": "gid://shopify/Customer/123456789",
    "metafields": [
      {
        "namespace": "rewards_pro",
        "key": "store_credit",
        "value": "150.00",
        "type": "number_decimal"
      },
      {
        "namespace": "rewards_pro",
        "key": "tier_name",
        "value": "Gold",
        "type": "single_line_text_field"
      }
    ]
  }
}
```

### Order Webhook for Cashback Processing

```typescript
// app/routes/webhooks.orders.paid.tsx
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, payload, shop } = await authenticate.webhook(request);
  
  // Calculate cashback based on customer tier
  const customerId = payload.customer?.id?.replace('gid://shopify/Customer/', '');
  
  if (customerId) {
    const customer = await db.customer.findUnique({
      where: { 
        shop_shopifyCustomerId: {
          shop,
          shopifyCustomerId: customerId
        }
      },
      include: { 
        currentTier: true 
      }
    });
    
    if (customer && customer.currentTier) {
      const orderAmount = parseFloat(payload.total_price);
      const cashbackAmount = orderAmount * (customer.currentTier.cashbackPercent / 100);
      
      // Create cashback transaction
      await db.cashbackTransaction.create({
        data: {
          customerId: customer.id,
          orderId: payload.id,
          shopifyOrderId: payload.order_number.toString(),
          orderAmount,
          cashbackAmount,
          cashbackPercent: customer.currentTier.cashbackPercent,
          shop,
          status: 'PENDING'
        }
      });
      
      // Update store credit in Shopify
      const newCredit = customer.storeCredit + cashbackAmount;
      
      await admin.graphql(`
        mutation UpdateCredit($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer { id }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            id: `gid://shopify/Customer/${customerId}`,
            metafields: [{
              namespace: "rewards_pro",
              key: "store_credit",
              value: newCredit.toString(),
              type: "number_decimal"
            }]
          }
        }
      });
    }
  }
  
  return json({ success: true });
}
```

## Best Practices Summary

### Performance Optimization
- Request only needed fields
- Use fragments for reusability
- Implement cursor-based pagination with appropriate batch sizes (max 250)
- Leverage bulk operations for datasets exceeding 1000 records
- Monitor query costs in response extensions

### Error Handling
- Always check userErrors in mutation responses
- Implement exponential backoff for rate limiting
- Use error boundaries in React components
- Provide user-friendly error messages through toast notifications

### Security Considerations
- Verify webhook signatures with HMAC-SHA256
- Use HTTPS endpoints exclusively
- Implement idempotency keys to prevent duplicate processing
- Follow GDPR requirements for protected customer data access
- Store access tokens securely and rotate them regularly

### Testing Strategy
- Unit tests with mocked providers
- Integration tests with actual API calls in development stores
- Performance tests monitoring query costs and response times
- CI/CD pipeline integration with automated GraphQL schema validation

## Migration from REST to GraphQL

### Key Differences
- **Pagination**: Cursor-based instead of page-based
- **Rate Limiting**: Cost-based instead of call-based
- **Response Format**: Nested structure with explicit error handling
- **Field Selection**: Request only what you need
- **Bulk Operations**: Native support for large dataset operations

### Migration Checklist
- [ ] Update API version to 2025-07 or later
- [ ] Replace REST endpoints with GraphQL queries
- [ ] Implement cursor-based pagination
- [ ] Add cost monitoring to prevent rate limiting
- [ ] Update error handling for userErrors pattern
- [ ] Test with production-scale data volumes
- [ ] Implement webhook subscriptions via GraphQL

This comprehensive guide provides production-ready patterns for building robust Shopify apps using GraphQL. The transition from REST to GraphQL is mandatory for new apps, but offers significant advantages including better performance, more flexible querying, and improved developer experience through strong typing and introspection capabilities.