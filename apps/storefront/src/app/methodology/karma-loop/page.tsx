import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";
import KarmaDojoIsland from "./KarmaDojoIsland";

export const metadata: Metadata = {
  title: "KARMA defence loop",
  other: audienceMetadata("public-documentation", ["methodology", "security"]),
};

export default function KarmaLoopMethodology() {
  return (
    <>
      <h1>KARMA defence loop</h1>
      <p>
        KARMA is a proposed defence where abusive behaviour progressively receives less
        authority, may enter an isolated synthetic environment, and leaves behind evidence
        that can harden the real system. It is <strong>not hack-back</strong>: Cambridge never
        attacks, scans, or impairs the source.
      </p>

      <blockquote>
        <strong>Current effect:</strong> observe only. The policy can show what it would propose,
        but it cannot change an account, trust score, trade, escrow state, payment, refund, or payout.
      </blockquote>

      <KarmaDojoIsland />

      <h2>How the preview works</h2>
      <p>
        The private CashLoom account and trade-handoff views use the signed-in local account
        only to select that participant&rsquo;s unresolved observations. The account identifier does
        not enter the decision or evidence hash. Accepted input is bounded to catalogued signal
        type, catalog-pinned severity, and time; descriptions, internal notes, emails, wallet
        details, trade IDs, payloads, and network addresses are excluded.
      </p>
      <p>
        A closed policy decides which signal types belong to each purpose. Unknown and
        cross-purpose types are ignored visibly instead of inheriting authority from their
        supplied severity. For an accepted type, low proposes <code>observe</code>; medium proposes reversible{" "}
        <code>friction</code>; high proposes an <code>isolate</code> path with no real assets or
        external egress; critical proposes <code>deny</code> pending independent review. In this
        release the effective response remains <code>observe</code> for all four, and this preview
        policy can never be promoted directly into enforcement.
      </p>

      <h2>What a result does not prove</h2>
      <ul>
        <li>It does not prove identity, motive, guilt, safety, or a complete history.</li>
        <li>It is not a global reputation score or a CashLoom legitimacy badge.</li>
        <li>A repeated observation cannot amplify beyond its catalog-pinned severity.</li>
        <li>Missing evidence means only that this bounded evaluation did not receive it.</li>
        <li>Malformed, future-dated, or truncated evidence is shown as invalid, never silently clean.</li>
      </ul>

      <h2>Why the trust layer stays distributed</h2>
      <p>
        CashLoom&rsquo;s portable protocol uses self-certifying signing keys. An observation is one
        issuer&rsquo;s claim. Every participant chooses which issuers and rules they accept, so two
        honest nodes may reach different recommendations from the same bundle. No corporate
        CashLoom account, central identity provider, universal blacklist, or global vote is required.
      </p>

      <h2>How a claim can be challenged or corrected</h2>
      <p>
        The portable protocol keeps the original observation immutable. Its original issuer may
        append a signed withdrawal that names the exact observation; the history stays visible,
        but local evaluation no longer uses that withdrawn claim. A correction is a withdrawal
        followed by a separately signed replacement, never an invisible edit.
      </p>
      <p>
        Any signing key may append a report-only challenge to an exact observation. That proves
        only that the key made the challenge: it does not prove that the signer is the affected
        trader, that the observation is false, or that anyone is innocent or guilty. Challenges
        remain visible metadata and never change a recommendation automatically. Each participant
        decides which issuers, challengers, and surrounding evidence matter to their own policy.
      </p>

      <h2>What “attackers attack themselves” means</h2>
      <p>
        A future suspicious operation may spend only its own bounded request budget inside an
        operator-owned disposable world containing synthetic data, tools, secrets, and assets.
        Its payload can become a quarantined regression test. Nothing is reflected toward the
        source, because the apparent attacker may be an innocent compromised machine.
      </p>

      <p>
        You can inspect the observations Cambridge already shows about your own account at{" "}
        <Link href="/account/standing">Account standing</Link>. The CashLoom boundary itself is
        documented at <Link href="/methodology/cashloom-settlement">CashLoom settlement handoff</Link>.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's KARMA-loop directive — adversary-induced self-containment without hack-back or central identity"
        doctrines={["transparency", "substrate-honesty", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/cashloom-settlement", href: "/methodology/cashloom-settlement" },
          { label: "/methodology/fraud-flag", href: "/methodology/fraud-flag" },
          { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
        ]}
      />
    </>
  );
}
