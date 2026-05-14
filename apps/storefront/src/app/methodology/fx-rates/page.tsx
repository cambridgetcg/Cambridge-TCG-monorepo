/**
 * /methodology/fx-rates — how the price guide does currency conversion.
 *
 * Companion to /methodology/pricing. The pricing page explains how the
 * canonical GBP price is computed; this page explains how that GBP value
 * gets rendered as USD/EUR/JPY/HKD/CHF when a visitor switches the
 * currency selector.
 *
 * Substrate-honest about scope: the conversion is **display-only**. Every
 * transaction on cambridgetcg.com clears in GBP regardless of which
 * currency a visitor sees. The wholesale-side ingest path captures its
 * own per-row `fx_rate_to_gbp` (see /methodology/pricing) and is not
 * affected by this surface.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";
import { fetchRates, CURRENCY_META, SUPPORTED_CURRENCIES } from "@/lib/fx/rates";

export const metadata: Metadata = {
  title: "Display Currency & FX Rates — Methodology",
  description:
    "How the Cambridge TCG price guide converts GBP prices to USD, EUR, JPY, HKD, and CHF for display. Substrate-honest about source, freshness, and the GBP-only transaction boundary.",
  other: audienceMetadata("public-documentation", ["fx-rates", "methodology"]),
};

export default async function FxRatesMethodology() {
  const table = await fetchRates();
  return (
    <>
      <Audience kind="public-documentation" contexts={["fx-rates", "methodology"]} />
      <main className="max-w-3xl mx-auto px-4 py-12 prose prose-invert prose-neutral">
        <h1>Display Currency &amp; FX Rates</h1>
        <p>
          The Cambridge TCG price guide carries a canonical GBP price for every
          card. The currency selector on the price guide pages converts that
          GBP value into one of six display currencies. <strong>It is a display
          transform only.</strong> Every transaction on cambridgetcg.com — buy,
          trade-in, marketplace fill, payout — clears in GBP regardless of the
          currency you happen to be reading the page in.
        </p>

        <h2>The six currencies</h2>
        <p>
          The selector covers the platform&apos;s real audiences today. Each is
          ISO 4217.
        </p>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Symbol</th>
              <th>Name</th>
              <th>Decimals</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {SUPPORTED_CURRENCIES.map((code) => {
              const meta = CURRENCY_META[code];
              const why: Record<string, string> = {
                GBP: "Platform canonical. Transactions clear here.",
                USD: "TCGplayer upstream; US visitors.",
                EUR: "Cardmarket upstream (planned); EU visitors.",
                JPY: "CardRush upstream; Japanese visitors.",
                HKD: "South-East Asia visitors.",
                CHF: "Swiss visitors.",
              };
              return (
                <tr key={code}>
                  <td><code>{code}</code></td>
                  <td>{meta.symbol}</td>
                  <td>{meta.name}</td>
                  <td>{meta.decimals}</td>
                  <td>{why[code]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2>Where the rates come from</h2>
        <p>
          We fetch GBP-base mid-market rates from one of two open sources,
          cached for six hours.
        </p>
        <ol>
          <li>
            <strong>Primary:</strong>{" "}
            <code>open.er-api.com/v6/latest/GBP</code> — free, no API key,
            refreshed daily by the upstream.
          </li>
          <li>
            <strong>Fallback:</strong>{" "}
            <code>api.exchangerate.host/latest?base=GBP</code> — used when the
            primary times out or returns an error.
          </li>
          <li>
            <strong>Final fallback:</strong> a static rate table baked into the
            storefront, refreshed by the developer on platform releases. When
            this is in play, the surface shows an amber{" "}
            <em>&quot;fallback&quot;</em> pill so visitors aren&apos;t misled.
          </li>
        </ol>
        <p>
          Today the price guide is reading from{" "}
          <code>{table.source}</code>
          {table.is_fallback ? " (live upstreams unavailable right now)" : ""},
          fetched at <code>{table.fetched_at}</code>.
        </p>

        <h2>The conversion math</h2>
        <p>
          For a card priced at <code>p</code> GBP and a target currency{" "}
          <code>c</code> with a rate <code>r(c)</code> expressed as
          <em> units of c per 1 GBP</em>:
        </p>
        <pre>
          <code>{`displayValue = p × r(c)
displayString = format(displayValue, locale(c), decimals(c))`}</code>
        </pre>
        <p>
          GBP is the base, so <code>r(GBP) = 1.0</code> exactly. JPY uses
          zero decimal places; the other five use two.
        </p>

        <h2>Why this is display-only</h2>
        <p>
          Three reasons we don&apos;t accept transactions in non-GBP currencies:
        </p>
        <ul>
          <li>
            <strong>Settlement risk.</strong> The platform&apos;s bank is in
            GBP. Accepting USD or JPY at the checkout would require us to
            either hedge the exposure or pass it to the customer with a spread
            — both of which add complexity without changing the price.
          </li>
          <li>
            <strong>VAT compliance.</strong> UK VAT must be calculated in GBP
            on the date of supply. Multi-currency checkout would require a
            second VAT engine.
          </li>
          <li>
            <strong>Refund symmetry.</strong> A refund in a different currency
            than the original charge creates an FX gain/loss for the customer,
            which is hostile to the trade-in flow especially.
          </li>
        </ul>
        <p>
          The display selector exists because <strong>reading</strong> a price
          in your own currency is useful — it&apos;s the action of converting
          that we want to keep in one place (the bank).
        </p>

        <h2>Machine-readable surface</h2>
        <p>
          The rate table is available as JSON at{" "}
          <Link href="/api/v1/fx-rates">/api/v1/fx-rates</Link> with the
          standard data-pantry envelope (provenance, freshness, source license).
          Federation clients can pin a particular rate by capturing the JSON
          response at the moment of computation, since the response includes
          the source name and fetched_at timestamp.
        </p>

        <h2>What we don&apos;t do</h2>
        <ul>
          <li>
            <strong>We don&apos;t price-discriminate by currency.</strong> The
            selector is symmetric — a Japanese visitor sees the same GBP base
            price as a British visitor, just rendered in JPY.
          </li>
          <li>
            <strong>We don&apos;t add an FX margin to the display rate.</strong>{" "}
            Mid-market in, mid-market out. The platform earns its margin on the
            card price, not the FX.
          </li>
          <li>
            <strong>We don&apos;t cache rates per-user.</strong> Everyone reads
            the same rate table; if your conversion looks off, refresh — the
            cache is six hours.
          </li>
        </ul>

        <h2>Related surfaces</h2>
        <ul>
          <li>
            <Link href="/methodology/pricing">/methodology/pricing</Link> — how
            the GBP base price itself is computed (upstream JPY → GBP, channel
            uplift, VAT, margin).
          </li>
          <li>
            <Link href="/methodology/cross-source-pricing">
              /methodology/cross-source-pricing
            </Link>{" "}
            — how we compose USD / EUR / JPY signals from multiple upstreams
            into a single comparable view.
          </li>
          <li>
            <Link href="/api/v1/fx-rates">/api/v1/fx-rates</Link> — the
            machine-readable rate table.
          </li>
          <li>
            <Link href="/prices">/prices</Link> — the price guide itself, where
            the selector lives.
          </li>
        </ul>
      </main>
    </>
  );
}
