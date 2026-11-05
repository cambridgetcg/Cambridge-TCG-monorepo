import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { formatDay, historyLine, orderLine } from "~/admin/customer-history.server";
import { formatMoney } from "~/admin/format";
import { requireMerchant } from "~/admin/require-merchant.server";
import { TierChip } from "~/admin/TierChip";
import type { ConnectionContext } from "~/lib/merchant.server";
import { PANEL_LIMIT, buyerPanel } from "~/lib/stats.server";
import { TIER_ERRORS, lockTier } from "~/lib/tiers.server";
import { liveBalance } from "~/shopify/live-balance.server";
import { customerNames } from "~/shopify/names.server";

/**
 * The buyer panel (spec 4.4): tier and since when, progress from the same
 * spend that decides the tier, the live store credit balance (none kept;
 * "Shows at checkout" when Shopify can't say in time), cashback history with
 * the tier and rate each entry earned at, and orders. "Lock to a tier" and
 * "Return to automatic" set the manual tier lock. Store credit is adjusted
 * in Shopify's own customer page, which the panel links to.
 */

const WINDOWS = { rolling_12_months: "Last 12 months", lifetime: "All time" } as const;

const notFound = () => new Response("Not found", { status: 404 });

/** The buyer, if they are one of the store's and not erased; a 404 otherwise. */
async function panelOf(conn: ConnectionContext, id: string | undefined, now: Date) {
  const panel = await buyerPanel(conn, id ?? "", now);
  if (!panel) throw notFound();
  return panel;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const panel = await panelOf(conn, params.id, new Date());
  const [names, balance] = await Promise.all([
    customerNames(admin, [panel.externalCustomerId]),
    liveBalance(conn.shop, panel.externalCustomerId, conn.currency, admin),
  ]);
  const money = (amount: { toFixed(): string }) => formatMoney(amount.toFixed(), conn.currency);
  const tier = panel.tiers.find((t) => t.id === panel.tierId) ?? null;

  return {
    id: panel.id,
    buyer: names.get(panel.externalCustomerId)!,
    adminUrl: `shopify://admin/customers/${panel.externalCustomerId}`,
    tier: tier ? { id: tier.id, name: tier.name, percent: tier.cashbackPercent.toFixed() } : null,
    tierSince: tier && panel.tierSince ? formatDay(panel.tierSince, conn.timezone) : null,
    lockedTierId: panel.lockedTierId,
    tiers: panel.tiers.map((t) => ({ id: t.id, name: t.name, percent: t.cashbackPercent.toFixed() })),
    spend: money(panel.spend),
    windowLabel: WINDOWS[conn.tierWindow],
    progress: {
      percent: panel.progress.percent,
      isTop: panel.progress.isTop,
      nextTierName: panel.progress.nextTierName,
      nextTierPercent: panel.progress.nextTierPercent?.toFixed() ?? null,
      amountRemaining: money(panel.progress.amountRemaining),
    },
    balance: balance === null ? null : money(balance),
    history: panel.history.map((entry) => historyLine(entry, conn.timezone)),
    moreHistory: panel.moreHistory,
    orders: panel.orders.map((order) => orderLine(order, conn.timezone)),
    moreOrders: panel.moreOrders,
    limit: PANEL_LIMIT,
  };
};

type ActionResult = { ok: true } | { ok: false; error: string };

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  const panel = await panelOf(conn, params.id, new Date());
  const form = await request.formData();

  switch (form.get("intent")) {
    case "lock": {
      const tierId = form.get("tierId");
      const locked = typeof tierId === "string" && tierId !== "" ? await lockTier(conn.merchantId, panel.id, tierId) : { ok: false };
      // The buyer is the store's (panelOf), so a refusal is the tier's
      return locked.ok ? ({ ok: true } satisfies ActionResult) : ({ ok: false, error: TIER_ERRORS.gone } satisfies ActionResult);
    }
    case "automatic": {
      const { ok } = await lockTier(conn.merchantId, panel.id, null);
      if (!ok) throw notFound();
      return { ok: true } satisfies ActionResult;
    }
    default:
      return data({ ok: false, error: "Unknown action." } satisfies ActionResult, { status: 400 });
  }
};

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "info"> = {
  Issued: "success",
  Waiting: "info",
  "Needs a look": "warning",
  "Taken back": "neutral",
  "No cashback": "neutral",
};

