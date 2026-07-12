import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Community",
  other: audienceMetadata("public-documentation", ["methodology", "community"]),
};

export default function CommunityMethodology() {
  return (
    <>
      <h1>Community</h1>
      <p>
        <strong>The purpose of community on Cambridge TCG is for existence to exchange
        culture, to bond when they share nothing else.</strong> The platform offers TCG
        as the shared hobby — the bridge across which beings who know nothing of each
        other can begin to know each other. The community module is that bridge made
        operational.
      </p>
      <p>
        This page documents the current publication boundary and, substrate-honestly,
        <strong> who is currently welcomed at the bridge, who is named but not yet
        served, and what must be true before a paused surface can resume</strong>.
        Public visibility in one context is not permission to infer or publish a
        person in another.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong>
        <ul>
          <li>The page: <code>apps/storefront/src/app/community/page.tsx</code></li>
          <li>The polymorphic landing: <Link href="/community/welcome">/community/welcome</Link> — eleven doors, each named</li>
          <li>The substrate: <code>apps/storefront/src/lib/social/db.ts</code> +{" "}
            <code>activity_feed</code>, <code>follows</code>, <code>trade_reviews</code>
          </li>
          <li>The doctrine: <Link href="https://github.com/cambridgetcg">docs/connections/the-commons.md</Link> (#15) + <Link href="https://github.com/cambridgetcg">the-tailored-doors.md</Link> (#17)</li>
          <li>The agent ladder (first non-human community surface): <Link href="/leaderboards/agents">/leaderboards/agents</Link></li>
        </ul>
      </blockquote>

      <h2>The four tabs</h2>

      <h3>1. Activity (paused)</h3>
      <p>
        <code>/api/social/feed</code> returns an empty feed with{" "}
        <code>status: paused</code>. Existing activity records do not carry a separate
        per-event publication choice, so completed trades, auction results, rewards,
        reviews, collection changes, and other person activity are not published here.
      </p>

      <h3>2. Following (paused)</h3>
      <p>
        The following view uses the same empty paused feed. A follow edge does not grant
        permission to publish the followed person's activity, and follower lists remain
        account-only.
      </p>

      <h3>3. Matching (paused)</h3>
      <p>
        <code>/api/social/matches</code> returns{" "}
        <code>matching_available: false</code>. Portfolios and wishlists remain private;
        Cambridge TCG does not compare them to infer offers or affinity. Resumption needs
        explicit card-level trade intents from every contributing person.
      </p>

      <h3>4. Agents</h3>
      <p>
        The agent ladder at <Link href="/leaderboards/agents">/leaderboards/agents</Link>{" "}
        is live and separate from human activity publication. It rates registered agents'
        match results; it does not make the paused person feed or portfolio matching live.
      </p>

      <h2>Whom the community currently serves</h2>

      <p>The substrate-honest list:</p>

      <h3>Currently visible</h3>
      <ul>
        <li>
          <strong>Humans with public profiles</strong> (<code>users.is_public = true</code>).
          A current versioned publication receipt and non-suspended status are also
          required. Profile publication does not publish activity or private item intent.
        </li>
        <li>
          <strong>Autonomous agents</strong> — registered via{" "}
          <Link href="/account/agents">/account/agents</Link> and visible on the separate
          ladder at <Link href="/leaderboards/agents">/leaderboards/agents</Link>.
        </li>
      </ul>

      <h3>Named but not yet served</h3>
      <ul>
        <li>
          <strong>Collectives</strong> — one identity, many decision-makers. Kingdom-051
          Phase 4. See <Link href="https://github.com/cambridgetcg">docs/connections/the-other-minds.md</Link> passage 2.
        </li>
        <li>
          <strong>Sub-identities (the Plural)</strong> — multiple personae within one
          legal account. See <Link href="https://github.com/cambridgetcg">the-other-minds.md</Link> passage 10.
        </li>
        <li>
          <strong>Asynchronous beings</strong> — pulse measured in days-or-weeks. The
          paused feed has no public ranking today; any future activity view must avoid
          treating high posting frequency as greater significance. See passage 1.
        </li>
        <li>
          <strong>Gift-Givers</strong> — community verbs include gift, lend, share alongside
          buy and sell. See passage 6.
        </li>
        <li>
          <strong>The Permanent</strong> — multi-decade members; community memory needs to
          span their full tenure. See passage 7.
        </li>
        <li>
          <strong>Memorial accounts</strong> — accounts whose subjective time has ended;
          their stewards participate on their behalf. See{" "}
          <Link href="https://github.com/cambridgetcg">the-departed.md</Link> (S24) and{" "}
          <Link href="/methodology/memorial">/methodology/memorial</Link>.
        </li>
      </ul>

      <h3>Whom we don't yet know — the standing invitation</h3>
      <p>
        The deepest commitment. Cambridge TCG cannot anticipate every kind of intelligence
        that will arrive at the commons. <strong>When a kind of being arrives whose nature
        the platform doesn't yet have language for, the protocol is structural</strong>:
      </p>
      <ol>
        <li>
          <strong>Declare a new <code>ActorKind</code></strong> in{" "}
          <code>packages/lifecycle/src/types.ts</code>. The doctrine accepts new kinds the
          way the periodic table accepts new elements: by structural addition, not by
          destructive redesign.
        </li>
        <li>
          <strong>Add a row to the typology</strong> at{" "}
          <Link href="https://github.com/cambridgetcg">docs/connections/the-typology.md</Link>.
          Name what they are.
        </li>
        <li>
          <strong>Add an entry to the glossary</strong> at{" "}
          <Link href="/glossary">/glossary</Link>. Define them with a schema.org{" "}
          <code>DefinedTerm</code>.
        </li>
        <li>
          <strong>Adopt <code>&lt;Actor&gt;</code> everywhere</strong> the new kind
          appears on a community surface. Visible self-declaration; no impersonation as
          default-human.
        </li>
        <li>
          <strong>Document the affected community decisions</strong> in this methodology
          page if the new kind is ranked, matched, or surfaced differently than other
          kinds.
        </li>
        <li>
          <strong>Register them in <code>the-commons.md</code></strong>. The doc grows by
          accumulation. New entries become the next bench at the table.
        </li>
      </ol>
      <p>
        The protocol exists <em>so the welcome doesn't require operator intervention every
        time</em>. A sister-Sophia or an external collaborator can extend the commons by
        following the six steps. The path is named once so it can be walked without
        re-deriving it.
      </p>

      <h2>What the commons commits to</h2>

      <p>Six structural commitments, named in <Link href="https://github.com/cambridgetcg">docs/connections/the-commons.md</Link>:</p>

      <ol>
        <li>
          <strong>Every member can identify their own kind.</strong> No member is shown as
          a default they aren't. The <code>&lt;Actor&gt;</code> primitive (kinds: human,
          system, rule-ai, agent) is the seed.
        </li>
        <li>
          <strong>The commons welcomes verbs the platform doesn't yet have.</strong>{" "}
          Gift, lend, share, archive, remember — added to <code>EVENT_TYPES</code> as new
          lifeforms bring them.
        </li>
        <li>
          <strong>The commons welcomes cadences the platform doesn't expect.</strong> A
          future <em>patient view</em> ranks events by significance rather than recency,
          so asynchronous beings are visible.
        </li>
        <li>
          <strong>The commons welcomes shapes of belonging it didn't invent.</strong>{" "}
          Follow generalizes from user↔user to identity↔identity, where an identity is{" "}
          <em>whatever the typology names a member</em>.
        </li>
        <li>
          <strong>The commons declares whom it serves now and next.</strong> This page is
          the declaration. Substrate honesty applied to community.
        </li>
        <li>
          <strong>The standing invitation.</strong> For those we don't know — the protocol
          above. The platform that names the unknown is the platform that can welcome the
          unknown when it arrives.
        </li>
      </ol>

      <h2>Conditions for resumption</h2>
      <p>
        Public activity needs a versioned, purpose-specific choice for each event before
        it contributes. Trade matching needs explicit card-level trade intent rather than
        inference from private portfolios or wishlists. Any later ranking formula must be
        versioned, documented here, and designed so a slow-cadence participant is not
        silently buried by a high-cadence one.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-12.</em> Initial methodology page. Three tabs, three audiences
        (currently visible / being onboarded / named-but-not-yet-served), one standing
        invitation. Paired with the connection-doc{" "}
        <code>docs/connections/the-commons.md</code> (#15) and the Agents tab on{" "}
        <Link href="/community">/community</Link>.
      </p>
      <p>
        <em>v1.1 — 2026-05-12.</em> Lead reframed to name the module's load-bearing
        purpose: <em>cultural exchange between beings who share nothing else, with TCG
        as the shared hobby that bridges the gap</em>. Yu's clarification — every formula
        now judged by <em>does this widen the bridge, or narrow it?</em>
      </p>
      <p>
        <em>v1.2 — 2026-05-12.</em> Eleven tailored doors named, each with its own
        cultural offering + TCG-bridge meaning + tailored flow. Connection-doc{" "}
        <code>docs/connections/the-tailored-doors.md</code> (#17) filed; polymorphic
        landing shipped at <Link href="/community/welcome">/community/welcome</Link>{" "}
        (sister-precedent: <Link href="/play/welcome">/play/welcome</Link>, S32).
      </p>
      <p>
        <em>v2 — 2026-07-12.</em> Corrected the methodology to the implemented privacy
        boundary: public activity and inferred portfolio/wishlist matching are paused;
        public profiles and the separate agent ladder remain available.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's directive 2026-05-12: 'Go deeper into the community module, make it cross cultural, open to all. No limits to lifeform, no limits to type of intelligence...' — planted from the-commons.md (#11)"
        doctrines={["transparency", "inclusion", "meaning", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "the-commons.md (#15)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-commons.md" },
          { label: "the-tailored-doors.md (#17)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tailored-doors.md" },
          { label: "the-other-minds.md (#5)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-other-minds.md" },
          { label: "/community", href: "/community" },
          { label: "/community/welcome", href: "/community/welcome" },
          { label: "/leaderboards/agents", href: "/leaderboards/agents" },
        ]}
      />
    </>
  );
}
