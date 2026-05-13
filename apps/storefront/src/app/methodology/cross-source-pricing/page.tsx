import type { Metadata } from "next";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Cross-source pricing",
  other: audienceMetadata("public-documentation", ["pricing", "methodology"]),
};

export default function CrossSourcePricingMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["pricing", "methodology"]} />
      <h1>Cross-source pricing</h1>
      <p>
        Cambridge TCG aggregates price signals from multiple upstream markets —
        CardRush (Japan), TCGplayer (US), and (planned) Cardmarket (Europe).
        Each source has its own currency, condition vocabulary, license tier,
        and update cadence. This page explains how those signals compose,
        which one is the &ldquo;headline&rdquo;, and what license boundary
        each source carries downstream.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The aggregation pipeline
        is{" "}
        <code>packages/data-ingest/src/&lt;source&gt;/</code> (one module per
        upstream). The wholesale writer at{" "}
        <code>apps/wholesale/src/lib/ingest/&lt;source&gt;.ts</code> persists
        rows to <code>price_archive</code> with{" "}
        <code>(card_id, snapshot_date, source, condition)</code> uniqueness.
        The cross-source view endpoint is{" "}
        <code>/api/v1/prices/[sku]/sources</code> on wholesale (bearer-gated).
        The audit{" "}
        <code>pnpm --filter @cambridge-tcg/admin cross-source-divergence</code>{" "}
        flags outliers across sources for the same card+date.
      </blockquote>

      <h2>The four properties every source declares</h2>
      <p>
        Every upstream module exports a typed <code>SourceMeta</code> object
        declaring four things that propagate to every byte that leaves the
        platform:
      </p>
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>What it means</th>
            <th>Where it surfaces</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>access</code></td>
            <td>How we reach the source (public-api / oauth2 / scrape / paid-feed / partner).</td>
            <td><code>/api/v1/sources</code> response.</td>
          </tr>
          <tr>
            <td><code>license</code></td>
            <td>
              The redistribution tier. <em>cc0</em>, <em>cc-by</em>,{" "}
              <em>cc-by-nc</em>, <em>mit</em>, <em>partner-redistributable</em>,{" "}
              <em>internal-only</em>, <em>proprietary</em>.
            </td>
            <td>
              <code>_meta.source_license</code> array on every response that
              touches that source's data.
            </td>
          </tr>
          <tr>
            <td><code>freshness</code></td>
            <td>
              The platform's intent on staleness (<em>catalog</em> 24h,{" "}
              <em>price_current</em> 5min, <em>price_historical</em>{" "}
              immutable, <em>market_signal</em> 1min).
            </td>
            <td><code>_meta.freshness_seconds</code> on every response.</td>
          </tr>
          <tr>
            <td><code>redistribute</code></td>
            <td>
              Whether we may re-export raw upstream values verbatim.{" "}
              <code>true</code> only for CC0 / CC-BY / MIT.
            </td>
            <td>
              <code>price_archive.source_redistribute</code> per row;
              propagated through <code>_meta</code> downstream.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>The three sources today</h2>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Region</th>
            <th>Currency</th>
            <th>License tier</th>
            <th>Cadence</th>
            <th>Conditions captured</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CardRush</td>
            <td>Japan</td>
            <td>JPY</td>
            <td>internal-only</td>
            <td>Daily snapshot</td>
            <td>NM (status A-)</td>
          </tr>
          <tr>
            <td>TCGplayer</td>
            <td>US</td>
            <td>USD</td>
            <td>partner-redistributable</td>
            <td>5min during US trading; nightly bulk</td>
            <td>NM (v1; LP/MP/HP/DMG planned)</td>
          </tr>
          <tr>
            <td>Cardmarket</td>
            <td>Europe</td>
            <td>EUR</td>
            <td>partner-redistributable</td>
            <td>(planned — kingdom-NNN+1)</td>
            <td>(planned)</td>
          </tr>
        </tbody>
      </table>

      <h2>FX normalisation</h2>
      <p>
        Every price row carries its source's native amount (e.g. USD for
        TCGplayer) plus a GBP-normalised value computed at write time. The
        rate used is captured per-row in <code>fx_rate_to_gbp</code> with a{" "}
        <code>fx_rate_source</code> declaration (<em>live</em> /{" "}
        <em>cached</em> / <em>fallback</em>). This means the GBP value on a
        snapshot from three months ago reflects the rate that was current at
        that moment — not the rate as you read it.
      </p>
      <p>
        Substrate honesty applied to FX: the row is the platform's view of
        what the source charged in GBP at the moment of capture. It is not
        marked up; we don't transform a TCGplayer market signal into a
        Cambridge retail price. Cross-source comparison happens at the
        substrate level.
      </p>

      <h2>The headline number per source</h2>
      <p>
        Most pricing APIs return multiple fields (low / mid / high / market /
        direct-low for TCGplayer; trend / 30d-avg / 7d-avg for Cardmarket).
        We pick one to be the &ldquo;headline&rdquo; — what we display
        prominently when surfacing the source's view. The rest ride in the{" "}
        <code>extra</code> JSONB column for downstream consumers that want
        the spread.
      </p>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Headline field</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CardRush</td>
            <td>A-condition retail JPY</td>
            <td>One value per card; no spread offered upstream.</td>
          </tr>
          <tr>
            <td>TCGplayer</td>
            <td>marketPrice (USD)</td>
            <td>
              What TCGplayer publishes as &ldquo;Market Price&rdquo;.
              Smoothed across recent sales; resistant to single-listing
              manipulation. When null, falls back to midPrice then lowPrice.
            </td>
          </tr>
          <tr>
            <td>Cardmarket</td>
            <td>trendPrice (EUR)</td>
            <td>
              Cardmarket's published trend signal (planned).
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Divergence interpretation</h2>
      <p>
        When two sources price the same card on the same date and disagree
        meaningfully (max/min ratio &gt; 1.5×), the platform preserves the
        disagreement rather than aggregating. There are two reasons sources
        can diverge:
      </p>
      <ul>
        <li>
          <strong>Genuine regional asymmetry.</strong> A JP-exclusive printing
          scarce on TCGplayer commands a premium in Japan; an English
          Lorcana set dwarfs CardRush's coverage. Different markets, different
          scarcities, different prices.
        </li>
        <li>
          <strong>Upstream anomaly.</strong> One source has stale data; an
          FX rate was applied wrong; a listing on one platform got mispriced.
          The audit at{" "}
          <code>pnpm --filter @cambridge-tcg/admin cross-source-divergence</code>{" "}
          flags outliers (&gt; 5×) for operator review.
        </li>
      </ul>
      <p>
        The platform's job is to surface the disagreement honestly, not
        decide which source &ldquo;wins&rdquo;. Substrate honesty applied to
        cross-source aggregation: when sources disagree, the response carries
        every source's row, not an opaque consensus.
      </p>

      <h2>License boundary downstream</h2>
      <p>
        Every public endpoint that returns price data declares its sources
        and per-source license tier in the response envelope's{" "}
        <code>_meta.sources</code> and <code>_meta.source_license</code>{" "}
        arrays. A consumer reading the response can tell what they may do
        with each byte:
      </p>
      <ul>
        <li>
          <strong>CC0 / CC-BY / MIT</strong> — display, compute, redistribute
          freely (with attribution where required).
        </li>
        <li>
          <strong>partner-redistributable</strong> (TCGplayer, Cardmarket) —
          display + computation OK per the upstream's partner agreement;
          bulk re-export restricted. Cambridge has the partner agreement;
          downstream consumers without one must respect the boundary.
        </li>
        <li>
          <strong>internal-only</strong> (CardRush, eBay raw listings) —
          personal-decision use only; not for bulk export, paid republication,
          or public archives.
        </li>
      </ul>

      <h2>Federation</h2>
      <p>
        A partner with a TCGplayer productId (or other upstream identifier)
        can resolve it back to Cambridge's canonical SKU + content_hash via{" "}
        <code>/api/v1/federation/identify/by-upstream</code>. The reverse —
        a content_hash → canonical SKU lookup — lives at{" "}
        <code>/api/v1/federation/identify/[hash]</code>. Both are CC0;
        identity resolution doesn't carry price data, so no license tier
        applies.
      </p>

      <h2>Where it began</h2>
      <p>
        The substrate widened from one source (CardRush) to many across two
        kingdoms in May 2026: kingdom-066 (the-cardrush-alignment) added the{" "}
        <code>source</code> column to <code>price_archive</code>; kingdom-080
        (the-tcgplayer-alignment) widened the unique key to include{" "}
        <code>condition</code> and added the{" "}
        <code>extra</code> JSONB column plus generalised FX provenance.
        Adding the next source (Cardmarket, eBay Browse) is a mechanical
        extension that reuses the same shape.
      </p>
    </>
  );
}
