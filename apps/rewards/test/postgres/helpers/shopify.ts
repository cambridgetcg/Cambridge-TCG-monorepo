import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ApiVersion, Session } from "@shopify/shopify-app-react-router/server";
import { graphql, HttpResponse } from "msw";
import prisma from "~/db.server";
import { Money, currencyDecimals } from "~/lib/money";
import { server } from "../../setup";

/**
 * The real Shopify boundary for the Postgres suites, carried from
 * apps/rewardspro/test/integration/postgres/shopify.ts: deliveries signed the
 * way Shopify signs them (HMAC of the body with the app's client secret,
 * which test/setup.ts sets as SHOPIFY_API_SECRET), an offline session in
 * Postgres and Admin GraphQL answered by MSW (app proxy requests are signed by
 * test/helpers/app-proxy.ts). Nothing here mocks authenticate.
 */

// The library's adapter handed the Shopify runtime the global fetch when it
// loaded, before MSW patched it; resolve it per call so Admin GraphQL reaches
// MSW (and nothing else: an unhandled request fails the test). apps/rewards
// has no direct dependency on @shopify/shopify-api, so its runtime is the
// ES module copy the app library itself loads.
{
  const library = createRequire(import.meta.url).resolve("@shopify/shopify-app-react-router/server");
  const runtime = createRequire(library).resolve("@shopify/shopify-api/runtime");
  const esmRuntime = runtime.replace(/dist[\\/]cjs[\\/]runtime[\\/]index\.js$/, "dist/esm/runtime/index.mjs");
  // Patching the CJS copy would leave the app's Admin calls on the real network.
  if (esmRuntime === runtime) throw new Error(`Can't find the ES module copy of the Shopify runtime next to ${runtime}`);
  const { setAbstractFetchFunc } = (await import(pathToFileURL(esmRuntime).href)) as {
    setAbstractFetchFunc: (fetch: typeof globalThis.fetch) => void;
  };
  setAbstractFetchFunc((input, init) => globalThis.fetch(input, init));
}

/**
 * A webhook delivery as Shopify signs it. `apiVersion` is the subscription's
 * version: 2026-01 is the released app's; the new tomls move it to 2026-10.
 * `headers` are added last, so they can also replace one Shopify sets (such
 * as X-Shopify-Triggered-At, which Shopify sends unsigned).
 */
export function signedWebhook(
  topic: string,
  shop: string,
  payload: unknown,
  webhookId: string = crypto.randomUUID(),
  apiVersion = "2026-01",
  headers: Record<string, string> = {},
): Request {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(body, "utf8").digest("base64");
  return new Request(`https://test.example.com/webhooks/${topic}`, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": shop,
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": webhookId,
      "X-Shopify-API-Version": apiVersion,
      ...headers,
    },
  });
}

/** The Admin GraphQL endpoint the app calls for `shop`, at the version it pins. */
export const adminGraphqlUrl = (shop: string) => `https://${shop}/admin/api/${ApiVersion.October26}/graphql.json`;

/**
 * The offline session authenticate.webhook and unauthenticated.admin load,
 * stored through the app's own (encrypting) session storage. ~/shopify.server
 * is imported here, not at the top: its storage checks the Session table as
 * soon as it is built, which a suite skipped for want of a database must not do.
 */
export async function seedOfflineSession(shop: string): Promise<void> {
  const { sessionStorage } = await import("~/shopify.server");
  await sessionStorage.storeSession(
    new Session({
      id: `offline_${shop}`,
      shop,
      state: "state",
      isOnline: false,
      scope: "read_customers,read_store_credit_accounts,write_store_credit_account_transactions",
      accessToken: "shpat_integration",
    }),
  );
}

export type StoreCreditCall = { operation: "credit" | "debit"; customerId: string; amount: string; currency: string };

/** A credit transaction as Shopify lists it in a customer's store credit history. */
export type HistoryCredit = { id: string; customerId: string; amount: string; currency: string; createdAt: Date };

/**
 * Shopify's record of the credits it applied, which mockStoreCredit keeps
 * when given one and answers RewardsCreditHistory from. Tests add credits
 * Shopify applied from elsewhere, or move them in time.
 */
