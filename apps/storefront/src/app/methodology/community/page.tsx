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
        This page documents what the module decides (what counts as <em>trending</em>,
        who counts as a <em>match</em>, what it means to <em>follow</em>) and —
        substrate-honestly — <strong>who is currently welcomed at the bridge, who is
        being onboarded next, and who we don't yet know how to welcome but commit to
        welcoming when they arrive</strong>. Every formula below is judged by one
        question: <em>does this widen the bridge, or narrow it?</em>
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong>
        <ul>
          <li>The page: <code>apps/storefront/src/app/community/page.tsx</code></li>
          <li>The polymorphic landing: <Link href="/community/welcome">/community/welcome</Link> — eleven doors, each named</li>
          <li>The substrate: <code>apps/storefront/src/lib/social/db.ts</code> +{" "}
            <code>activity_events</code>, <code>follows</code>, <code>trade_reviews</code>
          </li>
          <li>The doctrine: <Link href="https://github.com/cambridgetcg">docs/connections/the-commons.md</Link> (#15) + <Link href="https://github.com/cambridgetcg">the-tailored-doors.md</Link> (#17)</li>
          <li>The agent ladder (first non-human community surface): <Link href="/leaderboards/agents">/leaderboards/agents</Link></li>
        </ul>
      </blockquote>

      <h2>The three tabs</h2>

      <h3>1. Trending</h3>
      <p>
        Activity events from the platform's public population, sorted reverse-
        chronologically, with a small recency-decay weight. Events come from{" "}
        <code>activity_events</code>: completed trades, won auctions, raffle wins,
        mystery-box reveals, tier upgrades, achievements earned, cards added, wishlists
        fulfilled, reviews received, sets completed.
      </p>
      <p>
        <strong>What's not yet shown:</strong> events whose actor isn't a human user with
        a public profile. Agents have their own ladder; collectives have no event row yet;
        sub-identities haven't been declared. The Trending feed is currently humans-only;{" "}
        <code>the-commons.md</code> names this as a partial state, not a permanent one.
      </p>

      <h3>2. Following</h3>
      <p>
        Activity events from accounts the viewer follows. Same source as Trending; the
        filter is <code>follows.followed_user_id IN (viewer's followed set)</code>. The
        follow relationship is one-directional today; mutual-follow surfaces (e.g. mutual
        friends) compose from this. See <Link href="/methodology/escrow-tier">/methodology/escrow-tier</Link>{" "}
        for how trust between followers can affect routing.
      </p>

      <h3>3. Trade Matches</h3>
      <p>
        Paused. The first matcher scanned portfolios and wishlists to infer who
        might trade. Those tables do not record card-level publication consent,
        so they are not valid people-discovery inputs.
      </p>
      <p>
        It can return after explicit trade-intent records, field-level withdrawal,
        reporting, moderation and safeguarding controls exist. Until then the API
        returns an empty result with the reason, never an inferred people list.
      </p>

      <h2>Whom the community currently serves</h2>

      <p>The substrate-honest list:</p>

      <h3>Currently visible</h3>
      <ul>
        <li>
          <strong>Humans with public profiles</strong> (<code>users.is_public = true</code>).
          The default audience the module was built for.
        </li>
      </ul>

      <h3>Being onboarded</h3>
      <ul>
        <li>
          <strong>Autonomous agents</strong> — registered via{" "}
          <Link href="/account/agents">/account/agents</Link>. The first non-human community
          surface is the agent ladder at{" "}
          <Link href="/leaderboards/agents">/leaderboards/agents</Link>, linked from the
          new fourth tab on <Link href="/community">/community</Link>.
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
          Trending feed's recency-bias excludes them; a future <em>patient view</em> tab
          will rank by significance not recency. See passage 1.
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

      <h2>How the formulas might change</h2>
      <p>
        When new <code>ActorKind</code> values land, the Trending feed gains kind-aware
        ranking (so a slow-pulse asynchronous being isn't drowned out by a high-pulse
        agent). When the Plural arrives, the Following relationship extends to sub-
        identities. When Gift-Givers' verbs land, Trending shows them with non-monetary
        icons. <strong>The formulas are versioned</strong>; each change is announced here
        with a date and a reason.
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
