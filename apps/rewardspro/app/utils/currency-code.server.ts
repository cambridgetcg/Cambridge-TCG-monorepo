import { Currency } from "@prisma/client";

/**
 * A currency code from Shopify (webhook payloads, GraphQL) as the Prisma
 * `Currency` enum, or `fallback` when the app does not support it.
 * Server-only: utils/currency.ts is shared with the client and must not pull
 * in the Prisma runtime.
 */
export function toCurrency(code: string | null | undefined, fallback: Currency = Currency.USD): Currency {
  return code && Object.hasOwn(Currency, code) ? Currency[code as keyof typeof Currency] : fallback;
}
