import type { LoaderFunctionArgs } from "react-router";

import { filterTiers, listBuyers, readFilters } from "~/admin/customer-list.server";
import { requireMerchant } from "~/admin/require-merchant.server";
import { EXPORT_SEARCH_UNREAD, SEARCH_TOO_BROAD } from "~/admin/words";
import { currencyDecimals, roundMoney } from "~/lib/money";

/**
 * The Customers page's CSV (spec 4.4): one line per buyer the list's
 * filters select, every page of them, as Buyer, Tier, Spend counted (over
 * the tier window) and Cashback given, both in the shop's currency, named
 * in their headers (TRUTH-15), as plain numbers. Names come live from
 * Shopify (customerNames: first and last name only, so no email is ever in
 * the file), within EXPORT_NAMES_BUDGET_MS. Fetched by the page with its
 * session token, never stored.
 *
 * Only a complete file is made. A search Shopify couldn't answer is 503, a
 * search Shopify cut short or couldn't read is 422 with words the page shows
 * (Rulings 63, 79), and a tier that isn't the merchant's (deleted in another
 * tab) is 404, never every buyer (BOUNDARY-7).
 */

// Vercel stops the function at 300 s, as the webhook and cron routes set it (M3c-F3)
export const config = { maxDuration: 300 };

/** How long the names of a whole export may take (Ruling 78): a page waits 2.5 s, a file can wait for a throttle, well inside the 300 s. */
const EXPORT_NAMES_BUDGET_MS = 60_000;

/** The byte order mark that tells spreadsheets the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff);
const NO_STORE = "private, no-store";

/** A number the app writes itself: the one cell a spreadsheet may read as it stands (Ruling 58). */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * One CSV cell, always quoted with its quotes doubled (RFC 4180), so a `;`
 * in a name stays inside its cell in spreadsheets whose list separator is
 * `;` (BOUNDARY-1). A cell a spreadsheet would read as a formula (starting
 * with = + - @, a tab or a carriage return) starts with a ' first, except
 * an amount the app formats itself as a plain number (`number`), which stays
 * a number so a spreadsheet can sum it.
 */
function csvCell(value: string, o: { number?: boolean } = {}): string {
  const safe = !(o.number && PLAIN_NUMBER.test(value)) && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

const plainText = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE } });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const tiers = await filterTiers(conn.merchantId);
  const url = new URL(request.url);
  const askedTier = url.searchParams.get("tier") ?? "";
  if (askedTier !== "" && !tiers.some((tier) => tier.id === askedTier)) return plainText("This tier is no longer there.", 404);

  const filters = readFilters(url, tiers.map((tier) => tier.id));
  const { rows, searchFailed, searchCut, searchUnread } = await listBuyers(admin, conn, filters, { allPages: true, namesBudgetMs: EXPORT_NAMES_BUDGET_MS });
  // A failed search is not "no buyers match": answer an error, so the page
  // says the file couldn't be made instead of saving an empty one
  if (searchFailed) return plainText("Shopify didn't answer the search. Try again.", 503);
  if (searchCut) return plainText(SEARCH_TOO_BROAD, 422);
  if (searchUnread) return plainText(EXPORT_SEARCH_UNREAD, 422);

  const decimals = currencyDecimals(conn.currency);
  const amount = (value: Parameters<typeof roundMoney>[0]) => csvCell(roundMoney(value, conn.currency).toFixed(decimals), { number: true });
  const header = ["Buyer", "Tier", `Spend counted (${conn.currency})`, `Cashback given (${conn.currency})`].map((cell) => csvCell(cell));
  const lines = [header, ...rows.map((row) => [csvCell(row.buyer), csvCell(row.tierName ?? ""), amount(row.spend), amount(row.cashbackGiven)])];
  const body = `${BOM}${lines.map((cells) => cells.join(",")).join("\r\n")}\r\n`;
  // Today in the shop's time zone, as YYYY-MM-DD
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: conn.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${today}.csv"`,
      "Cache-Control": NO_STORE,
    },
  });
};
