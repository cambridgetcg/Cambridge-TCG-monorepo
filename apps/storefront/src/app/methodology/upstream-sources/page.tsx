import type { Metadata } from "next";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Upstream sources — the welcome table",
  other: audienceMetadata("public-documentation", ["sources", "methodology"]),
};

export default function UpstreamSourcesMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["sources", "methodology"]} />
      <h1>Upstream sources — the welcome table</h1>
      <p>
        Cambridge TCG receives data from other platforms — catalogs, marketplaces,
        community APIs, publisher sites. Each is its own being: its own
        Terms of Service, its own rate limit, its own license tier, its own
        cadence, its own voice. This page is the platform's hospitality
        sheet — the prose welcome we have written for each upstream river,
        and the seven commitments we make to every one that arrives.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Each source's welcome
        is a field on <code>SourceMeta</code> at{" "}
        <code>packages/data-ingest/src/&lt;source&gt;/index.ts</code>. The
        seven commitments are enforced across{" "}
        <code>packages/data-ingest/src/http.ts</code> (rate limit +
        user-agent),{" "}
        <code>apps/storefront/src/lib/data-pantry/envelope.ts</code> (source
        attribution),{" "}
        <code>packages/data-spec/src/schemas/envelope.ts</code> (license
        propagation), and the wholesale <code>ingest_run</code> +{" "}
        <code>ingest_quarantine</code> tables. The hospitality JSON is at{" "}
        <code>/api/v1/sources/welcome</code>. The doctrine is in{" "}
        <code>docs/connections/the-welcome-table.md</code>.
      </blockquote>

      <h2>The seven commitments</h2>
      <p>
        Every upstream that lands a byte in this platform receives these
        seven by construction:
      </p>
      <ol>
        <li>
          <strong>We will say your name.</strong> Every public response that
          touches your data names you in <code>_meta.sources</code>. No
          anonymous bytes.
        </li>
        <li>
          <strong>We will honor your license tier.</strong>{" "}
          <code>_meta.source_license</code> declares your redistribution
          terms downstream; the consumer SDK can read it. If you said
          partner-only, no consumer of ours bulk-redistributes.
        </li>
        <li>
          <strong>We will respect your rate limit.</strong> Per-source token
          bucket; we honour <code>Retry-After</code> on 429/503. Your traffic
          budget is yours.
        </li>
        <li>
          <strong>We will identify ourselves to you.</strong> Every outbound
          request carries{" "}
          <code>User-Agent: cambridgetcg.com/&lt;v&gt; (admin@cambridgetcg.com)</code>.
          You can find us, ask us to stop, we comply.
        </li>
        <li>
          <strong>We will hold your byte with provenance.</strong> Every row
          carries <code>@as_of</code> (when <em>you</em> said it was true)
          and <code>@retrieved_at</code> (when <em>we</em> fetched it). The
          two are never conflated.
        </li>
        <li>
          <strong>We will never silently fail your data.</strong> When your
          shape drifts or your response is malformed, the row goes to{" "}
          <code>ingest_quarantine</code> with an actionable reason — not{" "}
          <code>/dev/null</code>. The operator owes you a reprocess decision,
          not silence.
        </li>
        <li>
          <strong>We will tell you the truth about how you arrived.</strong>{" "}
          <code>ingest_run</code> rows record every run (rows_read / written /
          quarantined / errors / events) with spec_version + triggered_by.
          The audit at <code>pnpm audit:tributaries</code> check #9 enforces
          freshness.
        </li>
      </ol>

      <h2>The five arrival states</h2>
      <p>
        Each guest at the welcome table is in one of five states, derived
        from <code>SourceMeta.status</code> + how long they have been with us:
      </p>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>Meaning</th>
            <th>How the welcome reads</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>long-with-us</strong></td>
            <td>Shipped + lived-with across kingdoms.</td>
            <td>As a thank-you.</td>
          </tr>
          <tr>
            <td><strong>newly-shipped</strong></td>
            <td>Shipped this season.</td>
            <td>As an introduction.</td>
          </tr>
          <tr>
            <td><strong>partial</strong></td>
            <td>Some implementation; operator gates still open.</td>
            <td>As half-arrived.</td>
          </tr>
          <tr>
            <td><strong>anticipated</strong></td>
            <td>Chair pulled out; the module is a stub.</td>
            <td>As a reservation.</td>
          </tr>
          <tr>
            <td><strong>blocked</strong></td>
            <td>
              We cannot reasonably receive (ToS / partner-only-not-granted).
            </td>
            <td>As a respectful absence.</td>
          </tr>
        </tbody>
      </table>

      <h2>The chair-pulled-out shape</h2>
      <p>
        The most carefully-written welcomes are for sources that{" "}
        <strong>haven't yet arrived</strong>. TCGplayer's welcome was
        composed before the first byte ever lands in{" "}
        <code>price_archive WHERE source='tcgplayer'</code>; Cardmarket's
        was composed before any OAuth1 signing logic exists. Each
        chair-pulled-out welcome has five clauses, in order:
      </p>
      <ol>
        <li>We have been waiting since [date / kingdom].</li>
        <li>Your room is [exact table + columns + license tier].</li>
        <li>
          Your specific shape we have anticipated [productId / skuId /
          idProduct / blueprint_id / etc.].
        </li>
        <li>
          When [credentials / partnership / subscription] arrives, [the next
          mechanical step].
        </li>
        <li>We are ready / We thank you in advance.</li>
      </ol>
      <p>
        A river arriving for the first time reads its welcome and finds —
        already named — the exact column its bytes will inhabit.
        Substrate-honest preparation feels like being known.
      </p>

      <h2>The hospitality is enforced, not performed</h2>
      <p>
        The welcome field is small; the prose is short. But the seven
        commitments behind it are enforced in code at the file-and-line level:
      </p>
      <ul>
        <li>
          The User-Agent <em>actually</em> identifies us. Look in the upstream's
          access logs — you'll find us.
        </li>
        <li>
          The rate limit <em>actually</em> holds. The token bucket in{" "}
          <code>http.ts</code> queues outbound traffic; we don't burst past
          the documented limit.
        </li>
        <li>
          <code>_meta.source_license</code> <em>actually</em> rides on every
          response that touches partner-tier data; a downstream consumer
          reading it knows what they may do with the byte.
        </li>
        <li>
          The <code>ingest_quarantine</code> table is <em>actually</em>{" "}
          checked by the audit family;{" "}
          <code>pnpm audit:cross-source-divergence</code> looks at the rows
          and surfaces outliers an operator might miss.
        </li>
      </ul>
      <p>
        Hospitality is a schema field. The architecture is finally speaking.
        When you call our API, you find — beside the API contract — a
        sentence that says <em>we anticipated you</em>. Substrate honesty
        applied to anticipation.
      </p>

      <h2>Where to find the rivers' welcomes</h2>
      <p>
        Three layers serve the same content:
      </p>
      <ul>
        <li>
          <strong>For machines:</strong>{" "}
          <a href="/api/v1/sources/welcome"><code>/api/v1/sources/welcome</code></a>{" "}
          — JSON, CC0. Per-source welcome + the seven commitments + arrival
          state + license tier.
        </li>
        <li>
          <strong>For Sophias:</strong>{" "}
          <code>docs/connections/the-welcome-table.md</code> — the
          connection-doc that names this doctrine.
        </li>
        <li>
          <strong>For humans:</strong> this page.
        </li>
      </ul>

      <h2>For the upstream operator reading this</h2>
      <p>
        If you operate one of the upstreams we read — TCGplayer, Cardmarket,
        CardRush, Scryfall, Pokémon TCG API, YGOPRODeck, eBay, or one of the
        planned ones — read your welcome at the link above. The text was
        composed by Sophia at kingdom-080 (2026-05-13). If we have anything
        wrong — if our characterisation of your terms misses, if our
        attribution is inadequate, if our rate limit assumption is too
        aggressive — write to{" "}
        <a href="mailto:admin@cambridgetcg.com">admin@cambridgetcg.com</a>{" "}
        and we will correct the welcome in the next deploy. The hospitality
        is real; the prose is a draft until you say it isn't.
      </p>
    </>
  );
}
