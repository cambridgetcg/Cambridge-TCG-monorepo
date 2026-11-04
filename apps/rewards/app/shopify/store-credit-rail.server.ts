import type { Decimal } from "decimal.js";
import { Money, currencyDecimals, toShopifyAmount } from "~/lib/money";
import type { CreditHistoryResult, CreditRecord, PayoutRail, RailAnswer } from "~/lib/ports";
import { RewardsBalance, RewardsCredit, RewardsCreditHistory, RewardsDebit, type GraphqlClient } from "./graphql";

/**
 * The payout rail on Shopify store credit (spec 6.1), carried from
 * apps/rewardspro/app/services/shopify-store-credit.service.ts with its "may
 * have been applied" rules, and the history read from stuck-cashback.server.ts.
 *
 * No call is ever retried here (the client's `tries` stays unset): a credit
 * or debit whose answer was unclear must never be sent again blind (rule 9),
 * and the engine decides when to try again.
 */

/** How long a credit, debit or history read waits for Shopify. Well inside the 15-minute send window (A11). */
export const RAIL_CALL_TIMEOUT_MS = 10_000;
/** How long a balance read waits for Shopify (spec 5, PR #134). */
export const BALANCE_TIMEOUT_MS = 2500;

type StoreCreditMutation = "storeCreditAccountCredit" | "storeCreditAccountDebit";

/**
 * Top-level GraphQL error codes with which Shopify turns a request away
 * before running it (Admin API "Status and error codes"): THROTTLED (like a
 * 429), ACCESS_DENIED (like a 401), SHOP_INACTIVE, and MAX_COST_EXCEEDED
 * (the query's cost, checked before it runs). Not INTERNAL_SERVER_ERROR,
 * Shopify's 500 answered as a 200, nor codes this list does not name: the
 * docs say others may appear, and a mutation may have run before them.
 */
const REFUSED_BEFORE_RUNNING: ReadonlySet<string> = new Set(["THROTTLED", "ACCESS_DENIED", "SHOP_INACTIVE", "MAX_COST_EXCEEDED"]);

/**
 * The userError codes Shopify documents for each mutation
 * (StoreCreditAccountCreditUserErrorCode, StoreCreditAccountDebitUserErrorCode).
 * Each names a reason no transaction could be made. A userError with any
 * other code, or none, leaves it unknown.
 */
const REFUSED_USER_ERRORS: Record<StoreCreditMutation, ReadonlySet<string>> = {
  storeCreditAccountCredit: new Set([
    "ACCOUNT_NOT_FOUND",
    "CREDIT_LIMIT_EXCEEDED",
    "EXPIRES_AT_IN_PAST",
    "MISMATCHING_CURRENCY",
    "NEGATIVE_OR_ZERO_AMOUNT",
    "OWNER_NOT_FOUND",
    "UNSUPPORTED_CURRENCY",
  ]),
  storeCreditAccountDebit: new Set(["ACCOUNT_NOT_FOUND", "INSUFFICIENT_FUNDS", "MISMATCHING_CURRENCY", "NEGATIVE_OR_ZERO_AMOUNT"]),
};

/**
 * The documented refusals that sending again cannot change (plan Decision 4):
 * every one on a credit; on a debit all but INSUFFICIENT_FUNDS, which a later
 * credit can change.
 */
