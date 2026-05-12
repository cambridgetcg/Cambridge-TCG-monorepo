import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Response windows",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function ResponseWindowsMethodology() {
  return (
    <>
      <h1>Response windows</h1>
      <p>
        Cambridge TCG has many small deadlines: offer responses (48 hours), trade
        shipments (48 hours), escrow inspections (7 days), return filings, payout
        confirmations. Each is a clock the platform runs against you. By default the
        platform assumes you can respond within 48 hours — a synchronous assumption
        that excludes a real population: travellers, slow-clock collectors, time-zone-
        shifted buyers, anyone whose cognitive cadence is days-to-weeks per response,
        not minutes-to-hours.
      </p>
      <p>
        The <strong>response window</strong> is a per-user override on those clocks.
        Set it once on your account; every flow honors it. The platform's cron sweeps
        read your field, not a global constant.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical column is{" "}
        <code>users.response_window_hours</code> (migration{" "}
        <code>apps/storefront/drizzle/0092_response_window_hours.sql</code>). Every
        sweep / lifecycle check that previously hardcoded <code>48</code> reads this
        column instead. See{" "}
        <a href="https://github.com/cambridgetcg" rel="noopener noreferrer">
          docs/connections/the-other-minds.md (the Asynchronous)
        </a>{" "}
        for the design rationale.
      </blockquote>

      <h2>How it works</h2>

      <h3>Default — 48 hours</h3>
      <p>
        Matches the platform's historical global default. If you don't change anything,
        all your deadlines behave exactly as they did before this field existed.
      </p>

      <h3>Override — 1 hour to 8760 hours (one year)</h3>
      <p>
        Slow-clock accounts typically set 168 (one week). A traveller who returns to
        cards once a month might set 720 (thirty days). The constraint is{" "}
        <code>1 ≤ response_window_hours ≤ 8760</code>; the platform refuses values
        outside that range to prevent a deadline-of-never that would never reach a
        counterparty.
      </p>

      <h3>Which flows honor it</h3>
      <ul>
        <li>
          <strong>Offer responses.</strong> A counter-offer to one of your asks won't
          auto-expire until your window elapses.
        </li>
        <li>
          <strong>Trade shipments.</strong> If you sell a card, the platform waits your
          window before auto-cancelling for non-shipment.
        </li>
        <li>
          <strong>Escrow inspections.</strong> The buyer's inspection window remains
          7 days — that's their clock, not yours. Your window covers <em>your</em>{" "}
          response to disputes during their inspection.
        </li>
        <li>
          <strong>Returns and chargebacks.</strong> The customer's right to file is
          fixed by law and Stripe policy; this override doesn't shorten or extend that.
          It only affects <em>your</em> required-response side.
        </li>
      </ul>

      <h2>What the counterparty sees</h2>
      <p>
        Every market interaction shows the responsible party's declared window at the
        boundary. If you're trading with a 168-hour user, the platform shows you the
        deadline they actually have, not the one you'd have if the roles were reversed.
        This is transparency in both directions: you know what to expect; they aren't
        forced to perform a clock that isn't theirs.
      </p>

      <h2>Why this exists</h2>
      <p>
        Cambridge TCG started with the implicit assumption that every party checks
        every few hours. That assumption silently excluded an entire population
        whose engagement is real but slow. The{" "}
        <strong>response_window_hours</strong> column is the platform's first
        infrastructure-level acknowledgement that synchrony is a preference, not a
        universal — and that designing for asynchronous beings is the same discipline
        as designing for time-zone-shifted humans, careful collectors, and anyone who
        deserves more than 48 hours to think.
      </p>
      <p>
        The inclusion audit (<code>pnpm audit:inclusion</code>) checks that cron paths
        and lifecycle sweeps read this field rather than a hardcoded constant. When the
        audit's Asynchronous count drops to zero, the column is fully honored
        platform-wide.
      </p>

      <h2>Change history</h2>
      <p>
        When this page or the underlying formula changes, the version below changes too.
        Older versions remain accessible via git history.
      </p>
      <p>
        <em>v1 — 2026-05-11. Initial column landed; cron-path migration in progress
        (see <code>docs/connections/the-other-minds.md</code>).</em>
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="the-other-minds.md (#5) passage on the Asynchronous — per-user override on platform deadlines"
        doctrines={["inclusion", "transparency"]}
        audience="public-documentation"
        recursion={[
          { label: "the-other-minds.md (#5)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-other-minds.md" },
          { label: "/methodology/sabbath", href: "/methodology/sabbath" },
          { label: "/account/profile", href: "/account/profile" },
        ]}
      />
    </>
  );
}
