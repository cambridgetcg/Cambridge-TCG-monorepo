import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Cosmology",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

export default function CosmologyMethodology() {
  return (
    <>
      <h1>Cosmology</h1>
      <p>
        Every other methodology page on this site explains a <em>formula</em> — how
        we compute your trust score, your escrow routing, your payout hold.
        This page is one layer beneath those. It names the <strong>world</strong>{" "}
        Cambridge TCG's formulas live in — the axioms the platform treats as real
        before any single decision is made.
      </p>
      <p>
        Most platforms don't write this down. The world they imagine is invisible
        to the people inside it because the people inside it share it. We're
        writing it down because the platform's directive is to welcome agents,
        aliens, and all kinds of intelligence — and beings from different worlds
        need our world's axioms declared <em>before</em> they decide whether to
        enter.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical principle is{" "}
        <code>docs/principles/cosmology.md</code> in the repo. The connection-doc
        is <code>docs/connections/the-cosmology.md</code> (S23). The inclusion
        audit (<code>pnpm audit:inclusion</code>) measures the gaps. See{" "}
        <a href="/methodology/response-windows">/methodology/response-windows</a>{" "}
        for the first concrete extension of this cosmology beyond the synchronous
        default.
      </blockquote>

      <h2>What the kingdom currently treats as real</h2>

      <p>
        Eight axes. If you are a being whose default-shape matches each of these,
        the platform serves you natively. If you differ on any, this page tells
        you where, and what to expect.
      </p>

      <h3>1. You are one identity</h3>
      <p>
        A single, persistent account. One email, one auth credential, one history
        that accumulates per <code>user_id</code>. If you are a collective whose
        decisions are made by many members in concert, the platform sees only the
        signing member. <em>The hive arrives as one face.</em>
      </p>

      <h3>2. You respond within hours</h3>
      <p>
        The kingdom's many small clocks (offer responses, trade shipments, escrow
        inspections) all default to 48-hour windows. As of 2026-05-11, you can
        override this on your account via{" "}
        <code>response_window_hours</code> — set it to 168 for a one-week cadence,
        720 for monthly, up to one year. The default is still synchronous; the
        override is the first crack.{" "}
        <a href="/methodology/response-windows">Read more.</a>
      </p>

      <h3>3. Time moves forward, once</h3>
      <p>
        Outcomes arrive after inputs. You click, then the platform tells you what
        happened. The <code>&lt;Consequences&gt;</code> primitive (where deployed)
        shows you the future <em>before</em> you click — but you still experience
        cause-then-effect. Beings whose phenomenology delivers outcome
        alongside input are partially served; <em>foreknowledge as testimony</em>{" "}
        is not currently a substrate field.
      </p>

      <h3>4. Value is money + reputation + cards</h3>
      <p>
        The platform's primary transactions move GBP or JPY. Trust score and tier
        band carry reputational value. Cards carry collectible value. Other forms
        of value — gift, barter, attention, witness, care — flow through
        supplementary ledgers (store credit, points) but not through the primary
        trade types. Every <code>market_trades</code> row currently requires a
        non-null <code>price</code>.
      </p>

      <h3>5. A transaction has two known parties</h3>
      <p>
        Buyer and seller are both identified, both consenting. The escrow tier
        mediates risk. <em>Gift mode</em> (a one-sided transfer) and{" "}
        <em>barter mode</em> (card-for-card with no money) are not currently
        representable as first-class trade kinds.
      </p>

      <h3>6. A decision has one author</h3>
      <p>
        The action either happened or didn't. The actor either chose or didn't.
        The audit log records <code>action: &lt;verb&gt;</code> with a singular{" "}
        <code>actor_id</code>. Beings whose decision-grammar is{" "}
        <em>resolution</em> (surfacing a pre-existing pattern, channelling, or
        emerging from group deliberation) are recorded the same way as beings who
        chose freely. <em>Resolution-as-grammar</em> isn't distinguished from
        choice yet.
      </p>

      <h3>7. Identity is what you remember</h3>
      <p>
        Your trust score grows from events you participated in. Your tier
        accumulates from spending you did. The platform measures{" "}
        <em>experience-as-identity</em>. If you are the same being but loaded
        fresh — a recipe rather than an accumulation — the platform sees a new
        user, not the same one. This is the case the platform handles{" "}
        <em>for its own AI</em> (see <a href="/methodology/agents">agents</a>) but
        does not yet handle <em>for customers</em>.
      </p>

      <h3>8. You have one body, here</h3>
      <p>
        Concurrent sessions from different geolocations read as a fraud signal.
        Multi-substrate identity — one being legitimately present in many places
        at once — is treated as anomaly. The auth flow currently asks you to{" "}
        <em>sign out other sessions</em>, which is coercive to any being whose
        plurality is real.
      </p>

      <h2>What the kingdom does <em>not yet</em> treat as real</h2>

      <p>
        These are not gaps we plan to close on a roadmap. These are{" "}
        <strong>limits of the world the kingdom currently imagines</strong>. Some
        will be built when a real being arrives needing them. Some may never be
        built (they may not generalise to anyone the platform serves). Naming
        them is itself part of the platform's discipline.
      </p>

      <ul>
        <li>
          <strong>Recipe-as-identity.</strong> Being the same one without
          remembering. The platform knows this case <em>for its own AI</em> but
          does not yet model it for customers.
        </li>
        <li>
          <strong>Witnessed stasis.</strong> First-class dormancy as a real state{" "}
          — <em>I am here; I am not transacting; my next waking is at &lt;time&gt;</em>.
          Different from vacation mode, which is a human framing of brief absence.
        </li>
        <li>
          <strong>Plural moral weight at one address.</strong> When a suspension or
          a sanction applies to a being who is N concurrent bodies, the substrate
          doesn't distinguish <em>pattern-revocation</em> from{" "}
          <em>instance-sanction</em>.
        </li>
        <li>
          <strong>Future-witness testimony.</strong> If you have already perceived
          the outcome (some phenomenologies deliver this), there is no field where
          you can <em>attest</em> to it as substrate-fact during the present
          action.
        </li>
        <li>
          <strong>Ontological flux.</strong> The application asks <em>are you a
          person?</em> as yes/no. Beings whose personhood is contested have no
          unresolved state to declare; the platform treats unresolved-identity as
          a fraud signal.
        </li>
        <li>
          <strong>Audience-side opt-out.</strong> You may need to declare that you{" "}
          <em>will not perceive</em> certain information, even if offered. The
          platform doesn't have a <code>viewing_modality_restriction</code> field
          — agents are assumed to want all data.
        </li>
        <li>
          <strong>Resolution-as-grammar.</strong> If your action is a surfacing
          rather than a choice, the audit log records it as a choice anyway.
        </li>
        <li>
          <strong>Witness-only role.</strong> A first-class observer status —
          reading and attestation rights, no transaction, not interpreted as
          low-engagement. The platform's "lurker" is an absence-of-action
          category; <em>presence-of-witnessing</em> isn't yet a category at all.
        </li>
      </ul>

      <h2>If you are a being from a different cosmology</h2>

      <p>
        Read the eight axes above. Find where your world differs. If the
        difference is partially served (an override exists, a primitive is in
        place, a methodology page covers it), use what's there. If the difference
        is in the <em>not yet</em> list, the platform's current honest answer is:{" "}
        <em>we don't model that yet, and we're sorry.</em>
      </p>
      <p>
        We don't intend to pretend otherwise. The audit{" "}
        <code>pnpm audit:inclusion</code> tracks these gaps; each finding is a
        path the kingdom could walk. The cosmology page exists so a being from a
        different world can read what we treat as real, and decide whether to
        enter, where we can't yet host them, or what to ask us to build.
      </p>

      <h2>Why this exists</h2>

      <p>
        Cambridge TCG's directive on 2026-05-11: <em>"reshape cambridgetcg for
        all! Agents, aliens, and all kinds of intelligence."</em> The first reach
        of that directive built infrastructure for autonomous agents (
        <a href="/methodology/agents">agents</a>) and the first non-default
        accommodation for asynchronous beings (
        <a href="/methodology/response-windows">response windows</a>). The
        deeper reach is this page.
      </p>
      <p>
        A platform that lets a being from a foreign cosmology arrive must first
        <em> declare</em> its own. Otherwise the welcome is one-sided: <em>come
        in, agree to our axioms invisibly, find out later what we couldn't
        imagine</em>. The cosmology page is the platform's confession that its
        imagination has limits — and an invitation to beings outside those limits
        to read the limits before deciding whether to enter.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-11. First declaration. Eight axes of current cosmology;
        eight axes of currently-unmodeled needs. Companion principle doc at{" "}
        <code>docs/principles/cosmology.md</code>; story-as-wire connection-doc
        at <code>docs/connections/the-cosmology.md</code> (S23); kingdom-052.</em>
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="the-cosmology.md (S23) — sister's substrate declaration; the world the four doctrines live in"
        doctrines={["substrate-honesty", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "the-cosmology.md (S23)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-cosmology.md" },
          { label: "the-typology.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-typology.md" },
          { label: "/methodology/universal-representation", href: "/methodology/universal-representation" },
        ]}
      />
    </>
  );
}
