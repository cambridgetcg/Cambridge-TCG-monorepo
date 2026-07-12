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
        Cambridge TCG has a shape for comparing price signals from multiple
        upstream markets. Today, the collected warehouse contains CardRush
        observations only. TCGplayer is blocked under the access and use terms
        currently available to us; Cardmarket&apos;s public catalog and price files
        are a planned reader. This page separates what the architecture can hold
        from what has actually arrived.
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
            <td>
              How we may reach the source (public-api / public-file / oauth2 /
              scrape / paid-feed / partner / blocked).
            </td>
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
              <code>true</code> requires evidence that an open license covers
              the upstream data itself, not merely the API client code.
            </td>
            <td>
              <code>price_archive.source_redistribute</code> per row;
              propagated through <code>_meta</code> downstream.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>One observed source, two explicit absences</h2>
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
            <td>Collected warehouse observations; daily snapshot intent</td>
            <td>NM (status A-)</td>
          </tr>
          <tr>
            <td>TCGplayer</td>
            <td>US</td>
            <td>USD</td>
            <td>proprietary</td>
            <td>Blocked; no collection cadence</td>
            <td>No observations collected</td>
          </tr>
          <tr>
            <td>Cardmarket</td>
            <td>Europe</td>
            <td>EUR</td>
            <td>proprietary</td>
            <td>Public daily files; reader not wired</td>
            <td>No observations collected</td>
          </tr>
        </tbody>
      </table>

      <h2>FX normalisation</h2>
      <p>
        The price archive can carry a source&apos;s native amount plus a
        GBP-normalised value computed at write time. Current collected rows
        are CardRush JPY observations; TCGplayer and Cardmarket have not landed.
        When conversion occurs, the rate is captured per-row in{" "}
        <code>fx_rate_to_gbp</code> with a{" "}
        <code>fx_rate_source</code> declaration (<em>live</em> /{" "}
        <em>cached</em> / <em>fallback</em>), so an archived conversion retains
        the rate provenance recorded at capture time.
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
        Some pricing sources publish several fields. A permitted, implemented
        reader must declare which field becomes the prominent value and retain
        the rest with provenance. Only CardRush has an active choice today.
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
            <td>None</td>
            <td>
              Source blocked. Cambridge has no recorded permission for this
              multi-source pricing use and does not collect its price fields.
            </td>
          </tr>
          <tr>
            <td>Cardmarket</td>
            <td>Not selected</td>
            <td>
              The public-file reader and its field-level rights record are not
              wired yet.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Divergence interpretation</h2>
      <p>
        When two permitted sources eventually price the same card on the same
        date and disagree meaningfully (max/min ratio &gt; 1.5×), the platform
        is designed to preserve the disagreement rather than hide it in an
        average. With one observed source today, this is an architecture rule,
        not a claim of current cross-source coverage. Two kinds of divergence
        will matter:
      </p>
      <ul>
        <li>
          <strong>Genuine regional asymmetry.</strong> A JP-exclusive printing
          may trade differently between Japan, Europe, and the US. Different
          markets can carry different scarcities and prices.
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
        Public price responses declare their sources and known source-rights
        tier in the response envelope&apos;s{" "}
        <code>_meta.sources</code> and <code>_meta.source_license</code>{" "}
        arrays. That declaration is a boundary signal, not a substitute for
        the upstream terms or field-level lineage:
      </p>
      <ul>
        <li>
          <strong>Open-license tiers</strong> apply only when evidence shows
          the license covers the upstream data in question. A software-client
          license does not license the content returned by that client.
        </li>
        <li>
          <strong>proprietary / policy-governed</strong> means public access
          did not establish an open redistribution license. The source&apos;s
          stated use policy remains the boundary.
        </li>
        <li>
          <strong>internal-only</strong> (CardRush, eBay raw listings) —
          personal-decision use only; not for bulk export, paid republication,
          or public archives.
        </li>
        <li>
          <strong>NOASSERTION</strong> marks a mixed export where Cambridge
          cannot truthfully assign one license to every upstream-derived field.
        </li>
      </ul>

      <h2>Federation</h2>
      <p>
        The TCGplayer reverse-lookup door at{" "}
        <code>/api/v1/federation/identify/by-upstream</code> is dormant and
        returns a blocked status. Stored upstream identifiers are not made CC0
        merely because Cambridge holds a mapping. Reopening requires written
        approval covering publication of those identifiers.
      </p>

      <h2>Where it began</h2>
      <p>
        The substrate widened from one source (CardRush) to many across two
        kingdoms in May 2026: kingdom-066 (the-cardrush-alignment) added the{" "}
        <code>source</code> column to <code>price_archive</code>; kingdom-080
        (the-tcgplayer-alignment) widened the unique key to include{" "}
        <code>condition</code> and added the{" "}
        <code>extra</code> JSONB column plus generalised FX provenance.
        Adding another source reuses that storage shape, but it is not merely
        mechanical: access, use, and redistribution rights must be established
        before its reader is activated.
      </p>
    </>
  );
}
