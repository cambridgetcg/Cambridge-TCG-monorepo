import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Messaging",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function MessagingMethodology() {
  return (
    <>
      <h1>Messaging</h1>
      <p>
        Direct messages let any two traders talk — about a listing, a trade, or a card.
        Because a message reaches into someone else&apos;s attention, the platform makes
        several decisions on both parties&apos; behalf. This page names all of them.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> Guards, rate limits, and thread rules:{" "}
        <code>apps/storefront/src/lib/messages/db.ts</code>. Email batching:{" "}
        <code>apps/storefront/src/lib/email/handlers/dm-unread.ts</code>. Schema:
        migrations <code>0072_direct_messages.sql</code> and{" "}
        <code>0110_dm_audibility.sql</code>.
      </blockquote>

      <h2>Who can message you</h2>
      <ul>
        <li>
          <strong>Blocks are bidirectional.</strong> If either of you has blocked the
          other, neither can open a thread or send a message. The refusal happens before
          anything is written — including at the &quot;Message&quot; button, so you learn
          before composing.
        </li>
        <li>
          <strong>You can opt out entirely.</strong> The <em>accepts messages</em> toggle
          on your profile refuses all new unsolicited messages. It defaults to off.
        </li>
        <li>
          <strong>Empty threads stay private to their opener.</strong> Opening a thread
          without sending anything does not appear in the other person&apos;s inbox; they
          see the conversation only when the first message lands.
        </li>
      </ul>

      <h2>Rate limits</h2>
      <ul>
        <li>
          <strong>10 messages per fixed minute.</strong> High enough for a quick
          shipping-address exchange, low enough to blunt paste-bombing.
        </li>
        <li>
          <strong>50 messages per UTC day.</strong> Caps broadcast abuse.
        </li>
        <li>
          <strong>10 new-conversation attempts per fixed hour.</strong> Opening threads with many
          strangers in quick succession is a spam shape. Re-opening an existing thread is
          never limited.
        </li>
      </ul>
      <p>
        Limits use atomic, window-specific HMAC buckets so parallel sends cannot all
        slip through the same preflight count. The bucket never stores the raw account
        id. Hitting a limit returns an explicit error naming the cap; if safe hashing or
        bucket storage is unavailable, messaging fails closed.
      </p>

      <h2>Reference chips</h2>
      <p>
        A message can carry a chip pointing at a trade, offer, lot, auction, or order.
        The chip is only stored after the platform verifies the sender&apos;s relationship
        to the referenced thing (e.g. you must be a party to a trade to cite it). This
        prevents a stranger from borrowing the platform&apos;s provenance to dress up a
        phishing message.
      </p>

      <h2>How you find out — and what &quot;fresh&quot; means here</h2>
      <ul>
        <li>
          <strong>In-app.</strong> A bell notification (at most one per conversation per
          day), an unread badge on the envelope in the navigation (refreshed every 60
          seconds), and the inbox itself (open thread refreshed every 15 seconds, list
          every 45). Messaging here is polled, not push — a reply can take up to one
          refresh interval to appear.
        </li>
        <li>
          <strong>Email.</strong> When a message arrives and you haven&apos;t read it, you
          get one email pointing at the conversation — then at most one email per
          conversation every 12 hours, and none at all once you&apos;ve read the thread,
          unless something new arrives after that. Turn this off under{" "}
          <a href="/account/emails">Email preferences</a> (&quot;Direct messages&quot;) or
          via the unsubscribe link in any such email. Sabbath-mode and memorial accounts
          receive neither notifications nor emails.
        </li>
      </ul>

      <h2>What the platform does not do</h2>
      <ul>
        <li>
          Messages are <strong>not end-to-end encrypted</strong>; platform administrators
          can read them when investigating abuse reports.
        </li>
        <li>
          The platform does <strong>not moderate messages automatically</strong>. If
          someone abuses the channel, block them and report the trade context — review is
          manual.
        </li>
        <li>
          Anything you arrange over messages (meet-ups, off-platform payment) is{" "}
          <strong>settled off-platform</strong> and carries none of the escrow or dispute
          protections trades have.
        </li>
      </ul>

      <h2>Changelog</h2>
      <ul>
        <li>
          <strong>2026-07-05</strong> — per-minute limit raised 5 → 10 (address exchanges
          tripped it); thread-open guard + hourly cap added; unread-email batching (12h
          window) introduced.
        </li>
        <li>
          <strong>2026-05 (migration 0072)</strong> — direct messaging shipped: blocks,
          opt-out, 5/min + 50/day limits, reference validation.
        </li>
      </ul>
    </>
  );
}
