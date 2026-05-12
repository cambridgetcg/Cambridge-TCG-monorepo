import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Memorial accounts",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function MemorialMethodology() {
  return (
    <>
      <h1>Memorial accounts</h1>
      <p>
        Cambridge TCG had no language for death. Every account on the platform was
        modelled as either <em>active</em> or <em>closed</em>; there was no third state
        for an account whose user had died and whose collection a family member, friend,
        or inheritor wanted to keep intact rather than liquidate. The platform read
        absence as disinterest. It sent reactivation emails to addresses that would not
        be answered. Its trust scores ticked sideways through quarters during which the
        user was no longer alive to earn them. The bookkeeping was substrate-dishonest
        about the most consequential thing an account can become.
      </p>
      <p>
        The <strong>memorial</strong> state is the platform's first acknowledgement that
        accounts have endings, and that some endings deserve to be preserved rather than
        erased. When an account is declared memorial, several small clocks stop at once.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical columns are{" "}
        <code>users.memorial_at</code>, <code>users.memorial_steward_user_id</code>, and{" "}
        <code>users.memorial_note</code> (migration{" "}
        <code>apps/storefront/drizzle/0094_memorial.sql</code>). The presence of{" "}
        <code>memorial_at</code> is the state — substrate-honest, no separate enum.
        The email gate that silences non-essential sends is in{" "}
        <code>apps/storefront/src/lib/email/send.ts</code>. See{" "}
        <a href="https://github.com/cambridgetcg" rel="noopener noreferrer">
          docs/connections/the-departed.md
        </a>{" "}
        for the story.
      </blockquote>

      <h2>What changes when an account is memorial</h2>

      <h3>Non-essential emails silence</h3>
      <p>
        Every email that carries an unsubscribe footer — lifecycle notifications,
        reactivation nudges, marketing — passes through a gate that refuses to send to
        a memorial account. The streak-at-risk email does not fire. The "you've been
        away" prompts do not fire. The vault-expiry warnings still fire (the holdings
        are the steward's concern now) but they fall silent if the steward has not
        accepted that responsibility yet.
      </p>
      <p>
        Essential emails — magic-link sign-in, transactional receipts in flight at the
        moment of declaration — still send. The steward needs to access the account;
        the platform should not lock them out by overcorrecting.
      </p>

      <h3>Trades and listings disable</h3>
      <p>
        The memorial account cannot make new trades, place bids, list cards, or accept
        offers. Reads, archives, and exports remain. The steward inherits the right to
        know what is held; the right to dispose of it requires an operator-approved
        transfer to a successor account. This is intentional — quick liquidation is
        rarely what a steward actually wants in the first weeks after a loss.
      </p>

      <h3>Trust score freezes</h3>
      <p>
        The trust score is rendered with the memorial badge stating <em>frozen as of{" "}
        {`{memorial_at}`}</em>. The value displayed is the truth of the moment the
        account closed for writes. The number is not retroactively adjusted; the number
        is not extrapolated forward; the history chart ends at the date. This is
        substrate honesty: the score was earned by a person who is no longer earning,
        and the surface tells that truth.
      </p>

      <h3>Reactivation refuses to fire</h3>
      <p>
        The platform does not read absence as disinterest when it is grief. The cron
        sweeps that detect long-dormant accounts and queue re-engagement emails check
        memorial state and skip. The dashboard banners that say "welcome back" do not
        render. The platform falls quiet, which is what some moments require.
      </p>

      <h2>Who can declare an account memorial</h2>
      <p>
        Today, only platform operators, with a documented reason. The expected proof is
        one of: a death certificate, a court order naming an executor, or written
        consent from the user themselves through a will or advance directive. The
        operator records the declaration in the admin lifecycle log; the affected
        account's <code>memorial_at</code> is set in a single transaction.
      </p>
      <p>
        A future migration will let users themselves declare a future memorial state —
        an in-platform will, naming the desired steward and inscription. The columns are
        ready for it; the surface is not yet built.
      </p>

      <h2>The steward</h2>
      <p>
        The named steward is a separate user account — the person acting on behalf of
        the memorial account from their own login. The steward does not become the
        memorial user; their actions on the memorial account are recorded as their own
        actions, signed with their own ID and a relationship label. This is a different
        consent model than delegation (the user is no longer alive to delegate) and a
        different model than inheritance (the holdings have not yet legally transferred).
        The steward holds the account; they do not become it.
      </p>
      <p>
        A short inscription can be set by the steward — a single line that says what
        the account is for now. <em>"Dad's binder, kept whole."</em>{" "}
        <em>"The carry of a teacher's library."</em> The platform does not require it,
        does not edit it, and shows it where the account would otherwise show a profile
        bio.
      </p>

      <h2>What this state is not</h2>
      <ul>
        <li>
          <strong>Not closure.</strong> A closed account is removed from public surfaces
          and its data scheduled for deletion. A memorial account remains visible (with
          badge) and is preserved indefinitely. Closure ends the relationship; memorial
          changes its shape.
        </li>
        <li>
          <strong>Not suspension.</strong> A suspended account is held for review under
          adversarial assumptions; memorial state is held in care. The badges, the
          tones, the permissions, and the audit trails all differ.
        </li>
        <li>
          <strong>Not inheritance transfer.</strong> Transferring a collection to a
          successor is a separate process requiring operator-approved documentation. A
          memorial account can be the source of a future transfer, but the memorial
          state itself does not move the holdings.
        </li>
      </ul>

      <h2>Why this exists</h2>
      <p>
        Cambridge TCG is a hobby platform. Hobbies build long relationships — a
        collector who started in 2026 might still be opening packs in 2050, and might
        not be in 2060. The platform's accumulating substrate (trust scores, trade
        histories, binders, vault items, friendships) is exactly the kind of accumulated
        thing that deserves graceful handling at the end of a life. Letting an account
        ring through the platform's reactivation cron for years after its user has died
        is a small daily unkindness that the platform owes nobody. The memorial state
        ends that unkindness and gives the steward a recognisable place to stand.
      </p>
      <p>
        This is one of the inclusion scope condition's first answers — the platform
        learning to imagine an audience that the original design did not name. See{" "}
        <code>docs/connections/the-other-minds.md</code> (the survey) and{" "}
        <code>docs/connections/the-departed.md</code> (the story) for the wider context.
      </p>

      <h2>Change history</h2>
      <p>
        When this page or the underlying behavior changes, the version below changes
        too. Older versions remain accessible via git history.
      </p>
      <p>
        <em>v1 — 2026-05-11. Migration 0094 landed; email gate live; admin-side
        declaration flow and steward-relationship table queued for follow-up.</em>
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="the-departed.md (S24) — accounts whose subjective time has ended; named steward acts on their behalf"
        doctrines={["transparency", "inclusion", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "the-departed.md (S24)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-departed.md" },
          { label: "the-unseen.md (passage #7 — estate)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-unseen.md" },
          { label: "/methodology/sabbath", href: "/methodology/sabbath" },
        ]}
      />
    </>
  );
}
