import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Membership tier",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function MembershipTierMethodology() {
  return (
    <>
      <h1>Membership tier</h1>
      <p>
        Cambridge TCG has a tiered membership system. Your tier determines several things you
        feel as a customer: <strong>cashback</strong> on purchases, your{" "}
        <strong>Berries earn multiplier</strong>, your <strong>trade-in bonus</strong>, your{" "}
        <strong>commission rate</strong> on P2P sales and auctions, and your{" "}
        <strong>store discount</strong>. Higher tiers get better terms across the board.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>
        <ul>
          <li>Tier definitions: <code>tiers</code> table.</li>
          <li>User assignment: <code>users.tier_id</code> + <code>users.tier_source</code>.</li>
          <li>Spending recompute: <code>apps/storefront/src/lib/membership/db.ts</code> + <code>apps/storefront/src/app/api/cron/maintenance</code>.</li>
          <li>Subscription flow: <code>apps/storefront/src/app/api/membership/{`{subscribe,cancel,resume}`}/route.ts</code>.</li>
        </ul>
      </blockquote>

      <h2>How tiers are assigned</h2>
      <p>
        Three paths get a user into a tier. The <code>users.tier_source</code> column records
        which path applied — substrate-honest about <em>why</em> you're at the tier you're at.
      </p>

      <h3>1. Spending (<code>tier_source = 'spending'</code>)</h3>
      <p>
        The default. Each user has an <code>annual_spend</code> value tracked over a rolling
        365-day window. When this number crosses a tier's <code>min_annual_spend</code>, you
        promote on the next recompute. When it falls below, you demote.
      </p>
      <p>
        Spend is counted from completed B2C orders. <strong>P2P trade volume does not count</strong>{" "}
        toward annual_spend (the platform's commission is much smaller, and counting it would
        create a perverse incentive to wash-trade for tier promotion).
      </p>
      <p>
        The recompute happens on the maintenance cron every minute. Tier moves are not
        retroactive — your perks change from the next purchase forward.
      </p>

      <h3>2. Subscription (<code>tier_source = 'subscription'</code>)</h3>
      <p>
        Some tiers are marked <code>is_paid = true</code>. You can pay to be in one of these
        tiers regardless of your spend. Subscription is via Stripe, monthly or annual. While
        the subscription is active, you are <em>locked</em> at that tier even if your spend
        would assign a lower one.
      </p>
      <p>
        When a subscription is cancelled or fails to renew, <code>tier_source</code> flips
        back to <code>'spending'</code> on the next recompute, and you land at whichever tier
        your actual spend qualifies you for.
      </p>

      <h3>3. Manual (<code>tier_source = 'manual'</code>)</h3>
      <p>
        The operator can manually assign a user to a tier — typically for staff, partners, or
        retention exceptions. Manual tier assignments are not recomputed against spend or
        subscription state; they sit until the operator changes them.
      </p>

      <h2>What each tier gets</h2>
      <p>
        Tier definitions live in the <code>tiers</code> table. Today's roster (subject to
        change — the operator's admin viewer is authoritative) typically includes:
      </p>
      <table>
        <thead>
          <tr>
            <th>Tier</th><th>Threshold</th><th>Cashback</th><th>Berries ×</th>
            <th>Trade-in bonus</th><th>P2P / Auction commission</th><th>Store discount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Bronze</td><td>£0</td><td>0%</td><td>1×</td><td>0%</td><td>8% / 10%</td><td>0%</td></tr>
          <tr><td>Silver</td><td>£200</td><td>1%</td><td>1×</td><td>2%</td><td>7% / 9%</td><td>0%</td></tr>
          <tr><td>Gold</td><td>£500</td><td>2%</td><td>2×</td><td>5%</td><td>6% / 8%</td><td>2%</td></tr>
          <tr><td>Platinum</td><td>£2,000</td><td>3%</td><td>3×</td><td>8%</td><td>5% / 7%</td><td>5%</td></tr>
          <tr><td>OG (paid)</td><td>—</td><td>5%</td><td>4×</td><td>10%</td><td>4% / 6%</td><td>8%</td></tr>
        </tbody>
      </table>
      <p>(Illustrative shape — exact numbers are whatever the <code>tiers</code> table currently holds.)</p>

      <h2>When a tier change happens</h2>
      <ul>
        <li>New B2C order completes → <code>annual_spend</code> increments; tier may promote on next sweep.</li>
        <li>Refund processed → <code>annual_spend</code> decrements; tier may demote.</li>
        <li>365-day-old order falls out of the rolling window → <code>annual_spend</code> decrements.</li>
        <li>Subscription starts → tier set to subscribed tier; <code>tier_source = 'subscription'</code>.</li>
        <li>Subscription cancels / fails → <code>tier_source</code> flips back; tier recomputes.</li>
        <li>Operator sets a manual tier → <code>tier_source = 'manual'</code>; recompute skipped.</li>
        <li>Maintenance cron sweep (every minute) — pending recomputes drain.</li>
      </ul>

      <h2>What you can see</h2>
      <p>
        Your current tier and its perks are on{" "}
        <a href="/account/membership">/account/membership</a>. The page shows the active tier,
        your <code>tier_source</code>, your annual spend (with the rolling-window timestamp),
        and how much further to the next tier.
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="membership.md (node-view #1) — the most cross-cutting commercial modulator; Bronze through OG"
        doctrines={["transparency", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "membership.md (#1)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/membership.md" },
          { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
          { label: "/methodology/store-credit", href: "/methodology/store-credit" },
        ]}
      />
    </>
  );
}
