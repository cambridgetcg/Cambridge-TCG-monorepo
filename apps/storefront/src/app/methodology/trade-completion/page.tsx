import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Trade completion",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function TradeCompletionMethodology() {
  return (
    <>
      <h1>Trade completion</h1>
      <p>
        A P2P trade is <strong>completed</strong> when the escrow chain closes: the card has
        left the seller, the buyer&rsquo;s protection window has run its course, and the
        seller&rsquo;s payout clock can start. There are exactly <strong>three ways</strong> a
        trade completes, and the trade records which one happened
        (<code>market_trades.completed_via</code>).
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>
        <ul>
          <li>Buyer confirm + auto-complete sweep: <code>apps/storefront/src/lib/market/completion.ts</code>.</li>
          <li>Confirm-receipt endpoint: <code>POST /api/market/trades/[id]/received</code>.</li>
          <li>Admin path: <code>updateEscrowStatus</code> in <code>apps/storefront/src/lib/market/db.ts</code>.</li>
          <li>Dispute window per tier: <code>apps/storefront/src/lib/escrow/service-tiers.ts</code>, stamped onto <code>market_trades.dispute_window_hours</code> at trade creation.</li>
          <li>Payout release: <code>apps/storefront/src/lib/payouts/sweep.ts</code> (requires <code>completed</code> + <code>completed_at</code>).</li>
        </ul>
      </blockquote>

      <h2>Path 1 — you confirm receipt (<code>buyer_confirm</code>)</h2>
      <p>
        Once the card has been dispatched to you (<code>shipped_to_buyer</code>), the trade
        page shows a <strong>Confirm received</strong> button. Pressing it:
      </p>
      <ol>
        <li>Marks the escrow <code>completed</code> and stamps <code>completed_at</code> and <code>delivered_at</code>.</li>
        <li>Starts the seller&rsquo;s payout clock (see <a href="/methodology/payout-hold">/methodology/payout-hold</a>).</li>
        <li>Closes the dispute window — if something is wrong with the card, open a dispute <em>before</em> confirming.</li>
        <li>Recomputes both parties&rsquo; trust scores (<a href="/methodology/trust-score">/methodology/trust-score</a>).</li>
      </ol>
      <p>
        This is the only path that records a <code>delivered_at</code> timestamp, because it is
        the only path where anyone actually told us the card arrived. The platform sees
        confirmations, not deliveries — the carrier owns the delivery truth.
      </p>

      <h2>Path 2 — the window lapses (<code>auto_window</code>)</h2>
      <p>
        If you do nothing after dispatch, the trade completes on its own once the
        <strong> dispute window</strong> has elapsed:
      </p>
      <p>
        <code>dispatch time + dispute_window_hours</code>
      </p>
      <p>
        The window is stamped onto the trade at creation from its escrow tier
        (<a href="/methodology/escrow-tier">/methodology/escrow-tier</a>): 48&nbsp;hours for
        Direct Ship, 72 for Verified Ship, 168 (7&nbsp;days) for Full Escrow. Trades created
        before window stamping fall back to their tier&rsquo;s current default. The trade page
        shows your trade&rsquo;s exact auto-complete date while you wait.
      </p>
      <p>The sweep (run by the maintenance cron) will <strong>not</strong> auto-complete a trade that has:</p>
      <ul>
        <li>an open dispute (any status other than resolved/closed),</li>
        <li>an open return request (requested / accepted / shipping / received), or</li>
        <li>a pending cancellation handshake.</li>
      </ul>
      <p>
        Any of those pauses the clock until it resolves. Auto-completion does <em>not</em>{" "}
        verify that the card arrived — it means the protection window passed without anyone
        raising a problem. No <code>delivered_at</code> is recorded on this path.
      </p>

      <h2>Path 3 — an admin closes it (<code>admin</code>)</h2>
      <p>
        Admins can mark a trade completed manually (support cases, dispute resolutions that
        release the seller). This is the same override that existed before the two paths
        above; it now stamps <code>completed_via = &#39;admin&#39;</code> so the record says who
        closed the trade. Dispute resolutions that end in a refund mark the trade{" "}
        <code>refunded</code> instead — that is not a completion.
      </p>

      <h2>What completion starts: the payout clock</h2>
      <p>
        The payout sweep only considers trades that are <code>completed</code> with a{" "}
        <code>completed_at</code> stamp. From that moment the seller&rsquo;s funds wait out
        the trade&rsquo;s <code>payout_hold_days</code> (set by trust tier at trade creation —{" "}
        <a href="/methodology/payout-hold">/methodology/payout-hold</a>), then release
        automatically if the seller has payouts enabled, or wait for a manual admin payout
        otherwise. Confirming receipt earlier starts this clock earlier — that is the honest
        trade-off the confirm button offers.
      </p>

      <h2>What completion ends — and what it doesn&rsquo;t</h2>
      <ul>
        <li>
          <strong>Ends:</strong> the dispute window. Disputes are for problems discovered
          before completion; raise them from the trade page while the trade is in flight.
        </li>
        <li>
          <strong>Doesn&rsquo;t end:</strong> no-fault returns. If the seller&rsquo;s listing
          accepted returns, the return window (<code>return_window_days</code>) runs{" "}
          <em>from completion</em> — completing the trade is what starts it.
        </li>
        <li>
          <strong>Doesn&rsquo;t end:</strong> reviews. Completed (and refunded) trades are
          reviewable by both parties.
        </li>
      </ul>

      <h2>Worked example</h2>
      <p>
        Direct Ship trade, dispatched Monday 14:00 with a 48-hour dispute window. The buyer
        confirms receipt Tuesday 10:00 → trade completes Tuesday 10:00,{" "}
        <code>completed_via = &#39;buyer_confirm&#39;</code>, payout clock starts then. Had the buyer
        done nothing, the sweep would complete it after Wednesday 14:00,{" "}
        <code>completed_via = &#39;auto_window&#39;</code> — later, so the seller is paid later. Had
        the buyer opened a dispute Tuesday, nothing completes until the dispute resolves.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="trade fulfilment loop — how a market trade finishes without an admin, and what each completion path starts and ends"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
          { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
          { label: "/methodology/trust-score", href: "/methodology/trust-score" },
          { label: "/methodology/response-windows", href: "/methodology/response-windows" },
        ]}
      />
    </>
  );
}
