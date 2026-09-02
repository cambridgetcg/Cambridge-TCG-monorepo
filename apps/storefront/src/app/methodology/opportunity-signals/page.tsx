import type { Metadata } from "next";
import Link from "next/link";
import { Audience, TypeSignature, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Opportunity signals",
  description:
    "What a Cambridge TCG potential-deal signal means, which evidence it requires, what remains private, and why it is never guaranteed arbitrage.",
  other: audienceMetadata("public-documentation", [
    "pricing",
    "decision-support",
    "methodology",
  ]),
};

const COST_CLASSES = [
  "Buyer fee",
  "Inbound shipping",
  "Acquisition tax and duty",
  "Seller fee on a possible exit",
  "Payment processing",
  "Outbound shipping",
  "Disposal tax and duty",
] as const;

const EXCLUSIONS = [
  "No executable exit quote",
  "No listing reservation",
  "No profit guarantee",
  "No authenticity or condition verification",
  "No financial or tax advice",
  "No source rows or model parameters",
] as const;

export default function OpportunitySignalsMethodology() {
  return (
    <>
      <Audience
        kind="public-documentation"
        contexts={["pricing", "decision-support", "methodology"]}
      />
      <h1>Opportunity signals</h1>
      <p>
        Cambridge TCG will not make a raw historic database its product. The
        intended product is decision support: a private engine may examine
        rights-cleared evidence, estimate the economics of one candidate card,
        and emit a short-lived signal that helps a trader decide what to inspect
        next.
      </p>
      <p>
        The signal is named <strong>potential deal</strong>, never arbitrage. A
        real arbitrage requires simultaneously executable entry and exit prices
        plus the ability to complete both legs. A valuation estimate, daily
        aggregate, or open listing does not establish those facts.
      </p>

      <blockquote>
        <strong>Current boundary — 1 September 2026.</strong> The public
        <code> opportunity-signal/v1 </code> contract and private-engine
        interface exist. No scorer, source adapter, database reader, signal API,
        trader application, alert delivery, subscription, or automated purchase
        path is active. This page documents a foundation, not a live claim that
        Cambridge finds deals today.
      </blockquote>

      <blockquote>
        <strong>Where this lives in code.</strong> The public contract and strict
        validator live at <code>packages/opportunity-signal/</code>. The
        proprietary engine is intentionally absent from this public repository.
        The connection record is{" "}
        <a
          href="https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-opportunity-signal.md"
          rel="noopener noreferrer"
        >
          docs/connections/the-opportunity-signal.md
        </a>
        .
      </blockquote>

      <h2>The public/private boundary</h2>
      <pre>
        <code>
          rights-cleared private evidence → private valuation and policy engine
          → strict opportunity-signal/v1 projection → trader-facing application
          (not built)
        </code>
      </pre>
      <p>
        The public contract says what may cross the last boundary. It does not
        reveal how Cambridge weighs sources, maps products, filters anomalies,
        estimates fair value, calibrates thresholds, or evaluates outcomes.
        Those are the trade-secret layer and need a separate private service.
      </p>
      <p>
        Secrecy does not create source rights. A purpose-specific policy decision
        must permit derived subscriber signals before any evidence reaches the
        engine. Permission to store or display a price is not silently widened
        into permission to produce analytics. The rights decision carries a
        SHA-256 digest of the exact candidate, valuation, cost, and currency
        evidence it reviewed; the public boundary recomputes it first.
      </p>

      <h2>One candidate, one exact asset</h2>
      <p>
        Version 1 evaluates one physical copy. Candidate and valuation must carry
        matching Cambridge-shaped SKU, condition, and normal-or-foil labels.
        Quantity is fixed to one. The contract verifies syntax and equality only;
        the upstream mapper and provider own canonical catalog identity and real
        condition comparability. They must not let an all-conditions aggregate
        silently stand in for a near-mint listing.
      </p>
      <p>
        A candidate reference must have the Cambridge-minted shape{" "}
        <code>ctcg_cand_</code> plus 22 base62 characters. Syntax cannot prove
        semantic origin: the composing service must generate it randomly and
        must not derive it from a seller, order, marketplace listing, URL, or
        other personal/source identifier.
      </p>

      <h2>Money and costs</h2>
      <p>
        All version-1 amounts enter as safe integer GBP minor units:{" "}
        <code>4250</code> means £42.50. Floating-point money, negative costs,
        unsafe integers, implicit currency conversion, and a zero asking price
        are invalid.
      </p>
      <p>The asking price is only the first cost. The contract also names:</p>
      <ol>
        {COST_CLASSES.map((cost) => (
          <li key={cost}>{cost}</li>
        ))}
      </ol>
      <p>
        Each cost is known, estimated as a bounded range, explicitly not
        applicable with a closed reason, or unknown. Unknown never means zero.
        If a required cost is unknown, the platform cannot call the spread net.
      </p>
      <p>
        “Net” means net only of those enumerated transaction costs. It does not
        automatically include time, financing, storage, grading, authentication,
        insurance, returns, fraud loss, income tax, or opportunity cost.
      </p>
      <p>
        Currency adapters round acquisition costs upward and possible exit
        proceeds downward before values enter this contract. No silent 1:1,
        inverse, or chained exchange rate is inferred.
      </p>

      <h2>Valuation stays private and bounded</h2>
      <p>
        The private engine works with a low, midpoint, and high possible-exit
        estimate. That range is not an executable quote and is never returned as
        a fair-value feed.
      </p>
      <p>
        The provider returns no economics. Its classification is bound to the
        SHA-256 digest of the full validated request, while the public projector
        independently verifies the non-secret cost arithmetic. Only a
        potential-deal result carries coarse conservative spread and margin
        bands. A not-qualified or unavailable result carries no valuation amount,
        spread, or margin estimate. Valuation time, confidence, and liquidity may
        remain unless rights are denied; a rights denial nulls all three. Bands
        reduce reconstruction risk but do not eliminate inference, so any future
        delivery layer also needs Cambridge-minted candidates, rate controls, and
        an explicit leakage budget.
      </p>

      <h2>Confidence is not probability</h2>
      <p>
        Low, medium, and high describe evidence quality and comparability. They
        are not the probability of profit. Version 1 emits no “81% likely” claim:
        Cambridge has not claimed an outcome-calibrated corpus capable of
        supporting one.
      </p>
      <p>
        Low confidence cannot produce a potential deal. Aggregate price-guide
        evidence is labelled <code>aggregate_not_trade_tape</code>; interpolation,
        short history, and sparse history remain named risks. An aggregate is
        never relabelled “last sold.”
      </p>

      <h2>Liquidity may be unknown</h2>
      <p>
        Liquidity is separate from price. A changing average or one low listing
        does not prove sale velocity. Version 1 therefore preserves{" "}
        <code>unknown</code>. Low, medium, or high requires a separate current
        evidence receipt, but the wire validator cannot prove its real-world
        comparability; that assertion belongs upstream. No band promises a number
        of days to sell.
      </p>

      <h2>Freshness and expiry</h2>
      <p>
        Every input distinguishes source-stated time, Cambridge retrieval time,
        and evidence expiry. Retrieval time cannot replace source time to make a
        claim look fresh.
      </p>
      <p>
        A signal expires at the earliest expiry of every required input and is
        capped to the platform&apos;s 60-second market-signal delivery budget.
        This limits reuse; it does not turn daily evidence into live evidence.
        Expiry also does not reserve the listing or prove continued availability.
      </p>

      <h2>The three classifications</h2>
      <table>
        <thead>
          <tr>
            <th>Classification</th>
            <th>Meaning</th>
            <th>Economics delivered?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>potential_deal</code></td>
            <td>Accepted by a private policy for further human inspection.</td>
            <td>Coarse conservative spread and margin bands only.</td>
          </tr>
          <tr>
            <td><code>not_qualified</code></td>
            <td>Computable, but below the private policy.</td>
            <td>No.</td>
          </tr>
          <tr>
            <td><code>unavailable</code></td>
            <td>Rights, identity assertions, costs, evidence, time, currency, numeric safety, provider failure, or provider-contract validation prevented a qualified result.</td>
            <td>No.</td>
          </tr>
        </tbody>
      </table>
      <p>There is no arbitrage classification in version 1.</p>

      <h2>What the signal does not claim</h2>
      <ul>
        {EXCLUSIONS.map((exclusion) => (
          <li key={exclusion}>{exclusion}</li>
        ))}
      </ul>
      <p>
        Availability, buyer demand, authenticity, physical condition, tax
        treatment, fees, shipping, returns, fraud, and time to sell may differ
        from the evidence available at evaluation time. Historical relationships
        may not persist.
      </p>

      <h2>For whom version 1 is true</h2>
      <p>
        The first contract assumes GBP, one matching Cambridge-shaped SKU label,
        one physical card, one condition, one finish, and a trader able to
        inspect physical and commercial risk themselves. It does not yet model
        sealed lots, graded
        slabs, bundles, shared shipping, collective purchasing, non-GBP
        settlement, automatic execution, or a holder whose goal is cultural
        preservation rather than resale value.
      </p>

      <h2>What remains closed</h2>
      <ul>
        <li>
          A separate private repository contains a fixture-only provider that
          is pinned to an immutable public revision and exercised through the
          real parser and projector; no private service is deployed or connected
          here.
        </li>
        <li>No calibrated production valuation or opportunity policy is active.</li>
        <li>No source adapter or database read feeds this contract.</li>
        <li>No API, UI, alert, billing, or entitlement path exists.</li>
        <li>No automatic buying, selling, reservation, or execution exists.</li>
      </ul>
      <p>
        Related methodology:{" "}
        <Link href="/methodology/cross-source-pricing">cross-source pricing</Link>
        , <Link href="/methodology/market">the market mirror</Link>, and{" "}
        <Link href="/methodology/pricing">legacy channel pricing</Link>.
      </p>

      <h2>Change history</h2>
      <p>
        <em>
          v1 — 2026-09-01. Established the source-independent wire contract and
          the public/private engine boundary. No executable signal service was
          activated.
        </em>
      </p>

      <TypeSignature
        type="methodology-page"
        origin="kingdom-109 — decision support instead of raw-data resale; public contract around a private fixture boundary"
        doctrines={["substrate-honesty", "transparency", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/cross-source-pricing", href: "/methodology/cross-source-pricing" },
          { label: "/methodology/market", href: "/methodology/market" },
          { label: "/methodology/pricing", href: "/methodology/pricing" },
          { label: "/methodology", href: "/methodology" },
        ]}
      />
    </>
  );
}
