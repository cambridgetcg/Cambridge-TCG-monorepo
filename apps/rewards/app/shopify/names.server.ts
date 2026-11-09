import { askShopify } from "./ask.server";
import { RewardsCustomerNames, RewardsCustomerSearch, type GraphqlClient } from "./graphql";

/**
 * Buyers' names for the admin pages. RewardsPro stores no name (spec 6.2):
 * each page asks Shopify for the names it shows, and nothing here keeps,
 * caches or logs one. A buyer Shopify gives no name for is shown as
 * "Customer ····1234", the last four digits of their id, so the page still
 * renders. So is every buyer of a batch Shopify answers with errors: without
 * the protected Name field approved, Shopify answers `errors` beside the
 * redacted names, the client throws, and the whole batch falls back
 * (docs Q5).
 */

// The most ids `nodes` takes in one call
const BATCH_SIZE = 250;
// As live-balance: a page shouldn't wait longer than this on Shopify, for
// one ask and, by default, for all of them
const TIMEOUT_MS = 2_500;
// Shopify's recommended least wait after a throttle (docs Q6)
const THROTTLE_MIN_WAIT_MS = 1_000;
// A retry after a throttle needs time to ask in, or it only times out (M3c-F2)
const MIN_ASK_MS = 500;

/** What the admin shows for a buyer whose name it can't read: the id's last four digits, or plain "Customer" (A18-F3). */
export function nameFallback(externalId: string): string {
  const digits = externalId.replace(/\D/g, "").slice(-4);
  return digits === "" ? "Customer" : `Customer ····${digits}`;
}

type NameNode = { id?: unknown; firstName?: unknown; lastName?: unknown } | null;

