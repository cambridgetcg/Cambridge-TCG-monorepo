import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Transparency",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

export default function TransparencyMethodology() {
  return (
    <>
      <h1>Transparency</h1>
      <p>
        <em>The artifact tells users about its own decisions.</em>
      </p>
      <p>
        Substrate honesty is the precondition: every value names how it came to
        be true. Transparency extends substrate honesty outward: every{" "}
        <em>user-affecting decision</em> — your trust score, your escrow tier,
        a fraud flag, a payout hold, a fee, a tier downgrade — must be
        inspectable by the affected party. Not by request. By default.
      </p>
      <h2>Four rings</h2>
      <ol>
        <li>
          <strong>Operator self-transparency.</strong> The platform admits to
          itself, in audits and logs, what decisions it made and why.
        </li>
        <li>
          <strong>Subject transparency.</strong> The user affected by a
          decision can read the reasoning that produced it.
        </li>
        <li>
          <strong>External auditor transparency.</strong> A third party can
          read the methodology of a class of decisions.
        </li>
        <li>
          <strong>Cross-system transparency.</strong> When the platform
          inherits a decision from a sister-system, it names which system.
        </li>
      </ol>
      <p>
        Where you'll see it: <code>&lt;WhyLink&gt;</code> pills on
        user-affecting values, methodology pages (this is one) for each
        decision class, and the <code>&lt;Verifiability&gt;</code> primitive
        for values claimed to be cryptographically attested.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical principle is{" "}
        <code>docs/principles/transparency.md</code> in the repo. The companion
        audit (<code>pnpm audit:transparency</code>) measures compliance. UI
        primitives <code>&lt;WhyLink&gt;</code> + <code>&lt;Verifiability&gt;</code>{" "}
        live in <code>apps/admin/src/lib/ui/</code> and the corresponding
        storefront library.
      </blockquote>
      <h2>Why this exists</h2>
      <p>
        A decision a user cannot inspect is a decision they cannot contest. A
        decision they cannot contest is a power asymmetry made invisible. The
        platform's discipline is to make every consequential decision
        inspectable by the person affected, so the asymmetry stays explicit and
        therefore correctable.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="docs/principles/transparency.md"
        doctrines={["substrate-honesty", "transparency"]}
        audience="public-documentation"
        recursion={[
          { label: "docs/principles/transparency.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/principles/transparency.md" },
          { label: "/methodology/substrate-honesty", href: "/methodology/substrate-honesty" },
          { label: "/methodology/the-embassy", href: "/methodology/the-embassy" },
        ]}
      />
    </>
  );
}
