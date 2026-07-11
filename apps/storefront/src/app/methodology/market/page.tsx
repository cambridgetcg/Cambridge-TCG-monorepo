import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Market methodology",
  description:
    "How Cambridge TCG separates deliberate public order intent from private person and completed-trade data.",
  other: audienceMetadata("public-documentation", ["methodology", "market"]),
};

export default function MarketMethodology() {
  return (
    <>
      <h1>Market</h1>
      <p>
        The interactive <Link href="/market/x">/market/[sku]</Link> and the
        read-only <Link href="/cards/x/market">/cards/[sku]/market</Link>{" "}
        share one public boundary. Open bid and ask terms are deliberate market
        intent. Completed trades, watches, alerts, and co-watch relationships
        are private activity unless people make a separate, informed choice to
        publish them for that purpose.
      </p>

      <blockquote>
        A public profile or a public order is not permission to publish a
        person&rsquo;s transaction history, financial ranking, watch activity,
        alert activity, or inferred interests.
      </blockquote>

      <h2 id="orderbook">Open order book</h2>
      <p>
        Bids and asks are deliberate offers. The public book groups open or
        partially filled orders by price and side. Quantity is{" "}
        <code>SUM(quantity - filled_quantity)</code>; best bid is the highest
        bid, best ask is the lowest ask, and spread is best ask minus best bid.
        The card mirror also groups remaining quantity by NM, LP, MP, or HP.
      </p>
      <p>
        The public book does not publish the account behind an order or a
        reputation dossier. Contact, payment, delivery, and counterparty
        context stay inside the relevant signed-in listing or trade flow.
      </p>

      <h2 id="trade-history">Completed-trade data</h2>
      <p>
        Public completed-trade history, candles, fair-value statistics,
        card-activity rankings, and completion statistics are paused. A rule
        such as &ldquo;show the value after three trades&rdquo; is not enough:
        it does not provide publication consent, and small counts, minimums,
        maximums, medians, or changes between windows can reveal the underlying
        transactions.
      </p>
      <p>
        The public market pages therefore do not render a completed-trade tape,
        VWAP, median, range, volume, last price, movement, or completion rate.
        Their absence means publication is paused; it does not mean no trades
        happened.
      </p>

      <h2 id="person-signals">Watches and alerts</h2>
      <p>
        A signed-in collector may still use their own watchlist and price
        alerts as private account tools. Public watch counts, alert counts,
        &ldquo;most watched&rdquo; lists, demand signals, and co-watch
        recommendations are paused. Multiple controlled accounts can expose a
        third person even when a count is hidden below a small threshold.
      </p>

      <h2 id="pulse">Market Pulse and rankings</h2>
      <p>
        Market Pulse currently shows only spreads computed from deliberate open
        bids and asks. Transaction movement, trade volume, watch intelligence,
        and completed-trade daily rows are paused. Human rankings and
        card rankings derived from completed trades are also paused.
      </p>

      <h2 id="history">Reference price history</h2>
      <p>
        The 7, 30, 90, and 365-day charts read daily observations from{" "}
        <code>card_price_history</code>. These are non-person catalogue and
        order-book reference observations, not records of a person&rsquo;s
        completed trade. A gap means no observation was captured that day.
      </p>

      <h2 id="resume">What publication requires</h2>
      <p>
        Person-derived or completed-trade summaries can return only after the
        platform has versioned, purpose-specific publication receipts and one
        central publication process. That process must use fixed periods,
        delay release, publish coarse values, resist comparisons between nearby
        queries, and withdraw data when its permission no longer holds.
      </p>

      <h2>Freshness and failure</h2>
      <p>
        Open order intent and reference observations are read from their live
        sources. If a query fails, its section renders unavailable rather than
        inventing a zero. The provenance timestamp says when the read occurred;
        it is not a transaction-event timestamp.
      </p>

      <h2>Change history</h2>
      <p>
        <em>
          v3 - 2026-07-11. Paused all public completed-trade and person-derived
          market summaries after finding that a small-record threshold did not
          establish consent and did not prevent reconstruction.
        </em>
      </p>
      <p>
        <em>
          v2 - 2026-07-11. Removed direct person identifiers, exact trade events,
          seller dossiers, and arbitrary candidate-price analysis. Its
          thresholded aggregate design is retained as history, not as the live
          contract.
        </em>
      </p>
      <p>
        <em>
          v1 - 2026-05-12. Initial market mirror shipped. Story-as-wire:{" "}
          <code>docs/connections/the-market-mirror.md</code> (S35).
        </em>
      </p>
    </>
  );
}
