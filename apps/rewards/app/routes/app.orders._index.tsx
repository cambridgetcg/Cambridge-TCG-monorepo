import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { formatMoney } from "~/admin/format";
import { requireMerchant } from "~/admin/require-merchant.server";
import { TierChip } from "~/admin/TierChip";
import { ERASED_BUYER, STATUS_TONE } from "~/admin/words";
import { orderRows } from "~/lib/stats.server";
import { customerNames } from "~/shopify/names.server";

/**
 * Orders (spec 4.6): the store's recorded orders, 50 to a page, newest
 * first: order, buyer (named live, never stored), the tier and rate its
 * cashback earned at, total, cashback, and status (Issued, Waiting, Taken
 * back, Needs a look, No cashback). `?look=1` keeps the orders with a payout
 * that needs a look; the order panel holds the answers.
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const url = new URL(request.url);
  const asked = Number(url.searchParams.get("page"));
  const page = Number.isSafeInteger(asked) && asked >= 1 ? asked : 1;
  const needsLookOnly = url.searchParams.get("look") === "1";

  const listing = await orderRows(conn, { page, needsLook: needsLookOnly });
  const names = await customerNames(
    admin,
    listing.rows.flatMap((row) => (row.externalCustomerId === null ? [] : [row.externalCustomerId])),
  );

  return {
    page,
    needsLookOnly,
    needsLook: listing.needsLook,
    hasNext: listing.hasNext,
    hasPrevious: page > 1,
    rows: listing.rows.map((row) => ({
      id: row.id,
      name: row.name,
      buyer: row.externalCustomerId === null ? ERASED_BUYER : names.get(row.externalCustomerId)!,
      customerId: row.customerId,
      tierName: row.cashback?.tierName ?? null,
      ratePercent: row.cashback?.ratePercent?.toFixed() ?? null,
      total: formatMoney(row.totalAmount, row.currency),
      cashback: row.cashback ? formatMoney(row.cashback.amount, row.cashback.currency) : null,
      status: row.status.label,
      tone: STATUS_TONE[row.status.key],
      detail: row.status.detail,
    })),
  };
};

/** The page's URL for `page` of the list, keeping the needs-a-look filter. */
function hrefFor(needsLookOnly: boolean, page: number) {
  const params = new URLSearchParams();
  if (needsLookOnly) params.set("look", "1");
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `?${search}` : "?";
}

export default function Orders() {
  const d = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const empty = d.needsLookOnly
    ? "No orders need a look."
    : d.page > 1
      ? "No orders on this page."
      : "No orders yet. Paid orders show here once RewardsPro records them.";

  return (
    <s-page heading="Orders" inlineSize="base">
      {d.needsLook > 0 && !d.needsLookOnly ? (
        <s-banner tone="warning">
          {d.needsLook === 1 ? "1 order needs a look." : `${d.needsLook} orders need a look.`}{" "}
          <s-link href={hrefFor(true, 1)}>Show them</s-link>
        </s-banner>
      ) : null}
      <s-section padding="none">
        <s-table
          paginate
          hasPreviousPage={d.hasPrevious}
          hasNextPage={d.hasNext}
          onPreviousPage={() => navigate(hrefFor(d.needsLookOnly, d.page - 1))}
          onNextPage={() => navigate(hrefFor(d.needsLookOnly, d.page + 1))}
        >
          <s-grid slot="filters" gap="small-200" gridTemplateColumns="auto">
            <s-select
              label="Show"
              labelAccessibilityVisibility="exclusive"
              value={d.needsLookOnly ? "look" : ""}
              onChange={(event) => navigate(hrefFor(event.currentTarget.value === "look", 1))}
            >
              <s-option value="">All orders</s-option>
              <s-option value="look">Needs a look</s-option>
            </s-select>
          </s-grid>
          <s-table-header-row>
            <s-table-header listSlot="primary">Order</s-table-header>
            <s-table-header listSlot="secondary">Buyer</s-table-header>
            <s-table-header>Tier</s-table-header>
            <s-table-header format="currency">Total</s-table-header>
            <s-table-header listSlot="labeled" format="currency">
              Cashback
            </s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {d.rows.map((row) => (
              <s-table-row key={row.id} clickDelegate={`order-${row.id}`}>
                <s-table-cell>
                  <s-link id={`order-${row.id}`} href={`/app/orders/${row.id}`}>
                    {row.name}
                  </s-link>
                </s-table-cell>
                <s-table-cell>{row.buyer}</s-table-cell>
                <s-table-cell>{row.tierName && row.ratePercent ? <TierChip name={row.tierName} percent={row.ratePercent} /> : null}</s-table-cell>
                <s-table-cell>{row.total}</s-table-cell>
                <s-table-cell>{row.cashback ?? "None"}</s-table-cell>
                <s-table-cell>
                  <s-stack gap="small-300">
                    <s-badge tone={row.tone}>{row.status}</s-badge>
                    {row.detail ? <s-text color="subdued">{row.detail}</s-text> : null}
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
      {d.rows.length === 0 ? (
        <s-section>
          <s-text color="subdued">{empty}</s-text>
        </s-section>
      ) : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
