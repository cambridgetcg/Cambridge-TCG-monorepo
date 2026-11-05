/**
 * Every Admin API GraphQL document the app sends, under a unique name
 * starting with `Rewards`. Each one is checked against the 2026-10 schema
 * before it is committed; the comment above it gives the access scopes it
 * needs and its hand-computed query cost (Shopify's single-query limit is
 * 1,000 points).
 */

/**
 * The slice of the Admin API client the Shopify adapter uses. The library's
 * `admin` (authenticate.admin, unauthenticated.admin, afterAuth) fits it, and
 * so does a test double.
 */
export interface GraphqlClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown>; signal?: AbortSignal },
  ): Promise<{ json(): Promise<unknown> }>;
}

/**
 * The shop's name, currency and time zone, read on every app open.
 * Scopes: none (any installed app can read `shop`).
 * Cost: 1 (the shop object; its scalar fields cost nothing).
 */
export const RewardsShopDetails = `#graphql
  query RewardsShopDetails {
    shop {
      name
      currencyCode
      ianaTimezone
    }
  }
`;

/**
 * The cheapest call there is, sent by nightly housekeeping through
 * unauthenticated.admin for a store whose refresh token runs out within 14
 * days, so the library refreshes its expiring token (plan Decision 12) and
 * the new one is proven to work.
 * Scopes: none (any installed app can read `shop`).
 * Cost: 1 (the shop object; its id costs nothing).
 */
export const RewardsTokenPing = `#graphql
  query RewardsTokenPing {
    shop {
      id
    }
  }
`;

/**
 * Adds store credit to the buyer's account in one currency, creating the
 * account if the buyer has none in it. The selection set is the old app's,
 * proven in production.
 * Scopes: write_store_credit_account_transactions (which includes
 * read_store_credit_account_transactions).
 * Cost: 10 for the mutation, plus at most 4 for the objects it returns
 * (the transaction, its two MoneyV2 and the userErrors): 14 at most.
 */
export const RewardsCredit = `#graphql
  mutation RewardsCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
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
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

/**
 * Takes store credit back from the buyer's account in one currency.
 * Scopes: write_store_credit_account_transactions (which includes
 * read_store_credit_account_transactions).
 * Cost: 14 at most, as RewardsCredit.
 */
export const RewardsDebit = `#graphql
  mutation RewardsDebit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
    storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
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
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

/**
 * The buyer's balance in each store credit account (one per currency).
 * Scopes: read_customers, read_store_credit_accounts.
 * Cost: 24 = customer 1 + storeCreditAccounts (connection 2, pageInfo 1,
 * 10 × (account 1 + balance 1)).
 */
export const RewardsBalance = `#graphql
  query RewardsBalance($customerId: ID!) {
    customer(id: $customerId) {
      storeCreditAccounts(first: 10) {
        nodes {
          balance {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  }
`;

/**
 * The buyer's newest credits in each store credit account, for the hourly
 * check of unconfirmed payouts (rule 9). Pages of 25: the old app's 50, with
 * each account's balance and each credit's balance after, cost about 1,550.
 * Scopes: read_customers, read_store_credit_accounts,
 * read_store_credit_account_transactions.
 * Cost: 544 = customer 1 + storeCreditAccounts (connection 2, pageInfo 1,
 * 10 × (account 1 + transactions (connection 2, pageInfo 1,
 * 25 × (transaction 1 + amount 1)))).
 */
