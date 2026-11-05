import type { ConnectionContext } from "~/lib/merchant.server";
import { type CustomerRow, customerRows } from "~/lib/stats.server";
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
};

/**
 * The buyers `filters` select, with their names: one page, or every page
 * (`allPages`, for the export).
 */
export async function listBuyers(
  admin: GraphqlClient,
  conn: ConnectionContext,
  filters: CustomerFilters,
  o: { allPages?: boolean } = {},
): Promise<Listing> {
  let externalIds: string[] | undefined;
  let searchCut = false;
  if (filters.query !== "") {
    const found = await searchCustomers(admin, filters.query);
    if (!found) return { rows: [], hasNext: false, searchFailed: true, searchCut: false };
    externalIds = found.ids;
    searchCut = found.more;
  }

  const select = { tierId: filters.tierId || undefined, externalIds };
  const now = new Date();
  const rows: CustomerRow[] = [];
  let hasNext: boolean;
  if (o.allPages) {
    // A buyer first seen while the pages are read pushes the rest down one:
    // the buyer it pushes onto the next page is read twice, and kept once
    const seen = new Set<string>();
    for (let page = 1; ; page++) {
      const read = await customerRows(conn, { ...select, page, now });
      for (const row of read.rows) {
        if (!seen.has(row.id)) rows.push(row);
        seen.add(row.id);
      }
      if (!read.hasNext) break;
    }
    hasNext = false;
  } else {
    const read = await customerRows(conn, { ...select, page: filters.page, now });
    rows.push(...read.rows);
    hasNext = read.hasNext;
  }

  const names = await customerNames(
    admin,
    rows.map((row) => row.externalCustomerId),
  );
  return {
    rows: rows.map((row) => ({ ...row, buyer: names.get(row.externalCustomerId)! })),
    hasNext,
    searchFailed: false,
    searchCut,
  };
}
