import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";

import { formatDay } from "~/admin/customer-history.server";
import { notFoundBoundary } from "~/admin/errors";
import { formatMoney } from "~/admin/format";
import { privatePageHeaders } from "~/admin/headers";
import { type AnswerButton, type Look, entryLines, panelNotes, refundLine } from "~/admin/order-panel.server";
import { requireMerchant } from "~/admin/require-merchant.server";
import { TierChip } from "~/admin/TierChip";
import { BUYER_IN_SHOPIFY, ERASED_BUYER, STATUS_TONE } from "~/admin/words";
import { type MerchantAnswer, answerNeedsLook, sendPayout } from "~/lib/payouts.server";
import { orderHasPayout, orderPanel } from "~/lib/stats.server";
import { waitUntil } from "~/lib/wait-until.server";
import { customerNames } from "~/shopify/names.server";
import { railFor } from "~/shopify/rail-for.server";

/**
 * The order panel (spec 4.6): the order, its status, its ledger entries
 * (each payout folded into its entry's row, DESIGN-13) and refunds. The
 * only actions are rule 12's answers to a payout that needs a look, each
 * made through answerNeedsLook (A11), which does all of the money: Shopify
 * refused it or it kept failing, "Retry" or "Close without sending";
 * RewardsPro couldn't confirm it, "It arrived" or "It didn't arrive, send
 * it", after the merchant checks the buyer's store credit in Shopify. A
 * take-back that fell short is information only.
 *
 * Each answer posts the version of the send it was made about, and one made
 * about an earlier send is refused (Ruling 67). Every answer but Retry asks
 * first (Ruling 68). An answer that sends starts the send at once, after the
 * response, through the store's rail, as the webhooks do (Ruling 69); with no
 * usable session the hourly job sends it.
 */

const notFound = () => new Response("Not found", { status: 404 });

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const panel = await orderPanel(conn, params.id ?? "");
  if (!panel) throw notFound();
  const external = panel.externalCustomerId;
  const names = external === null ? new Map<string, string>() : await customerNames(admin, [external]);
  const money = (amount: { toFixed(): string }) => formatMoney(amount.toFixed(), panel.currency);

  return {
    id: panel.id,
    name: panel.name,
    buyer: external === null ? ERASED_BUYER : names.get(external)!,
    customerId: panel.customerId,
    buyerAdminUrl: external === null ? null : `shopify://admin/customers/${external}`,
    processed: formatDay(panel.paidAt, conn.timezone),
    total: money(panel.totalAmount),
    productValue: money(panel.productAmount),
    // Lines for money that wasn't paid that way are left out (DESIGN-13)
    storeCreditUsed: panel.storeCreditUsed.isZero() ? null : money(panel.storeCreditUsed),
    giftCardUsed: panel.giftCardUsed.isZero() ? null : money(panel.giftCardUsed),
    cashbackBase: money(panel.cashbackBase),
    status: panel.status,
    notes: panelNotes(panel),
    entries: entryLines(panel, conn.timezone),
    refunds: panel.refunds.map((refund) => refundLine(refund, panel.currency, conn.timezone)),
  };
};

type ActionResult = { ok: true } | { ok: false; error: string };

const ANSWERS: readonly MerchantAnswer[] = ["retry", "close", "arrived", "not_arrived"];

const CHANGED = "This payment has changed since the page loaded. Reload the page.";

/**
 * Send what an answer left to send, one after another; railFor logs a store
 * with no usable session. One send that fails is logged by its payout's id
 * and the rest still go (M3b-F4); the hourly job sends it later.
 */