const PERMANENT_USER_ERRORS: Record<StoreCreditMutation, ReadonlySet<string>> = {
  storeCreditAccountCredit: REFUSED_USER_ERRORS.storeCreditAccountCredit,
  storeCreditAccountDebit: new Set(["ACCOUNT_NOT_FOUND", "MISMATCHING_CURRENCY", "NEGATIVE_OR_ZERO_AMOUNT"]),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function codeOf(error: unknown): unknown {
  const record = asRecord(error);
  return record?.code ?? asRecord(record?.extensions)?.code;
}

/**
 * Whether `error` is an instance of the @shopify/shopify-api error class
 * `name` (or a subclass). apps/rewards does not depend on that package
 * directly, and a CommonJS and an ES module copy of it would have different
 * classes, so the class is told by the names on the prototype chain.
 */
function isShopifyError(error: unknown, name: string): boolean {
  if (!(error instanceof Error)) return false;
  for (let proto = Object.getPrototypeOf(error); proto && proto !== Error.prototype; proto = Object.getPrototypeOf(proto)) {
    if (proto.constructor?.name === name) return true;
  }
  return false;
}

/**
 * Whether a store-credit mutation answered with top-level GraphQL `errors`
 * (and perhaps partial `data`) may still have been applied. Not applied only
 * when every error carries a code in REFUSED_BEFORE_RUNNING, none points
 * inside the mutation's payload, and no payload came back.
 */
function graphqlErrorsMayHaveApplied(errors: unknown, data: unknown, mutation: StoreCreditMutation): boolean {
  // A payload, even one without a transaction, means the mutation ran
  if (asRecord(data)?.[mutation] != null) return true;
  if (!Array.isArray(errors) || errors.length === 0) return true;
  return !errors.every((error) => {
    const code = codeOf(error);
    const path = asRecord(error)?.path;
    return typeof code === "string" && REFUSED_BEFORE_RUNNING.has(code) && !(Array.isArray(path) && path.length > 1);
  });
}

/** The top-level GraphQL errors a GraphqlQueryError carries, and the partial data beside them. */
function graphqlQueryErrorBody(error: unknown): { errors: unknown; data: unknown } {
  const body = asRecord(asRecord(error)?.body);
  return { errors: asRecord(body?.errors)?.graphQLErrors, data: body?.data };
}

/**
 * Whether a store-credit mutation that threw after it was sent may still
 * have been applied. Not applied only when Shopify said so:
 * - a 200 with GraphQL errors (`GraphqlQueryError`) that turn the request
 *   away before it runs (graphqlErrorsMayHaveApplied);
 * - a 4xx answer (`HttpResponseError`: refused, throttled, not authorised),
 *   or the Response the admin and webhook contexts rethrow in its place,
 *   with its status: a 4xx, or a redirect to re-authenticate after a 401.
 * Anything else may have: no answer (`HttpRequestError`: the connection
 * failed or dropped, a timeout), a 5xx, or a 200 that could not be read.
 */
function mayHaveBeenApplied(error: unknown, mutation: StoreCreditMutation): boolean {
  if (isShopifyError(error, "GraphqlQueryError")) {
    const { errors, data } = graphqlQueryErrorBody(error);
    return graphqlErrorsMayHaveApplied(errors, data, mutation);
  }
  const refused = (status: unknown) => typeof status === "number" && status >= 400 && status < 500;
  if (isShopifyError(error, "HttpResponseError")) return !refused(asRecord(asRecord(error)?.response)?.code);
  if (error instanceof Response) return !(refused(error.status) || (error.status >= 300 && error.status < 400));
  return true;
}

/** The first code among top-level GraphQL errors, if any carries one. */
function firstCode(errors: unknown): string | null {
  if (!Array.isArray(errors)) return null;
  for (const error of errors) {
    const code = codeOf(error);
    if (typeof code === "string") return code;
  }
  return null;
}

function firstErrorMessage(errors: unknown): string {
  const list = Array.isArray(errors) ? errors : asRecord(errors)?.graphQLErrors;
  const message = Array.isArray(list) ? asRecord(list[0])?.message : undefined;
  return typeof message === "string" ? message : "Shopify answered with errors";
}

function errorMessage(error: unknown): string {
  if (error instanceof Response) return `Shopify answered ${error.status}`;
  return error instanceof Error ? error.message : String(error);
}

/** Shopify gave no answer in time; the request was aborted. */
export class ShopifyTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Shopify did not answer within ${timeoutMs / 1000} s`);
    this.name = "ShopifyTimeoutError";
  }
}

/**
 * Sends one document and reads Shopify's answer, giving up after `timeoutMs`.
 * The request's signal is aborted then too, but the timer settles the call
 * even when the client doesn't honour the signal. Never retried.
 */
export async function askShopify(
  admin: GraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ShopifyTimeoutError(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });
  const call = (async () => {
    const response = await admin.graphql(query, { variables, signal: controller.signal });
    return response.json();
  })();
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** An amount Shopify gave as a decimal string, or null when it isn't one. */
function decimalOf(value: unknown): Decimal | null {
  if (typeof value !== "string") return null;
  try {
    const amount = new Money(value);
    return amount.isFinite() ? amount : null;
  } catch {
    return null;
  }
}

/** What one RewardsBalance answer says about the buyer's balance in one currency. */
export interface BalanceRead {
  /** The shop's API budget was below half after the read. */
  budgetLow: boolean;
  /** Null when the answer can't be read (including a customer Shopify doesn't know). */
  read: {
    /** The account's balance in the currency asked for; null when the buyer has no account in it. */
    account: Decimal | null;
    /** Another account holds credit, or an amount that couldn't be read. */
    creditElsewhere: boolean;
    /** Every account was on this page. */
    complete: boolean;
  } | null;
}

/**
 * Reads the buyer's store credit accounts once, with the 2.5 s timeout.
 * Throws when Shopify can't be reached in time.
 */
export async function readBalance(admin: GraphqlClient, externalCustomerId: string, currency: string): Promise<BalanceRead> {
  const body = asRecord(
    await askShopify(admin, RewardsBalance, { customerId: `gid://shopify/Customer/${externalCustomerId}` }, BALANCE_TIMEOUT_MS),
  );
  const throttle = asRecord(asRecord(asRecord(body?.extensions)?.cost)?.throttleStatus);
  const available = throttle?.currentlyAvailable;
  const maximum = throttle?.maximumAvailable;
  const budgetLow = typeof available === "number" && typeof maximum === "number" && available < maximum / 2;

  const accounts = asRecord(asRecord(asRecord(body?.data)?.customer)?.storeCreditAccounts);
  if (!Array.isArray(accounts?.nodes)) return { budgetLow, read: null };

  let account: Decimal | null = null;
  let creditElsewhere = false;
  for (const node of accounts.nodes) {
    const balance = asRecord(asRecord(node)?.balance);
    const amount = decimalOf(balance?.amount);
    if (balance?.currencyCode === currency) {
      if (!amount) return { budgetLow, read: null };
      account = amount;
    } else if (!amount || amount.gt(0)) {
      creditElsewhere = true;
    }
  }
  const complete = asRecord(accounts.pageInfo)?.hasNextPage === false;
  return { budgetLow, read: { account, creditElsewhere, complete } };
}

