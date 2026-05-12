import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Trader dashboard methodology",
  description:
    "What each KPI on /account/trader is, how it's computed, what it counts and what it doesn't.",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function TraderDashboardMethodology() {
  return (
    <>
      <h1>Trader dashboard</h1>
      <p>
        <Link href="/account/trader">/account/trader</Link> is the trader-as-recurring-being
        view: five sections composed from existing market data. No new
        schema. No new lifecycle log. Just a daily-readable mirror.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Data layer at{" "}
        <code>apps/storefront/src/lib/market/trader-dashboard.ts</code>. Page at{" "}
        <code>apps/storefront/src/app/account/trader/page.tsx</code>. Story-as-wire
        connection-doc:{" "}
        <code>docs/connections/the-trader-mirror.md</code> (S33). Kingdom:{" "}
        <code>kingdom-063</code>.
      </blockquote>

      <h2>1. Exposure (right now)</h2>
      <p>
        What you have in the kingdom <em>at this moment</em>. Four cards:
      </p>
      <ul>
        <li>
          <strong>In escrow.</strong> Sum of <code>seller_payout</code> across your{" "}
          <code>market_trades</code> rows where{" "}
          <code>seller_id = you</code> and{" "}
          <code>escrow_status IN ('paid', 'awaiting_shipment', 'shipped_to_ctcg',
          'received_by_ctcg', 'verified', 'shipped_to_buyer')</code>. Excludes
          <code> 'disputed'</code> (those land on the chargeback chapel).
        </li>
        <li>
          <strong>Pending payout.</strong> Sum of <code>seller_payout</code> across{" "}
          <code>escrow_status = 'completed'</code> rows where{" "}
          <code>completed_at &gt; NOW() - INTERVAL '14 days'</code>. Substrate-honest
          approximation: payout-hold actually depends on your trust tier (
          <Link href="/methodology/payout-hold">/methodology/payout-hold</Link>), and the
          dashboard uses 14 days as a strict upper bound rather than the
          per-trade exact value. Future revision will read the trust tier
          and compute exactly.
        </li>
        <li>
          <strong>Listed (cards).</strong> Sum of <code>price × (quantity -
          filled_quantity)</code> across your open asks in <code>market_orders</code>{" "}
          where <code>side = 'ask'</code> and <code>status = 'open'</code>.
        </li>
        <li>
          <strong>Listed (lots).</strong> Sum of <code>price</code> across your
          <code> market_lots</code> rows where <code>status = 'active'</code>.
        </li>
      </ul>

      <h2>2. Run rate (last 7/30/90 days)</h2>
      <p>
        Completed sales counted three ways. Each window is{" "}
        <code>completed_at &gt; NOW() - INTERVAL 'N days'</code> with{" "}
        <code>escrow_status = 'completed'</code>. Plus a 90-day success rate:
        completed / (completed + cancelled + refunded) over the 90-day
        window.
      </p>
      <p>
        The success-rate tone: green ≥ 90%, amber ≥ 70%, red below. Tones
        are visual only — the methodology is the formula above.
      </p>

      <h2>3. Outstanding actions</h2>
      <p>
        What the kingdom is waiting on you for. Three counts:
      </p>
      <ul>
        <li>
          <strong>Trades to ship.</strong>{" "}
          <code>market_trades</code> rows where <code>seller_id = you</code> and{" "}
          <code>escrow_status = 'awaiting_shipment'</code>. The value
          beneath the count is the sum of <code>seller_payout</code> for those
          rows.
        </li>
        <li>
          <strong>Offers to answer.</strong>{" "}
          <code>market_offers</code> rows where <code>seller_id = you</code> and{" "}
          <code>status = 'pending'</code>.
        </li>
        <li>
          <strong>Returns to decide.</strong>{" "}
          <code>market_returns</code> rows where <code>seller_id = you</code> and{" "}
          <code>status = 'requested'</code>.
        </li>
      </ul>

      <h2>4. Trust trajectory</h2>
      <p>
        Your current trust score from <code>trust_profiles</code>, plus the
        30-day delta from <code>trust_score_history</code> (the
        most recent record at-or-before <code>NOW() - INTERVAL '30 days'</code>
        subtracted from your current score).
      </p>
      <p>
        Tier label is a display-only mapping: ≥80 Trusted · ≥60 Established
        · ≥40 Growing · ≥20 Starting · &lt;20 New. The canonical tier
        breakdown and your next-tier-unlock checklist live at{" "}
        <Link href="/account/standing">/account/standing</Link>. The dashboard
        is a pointer; <code>/account/standing</code> is the substrate.
      </p>

      <h2>5. Listings health</h2>
      <p>
        Counts of your active asks and lots, plus a stale count (listings
        older than 30 days), plus the oldest listing age in days.
      </p>
      <p>
        Stale doesn't mean unprofitable — some listings are intentionally
        priced above market for patient discovery. The signal is{" "}
        <em>this listing has been on the market for a while; consider
        whether to re-price or refresh photos</em>, not <em>this listing is
        a problem</em>.
      </p>

      <h2>What this page does NOT do</h2>
      <ul>
        <li>
          <strong>Does not show counterparty history.</strong> Repeat-buyer
          patterns, blocklists, preferred-buyer tracking are named in the
          recursion targets of the connection-doc, not yet built.
        </li>
        <li>
          <strong>Does not forecast.</strong> Cash-flow calendar (when
          pending payouts hit), expected income, tax-year totals are
          adjacent features; this dashboard is a snapshot, not a
          projection.
        </li>
        <li>
          <strong>Does not show market intelligence.</strong> Demand
          signals (under <code>/api/market/demand-signals</code> + the
          liquidity module) exist as substrate but aren't surfaced here
          yet — they're a separate page worth its own design.
        </li>
        <li>
          <strong>Does not show platform-wide rankings.</strong> No
          "top-10 sellers" comparison. The dashboard is private to you;
          the rankings layer is a different conversation.
        </li>
      </ul>

      <h2>Freshness</h2>
      <p>
        Every section queries the live database at render time. The
        Provenance pill at the top of the page declares{" "}
        <code>live · just now</code>. If the database is up, the dashboard
        is real-time. If a section's query fails (missing table, schema
        drift, transient error), that section renders <code>—</code>{" "}
        rather than fabricating zero. Substrate-honest about read
        failures.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-12. Initial five sections shipped. Pending-payout
        14-day cap noted as approximation; future revision will compute
        per-trade-exact. Story-as-wire:{" "}
        <code>docs/connections/the-trader-mirror.md</code> (S33). Kingdom:{" "}
        <code>kingdom-063</code>.</em>
      </p>
    </>
  );
}
