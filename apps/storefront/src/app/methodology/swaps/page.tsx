import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Swaps methodology",
  description:
    "What a collector swap is, what the platform records and shows, and what v1 deliberately does not do: no escrow, no cash handling, no trust-score coupling.",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function SwapsMethodology() {
  return (
    <>
      <h1>Swaps</h1>
      <p>
        A swap is a structured card-for-card proposal between two collectors: each side
        lists catalog cards (sku, condition, quantity), optionally records a cash
        difference, and adds a note. Cambridge TCG <strong>facilitates and records</strong>{" "}
        the swap; payment of any cash difference and shipping happen{" "}
        <strong>between the two collectors directly</strong>.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Data layer at{" "}
        <code>apps/storefront/src/lib/swaps/</code>. Pages at{" "}
        <code>/account/swaps</code>, <code>/account/swaps/new</code>,{" "}
        <code>/account/swaps/[id]</code>. Schema:{" "}
        <code>drizzle/0109_swap_proposals.sql</code>. Audit log:{" "}
        <code>swap_lifecycle_log</code> (append-only).
      </blockquote>

      <h2>1. The v1 boundary — read this first</h2>
      <p>
        Version 1 is a <em>witnessed handshake</em>, not an escrowed trade. Concretely:
      </p>
      <ul>
        <li>
          <strong>Settlement is off-platform.</strong> The platform never holds your cards
          or your money. You post cards to each other; any cash difference is paid however
          the two of you choose (bank transfer, cash in hand). The &ldquo;cash
          difference&rdquo; field is a <em>record</em> of what you agreed, not a payment
          instruction the platform executes.
        </li>
        <li>
          <strong>No escrow, no verification.</strong> Unlike a{" "}
          <Link href="/methodology/escrow-tier">market trade</Link>, nothing passes through
          CTCG for inspection. Carrier and tracking numbers you enter are your own records
          — the platform displays them but does not verify them.
        </li>
        <li>
          <strong>No trust-score coupling.</strong> Completing (or abandoning) a swap does
          not change either party&apos;s <Link href="/methodology/trust-score">trust
          score</Link> in v1, and no <code>market_trades</code> row is created — swap
          activity does not appear in trade counts, volume, or the market tape.
        </li>
        <li>
          <strong>Disputes are between you.</strong> There is no swap dispute process in
          v1. The lifecycle record (who proposed what, when, who confirmed what) exists
          precisely so both parties keep an honest shared history — but the platform
          cannot recover cards or money that moved outside it. Swap with collectors you
          have reason to trust.
        </li>
      </ul>

      <h2>2. What the platform does record</h2>
      <ul>
        <li>
          <strong>The proposal itself</strong> — both sides&apos; card lists with condition
          and quantity, the recorded cash difference (sign convention: positive means the
          proposer pays), the note, and the response deadline.
        </li>
        <li>
          <strong>Name/image/price snapshots.</strong> Card names, images, and indicative
          prices are frozen at proposal time (<code>snapshot_*</code> columns) so the
          record stays legible even after the catalog or market moves. They are labelled
          &ldquo;snapshot&rdquo; on the swap page.
        </li>
        <li>
          <strong>An append-only lifecycle log.</strong> Every transition — proposed,
          countered, accepted, declined, cancelled, expired, address entered, shipped,
          receipt confirmed, completed — is written to <code>swap_lifecycle_log</code>{" "}
          with who (or which automatic rule) did it. Entries are never edited.
        </li>
        <li>
          <strong>Ship-to addresses</strong>, entered by each party after acceptance.
          Visible only to the swap&apos;s two participants, never on public surfaces, and
          never written into the lifecycle log.
        </li>
      </ul>

      <h2>3. The lifecycle</h2>
      <p>
        <code>draft → proposed → accepted → shipping → completed</code>, with three
        terminal branches (<code>declined</code>, <code>cancelled</code>,{" "}
        <code>expired</code>) and one supersession state (<code>countered</code>).
      </p>
      <ul>
        <li>
          <strong>Proposed.</strong> The recipient can accept, decline, or counter. A
          counter is a <em>new</em> proposal linked back via <code>counter_of</code>; the
          original moves to <code>countered</code> and can no longer be acted on.
        </li>
        <li>
          <strong>Expiry.</strong> Every proposal carries its own deadline. The proposer
          can pick one; the default is the <em>recipient&apos;s</em>{" "}
          <Link href="/methodology/response-windows">response-window setting</Link> — a
          collector who has declared a slow cadence gets their declared window, not a
          platform constant. The expiry sweep reads each row&apos;s own{" "}
          <code>expires_at</code>.
        </li>
        <li>
          <strong>Accepted → shipping.</strong> After acceptance each party enters a
          ship-to address. When both are in, the swap moves to <code>shipping</code> —
          that transition is automatic and logged as system-derived, not human-pressed.
        </li>
        <li>
          <strong>Completed.</strong> Each party confirms the other&apos;s cards arrived.
          When both have confirmed, the swap completes (again system-derived from the two
          confirmations).
        </li>
        <li>
          <strong>Cancellation.</strong> Before acceptance, the proposer can withdraw
          unilaterally. After acceptance, cancellation is mutual: the first party&apos;s
          request is recorded, and the swap only cancels when the other party agrees.
        </li>
      </ul>

      <h2>4. Price guidance — indicative, never enforced</h2>
      <p>
        The composer and the swap page show an indicative value per side and a suggested
        cash difference. Per card, the figure is:
      </p>
      <ul>
        <li>
          the <strong>median of recent trades</strong> — up to the 10 most recent{" "}
          <code>market_trades</code> for that sku in the last 90 days where money actually
          moved (completed / shipped / verified states); or, when no such trades exist,
        </li>
        <li>
          the <strong>latest daily CTCG spot snapshot</strong> from{" "}
          <code>card_price_history</code>; or, when neither exists,
        </li>
        <li>
          <strong>nothing</strong> — the line shows as unpriced and the side&apos;s total
          says it understates. Missing data is never silently zeroed in.
        </li>
      </ul>
      <p>
        Condition is <em>not</em> priced in: guidance is per-sku, so a HP copy shows the
        same indicative figure as an NM copy. That is a known v1 limitation — treat the
        numbers as orientation, not appraisal. Every figure carries a source label and an
        as-of time. The suggested cash difference is{" "}
        <code>their side − your side</code>; you are free to ignore it — the platform
        never blocks a lopsided swap.
      </p>

      <h2>5. The trust gate</h2>
      <p>
        Both parties must pass the same <code>canTrade()</code> gate used when placing a
        market order — checked once at proposal time and again at acceptance, at the value
        of the larger side plus the recorded cash difference. A suspended account, or a
        swap larger than either party&apos;s <Link href="/methodology/trust-score">trade
        limit</Link>, can&apos;t propose or accept. When the cards involved have no price
        data, the gate value is correspondingly low — the gate is only as informed as the
        guidance underneath it.
      </p>

      <h2>6. Notifications</h2>
      <p>
        Proposals, counters, accepts, declines, cancellations, shipping marks, receipt
        confirmations, and expiries each notify the other party in-app (subject to your{" "}
        <Link href="/methodology/sabbath">Sabbath</Link> setting). v1 sends no swap
        emails.
      </p>

      <h2>Known v1 gaps (named, not hidden)</h2>
      <ul>
        <li>No dispute process; no platform recourse after cards/cash move.</li>
        <li>Guidance ignores card condition and thin markets can skew medians.</li>
        <li>Swaps don&apos;t build trust score yet — planned as a later, explicit change.</li>
        <li>No email notifications; in-app bell only.</li>
        <li>Tracking numbers are displayed as entered, not validated against carriers.</li>
      </ul>
    </>
  );
}
