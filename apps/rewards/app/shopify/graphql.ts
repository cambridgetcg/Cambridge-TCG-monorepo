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
 * One order's facts (spec 6.3 rule 1): its lines with their discounts, its
 * tenders, its refunds' ids, whether its prices include tax (for the shipping
 * a money-only refund returned, rule 7) and the shop's currency. Line items come 100 to a
 * page; `$after` reads the next. Kept apart from the refunds so each read
 * stays under the 1,000-point limit (one query with everything is refused
 * with MAX_COST_EXCEEDED).
 * Scopes (as the validator names them): read_orders, read_marketplace_orders,
 * read_quick_sale, read_customers; read_all_orders for orders older than 60 days.
 * Cost: 909 = shop 1 + order 1 + customer 1 + totalPriceSet 3 + lineItems
 * (connection 2, pageInfo 1, 100 × (line 1 + originalTotalSet 3 + one
 * discount allocation 4)) + transactions 20 × (transaction 1 + amountSet 3)
 * + refunds 20 × 1 (taxesIncluded and the other scalars cost nothing).
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
 * Scopes (as the validator names them): read_orders, read_marketplace_orders,
 * read_quick_sale.
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
 * Scopes (as the validator names them): read_orders, read_marketplace_orders,
 * read_quick_sale.
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
 * The paid and partly refunded orders created since a time, oldest first, 50
 * to a page, for the hourly sweep of missed orders (rule 13).
 * Scopes (as the validator names them): read_orders, read_marketplace_orders,
 * read_quick_sale, read_customers.
 * Cost: 103 = orders (connection 2, pageInfo 1, 50 × (order 1 + customer 1)).
 */
export const RewardsRecentPaidOrders = `#graphql
  query RewardsRecentPaidOrders($query: String!, $after: String) {
    orders(first: 50, after: $after, query: $query, sortKey: CREATED_AT) {
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