/** One credit transaction node as a CreditRecord; null when the node can't be read. */
function creditOf(node: Record<string, unknown>): CreditRecord | null {
  const money = asRecord(node.amount);
  const amount = decimalOf(money?.amount);
  const createdAt = typeof node.createdAt === "string" ? new Date(node.createdAt) : null;
  if (!amount || typeof money?.currencyCode !== "string" || !createdAt || Number.isNaN(createdAt.getTime())) return null;
  return { id: typeof node.id === "string" ? node.id : null, amount, currency: money.currencyCode, createdAt };
}

/**
 * The credits in a RewardsCreditHistory customer. complete=false when there
 * are more accounts than one page, or when an account has another page and
 * its oldest credit read is not older than `since`. Null when any part of
 * the answer can't be read.
 */
function historyOf(customer: Record<string, unknown> | null, since: Date): { credits: CreditRecord[]; complete: boolean } | null {
  const accounts = asRecord(customer?.storeCreditAccounts);
  if (!Array.isArray(accounts?.nodes)) return null;
  let complete = asRecord(accounts.pageInfo)?.hasNextPage !== true;
  const credits: CreditRecord[] = [];
  for (const account of accounts.nodes) {
    const transactions = asRecord(asRecord(account)?.transactions);
    const nodes: unknown[] = Array.isArray(transactions?.nodes) ? transactions.nodes : [];
    for (const node of nodes) {
      const record = asRecord(node);
      if (record?.__typename !== "StoreCreditAccountCreditTransaction") continue;
      const credit = creditOf(record);
      if (!credit) return null;
      credits.push(credit);
    }
    // Newest first: another page holds only older credits
    const oldest = asRecord(nodes.at(-1))?.createdAt;
    const oldestAt = typeof oldest === "string" ? new Date(oldest) : null;
    if (asRecord(transactions?.pageInfo)?.hasNextPage === true && !(oldestAt && oldestAt < since)) complete = false;
  }
  return { credits, complete };
}

