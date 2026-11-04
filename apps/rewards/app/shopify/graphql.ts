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
