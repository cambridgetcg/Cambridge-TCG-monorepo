import type { LoaderFunctionArgs } from "react-router";

import { filterTiers, listBuyers, readFilters } from "~/admin/customer-list.server";
import { requireMerchant } from "~/admin/require-merchant.server";
import { currencyDecimals, roundMoney } from "~/lib/money";

/**
 * The Customers page's CSV (spec 4.4): one line per buyer the list's
 * filters select, every page of them, as Buyer, Tier, Spend counted (over
 * the tier window) and Cashback given, both in the shop's currency as plain
 * numbers. Names come live from Shopify (customerNames: first and last name
 * only, so no email is ever in the file). Fetched by the page with its
 * session token, never stored.
 */

const HEADER = ["Buyer", "Tier", "Spend counted", "Cashback given"];
/** The byte order mark that tells spreadsheets the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/**
 * One CSV cell. A cell a spreadsheet would read as a formula (starting with
 * = + - or @) starts with a ' first; then a cell holding a comma, quote or
 * line break is quoted, its quotes doubled (RFC 4180). Names and tier names
 * are trimmed, so none starts with a tab or a carriage return.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const tiers = await filterTiers(conn.merchantId);
  const filters = readFilters(new URL(request.url), tiers.map((tier) => tier.id));
  const { rows } = await listBuyers(admin, conn, filters, { allPages: true });

  const decimals = currencyDecimals(conn.currency);
  const amount = (value: Parameters<typeof roundMoney>[0]) => roundMoney(value, conn.currency).toFixed(decimals);
  const lines = [HEADER, ...rows.map((row) => [row.buyer, row.tierName ?? "", amount(row.spend), amount(row.cashbackGiven)])];
  const body = `${BOM}${lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
  // Today in the shop's time zone, as YYYY-MM-DD
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: conn.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
};