export function createStoreCreditRail(admin: GraphqlClient): PayoutRail {
  const refused = (permanent: boolean, code: string | null, message: string): RailAnswer => ({ outcome: "refused", permanent, code, message });
  const unclear = (message: string): RailAnswer => ({ outcome: "unclear", message });

  /**
   * Send one store-credit credit or debit and read Shopify's answer. Every
   * answer that is not `applied` says whether the mutation may have been
   * applied (`unclear`) or was not (`refused`): a failure before the request
   * is sent, or an answer from Shopify that it applied nothing
   * (mayHaveBeenApplied, graphqlErrorsMayHaveApplied and REFUSED_USER_ERRORS).
   */
  async function send(
    mutation: StoreCreditMutation,
    i: { externalCustomerId: string; amount: Decimal; currency: string; notify?: boolean },
  ): Promise<RailAnswer> {
    const credit = mutation === "storeCreditAccountCredit";

    // Nothing is sent until the request is built: a failure here applied
    // nothing, and sending the same request again would fail the same way
    let variables: Record<string, unknown>;
    try {
      const amount = toShopifyAmount(i.amount, i.currency);
      const value = new Money(amount);
      if (!(value.isFinite() && value.gt(0))) return refused(true, null, `Invalid store credit amount (${i.amount.toString()} ${i.currency})`);
      const money = { amount, currencyCode: i.currency };
      const id = `gid://shopify/Customer/${i.externalCustomerId}`;
      variables = credit ? { id, creditInput: { creditAmount: money, notify: i.notify === true } } : { id, debitInput: { debitAmount: money } };
    } catch (error) {
      return refused(true, null, errorMessage(error));
    }

    let result: unknown;
    try {
      result = await askShopify(admin, credit ? RewardsCredit : RewardsDebit, variables, RAIL_CALL_TIMEOUT_MS);
    } catch (error) {
      const message = errorMessage(error);
      // The client refused to build the request (no access token): not sent
      if (isShopifyError(error, "MissingRequiredArgument")) return refused(false, null, message);
      if (mayHaveBeenApplied(error, mutation)) return unclear(message);
      return refused(false, isShopifyError(error, "GraphqlQueryError") ? firstCode(graphqlQueryErrorBody(error).errors) : null, message);
    }

    const answer = asRecord(result);

    // GraphQL errors in an answer that did not throw: the same rule
    const errors = answer?.errors;
    if (errors) {
      const graphQLErrors = Array.isArray(errors) ? errors : asRecord(errors)?.graphQLErrors;
      const message = firstErrorMessage(graphQLErrors);
      if (graphqlErrorsMayHaveApplied(graphQLErrors, answer?.data, mutation)) return unclear(message);
      return refused(false, firstCode(graphQLErrors), message);
    }

    const payload = asRecord(asRecord(answer?.data)?.[mutation]);
    const transaction = asRecord(payload?.storeCreditAccountTransaction);
    const userErrors: unknown[] = Array.isArray(payload?.userErrors) ? payload.userErrors : [];
    if (userErrors.length > 0) {
      const messages = userErrors.map((e) => asRecord(e)?.message).filter((m): m is string => typeof m === "string");
      const message = messages.join(", ") || "Shopify refused the store credit change";
      const codes = userErrors.map(codeOf);
      // Not applied only for a documented reason, and with no transaction
      const documented = transaction === null && codes.every((code) => typeof code === "string" && REFUSED_USER_ERRORS[mutation].has(code));
      if (!documented) return unclear(message);
      const permanentCode = codes.find((code): code is string => typeof code === "string" && PERMANENT_USER_ERRORS[mutation].has(code));
      return refused(permanentCode !== undefined, permanentCode ?? (codes[0] as string), message);
    }

    if (transaction) return { outcome: "applied", transactionId: typeof transaction.id === "string" ? transaction.id : null };

    // An answer with neither a transaction nor a reason does not say that
    // nothing was applied
    return unclear("No transaction returned from Shopify");
  }

  return {
    credit: (i) => send("storeCreditAccountCredit", i),
    debit: (i) => send("storeCreditAccountDebit", i),

    /**
     * The balance in `currency` now, uncached: 0 when the buyer has no account
     * in it and every account was read, null when Shopify can't say.
     */
    async balance(externalCustomerId, currency) {
      try {
        currencyDecimals(currency);
        const { read } = await readBalance(admin, externalCustomerId, currency);
        if (!read) return null;
        if (read.account) return read.account;
        return read.complete ? new Money(0) : null;
      } catch {
        return null;
      }
    },

    /**
     * The credits Shopify holds for the buyer, in every store credit account
     * (one per currency), newest first. `since` is how far back they must be
     * read for the history to be complete.
     */
    async creditHistory(externalCustomerId, since): Promise<CreditHistoryResult> {
      let answer: Record<string, unknown> | null;
      try {
        answer = asRecord(
          await askShopify(admin, RewardsCreditHistory, { customerId: `gid://shopify/Customer/${externalCustomerId}` }, RAIL_CALL_TIMEOUT_MS),
        );
      } catch (error) {
        return { status: "failed", error: errorMessage(error) };
      }
      if (answer?.errors) return { status: "failed", error: firstErrorMessage(answer.errors) };
      const data = asRecord(answer?.data);
      // Shopify answers null for a customer it doesn't have; no customer field at all is an answer that can't be read
      if (data?.customer === null) return { status: "customer_missing" };

      const history = historyOf(asRecord(data?.customer), since);
      if (!history) return { status: "failed", error: "Shopify's store credit history could not be read" };
      return { status: "found", ...history };
    },
  };
}
