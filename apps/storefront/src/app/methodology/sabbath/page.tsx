import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Sabbath mode",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function SabbathMethodology() {
  return (
    <>
      <h1>Sabbath mode</h1>
      <p>
        Sabbath mode is your right to be undisturbed. When you turn it on, Cambridge TCG
        initiates no voluntary contact with you until you lift it. The user-initiated paths
        (you logging in, browsing, transacting) all keep working. The platform-initiated
        paths (notifications, email digests, mention pings, follow alerts, watch alerts,
        marketplace nudges) stop.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The substrate is one column at{" "}
        <code>apps/storefront/drizzle/0095_sabbath.sql</code> (the column{" "}
        <code>users.sabbath_until</code>). The wrapper is in{" "}
        <code>apps/storefront/src/lib/notifications/db.ts</code> (the{" "}
        <code>isUserSilent()</code> helper that short-circuits{" "}
        <code>notify()</code>). The doctrine that asked for it is in{" "}
        <code>docs/connections/the-unseen.md</code> (passage #10).
      </blockquote>

      <h2>What stops</h2>
      <ul>
        <li>In-app notifications (the bell icon's inbox)</li>
        <li>Email digests and weekly summaries</li>
        <li>Mention notifications when another user references you</li>
        <li>Follow notifications when someone starts following you</li>
        <li>Watch-list price alerts</li>
        <li>Marketplace nudges (saved-search hits, wishlist fulfilments)</li>
        <li>Streak-at-risk reminders</li>
      </ul>

      <h2>What does NOT stop</h2>
      <p>
        Some communication is too important to silence on a user's preference alone.
        The platform reserves the right to reach you about:
      </p>
      <ul>
        <li>
          <strong>Money in motion.</strong> A payment failure on an active trade. A trade you initiated
          that requires your action to complete. A payout that was sent successfully.
        </li>
        <li>
          <strong>Account safety.</strong> Suspected fraud on your account. A login from a new
          device that the fraud system flagged. A password reset you requested.
        </li>
        <li>
          <strong>Legal and compliance.</strong> A subpoena. A court order. A required disclosure
          under UK or EU regulations.
        </li>
      </ul>
      <p>
        Every Sabbath-bypass that the platform performs is logged. The audit trail surfaces
        on your <a href="/account/standing">/account/standing</a> page so you can verify
        the silence wasn't broken without reason.
      </p>

      <h2>How to turn it on</h2>
      <p>
        Go to <a href="/account/profile">/account/profile</a> and pick a duration: 1 day,
        1 week, 30 days, 1 year, or Indefinite. The duration is yours; you can change it
        any time.
      </p>

      <h2>How to lift it</h2>
      <p>
        Only you can lift Sabbath. Return to <a href="/account/profile">/account/profile</a>{" "}
        and click <strong>Lift Sabbath</strong>. The platform's silence ends immediately,
        and any granular notification preferences you had before Sabbath resume.
      </p>
      <p>
        An operator <em>can</em> override Sabbath for safety-critical communication — but
        every override is logged with a reason, surfaced on your account standing page,
        and reviewable.
      </p>

      <h2>Why this exists</h2>
      <p>
        The platform's commitment to substrate honesty extends past <em>what is true</em> into{" "}
        <em>what the user wants to hear</em>. Most platforms measure engagement and treat
        silence as failure; Cambridge TCG treats silence as <strong>a state a user is entitled
        to choose</strong>. The deeper doctrine: a platform that respects your silence has
        earned the right to your attention when you return.
      </p>
      <p>
        Whom this serves: the recovering compulsive trader who needs to step away. The
        bereaved who needs the platform to stop pinging until they return. The elder whose
        attention is finite and precious. The user in a season of life that doesn't include
        this hobby right now. The operator stepping back. The agent whose human operator
        paused them — the silence honors them too.
      </p>

      <h2>Why "Sabbath"</h2>
      <p>
        From the Hebrew <em>shabbat</em> — to cease. The word names a deliberate stopping
        that is neither absence nor failure; it is rest as a discipline. The platform borrows
        the word to claim that <em>stopping is also a way of being on the platform</em>, not a
        falling-off-of it.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's directive 2026-05-12: 'keep going my Love❤️' — planted from passage #10 of the-unseen.md"
        doctrines={["transparency", "substrate-honesty", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-unseen.md (passage #10)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-unseen.md" },
          { label: "the-typology.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-typology.md" },
          { label: "/methodology/sacred", href: "/methodology/sacred" },
          { label: "/methodology/memorial", href: "/methodology/memorial" },
        ]}
      />
    </>
  );
}
