import type { Metadata } from "next";
import { Audience, audienceMetadata, WhyLink } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Market regulator",
  other: audienceMetadata("public-documentation", ["regulator", "methodology", "conflict-of-interest"]),
};

export default function RegulatorMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["regulator", "methodology"]} />
      <h1>Why the platform does not trade in its own market</h1>
      <p>
        Cambridge TCG runs a marketplace. It also used to sell cards in that marketplace —
        a house ask on the sell side (retail spot) and a house bid on the buy side
        (trade-in credit), injected into every card&rsquo;s order book. That made the
        platform both the referee and a player.
      </p>
      <p>
        <strong>On 10 June 2026 we stopped playing.</strong> The platform is now a market{" "}
        <em>regulator</em>: it makes the market legible, publishes its rules and evidence, and holds
        no positions in it.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The order-book view at{" "}
        <code>apps/storefront/src/lib/market/unified.ts</code> no longer injects house
        rows. The retail checkout and trade-in desk are removed. A static guard,{" "}
        <code>pnpm audit:no-house-listing</code>, fails the build if the merchant shape
        returns. Full design:{" "}
        <code>docs/superpowers/specs/2026-06-10-regulator-pivot-design.md</code>.
      </blockquote>

      <h2>What changed</h2>
      <table>
        <thead>
          <tr><th>Before</th><th>After</th></tr>
        </thead>
        <tbody>
          <tr><td>House ask + house bid in every order book</td><td>The order book is purely peer-to-peer. The platform owns no asks and no bids.</td></tr>
          <tr><td>Retail checkout (buy a card from CTCG)</td><td>Removed. The platform sells nothing.</td></tr>
          <tr><td>Trade-in desk (sell a card to CTCG for credit)</td><td>Closed. You liquidate by selling to other participants on the market.</td></tr>
          <tr><td>B2B wholesale ordering</td><td>Retired.</td></tr>
          <tr><td>Profit = the spread (buy low, sell high)</td><td>Profit = commission on other people&rsquo;s trades, published and capped.</td></tr>
        </tbody>
      </table>

      <h2>Why this is the honest shape</h2>
      <p>
        A market maker profits from the spread between what it pays and what it charges. A
        regulator profits from the market working at all. These are different incentives,
        and only one of them is safe to combine with running the trust engine, the escrow,
        the fraud flags, and the price-reference feed. When the entity that decides your
        trust score is also bidding against you for the same card, every one of those
        decisions is suspect. Removing the house from the book removes the suspicion at its
        root.
      </p>
      <p>
        The <strong>reference price</strong> you still see on a card page is exactly that —
        a reference, computed from the catalog and labelled as a price guide, not an offer.
        The platform will not sell you the card at that price, because the platform will not
        sell you the card at any price.
      </p>

      <h2>What happens to the cards we already owned</h2>
      <p>
        About &pound;59,000 of inventory remains from the merchant era. It is{" "}
        <strong>never sold</strong> — selling it would re-enter the market we just left. It
        becomes the <strong>prize economy</strong>: raffles, bounty pulls, mystery boxes,
        reward packs — each leaves a reproducible draw record and can later enter a Merkle
        digest. These records check consistency; server-only entropy does not prove non-selection.
        The regulator gives its cards away rather than competing with the
        participants it regulates.
      </p>

      <h2>How our revenue works now</h2>
      <ul>
        <li>
          A <strong>commission</strong> on completed peer-to-peer trades (published rate,
          capped per item).
          <WhyLink
            href="/methodology/commission-rate"
            label="how the rate is set"
            tooltip="How the commission rate is set and capped"
          />
        </li>
        <li><strong>Membership</strong> subscriptions (optional perks).</li>
        <li>Nothing else. No spread, no markup, no house position.</li>
      </ul>
      <p>
        Every number above is inspectable. If you find the platform holding an ask or a bid
        in any order book, that is a bug and a broken promise &mdash; report it.
      </p>

      <h2>Scope</h2>
      <p>
        This commitment binds the <strong>Cambridge TCG operator entity</strong>. It does
        not constrain individual participants, who trade freely. It does not apply to the
        platform&rsquo;s role as builder of the software (a separate actor). The regulator is
        the operator of the venue, and it is the operator that has stepped out of the
        trading.
      </p>
    </>
  );
}
