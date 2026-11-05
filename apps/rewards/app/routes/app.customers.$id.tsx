import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";

import { formatDay, historyLine, orderLine } from "~/admin/customer-history.server";
import { notFoundBoundary } from "~/admin/errors";
import { formatMoney } from "~/admin/format";
import { privatePageHeaders } from "~/admin/headers";
import { requireMerchant } from "~/admin/require-merchant.server";
import { TierChip } from "~/admin/TierChip";
import { BUYER_IN_SHOPIFY, LOCK, NO_TIER } from "~/admin/words";
import type { ConnectionContext } from "~/lib/merchant.server";
import { PANEL_LIMIT, buyerPanel, ownBuyer } from "~/lib/stats.server";
import { TIER_ERRORS, lockTier } from "~/lib/tiers.server";
import { balanceLines, liveBalance } from "~/shopify/live-balance.server";
import { customerNames } from "~/shopify/names.server";

/**
 * The buyer panel (spec 4.4): tier and since when, progress from the same
 * spend that decides the tier (none for a locked buyer; a buyer who already
 * qualifies for a higher tier is told they move at the next update), the
 * live store credit balance read fresh, one line per currency (none kept;
 * "Shows at checkout" when Shopify can't say in time, Ruling 66), cashback
 * history with the tier and rate each entry earned at, and orders with their
 * status. "Lock to a tier" and "Return to automatic" set the manual tier
 * lock. Store credit is adjusted in Shopify's own customer page, which the
 * panel links to.
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
    // "Now" on the page, so never a cached answer (A21-F6)
    liveBalance(conn.shop, panel.externalCustomerId, admin, { fresh: true }),
  ]);
  const balances = balanceLines(balance, [conn.currency, ...panel.currencies]);
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
      movesTo: panel.movesTo,
    },
    balances: balances === null ? null : balances.map((line) => ({ currency: line.currency, amount: formatMoney(line.amount.toFixed(), line.currency) })),
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
  // The buyer is the store's: one light read, not the panel (A21-F5)
  const buyer = await ownBuyer(conn, params.id ?? "");
  if (!buyer) throw notFound();
  const form = await request.formData();

  switch (form.get("intent")) {
    case "lock": {
      const tierId = form.get("tierId");
      // A lock that names no tier is no lock (BOUNDARY-6); one that names a tier the merchant hasn't is gone
      if (typeof tierId !== "string" || tierId === "") {
        return data({ ok: false, error: "Unknown action." } satisfies ActionResult, { status: 400 });
      }
      const locked = await lockTier(conn.merchantId, buyer.id, tierId);
      // The buyer is the store's (ownBuyer), so a refusal is the tier's
      return locked.ok ? ({ ok: true } satisfies ActionResult) : ({ ok: false, error: TIER_ERRORS.gone } satisfies ActionResult);
    }
    case "automatic": {
      const { ok } = await lockTier(conn.merchantId, buyer.id, null);
      if (!ok) throw notFound();
      return { ok: true } satisfies ActionResult;
    }
    default:
      return data({ ok: false, error: "Unknown action." } satisfies ActionResult, { status: 400 });
  }
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
      <s-button slot="secondary-actions" href={d.adminUrl} target="_top">
        {BUYER_IN_SHOPIFY}
      </s-button>

      <s-section heading="Tier">
        <s-stack gap="base">
          {d.tier ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <TierChip name={d.tier.name} percent={d.tier.percent} />
              {d.tierSince ? <s-text color="subdued">In this tier since {d.tierSince}</s-text> : null}
            </s-stack>
          ) : (
            <s-text color="subdued">{NO_TIER}</s-text>
          )}
          <s-text>
            Spend counted ({d.windowLabel.toLowerCase()}): {d.spend}
          </s-text>
          {lockedTier ? (
            // Spend doesn't move a locked buyer, so there is no progress to show (A21-F2)
            <s-text color="subdued">{`Spend doesn't move this buyer while they're locked to ${lockedTier.name}.`}</s-text>
          ) : d.progress.isTop ? (
            <s-text color="subdued">In the top tier.</s-text>
          ) : d.progress.movesTo ? (
            // The tier pass hasn't reached them yet (TRUTH-11)
            <s-text color="subdued">{`Moves to ${d.progress.movesTo} at the next tier update.`}</s-text>
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
              <s-text>{`Locked to ${lockedTier.name}.`}</s-text>
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
                {LOCK}
              </s-button>
            </s-stack>
          ) : null}
          {lockError ? <s-text tone="critical">{lockError}</s-text> : null}
        </s-stack>
      </s-section>

      <s-section heading="Store credit">
        <s-stack gap="small-200">
          {/* Amounts as figures, not headings (DESIGN-10) */}
          {d.balances === null ? (
            <s-text>Shows at checkout</s-text>
          ) : (
            d.balances.map((line) => (
              <s-number key={line.currency} fontSize="large" fontWeight="bold">
                {line.amount}
              </s-number>
            ))
          )}
          <s-text color="subdued">
            {d.balances === null ? `Shopify couldn't say just now. ${BUYER_IN_SHOPIFY} to see it.` : "As Shopify holds it now, from any source."}
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
                  <s-table-cell>{line.status && line.tone ? <s-badge tone={line.tone}>{line.status}</s-badge> : null}</s-table-cell>
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
              <s-table-header listSlot="inline">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.orders.map((order) => (
                <s-table-row key={order.id}>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      <s-link href={`/app/orders/${order.id}`}>{order.name}</s-link>
                      {order.notes.map((note) => (
                        <s-text key={note} color="subdued">
                          {note}
                        </s-text>
                      ))}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{order.processed}</s-table-cell>
                  <s-table-cell>{order.total}</s-table-cell>
                  <s-table-cell>{order.cashback ?? "None"}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={order.tone}>{order.status}</s-badge>
                  </s-table-cell>
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

export const headers = privatePageHeaders;

// A 404 (not the store's, erased, or no such id) inside the admin, with the way back (A21 concern 4)
export const ErrorBoundary = notFoundBoundary("This buyer isn't here.", { href: "/app/customers", label: "Customers" });
