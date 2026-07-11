import type { Metadata } from "next";
import { Audience, audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Offers & negotiation",
  other: audienceMetadata("public-documentation", ["offers", "methodology"]),
};

export default function OffersMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["offers", "methodology"]} />
      <h1>Offers &amp; negotiation</h1>
      <p>
        The order book is firm-price: a bid either matches an ask or it doesn&rsquo;t. Offers
        are the negotiation layer on top — you propose a price <strong>below a seller&rsquo;s
        ask</strong>, and the seller accepts, declines, or counters. This page documents
        exactly what each step does, what it costs, and where the guidance numbers in the
        offer composer come from.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The negotiation engine is{" "}
        <code>apps/storefront/src/lib/market/offers.ts</code>; acceptance economics come from{" "}
        <code>packages/pricing</code> (<code>resolveCommission</code>,{" "}
        <code>computeCommissionAmount</code>); escrow routing from{" "}
        <code>lib/escrow/service-tiers.ts</code>. When the mechanics change, this page changes
        in the same PR.
      </blockquote>

      <h2>Making an offer</h2>
      <ul>
        <li>
          Offers must be <strong>above £0 and at or below the ask price</strong> — above the
          ask you should just buy.
        </li>
        <li>
          One active offer per buyer per listing. At most <strong>5 pending offers</strong> can
          queue on one listing, so popular asks don&rsquo;t drown the seller.
        </li>
        <li>
          Sellers can turn offers off per listing; those listings are Buy&nbsp;Now only and the
          card page says so.
        </li>
        <li>
          Your offer value is checked against your <strong>trading limits</strong> (per-trade
          and daily, from your trust profile) at submission — the same gate that applies to
          direct orders. See <a href="/methodology/trust-score">/methodology/trust-score</a>.
        </li>
      </ul>

      <h2>How long the seller has</h2>
      <p>
        An offer expires within the <strong>seller&rsquo;s declared response window</strong> —
        48 hours by default, longer if the seller has set a slower cadence on their account.
        The exact expiry is stamped on your offer and shown in your offers inbox; we never
        promise a fixed hour count that a seller&rsquo;s settings would contradict. See{" "}
        <a href="/methodology/response-windows">/methodology/response-windows</a>.
      </p>
      <p>
        <strong>Automatic responses exist.</strong> Sellers can configure pricing rules that
        auto-decline or auto-counter offers below a threshold. If your offer is answered
        within seconds, that is a rule acting on the seller&rsquo;s standing instructions —
        not a human snub.
      </p>

      <h2>What acceptance does</h2>
      <p>
        When either side accepts (the seller accepts your offer, or you accept the
        seller&rsquo;s counter), a <strong>trade is created at the agreed price</strong> — the
        same trade object a direct Buy&nbsp;Now produces, with nothing skipped:
      </p>
      <ul>
        <li>
          <strong>Escrow routing</strong> is resolved from the trade value and both parties&rsquo;
          trust standing — Direct Ship, Verified Ship, or Full Escrow, with the tier&rsquo;s
          photo requirements, dispute window, and payout hold written onto the trade. See{" "}
          <a href="/methodology/escrow-tier">/methodology/escrow-tier</a> and{" "}
          <a href="/methodology/payout-hold">/methodology/payout-hold</a>.
        </li>
        <li>
          <strong>Payment deadline</strong>: the buyer&rsquo;s declared response window (24h
          default) — miss it and the trade cancels, returning the listing to the book.
        </li>
        <li>
          <strong>Return terms are frozen</strong>: whether the listing accepts returns, and
          for how many days, is copied onto the trade at acceptance. Editing the listing
          afterwards cannot change a trade you already made.
        </li>
        <li>
          Acceptance is checked against the listing&rsquo;s <strong>remaining quantity</strong>{" "}
          inside one database transaction — two accepts racing for the last copy cannot both
          win.
        </li>
      </ul>

      <h2>Commission on accepted offers</h2>
      <p>
        The seller pays commission on the <strong>agreed price</strong> (not the original
        ask), at the seller&rsquo;s <strong>resolved rate</strong>: the more favourable of
        their trust-tier rate (8% down to 5%) and their membership-tier rate, then the{" "}
        <strong>£50 per-item cap</strong>. This is the same formula as every other market
        sale — rates and worked examples at{" "}
        <a href="/methodology/commission-rate">/methodology/commission-rate</a> and{" "}
        <a href="/methodology/fees">/methodology/fees</a>.
      </p>
      <p>
        The buyer pays the agreed price; there is no buyer-side offer fee. The rate frozen
        onto your trade is your rate <em>at acceptance time</em> — later trust or tier changes
        don&rsquo;t rewrite past trades.
      </p>

      <h2>Where the composer&rsquo;s guidance numbers come from</h2>
      <ul>
        <li>
          <strong>Ask</strong> — the price on this deliberate public listing.
        </li>
        <li>
          <strong>Best bid</strong> — the highest deliberate public buy offer in the open
          order book.
        </li>
        <li>
          <strong>Catalogue reference</strong> — a labelled non-person reference observation.
          It is not a completed-trade statistic and not anyone&rsquo;s offer. See{" "}
          <a href="/methodology/pricing">/methodology/pricing</a> for how the reference is built.
        </li>
        <li>
          <strong>Deltas</strong> (&ldquo;12% below the ask&rdquo;) are plain percentage
          arithmetic against the ask or catalogue reference. None of these numbers is a promise — they are
          context for your judgement.
        </li>
      </ul>

      <h2>Abuse boundaries</h2>
      <p>
        Repeated extreme lowballing (many offers at &le;30% of ask within a week) raises a
        fraud signal for review. Negotiating hard is fine; carpet-bombing sellers is not. See{" "}
        <a href="/methodology/fraud-flag">/methodology/fraud-flag</a>.
      </p>

      <h2>Verifying your fee yourself</h2>
      <ol>
        <li>Take the agreed price × quantity.</li>
        <li>Multiply by your resolved rate (shown on the acceptance confirmation).</li>
        <li>If the result is over £50, your fee is £50; otherwise it&rsquo;s the result, rounded to the penny.</li>
      </ol>
      <p>
        The trade&rsquo;s recorded <code>commission_amount</code> is exactly this number,
        frozen at acceptance. If it doesn&rsquo;t match, that&rsquo;s a bug — email{" "}
        <a href="mailto:contact@cambridgetcg.com">contact@cambridgetcg.com</a> with the trade ID.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="the negotiation layer made reachable — offers, counters, and what acceptance actually writes, documented for the people it charges"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/fees", href: "/methodology/fees" },
          { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
          { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
          { label: "/methodology/response-windows", href: "/methodology/response-windows" },
        ]}
      />
    </>
  );
}