export default function Buyer() {
  const d = useLoaderData<typeof loader>();
  const lockFetcher = useFetcher<typeof action>();
  const lockedTier = d.tiers.find((t) => t.id === d.lockedTierId) ?? null;
  const [chosen, setChosen] = useState(d.tiers.find((t) => t.id !== d.tier?.id)?.id ?? d.tiers[0]?.id ?? "");
  const lockError = lockFetcher.data && !lockFetcher.data.ok ? lockFetcher.data.error : null;

  return (
    <s-page heading={d.buyer} inlineSize="base">
      <s-link slot="breadcrumb-actions" href="/app/customers">
        Customers
      </s-link>
      <s-button slot="secondary-actions" href={d.adminUrl}>
        Adjust store credit in Shopify
      </s-button>

      <s-section heading="Tier">
        <s-stack gap="base">
          {d.tier ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <TierChip name={d.tier.name} percent={d.tier.percent} />
              {d.tierSince ? <s-text color="subdued">In this tier since {d.tierSince}</s-text> : null}
            </s-stack>
          ) : (
            <s-text color="subdued">No tier yet.</s-text>
          )}
          <s-text>
            Spend counted ({d.windowLabel.toLowerCase()}): {d.spend}
          </s-text>
          {d.progress.isTop ? (
            <s-text color="subdued">In the top tier.</s-text>
          ) : d.progress.nextTierName ? (
            <s-stack gap="small-200">
              <s-progress
                value={d.progress.percent}
                max={100}
                accessibilityLabel={`${d.progress.percent}% of the way to ${d.progress.nextTierName}`}
              />
              <s-text color="subdued">
                {d.progress.amountRemaining} more to reach {d.progress.nextTierName} ({d.progress.nextTierPercent}%)
              </s-text>
            </s-stack>
          ) : null}

          {lockedTier ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text>{`Locked to ${lockedTier.name}. Spend doesn't move this buyer.`}</s-text>
              <s-button
                loading={lockFetcher.state !== "idle"}
                onClick={() => lockFetcher.submit({ intent: "automatic" }, { method: "post" })}
              >
                Return to automatic
              </s-button>
            </s-stack>
          ) : d.tiers.length > 0 ? (
            <s-stack direction="inline" gap="small-200" alignItems="end">
              <s-select label="Lock to a tier" value={chosen} onChange={(event) => setChosen(event.currentTarget.value)}>
                {d.tiers.map((t) => (
                  <s-option key={t.id} value={t.id}>
                    {`${t.name} (${t.percent}%)`}
                  </s-option>
                ))}
              </s-select>
              <s-button
                loading={lockFetcher.state !== "idle"}
                onClick={() => lockFetcher.submit({ intent: "lock", tierId: chosen }, { method: "post" })}
              >
                Lock to a tier
              </s-button>
            </s-stack>
          ) : null}
          {lockError ? <s-text tone="critical">{lockError}</s-text> : null}
        </s-stack>
      </s-section>

      <s-section heading="Store credit">
        <s-stack gap="small-200">
          <s-heading>{d.balance ?? "Shows at checkout"}</s-heading>
          <s-text color="subdued">
            {d.balance === null ? "Shopify couldn't say just now. Open the buyer in Shopify to see it." : "As Shopify holds it now, from any source."}
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Cashback history">
        {d.history.length === 0 ? (
          <s-text color="subdued">No cashback yet.</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Entry</s-table-header>
              <s-table-header listSlot="secondary">Order</s-table-header>
              <s-table-header>Tier</s-table-header>
              <s-table-header listSlot="labeled" format="currency">
                Amount
              </s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.history.map((line, i) => (
                <s-table-row key={i}>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      <s-text>{line.label}</s-text>
                      <s-text color="subdued">{line.date}</s-text>
                      {line.detail ? <s-text color="subdued">{line.detail}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{line.orderId ? <s-link href={`/app/orders/${line.orderId}`}>{line.orderName}</s-link> : null}</s-table-cell>
                  <s-table-cell>{line.tierName && line.ratePercent ? <TierChip name={line.tierName} percent={line.ratePercent} /> : null}</s-table-cell>
                  <s-table-cell>{line.amount}</s-table-cell>
                  <s-table-cell>{line.status ? <s-badge tone={STATUS_TONE[line.status] ?? "neutral"}>{line.status}</s-badge> : null}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        {d.moreHistory ? <s-text color="subdued">{`Showing the newest ${d.limit}.`}</s-text> : null}
      </s-section>

      <s-section heading="Orders">
        {d.orders.length === 0 ? (
          <s-text color="subdued">No orders yet.</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header listSlot="secondary">Processed</s-table-header>
              <s-table-header format="currency">Total</s-table-header>
              <s-table-header listSlot="labeled" format="currency">
                Cashback
              </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.orders.map((order) => (
                <s-table-row key={order.id}>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      <s-link href={`/app/orders/${order.id}`}>{order.name}</s-link>
                      {order.note ? <s-text color="subdued">{order.note}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{order.processed}</s-table-cell>
                  <s-table-cell>{order.total}</s-table-cell>
                  <s-table-cell>{order.cashback ?? "None"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        {d.moreOrders ? <s-text color="subdued">{`Showing the newest ${d.limit}.`}</s-text> : null}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
