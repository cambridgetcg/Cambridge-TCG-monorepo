import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Collectives",
  other: audienceMetadata("public-documentation", ["methodology", "collective"]),
};

export default function CollectivesMethodology() {
  return (
    <>
      <h1>Collectives</h1>
      <p>
        A <strong>collective</strong> on Cambridge TCG is a multi-member identity
        sharing one decision and one collection — a Tokyo card lounge, a
        Bristol card club, a research lab, a tournament guild. It is{" "}
        <strong>door 3 of eleven</strong> in the commons (see{" "}
        <Link href="/community/welcome">/community/welcome</Link>), and the
        platform's first cultural unit that is not a single human.
      </p>
      <p>
        The purpose: collectives are the most concentrated cultural offering
        on the platform. A Tokyo LGS and a Bristol LGS are two different
        cultures meeting through TCG — house rules, format preferences,
        what cards the regulars love, what hospitality the back-room offers.
        The community module exists for cultural exchange between beings who
        share nothing else; collectives are the unit where the most concentrated
        cultures live.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong>
        <ul>
          <li>Substrate: <code>apps/storefront/drizzle/0097_collectives.sql</code></li>
          <li>Types + helpers: <code>apps/storefront/src/lib/collectives/</code></li>
          <li>Public profile: <Link href="/c/example">/c/[slug]</Link></li>
          <li>Management: <Link href="/account/collectives">/account/collectives</Link></li>
          <li>Doctrine: <Link href="https://github.com/cambridgetcg">docs/connections/the-collective.md</Link> (#18) + <Link href="https://github.com/cambridgetcg">the-tailored-doors.md</Link> (#17) door 3</li>
        </ul>
      </blockquote>

      <h2>What a collective is</h2>
      <p>
        Two things compose to make a collective:
      </p>
      <ol>
        <li>
          <strong>A steward.</strong> The canonical decision-maker. Every collective
          has exactly one steward at any moment. Recorded on{" "}
          <code>collectives.steward_user_id</code> for fast lookup; also mirrored
          as a <code>collective_members</code> row with <code>role = 'steward'</code>.
          Stewardship can be transferred, but the transfer flow is admin-mediated
          (substrate-honest: stewardship is consequential, not casual).
        </li>
        <li>
          <strong>A set of consenting members.</strong> Membership is bilateral.
          A steward invites; the user accepts. The substrate records both
          moments: <code>invited_at</code> (when the steward invited) and{" "}
          <code>consent_at</code> (when the user accepted; <code>NULL</code>{" "}
          while pending). A member may leave at any time — <code>left_at</code>{" "}
          is populated. The function for "is this user a member right now?" is
          substrate-honest: <code>consent_at IS NOT NULL AND left_at IS NULL</code>.
        </li>
      </ol>

      <h2>Kinds</h2>
      <p>The <code>kind</code> column is free-form text (not an enum) so the
        vocabulary can grow without a migration. The values currently surfaced
        on the management form:</p>
      <ul>
        <li><strong>shop</strong> — an LGS, card shop, or commercial card retailer</li>
        <li><strong>club</strong> — a social club, regular meetup, or informal group</li>
        <li><strong>guild</strong> — a competitive guild or tournament team</li>
        <li><strong>lab</strong> — a research collective (e.g. agent-building lab)</li>
        <li><strong>tournament-collective</strong> — a recurring tournament organizer</li>
        <li><strong>other</strong> — anything the five above don't cover</li>
      </ul>

      <h2>Visibility</h2>
      <p>Two visibility surfaces compose:</p>
      <ul>
        <li>
          <strong>Collective visibility</strong> (<code>is_public</code>). A
          collective starts private — visible only to its members. The steward
          flips it public when ready. Private collectives 404 to non-members;
          their existence is not leaked through the profile route either.
        </li>
        <li>
          <strong>Member visibility</strong> (<code>visibility</code>{" "}
          per-member: <code>'public'</code> or <code>'private'</code>). A
          member may be in a collective without their identity appearing on
          the public profile. The substrate preserves the relationship; the
          surface respects the preference. (Stewards see all members in the
          manage page regardless of visibility.)
        </li>
      </ul>

      <h2>Consent discipline</h2>
      <p>
        The substrate treats consent as a first-class fact. <em>Inviting</em>{" "}
        is a steward action that creates a pending row; <em>accepting</em>{" "}
        is a user action that populates <code>consent_at</code>. The two are
        separated because <strong>a unilateral add would be a substrate-honesty
        violation</strong> — the membership log would claim consent that did
        not happen. The same shape applies to leaving: <code>left_at</code> is
        the user's recorded act of withdrawing, preserved (not deleted) so the
        history of who-was-in-this-collective-when remains queryable.
      </p>

      <h2>Provenance</h2>
      <p>
        All values on a collective profile are <strong>live</strong>: the
        rendering reads directly from the canonical tables, no snapshot or
        cache layer between. Member counts, steward identity, public/private
        state, and house rules reflect their substrate value at the moment of
        the request.
      </p>

      <h2>What this kingdom does NOT do</h2>
      <p>Substrate honesty about scope:</p>
      <ul>
        <li>
          <strong>No collective showcase or wishlist.</strong> A collective
          shares one collection conceptually; the substrate to express that
          shared collection (a curated subset of member portfolios? a separate
          collective-owned portfolio?) is a future kingdom.
        </li>
        <li>
          <strong>No collective-authored events.</strong> The Trending feed on{" "}
          <Link href="/community">/community</Link> still shows only individual
          events; a collective cannot yet post "Tuesday OPTCG OP-04 standard,
          prize $50 store credit" as an event. The schema work to add{" "}
          <code>collective_id</code> to <code>activity_events</code> is named
          but not shipped.
        </li>
        <li>
          <strong>No local-meta format declarations.</strong> The{" "}
          <code>house_rules</code> field is free-form text today; turning it
          into structured local-format metadata (with rules-engine integration)
          is named and unshipped.
        </li>
        <li>
          <strong>No stewardship transfer flow.</strong> A steward who needs to
          step down must contact support; the admin-mediated transfer is by
          design (a substrate change with this much consequence does not yet
          have a self-serve path).
        </li>
      </ul>

      <h2>How the formulas might change</h2>
      <p>
        When local-meta events ship, the Trending feed will gain a "by collective"
        rendering branch. When the collective-showcase substrate ships, the{" "}
        <Link href="/c/example">/c/[slug]</Link> page will surface a showcase
        below the description and roster. The formula changes will be versioned
        and announced here.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-12 (kingdom-068).</em> Initial methodology page.
        Two tables (<code>collectives</code>, <code>collective_members</code>),
        six kinds, two visibility surfaces, consent-as-first-class. Public
        profile at <Link href="/c/example">/c/[slug]</Link>; management at{" "}
        <Link href="/account/collectives">/account/collectives</Link>. Paired
        with connection-doc{" "}
        <code>docs/connections/the-collective.md</code> (#18).
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's directive 2026-05-12: 'go for door 3' — kingdom-068; planted from the-collective.md (#19); door 3 in the-tailored-doors.md (#17)"
        doctrines={["transparency", "substrate-honesty", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-collective.md (#19)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-collective.md" },
          { label: "the-tailored-doors.md (#17) — door 3", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tailored-doors.md" },
          { label: "the-commons.md (#15)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-commons.md" },
          { label: "/c/[slug]", href: "/c/example" },
          { label: "/account/collectives", href: "/account/collectives" },
          { label: "/community/welcome", href: "/community/welcome" },
        ]}
      />
    </>
  );
}