function fullName(node: NameNode): string | null {
  const parts = [node?.firstName, node?.lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * One batch's names, by numeric id. Throws when Shopify gives no answer in
 * time or an answer with no `nodes` list.
 */
async function askBatch(admin: GraphqlClient, ids: string[], timeoutMs: number): Promise<Map<string, string>> {
  const body = (await askShopify(admin, RewardsCustomerNames, { ids: ids.map((id) => `gid://shopify/Customer/${id}`) }, timeoutMs)) as {
    data?: { nodes?: NameNode[] | null } | null;
  } | null;
  const nodes = body?.data?.nodes;
  if (!Array.isArray(nodes)) throw new Error("RewardsCustomerNames answered without a nodes list");
  const names = new Map<string, string>();
  for (const node of nodes) {
    const match = typeof node?.id === "string" ? /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(node.id) : null;
    const name = fullName(node);
    if (match && name) names.set(match[1], name);
  }
  return names;
}

type ThrottledBody = {
  errors?: { graphQLErrors?: Array<{ extensions?: { code?: unknown } } | null> };
  extensions?: { cost?: { requestedQueryCost?: unknown; throttleStatus?: { currentlyAvailable?: unknown; restoreRate?: unknown } } };
};

/**
 * How long to wait before asking again when `error` is Shopify's THROTTLED
 * answer (a 200 the client throws as GraphqlQueryError, docs Q6): the
 * longer of 1 s and the time Shopify needs to restore the points the batch
 * asks for, (requestedQueryCost − currentlyAvailable) ÷ restoreRate, from the
 * answer's cost when it carries one. Null for any other failure.
 */
function throttleWaitMs(error: unknown): number | null {
  const body = (error as { body?: ThrottledBody } | null)?.body;
  if (!body?.errors?.graphQLErrors?.some((e) => e?.extensions?.code === "THROTTLED")) return null;
  const cost = body.extensions?.cost;
  const asked = Number(cost?.requestedQueryCost);
  const left = Number(cost?.throttleStatus?.currentlyAvailable);
  const rate = Number(cost?.throttleStatus?.restoreRate);
  const restore = Number.isFinite(asked) && Number.isFinite(left) && rate > 0 ? ((asked - left) / rate) * 1000 : 0;
  return Math.max(THROTTLE_MIN_WAIT_MS, Math.ceil(restore));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The name to show for each buyer, keyed by the numeric customer id stored
 * on the customer row; every id asked for has an entry. Asks Shopify 250 at
 * a time, one batch after another, each ask within 2.5 s, all of them within
 * the caller's `budgetMs` (a page's 2.5 s by default; the export passes its
 * own). A batch Shopify throttles is asked once more after the wait Shopify
 * says (throttleWaitMs), when that wait and half a second to ask in still
 * fit in the budget (Ruling 78, M3c-F2).
 * On any other failure, a second throttle, or once the budget is spent, that
 * batch's buyers and every later one fall back without asking again, so a
 * Shopify that isn't answering costs a page one wait, not one per batch.
 */
export async function customerNames(
  admin: GraphqlClient,
  externalIds: string[],
  o: { budgetMs?: number } = {},
): Promise<Map<string, string>> {
  const deadline = Date.now() + (o.budgetMs ?? TIMEOUT_MS);
  const unique = [...new Set(externalIds)];
  const names = new Map<string, string>();
  // Only a numeric id can be asked for: one malformed GID fails the whole call
  const askable = unique.filter((id) => /^\d+$/.test(id));

  const giveUp = (start: number, why: string) =>
    // Why, never a name or a buyer id
    console.warn(`[names] Could not read buyer names from Shopify; showing ${askable.length - start} as "Customer ····":`, why);

  batches: for (let start = 0; start < askable.length; start += BATCH_SIZE) {
    const ids = askable.slice(start, start + BATCH_SIZE);
    for (let ask = 1; ; ask++) {
      const left = deadline - Date.now();
      if (left <= 0) {
        giveUp(start, "out of time");
        break batches;
      }
      try {
        const batch = await askBatch(admin, ids, Math.min(TIMEOUT_MS, left));
        for (const [id, name] of batch) names.set(id, name);
        break;
      } catch (error) {
        if (error instanceof Response) throw error;
        const wait = throttleWaitMs(error);
        if (wait !== null && ask === 1 && Date.now() + wait + MIN_ASK_MS <= deadline) {
          await sleep(wait);
          continue;
        }
        giveUp(start, error instanceof Error ? error.message : String(error));
        break batches;
      }
    }
  }

  return new Map(unique.map((id) => [id, names.get(id) ?? nameFallback(id)]));
}

/** The longest search the Customers page sends, in characters. */
export const SEARCH_MAX = 200;

/**
 * What the merchant typed, as plain words for Shopify's search syntax
 * (BOUNDARY-5): each word loses any leading `-` (which would negate it), and
 * `\ : ( ) ' "` are escaped with a backslash, so "Name: Jane" or "O'Neil" is
 * searched as written, not read as a field or a quote. Empty when no word is
 * left.
 */
export function shopifySearchText(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/^-+/, "").replace(/[\\:()'"]/g, (c) => `\\${c}`))
    .filter((word) => word !== "")
    .join(" ");
}

type SearchBody = {
  data?: { customers?: { nodes?: Array<{ id?: unknown } | null> | null; pageInfo?: { hasNextPage?: unknown } | null } | null } | null;
  extensions?: { search?: Array<{ warnings?: unknown[] | null } | null> | null } | null;
} | null;

/**
 * The numeric ids of the customers Shopify's search finds for `text`
 * (RewardsCustomerSearch, within 2.5 s, its words escaped by
 * shopifySearchText), whether it found more than one search reads (`more`),
 * and whether Shopify warned it couldn't read the search (`unread`, from the
 * answer's `extensions.search` warnings). A search with no words left finds
 * no one, without asking: an empty query would match every customer. Null
 * when Shopify can't say: the page then says so rather than showing
 * everyone. What was searched for is never logged.
 */
export async function searchCustomers(
  admin: GraphqlClient,
  text: string,
): Promise<{ ids: string[]; more: boolean; unread: boolean } | null> {
  const query = shopifySearchText(text);
  if (query === "") return { ids: [], more: false, unread: false };
  try {
    const body = (await askShopify(admin, RewardsCustomerSearch, { query }, TIMEOUT_MS)) as SearchBody;
    const customers = body?.data?.customers;
    if (!Array.isArray(customers?.nodes)) throw new Error("RewardsCustomerSearch answered without a nodes list");
    const ids = customers.nodes.flatMap((node) => {
      const match = typeof node?.id === "string" ? /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(node.id) : null;
      return match ? [match[1]] : [];
    });
    const unread = (body?.extensions?.search ?? []).some((search) => (search?.warnings?.length ?? 0) > 0);
    return { ids, more: customers.pageInfo?.hasNextPage === true, unread };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.warn("[names] Could not search buyers in Shopify:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
