import type { ConnectionContext } from "~/lib/merchant.server";
import { type CustomerCursor, type CustomerRow, customerRows } from "~/lib/stats.server";
import { tierTable } from "~/lib/tiers.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { SEARCH_MAX, customerNames, searchCustomers } from "~/shopify/names.server";

/**
 * What the Customers list and its CSV export share (spec 4.4): the filters
 * in the page's URL (`q` the search, `tier` a tier id, `page` from 1), the
 * search through Shopify mapped to the buyers RewardsPro knows, and each
 * buyer's live name. Names are read for the request and never kept.
 */

export type CustomerFilters = { query: string; tierId: string; page: number };

export type ListedBuyer = CustomerRow & { buyer: string };

/** The merchant's tiers, lowest first, for the filter and the rows' tier chips. */
export async function filterTiers(merchantId: string): Promise<Array<{ id: string; name: string; percent: string }>> {
  return (await tierTable(merchantId)).map((tier) => ({ id: tier.id, name: tier.name, percent: tier.cashbackPercent.toFixed() }));
}

/**
 * The filters a URL asks for: the search trimmed (at most SEARCH_MAX
 * characters), a tier only when it is one of `tierIds` (anything else is no
 * filter), and a page from 1.
 */
export function readFilters(url: URL, tierIds: string[]): CustomerFilters {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, SEARCH_MAX);
  const tier = url.searchParams.get("tier") ?? "";
  const page = Number(url.searchParams.get("page"));
  return { query, tierId: tierIds.includes(tier) ? tier : "", page: Number.isSafeInteger(page) && page >= 1 ? page : 1 };
}

export type Listing = {
  rows: ListedBuyer[];
  hasNext: boolean;
  /** Shopify couldn't search: no one is shown */
  searchFailed: boolean;
  /** Shopify found more customers than one search reads */
  searchCut: boolean;
  /** Shopify warned it couldn't read the search (BOUNDARY-5) */
  searchUnread: boolean;
};

/**
 * The buyers `filters` select, with their names: one page, or every page
 * (`allPages`, for the export), read by keyset (CONCURRENCY-5). A search
 * Shopify cut short gives the export no rows at all: a file of part of the
 * matches would pass for all of them (Ruling 63). `namesBudgetMs` is how long
 * the names may take in all (customerNames; a page's default otherwise).
 */
export async function listBuyers(
  admin: GraphqlClient,
  conn: ConnectionContext,
  filters: CustomerFilters,
  o: { allPages?: boolean; namesBudgetMs?: number } = {},
): Promise<Listing> {
  let externalIds: string[] | undefined;
  let searchCut = false;
  let searchUnread = false;
  if (filters.query !== "") {
    const found = await searchCustomers(admin, filters.query);
    if (!found) return { rows: [], hasNext: false, searchFailed: true, searchCut: false, searchUnread: false };
    externalIds = found.ids;
    searchCut = found.more;
    searchUnread = found.unread;
    if (o.allPages && searchCut) return { rows: [], hasNext: false, searchFailed: false, searchCut, searchUnread };
  }

  const select = { tierId: filters.tierId || undefined, externalIds };
  const now = new Date();
  const rows: CustomerRow[] = [];
  let hasNext: boolean;
  if (o.allPages) {
    // Each page starts after the last buyer read, so a buyer leaving the
    // filter meanwhile can't slide another past the reader. A buyer first
    // seen meanwhile sorts before the cursor and isn't in the file: they
    // weren't a buyer when the export began.
    let after: CustomerCursor | undefined;
    do {
      const read = await customerRows(conn, { ...select, page: 1, after, now });
      rows.push(...read.rows);
      after = read.next;
    } while (after);
    hasNext = false;
  } else {
    const read = await customerRows(conn, { ...select, page: filters.page, now });
    rows.push(...read.rows);
    hasNext = read.hasNext;
  }

  const names = await customerNames(
    admin,
    rows.map((row) => row.externalCustomerId),
    { budgetMs: o.namesBudgetMs },
  );
  return {
    rows: rows.map((row) => ({ ...row, buyer: names.get(row.externalCustomerId)! })),
    hasNext,
    searchFailed: false,
    searchCut,
    searchUnread,
  };
}
