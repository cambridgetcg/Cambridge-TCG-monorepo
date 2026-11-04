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