export const RewardsCreditHistory = `#graphql
  query RewardsCreditHistory($customerId: ID!) {
    customer(id: $customerId) {
      storeCreditAccounts(first: 10) {
        pageInfo {
          hasNextPage
        }
        nodes {
          transactions(first: 25, reverse: true, query: "type:credit") {
            pageInfo {
              hasNextPage
            }
            nodes {
              __typename
              amount {
                amount
                currencyCode
              }
              createdAt
              ... on StoreCreditAccountCreditTransaction {
                id
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * One order's facts (spec 6.3 rule 1): its lines with their discounts and
 * their quantities before and after edits and refunds (Ruling 25), its tips
 * (Ruling 26), its tenders (with when each was processed: the latest
 * successful sale or capture is when the order became paid, Ruling 43), its
 * refunds' ids, whether its prices include tax
 * (for the shipping a money-only refund returned, rule 7) and the shop's
 * currency. Line items come 100 to a page; `$after` reads the next. Kept apart from the refunds so each read
 * stays under the 1,000-point limit (one query with everything is refused
 * with MAX_COST_EXCEEDED).
 * Scopes: read_orders, read_customers; read_all_orders for orders older than
 * 60 days. The validator also names read_marketplace_orders and read_quick_sale: those
 * are alternatives to read_orders (returning only orders attributed to the
 * app), not further requirements.
 * Cost: 912 = shop 1 + order 1 + customer 1 + totalPriceSet 3
 * + totalTipReceivedSet 3 + lineItems
 * (connection 2, pageInfo 1, 100 × (line 1 + originalTotalSet 3 + one
 * discount allocation 4)) + transactions 20 × (transaction 1 + amountSet 3)
 * + refunds 20 × 1 (taxesIncluded, processedAt and the other scalars cost
 * nothing).
 */
export const RewardsOrderFacts = `#graphql
  query RewardsOrderFacts($id: ID!, $after: String) {
    shop {
      currencyCode
    }
    order(id: $id) {
      id
      name
      test
      createdAt
      processedAt
      cancelledAt
      displayFinancialStatus
      currencyCode
      presentmentCurrencyCode
      taxesIncluded
      customer {
        id
      }
      totalPriceSet {
        shopMoney {
          amount
        }
        presentmentMoney {
          amount
        }
      }
      totalTipReceivedSet {
        shopMoney {
          amount
        }
        presentmentMoney {
          amount
        }
      }
      lineItems(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          quantity
          currentQuantity
          isGiftCard
          originalTotalSet {
            shopMoney {
              amount
              currencyCode
            }
            presentmentMoney {
              amount
              currencyCode
            }
          }
          discountAllocations {
            allocatedAmountSet {
              shopMoney {
                amount
              }
              presentmentMoney {
                amount
              }
            }
          }
        }
      }
      transactions(first: 20) {
        gateway
        status
        kind
        processedAt
        amountSet {
          shopMoney {
            amount
          }
          presentmentMoney {
            amount
          }
        }
      }
      refunds(first: 20) {
        id
      }
    }
  }
`;

/**
 * Every tender of one order, read when RewardsOrderFacts's 20 came back full
 * (refunds and failed attempts are on the list too). `transactions` is a plain
 * list with no paging, so this is the most one read can see.
 * Scopes: read_orders. The validator also names read_marketplace_orders and read_quick_sale: those
 * are alternatives to read_orders (returning only orders attributed to the
 * app), not further requirements.
 * Cost: 801 = order 1 + transactions 200 × (transaction 1 + amountSet 3).
 */
export const RewardsOrderTransactionsCost = 801;
export const RewardsOrderTransactions = `#graphql
  query RewardsOrderTransactions($id: ID!) {
    order(id: $id) {
      transactions(first: 200) {
        gateway
        status
        kind
        processedAt
        amountSet {
          shopMoney {
            amount
          }
          presentmentMoney {
            amount
          }
        }
      }
    }
  }
`;

/**
 * One refund: the lines and quantities it returned, its money and the
 * shipping it refunded, before and after tax (rule 7).
 * Scopes: read_orders. The validator also names read_marketplace_orders and read_quick_sale: those
 * are alternatives to read_orders (returning only orders attributed to the
 * app), not further requirements.
 * Cost: 429 = refund 1 + order 1 + refundLineItems (connection 2, pageInfo 1,
 * 100 × (refund line 1 + line 1)) + transactions (connection 2, 20 ×
 * (transaction 1 + amountSet 3)) + refundShippingLines (connection 2, 20 ×
 * (shipping line 1 + subtotalAmountSet 3 + taxAmountSet 3)).
 */
export const RewardsRefundFactsCost = 429;
export const RewardsRefundFacts = `#graphql
  query RewardsRefundFacts($id: ID!) {
    refund(id: $id) {
      id
      createdAt
      order {
        id
      }
      refundLineItems(first: 100) {
        pageInfo {
          hasNextPage
        }
        nodes {
          quantity
          lineItem {
            id
          }
        }
      }
      transactions(first: 20) {
        nodes {
          kind
          status
          amountSet {
            shopMoney {
              amount
            }
            presentmentMoney {
              amount
            }
          }
        }
      }
      refundShippingLines(first: 20) {
        nodes {
          subtotalAmountSet {
            shopMoney {
              amount
            }
            presentmentMoney {
              amount
            }
          }
          taxAmountSet {
            shopMoney {
              amount
            }
            presentmentMoney {
              amount
            }
          }
        }
      }
    }
  }
`;

/**
 * The paid and partly refunded orders created since a time, newest first, 50
 * to a page, for the hourly sweep of missed orders (rule 13).
 * Scopes: read_orders, read_customers. The validator also names read_marketplace_orders and read_quick_sale: those
 * are alternatives to read_orders (returning only orders attributed to the
 * app), not further requirements.
 * Cost: 103 = orders (connection 2, pageInfo 1, 50 × (order 1 + customer 1)).
 */
export const RewardsRecentPaidOrders = `#graphql
  query RewardsRecentPaidOrders($query: String!, $after: String) {
    orders(first: 50, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        test
        createdAt
        customer {
          id
        }
      }
    }
  }