async function sendAnswered(connectionId: string, payoutIds: string[]): Promise<void> {
  const way = await railFor(connectionId);
  if (!way) return;
  for (const id of payoutIds) {
    try {
      await sendPayout(id, way.rail);
    } catch (error) {
      console.error(`[orders] Could not send payout ${id} after an answer; the hourly job sends it: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  const form = await request.formData();
  const payoutId = form.get("payoutId");
  // Only a payout of this order, an order of this store
  if (typeof payoutId !== "string" || !(await orderHasPayout(conn, params.id ?? "", payoutId))) throw notFound();

  const answer = form.get("intent");
  if (typeof answer !== "string" || !(ANSWERS as readonly string[]).includes(answer)) {
    return data({ ok: false, error: "Unknown answer." } satisfies ActionResult, { status: 400 });
  }
  const version = form.get("version");
  const answered = await answerNeedsLook(conn.merchantId, payoutId, answer as MerchantAnswer, new Date(), {
    version: typeof version === "string" ? version : null,
  });
  if (answered.ok) {
    if (answered.sendNow.length > 0) waitUntil(sendAnswered(conn.connectionId, answered.sendNow));
    return { ok: true } satisfies ActionResult;
  }
  if (answered.reason === "not_found") throw notFound();
  // Answered already, or no longer waiting for this answer
  return { ok: false, error: CHANGED } satisfies ActionResult;
};

/**
 * One payout that needs a look, with its two answers. Retry posts at once;
 * the other answers open the banner's modal, which says what the answer does,
 * and only its confirm button posts.
 */
function LookBanner({ payoutId, look, buyerAdminUrl }: { payoutId: string; look: Look; buyerAdminUrl: string | null }) {
  const fetcher = useFetcher<typeof action>();
  const modal = useRef<HTMLElementTagNameMap["s-modal"]>(null);
  // The answer the modal asks about, with the version showing when it opened (M3b-F2)
  const [asking, setAsking] = useState<{ button: AnswerButton; version: string } | null>(null);
  const modalId = `confirm-${payoutId}`;
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  // One answer at a time, about the send it was made about
  const post = (answer: MerchantAnswer, version: string) => {
    if (busy) return;
    fetcher.submit({ intent: answer, payoutId, version }, { method: "post" });
  };

  // Answered (or refused): the banner says what happened
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) modal.current?.hideOverlay?.();
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <s-banner tone="warning" heading={look.heading}>
        <s-stack gap="small-200">
          {look.text ? <s-text>{look.text}</s-text> : null}
          {look.hint ? <s-text>{look.hint}</s-text> : null}
          {look.hint && buyerAdminUrl ? (
            <s-link href={buyerAdminUrl} target="_top">
              {BUYER_IN_SHOPIFY}
            </s-link>
          ) : null}
          {error ? <s-text tone="critical">{error}</s-text> : null}
        </s-stack>
        {look.answers.map((button) =>
          button.confirm ? (
            <s-button
              key={button.answer}
              slot="secondary-actions"
              variant="secondary"
              disabled={busy}
              commandFor={modalId}
              command="--show"
              onClick={() => setAsking({ button, version: look.version })}
            >
              {button.label}
            </s-button>
          ) : (
            <s-button key={button.answer} slot="secondary-actions" variant="secondary" disabled={busy} onClick={() => post(button.answer, look.version)}>
              {button.label}
            </s-button>
          ),
        )}
      </s-banner>
      <s-modal id={modalId} ref={modal} heading={asking?.button.confirm?.heading ?? look.heading}>
        <s-paragraph>{asking?.button.confirm?.text}</s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone={asking?.button.confirm?.critical ? "critical" : "auto"}
          loading={busy}
          onClick={() => asking && post(asking.button.answer, asking.version)}
        >
          {asking?.button.label}
        </s-button>
        <s-button slot="secondary-actions" commandFor={modalId} command="--hide">
          Cancel
        </s-button>
      </s-modal>
    </>
  );
}

export default function Order() {
  const d = useLoaderData<typeof loader>();
  const looks = d.entries.flatMap((entry) => (entry.look && entry.payoutId ? [{ id: entry.payoutId, look: entry.look }] : []));

  return (
    <s-page heading={d.name} inlineSize="base">
      <s-link slot="breadcrumb-actions" href="/app/orders">
        Orders
      </s-link>

      {/* One stack, so two banners at once stand apart (M3d-F6); a closed modal takes no room */}
      {looks.length > 0 ? (
        <s-stack slot="supplemental-start" gap="base">
          {looks.map(({ id, look }) => (
            <LookBanner key={id} payoutId={id} look={look} buyerAdminUrl={d.buyerAdminUrl} />
          ))}
        </s-stack>
      ) : null}

      <s-section heading="Order">
        <s-stack gap="small-200">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone={STATUS_TONE[d.status.key]}>{d.status.label}</s-badge>
            {d.status.detail ? <s-text color="subdued">{d.status.detail}</s-text> : null}
          </s-stack>
          <s-text>Buyer: {d.customerId ? <s-link href={`/app/customers/${d.customerId}`}>{d.buyer}</s-link> : d.buyer}</s-text>
          <s-text>Processed: {d.processed}</s-text>
          <s-text>Total: {d.total}</s-text>
          <s-text>Products after discounts: {d.productValue}</s-text>
          {d.storeCreditUsed ? <s-text>Paid with store credit: {d.storeCreditUsed}</s-text> : null}
          {d.giftCardUsed ? <s-text>Paid with gift cards: {d.giftCardUsed}</s-text> : null}
          <s-text>Earns cashback on: {d.cashbackBase}</s-text>
          {d.notes.map((note) => (
            <s-text key={note} color="subdued">
              {note}
            </s-text>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Cashback and take-backs">
        {d.entries.length === 0 ? (
          <s-text color="subdued">No cashback on this order.</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Entry</s-table-header>
              <s-table-header>Tier</s-table-header>
              <s-table-header listSlot="labeled" format="currency">
                Amount
              </s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.entries.map((line, i) => (
                <s-table-row key={i}>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      <s-text>{line.label}</s-text>
                      <s-text color="subdued">{line.date}</s-text>
                      {line.detail ? <s-text color="subdued">{line.detail}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{line.tierName && line.ratePercent ? <TierChip name={line.tierName} percent={line.ratePercent} /> : null}</s-table-cell>
                  <s-table-cell>{line.amount}</s-table-cell>
                  <s-table-cell>
                    {line.status && line.tone ? (
                      <s-stack gap="small-300">
                        <s-badge tone={line.tone}>{line.status}</s-badge>
                        {line.payout ? <s-text color="subdued">{line.payout}</s-text> : null}
                      </s-stack>
                    ) : null}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Refunds">
        {d.refunds.length === 0 ? (
          <s-text color="subdued">No refunds yet.</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Refunded</s-table-header>
              <s-table-header format="currency">Products returned</s-table-header>
              <s-table-header listSlot="labeled" format="currency">
                Cashback taken back
              </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.refunds.map((refund, i) => (
                <s-table-row key={i}>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      <s-text>{refund.date}</s-text>
                      {refund.note ? <s-text color="subdued">{refund.note}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{refund.productValue}</s-table-cell>
                  <s-table-cell>{refund.takenBack ?? "None"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = privatePageHeaders;

// A 404 (not the store's, erased, or no such id) inside the admin, with the way back (A21 concern 4)
export const ErrorBoundary = notFoundBoundary("This order isn't here.", { href: "/app/orders", label: "Orders" });
