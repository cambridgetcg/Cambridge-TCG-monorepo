import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { listBuyers, filterTiers, readFilters } from "~/admin/customer-list.server";
import { formatMoney } from "~/admin/format";
import { requireMerchant } from "~/admin/require-merchant.server";
import { TierChip } from "~/admin/TierChip";

/**
 * Customers (spec 4.4): search, a tier filter, and a table of buyers (buyer,
 * tier, orders, cashback given), 50 to a page, newest first. The search is
 * Shopify's own, mapped to the buyers RewardsPro knows; names are read live
 * and never stored. Export CSV downloads the same buyers, every page.
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const tiers = await filterTiers(conn.merchantId);
  const filters = readFilters(new URL(request.url), tiers.map((tier) => tier.id));
  const listing = await listBuyers(admin, conn, filters);
  const percentOf = new Map(tiers.map((tier) => [tier.id, tier.percent]));
  const money = (amount: { toFixed(): string }) => formatMoney(amount.toFixed(), conn.currency);

  return {
    query: filters.query,
    tierId: filters.tierId,
    page: filters.page,
    tiers,
    searchFailed: listing.searchFailed,
    searchCut: listing.searchCut,
    hasNext: listing.hasNext,
    hasPrevious: filters.page > 1,
    rows: listing.rows.map((row) => ({
      id: row.id,
      buyer: row.buyer,
      tierName: row.tierName,
      tierPercent: row.tierId ? (percentOf.get(row.tierId) ?? null) : null,
      orders: row.orders,
      cashbackGiven: money(row.cashbackGiven),
    })),
  };
};

/** The page's URL with `changes` applied; any change of filter starts again at page 1. */
function hrefWith(current: { query: string; tierId: string; page: number }, changes: Partial<{ query: string; tierId: string; page: number }>) {
  const next = { ...current, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.tierId) params.set("tier", next.tierId);
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `?${search}` : "?";
}

const DOWNLOAD_FAILED = "The file couldn't be made. Try again.";

export default function Customers() {
  const d = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const current = { query: d.query, tierId: d.tierId, page: d.page };

  // fetch carries App Bridge's session token; a plain link would not
  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      if (d.query) params.set("q", d.query);
      if (d.tierId) params.set("tier", d.tierId);
      const response = await fetch(`/app/customers/export?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "customers.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(DOWNLOAD_FAILED);
    } finally {
      setExporting(false);
    }
  };

  const filtered = d.query !== "" || d.tierId !== "";

  return (
    <s-page heading="Customers" inlineSize="base">
      <s-button slot="secondary-actions" loading={exporting} onClick={() => void download()}>
        Export CSV
      </s-button>
      <s-section padding="none">
        <s-table
          paginate
          hasPreviousPage={d.hasPrevious}
          hasNextPage={d.hasNext}
          onPreviousPage={() => navigate(hrefWith(current, { page: d.page - 1 }))}
          onNextPage={() => navigate(hrefWith(current, { page: d.page + 1 }))}
        >
          <s-grid slot="filters" gap="small-200" gridTemplateColumns="1fr auto">
            <s-search-field
              label="Search buyers"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search by name or email"
              defaultValue={d.query}
              onChange={(event) => navigate(hrefWith(current, { query: event.currentTarget.value.trim() }))}
            />
            <s-select
              label="Tier"
              labelAccessibilityVisibility="exclusive"
              value={d.tierId}
              onChange={(event) => navigate(hrefWith(current, { tierId: event.currentTarget.value }))}
            >
              <s-option value="">All tiers</s-option>
              {d.tiers.map((tier) => (
                <s-option key={tier.id} value={tier.id}>
                  {tier.name}
                </s-option>
              ))}
            </s-select>
          </s-grid>
          <s-table-header-row>
            <s-table-header listSlot="primary">Buyer</s-table-header>
            <s-table-header listSlot="secondary">Tier</s-table-header>
            <s-table-header format="numeric">Orders</s-table-header>
            <s-table-header listSlot="labeled" format="currency">
              Cashback given
            </s-table-header>
          </s-table-header-row>
          <s-table-body>
            {d.rows.map((row) => (
              <s-table-row key={row.id} clickDelegate={`buyer-${row.id}`}>
                <s-table-cell>
                  <s-link id={`buyer-${row.id}`} href={`/app/customers/${row.id}`}>
                    {row.buyer}
                  </s-link>
                </s-table-cell>
                <s-table-cell>{row.tierName && row.tierPercent ? <TierChip name={row.tierName} percent={row.tierPercent} /> : "No tier"}</s-table-cell>
                <s-table-cell>{row.orders}</s-table-cell>
                <s-table-cell>{row.cashbackGiven}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
      {d.searchFailed ? (
        <s-banner tone="warning">{"Shopify didn't answer the search. Try again."}</s-banner>
      ) : d.rows.length === 0 ? (
        <s-section>
          <s-text color="subdued">{filtered ? "No buyers match." : "No buyers yet. They appear here after their first paid order."}</s-text>
        </s-section>
      ) : null}
      {d.searchCut ? <s-text color="subdued">Shopify found more customers than one search reads. Add more words to narrow it.</s-text> : null}
      {exportError ? <s-text tone="critical">{exportError}</s-text> : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