`;

/**
 * Which customer accounts the shop uses, and whether its sign-in links show
 * on the storefront and at checkout: store credit can be spent only by a
 * buyer signed in to new customer accounts (or using Shop Pay). Carried from
 * apps/rewardspro's CustomerAccountsVersion and
 * StoreCreditSpendCustomerAccounts, one document for both shop checks.
 * Scopes: none documented (shop settings any installed app can read).
 * Cost: 2 = shop 1 + customerAccountsV2 1 (its scalars cost nothing).
 */
export const RewardsCustomerAccounts = `#graphql
  query RewardsCustomerAccounts {
    shop {
      customerAccountsV2 {
        customerAccountsVersion
        loginLinksVisibleOnStorefrontAndCheckout
      }
    }
  }
`;

/**
 * Whether store credit is turned on for buyers at checkout (Settings >
 * Customer accounts). Carried from apps/rewardspro's
 * StoreCreditSpendConfiguration; Admin API 2026-10 or later.
 * Scopes: none documented on the query's reference page.
 * Cost: 1 (the storeCreditConfiguration object).
 */
export const RewardsStoreCreditConfig = `#graphql
  query RewardsStoreCreditConfig {
    storeCreditConfiguration {
      storeCreditEnabled
    }
  }
`;

/**
 * The access scopes Shopify has granted the app on this store, read before
 * the past-orders import: orders older than 60 days need read_all_orders
 * (spec 6.5), and without it the import covers 60 days.
 * Scopes: none (any installed app can read its own installation).
 * Cost: about 1 + one point per granted scope (the installation object and
 * each AccessScope object in the list; their handles cost nothing): under 50
 * for the app's scopes. A25 logs the requested cost.
 */
export const RewardsAccessScopes = `#graphql
  query RewardsAccessScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

/**
 * The bulk query of the past-orders import (spec 6.5), sent as
 * RewardsBulkOrders's `$query`: the orders created in [from, to) with the
 * order fields of RewardsOrderFacts and their line items, one JSONL line per
 * order and one per line item (with `__parentId`). Bulk rules shape it: one
 * top-level field and no `shop`; `edges { node }`; `transactions` with no
 * size argument (bulk reads the whole list); and no `refunds`, because every
 * part of a refund that would tell a refund of money with no items apart
 * (its line items, transactions and shipping lines) is a connection, and
 * bulk refuses a connection inside a list field. The node is therefore read
 * with "quantities" (order-source.server.ts, Ruling 25), and a money-only
 * refund made before the import still counts as spend (a known limit).
 * `search` is Shopify search syntax, embedded as a GraphQL string.
 * Scopes: read_orders, read_customers; read_all_orders for orders older than
 * 60 days. The validator also names read_marketplace_orders and read_quick_sale: those
 * are alternatives to read_orders (returning only orders attributed to the
 * app), not further requirements.
 * Cost: none charged to the app's bucket (a bulk query runs on Shopify's side,
 * outside the single-query limit). The validator checks only the wrapper, so
 * this text was validated on its own as a plain query; A25 is the real run.
 */
export function RewardsBulkOrderNodes(search: string): string {
  return `{
  orders(query: ${JSON.stringify(search)}) {
    edges {
      node {
        id
        name
        test
        createdAt
        processedAt
        cancelledAt
        displayFinancialStatus
        currencyCode
        presentmentCurrencyCode
        taxesIncluded
        customer {
          id
        }
        totalPriceSet {
          shopMoney {
            amount
          }
          presentmentMoney {
            amount
          }
        }
        totalTipReceivedSet {
          shopMoney {
            amount
          }
          presentmentMoney {
            amount
          }
        }
        transactions {
          gateway
          status
          kind
          amountSet {
            shopMoney {
              amount
            }
            presentmentMoney {
              amount
            }
          }
        }
        lineItems {
          edges {
            node {
              id
              quantity
              currentQuantity
              isGiftCard
              originalTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
              discountAllocations {
                allocatedAmountSet {
                  shopMoney {
                    amount
                  }
                  presentmentMoney {
                    amount
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;
}

/**
 * Starts the past-orders import's bulk query (RewardsBulkOrderNodes's text
 * as `$query`). Shopify runs it in the background; RewardsBulkStatus follows it.
 * Scopes: those of the bulk query itself (see RewardsBulkOrderNodes).
 * Cost: 12 = mutation 10 + bulkOperation 1 + userErrors 1.
 */
export const RewardsBulkOrders = `#graphql
  mutation RewardsBulkOrders($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

/**
 * One bulk operation's progress (Admin API 2026-01 and later), polled by the
 * hourly job and by Home while the import runs. `url` is the signed JSONL
 * file once it is COMPLETED (null when the query found nothing).
 * Scopes: none beyond the app's own operation.
 * Cost: 1 (the bulkOperation object; its scalars cost nothing).
 */
export const RewardsBulkStatus = `#graphql
  query RewardsBulkStatus($id: ID!) {
    bulkOperation(id: $id) {
      id
      status
      errorCode
      url
      objectCount
    }
  }
`;