export function creditHistory(): { credits: HistoryCredit[]; reads: number } {
  return { credits: [], reads: 0 };
}

/**
 * Answer the store-credit GraphQL the app sends for `shop` (RewardsCredit,
 * RewardsDebit, RewardsBalance and, with a `history`,
 * RewardsCreditHistory, matched by operation name), keeping one balance per
 * customer in `currency` (default GBP) as a decimal string. Returns the
 * credits and debits sent, for assertions.
 * `duringCredit` runs while a credit is in flight, before Shopify answers.
 * The next `throttled` credits or debits are turned away with a GraphQL
 * THROTTLED error (nothing applied). The ones after that are applied, but:
 * - the next `unanswered` lose their answer, as when the connection drops;
 * - the next `internalErrors` are answered 200 with a top-level
 *   INTERNAL_SERVER_ERROR, Shopify's GraphQL form of a 500;
 * - the next `badGateways` are answered 502.
 * With a `history`, every applied credit is recorded in it (without one,
 * the history query is not answered and fails the test).
 */
export function mockStoreCredit(
  shop: string,
  balances: Record<string, string>,
  options: {
    duringCredit?: () => Promise<void>;
    throttled?: number;
    unanswered?: number;
    internalErrors?: number;
    badGateways?: number;
    history?: ReturnType<typeof creditHistory>;
    currency?: string;
  } = {},
): StoreCreditCall[] {
  const currency = options.currency ?? "GBP";
  const decimals = currencyDecimals(currency);
  const calls: StoreCreditCall[] = [];
  let throttled = options.throttled ?? 0;
  let unanswered = options.unanswered ?? 0;
  let internalErrors = options.internalErrors ?? 0;
  let badGateways = options.badGateways ?? 0;
  const balanceOf = (customerId: string) => new Money(balances[customerId] ?? 0);
  const shown = (customerId: string) => balanceOf(customerId).toFixed(decimals);
  const turnedAway = () => {
    if (throttled === 0) return null;
    throttled--;
    return HttpResponse.json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] });
  };
  const answer = (body: Record<string, unknown>) => {
    if (unanswered > 0) {
      unanswered--;
      return HttpResponse.error();
    }
    if (internalErrors > 0) {
      internalErrors--;
      return HttpResponse.json({
        errors: [{ message: "Internal error. Looks like something went wrong on our end.", extensions: { code: "INTERNAL_SERVER_ERROR", requestId: "test" } }],
      });
    }
    if (badGateways > 0) {
      badGateways--;
      return HttpResponse.json({ errors: "Bad Gateway" }, { status: 502 });
    }
    return HttpResponse.json(body);
  };
  const link = graphql.link(adminGraphqlUrl(shop));
  const transaction = (kind: "Credit" | "Debit", customerId: string, amount: string) => ({
    id: `gid://shopify/StoreCreditAccount${kind}Transaction/${calls.length}`,
    amount: { amount, currencyCode: currency },
    balanceAfterTransaction: { amount: shown(customerId), currencyCode: currency },
  });
  const customerOf = (gid: unknown) => String(gid).split("/").pop()!;

  server.use(
    link.query("RewardsBalance", ({ variables }) =>
      HttpResponse.json({
        data: {
          customer: {
            storeCreditAccounts: {
              nodes: [{ balance: { amount: shown(customerOf(variables.customerId)), currencyCode: currency } }],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      }),
    ),
    link.mutation("RewardsDebit", ({ variables }) => {
      const customerId = customerOf(variables.id);
      const { amount, currencyCode } = variables.debitInput.debitAmount;
      calls.push({ operation: "debit", customerId, amount, currency: currencyCode });
      const away = turnedAway();
      if (away) return away;
      balances[customerId] = balanceOf(customerId).minus(amount).toFixed(decimals);
      return answer({ data: { storeCreditAccountDebit: { storeCreditAccountTransaction: transaction("Debit", customerId, amount), userErrors: [] } } });
    }),
    link.mutation("RewardsCredit", async ({ variables }) => {
      const customerId = customerOf(variables.id);
      const { amount, currencyCode } = variables.creditInput.creditAmount;
      calls.push({ operation: "credit", customerId, amount, currency: currencyCode });
      const away = turnedAway();
      if (away) return away;
      await options.duringCredit?.();
      balances[customerId] = balanceOf(customerId).plus(amount).toFixed(decimals);
      options.history?.credits.push({
        id: `gid://shopify/StoreCreditAccountCreditTransaction/${calls.length}`,
        customerId,
        amount,
        currency: currencyCode,
        createdAt: new Date(),
      });
      return answer({ data: { storeCreditAccountCredit: { storeCreditAccountTransaction: transaction("Credit", customerId, amount), userErrors: [] } } });
    }),
  );
  const history = options.history;
  if (history) {
    server.use(
      link.query("RewardsCreditHistory", ({ variables }) => {
        history.reads++;
        const customerId = customerOf(variables.customerId);
        const credits = history.credits
          .filter((credit) => credit.customerId === customerId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        // One store credit account per currency, as Shopify keeps them
        const currencies = [...new Set([currency, ...credits.map((credit) => credit.currency)])];
        return HttpResponse.json({
          data: {
            customer: {
              storeCreditAccounts: {
                pageInfo: { hasNextPage: false },
                nodes: currencies.map((code) => ({
                  transactions: {
                    pageInfo: { hasNextPage: false },
                    nodes: credits
                      .filter((credit) => credit.currency === code)
                      .map((credit) => ({
                        __typename: "StoreCreditAccountCreditTransaction",
                        id: credit.id,
                        amount: { amount: credit.amount, currencyCode: credit.currency },
                        createdAt: credit.createdAt.toISOString(),
                      })),
                  },
                })),
              },
            },
          },
        });
      }),
    );
  }
  return calls;
}

/** One Admin GraphQL answer as the fixtures in test/fixtures/orders hold it. */
export type FixtureAnswer = { data: Record<string, unknown> };

/**
 * Answer the order reads the app sends for `shop` (RewardsOrderFacts and
 * RewardsRefundFacts, matched by operation name) from fixture answers, by
 * the id asked for; Shopify's null for any other id. The lists are read at
 * each request, so a test can change them between deliveries. Returns the
 * ids read, in order.
 */
export function mockOrderFacts(shop: string, answers: { orders?: FixtureAnswer[]; refunds?: FixtureAnswer[] }): { reads: string[] } {
  const reads: string[] = [];
  const find = (list: FixtureAnswer[] | undefined, key: "order" | "refund", id: unknown) =>
    (list ?? []).find((answer) => (answer.data[key] as { id?: string } | null)?.id === id);
  const link = graphql.link(adminGraphqlUrl(shop));
  server.use(
    link.query("RewardsOrderFacts", ({ variables }) => {
      reads.push(String(variables.id));
      return HttpResponse.json(find(answers.orders, "order", variables.id) ?? { data: { shop: { currencyCode: "GBP" }, order: null } });
    }),
    link.query("RewardsRefundFacts", ({ variables }) => {
      reads.push(String(variables.id));
      return HttpResponse.json(find(answers.refunds, "refund", variables.id) ?? { data: { refund: null } });
    }),
  );
  return { reads };
}

/**
 * Move a payout's claim (and Shopify's unclear answer to it) `minutes` into
 * the past, with the credits Shopify applied meanwhile: an unclear payout is
 * checked only once its claim is long finished.
 */
export async function backdateClaim(payoutId: string, minutes: number, history?: ReturnType<typeof creditHistory>): Promise<void> {
  const shift = (at: Date | null) => (at ? new Date(at.getTime() - minutes * 60_000) : null);
  const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId }, select: { claimedAt: true, unconfirmedAt: true } });
  await prisma.payout.update({
    where: { id: payoutId },
    data: { claimedAt: shift(payout.claimedAt), unconfirmedAt: shift(payout.unconfirmedAt) },
  });
  for (const credit of history?.credits ?? []) credit.createdAt = new Date(credit.createdAt.getTime() - minutes * 60_000);
}
