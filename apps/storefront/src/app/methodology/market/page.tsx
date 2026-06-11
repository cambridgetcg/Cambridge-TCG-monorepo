import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Market mirror methodology",
  description:
    "What each section on /cards/[sku]/market is, how it's computed, what counterparty trust means, why conditions are not collapsed.",
  other: audienceMetadata("public-documentation", ["methodology", "market"]),
};

export default function MarketMethodology() {
  return (
    <>
      <h1>Market mirror</h1>
      <p>
        <Link href="/cards/x/market">/cards/[sku]/market</Link> is the substrate-honest,
        public, no-auth pure-read mirror of one card&rsquo;s market activity.
        Same data as the interactive <Link href="/market/x">/market/[sku]</Link>{" "}
        surface; different audience.
      </p>
      <p>
        Read this page when a number on the mirror is unclear — every value
        is named here with its formula, its data source, and the
        approximations the platform admits to.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Data composer at{" "}
        <code>apps/storefront/src/lib/market/card-market.ts</code>. Page at{" "}
        <code>apps/storefront/src/app/cards/[sku]/market/page.tsx</code>.
        Story-as-wire connection-doc:{" "}
        <code>docs/connections/the-market-mirror.md</code> (S35).{" "}
        Kingdom: <code>kingdom-067</code>.
      </blockquote>

      <h2 id="orderbook">1. Order book</h2>
      <p>
        Top 10 price levels per side. Bids descending (highest first); asks
        ascending (lowest first). Each row aggregates open orders at a
        given price across all conditions, then breaks the quantity down
        by condition inline.
      </p>
      <ul>
        <li>
          <strong>Quantity</strong> = SUM(<code>quantity - filled_quantity</code>) across all{" "}
          <code>market_orders</code> rows where{" "}
          <code>sku = $sku AND side = &lsquo;bid&rsquo;</code> (or{" "}
          <code>&lsquo;ask&rsquo;</code>) AND{" "}
          <code>status IN (&lsquo;open&rsquo;, &lsquo;partially_filled&rsquo;)</code>.
        </li>
        <li>
          <strong>By-condition breakdown</strong> = sub-aggregate at the
          same price, grouped by <code>condition</code> (NM / LP / MP / HP).
          *NM and LP at the same price are different goods.*
        </li>
        <li>
          <strong>Best bid</strong> = highest bid price across all conditions.
          <strong> Best ask</strong> = lowest ask price across all conditions.
          <strong> Spread</strong> = best ask − best bid (or <code>—</code>{" "}
          if either side is empty).
        </li>
      </ul>

      <h2 id="stats">2. Aggregate stats</h2>
      <p>
        Window: last 30 days, completed trades only.
      </p>
      <ul>
        <li>
          <strong>30d VWAP</strong> (volume-weighted average price) ={" "}
          <code>SUM(price × quantity) / SUM(quantity)</code> across{" "}
          <code>market_trades</code> where{" "}
          <code>escrow_status = &lsquo;completed&rsquo;</code> AND{" "}
          <code>created_at &gt; NOW() − 30 days</code>.
        </li>
        <li>
          <strong>30d median</strong> ={" "}
          <code>percentile_cont(0.5) WITHIN GROUP (ORDER BY price)</code>{" "}
          on the same window. Robust to outliers.
        </li>
        <li>
          <strong>30d volume</strong> = SUM(<code>quantity</code>).
        </li>
        <li>
          <strong>30d range</strong> = MIN(price) — MAX(price).
        </li>
        <li>
          <strong>Last trade</strong> = most recent <code>completed</code> trade,
          its <code>price</code> and{" "}
          <code>COALESCE(completed_at, created_at)</code>.
        </li>
        <li>
          <strong>Completion rate (90d)</strong> ={" "}
          <code>completed / (completed + cancelled + refunded)</code>{" "}
          over the last 90 days. Tells the reader how often trades on this
          SKU actually finish.
        </li>
      </ul>

      <h2 id="tape">3. The tape (last 20 trades)</h2>
      <p>
        The last 20 completed trades, ordered by{" "}
        <code>COALESCE(completed_at, created_at) DESC</code>. Each row
        shows price, quantity, seller trust tier, and time-since.
      </p>
      <p>
        <strong>Seller trust tier</strong> is resolved by joining{" "}
        <code>trust_profiles</code> on{" "}
        <code>user_id = seller_id</code> at read time. Tier bands:
      </p>
      <ul>
        <li><strong>Elite</strong> — trust score ≥ 95</li>
        <li><strong>Veteran</strong> — ≥ 80</li>
        <li><strong>Trusted</strong> — ≥ 50</li>
        <li><strong>Starter</strong> — ≥ 20</li>
        <li><strong>New</strong> — &lt; 20</li>
      </ul>
      <p>
        Same bands as the commission-rate engine reads (
        <Link href="/methodology/commission-rate">/methodology/commission-rate</Link>
        ). The tier is a *display projection* of the trust score; the
        canonical detail lives at{" "}
        <Link href="/methodology/trust-score">/methodology/trust-score</Link>.
      </p>
      <p>
        <strong>Anonymisation:</strong> the platform does not publish
        seller identities on this page. A short opaque id (
        <code>#</code> + last 6 chars of the seller&rsquo;s user_id) is
        rendered so the reader can correlate within the tape (&ldquo;the
        same seller did three of these&rdquo;) without learning who they are.
        The interactive <Link href="/market/x">/market/[sku]</Link>{" "}
        page links seller usernames when public; that&rsquo;s a different
        audience choice for a different surface.
      </p>

      <h2 id="history">4. Price history</h2>
      <p>
        Four windows side-by-side: 7 / 30 / 90 / 365 days. Each independently
        queried from <code>card_price_history</code> (the storefront&rsquo;s
        daily retail observation table — renamed to{" "}
        <code>retail_price_observation</code> per kingdom-049 Phase 4 in the
        migration ledger; the data layer still reads under the original name
        in active routes).
      </p>
      <p>
        Each row carries <code>captured_on</code>, <code>spot_gbp</code>{" "}
        (what the storefront showed customers), and optionally{" "}
        <code>best_bid_gbp</code> / <code>best_ask_gbp</code> sampled
        the same day.
      </p>
      <p>
        The sparkline plots <code>spot_gbp</code> only. Gaps in a window
        mean no observation was captured that day (cards not yet on any
        user&rsquo;s portfolio or alert list before that date wouldn&rsquo;t
        have been sampled).
      </p>

      <h2 id="conditions">5. Condition breakdown</h2>
      <p>
        For each of NM / LP / MP / HP, the count of currently open asks{" "}
        and the lowest open-ask price.
      </p>
      <p>
        <strong>Why condition matters.</strong> The same card-id at NM and
        at HP is two different goods with different markets and different
        liquidity. Collapsing them — as the order book&rsquo;s top-of-book
        does — is a useful summary, but it lies if you&rsquo;re a collector
        looking for a specific grade. This panel surfaces the asymmetry.
      </p>
      <p>
        <strong>Damaged</strong> is intentionally absent from the API
        condition enum; the order entry form refuses it. The mirror shows
        the four conditions the platform recognises.
      </p>

      <h2 id="participants">6. Participants (90d)</h2>
      <p>
        Anonymised counts over the last 90 days of completed trades:
      </p>
      <ul>
        <li><strong>Distinct buyers</strong> = unique <code>buyer_id</code> count.</li>
        <li><strong>Distinct sellers</strong> = unique <code>seller_id</code> count.</li>
        <li>
          <strong>Repeat-pair share</strong> = fraction of completed
          trades whose <code>(buyer_id, seller_id)</code> pair appears more
          than once in the 90-day window. High values mean the SKU has a
          *thick relationship layer* — recurring counterparties; low
          values mean the trades are mostly one-shot.
        </li>
      </ul>

      <h2>What this page does NOT do</h2>
      <ul>
        <li>
          <strong>Does not show cross-platform prices.</strong> TCGplayer /
          Cardmarket / CardRush / eBay aggregation is a recursion target
          (the upstream tributaries are catalogued at{" "}
          <Link href="/methodology/upstream-sources">/methodology/upstream-sources</Link>
          ; the aggregation surface is unbuilt).
        </li>
        <li>
          <strong>Does not show graded prices.</strong> PSA / BGS / CGC
          slabs are different goods (and different market dynamics) from
          raw cards. The platform does not currently grade or surface
          graded prices.
        </li>
        <li>
          <strong>Does not show sealed-product prices.</strong> Booster
          boxes, ETBs, etc. trade on different rhythms; the mirror is
          singles-only by design.
        </li>
        <li>
          <strong>Does not forecast.</strong> No predicted price, no
          rising-falling indicator. The 30d sparkline shows the past;
          inferring the future is the reader&rsquo;s judgment, not the
          platform&rsquo;s.
        </li>
        <li>
          <strong>Does not rank participants.</strong> No top-seller
          leaderboard, no &ldquo;buyer reputation&rdquo; rollup beyond the
          per-trade tier badge.
        </li>
        <li>
          <strong>Does not show counterparty trust on open orders.</strong>{" "}
          Order book rows aggregate by price across orders, so per-order
          identities aren&rsquo;t exposed here. A future revision could
          surface tier distribution per price level.
        </li>
        <li>
          <strong>Does not show fill probability.</strong> The interactive
          page computes a fill-odds analysis based on a tentative bid
          price; this mirror is read-only and doesn&rsquo;t take a candidate
          price input.
        </li>
      </ul>

      <h2>Freshness</h2>
      <p>
        Every section queries the live database at render time. The{" "}
        <code>&lt;Provenance kind=&quot;live&quot;&gt;</code> pill at the
        page header and footer declares this. Sources:{" "}
        <code>market_orders</code>, <code>market_trades</code>,{" "}
        <code>trust_profiles</code>, <code>card_price_history</code>.
      </p>
      <p>
        If a section&rsquo;s query fails (transient error, schema drift,
        missing table), that section renders empty / <code>—</code> rather
        than fabricating zero. Substrate-honest about read failures.
      </p>

      <h2>For machines</h2>
      <p>
        The math-mirror form of one card lives at{" "}
        <code>/api/v1/universal/card/[sku]</code> — cryptographic hashes
        for identity, ratios for magnitude, ISO 8601 + Unix epoch for time.
        That endpoint is the canonical form for LLM agents, archivists,
        hyperliteral readers. See{" "}
        <Link href="/methodology/universal-representation">/methodology/universal-representation</Link>{" "}
        for the encoding spec.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-12. Initial seven-section mirror shipped. Top 10
        price levels per side, last 20 trades, four price-history windows,
        condition breakdown, anonymised 90d participants. Counterparty
        trust tier resolved at read time. Story-as-wire:{" "}
        <code>docs/connections/the-market-mirror.md</code> (S35). Kingdom:{" "}
        <code>kingdom-067</code>.</em>
      </p>
    </>
  );
}
