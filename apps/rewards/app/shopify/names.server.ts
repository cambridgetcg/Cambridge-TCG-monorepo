import { askShopify } from "./ask.server";
import { RewardsCustomerNames, RewardsCustomerSearch, type GraphqlClient } from "./graphql";

/**
 * Buyers' names for the admin pages. RewardsPro stores no name (spec 6.2):
 * each page asks Shopify for the names it shows, and nothing here keeps,
 * caches or logs one. A buyer Shopify gives no name for, or every buyer when
 * Shopify can't say, is shown as "Customer ····1234", the last four digits
 * of their id, so the page still renders.
 */

// The most ids `nodes` takes in one call
const BATCH_SIZE = 250;
// As live-balance: a page shouldn't wait longer than this on Shopify
const TIMEOUT_MS = 2_500;

/** What the admin shows for a buyer whose name it can't read. */
export function nameFallback(externalId: string): string {
  return `Customer ····${externalId.slice(-4)}`;
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
async function askBatch(admin: GraphqlClient, ids: string[]): Promise<Map<string, string>> {
  const body = (await askShopify(admin, RewardsCustomerNames, { ids: ids.map((id) => `gid://shopify/Customer/${id}`) }, TIMEOUT_MS)) as {
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

/**
 * The name to show for each buyer, keyed by the numeric customer id stored
 * on the customer row; every id asked for has an entry. Asks Shopify 250 at
 * a time, one batch after another, each within 2.5 s. When a batch fails,
 * its buyers and every later one fall back without asking again, so a
 * Shopify that isn't answering costs a page one wait, not one per batch.
 */
export async function customerNames(admin: GraphqlClient, externalIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(externalIds)];
  const names = new Map<string, string>();
  // Only a numeric id can be asked for: one malformed GID fails the whole call
  const askable = unique.filter((id) => /^\d+$/.test(id));

  for (let start = 0; start < askable.length; start += BATCH_SIZE) {
    try {
      const batch = await askBatch(admin, askable.slice(start, start + BATCH_SIZE));
      for (const [id, name] of batch) names.set(id, name);
    } catch (error) {
      if (error instanceof Response) throw error;
      // Why, never a name or a buyer id
      console.warn(
        `[names] Could not read buyer names from Shopify; showing ${askable.length - start} as "Customer ····":`,
        error instanceof Error ? error.message : String(error),
      );
      break;
    }
  }

  return new Map(unique.map((id) => [id, names.get(id) ?? nameFallback(id)]));
}

/** The longest search the Customers page sends, in characters. */
export const SEARCH_MAX = 200;

/**
 * The numeric ids of the customers Shopify's search finds for `text`
 * (RewardsCustomerSearch, within 2.5 s), and whether it found more than one
 * search reads (`more`). Null when Shopify can't say: the page then says so
 * rather than showing everyone. What was searched for is never logged.
 */
export async function searchCustomers(admin: GraphqlClient, text: string): Promise<{ ids: string[]; more: boolean } | null> {
  try {
    const body = (await askShopify(admin, RewardsCustomerSearch, { query: text }, TIMEOUT_MS)) as {
      data?: { customers?: { nodes?: Array<{ id?: unknown } | null> | null; pageInfo?: { hasNextPage?: unknown } | null } | null } | null;
    } | null;
    const customers = body?.data?.customers;
    if (!Array.isArray(customers?.nodes)) throw new Error("RewardsCustomerSearch answered without a nodes list");
    const ids = customers.nodes.flatMap((node) => {
      const match = typeof node?.id === "string" ? /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(node.id) : null;
      return match ? [match[1]] : [];
    });
    return { ids, more: customers.pageInfo?.hasNextPage === true };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.warn("[names] Could not search buyers in Shopify:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
