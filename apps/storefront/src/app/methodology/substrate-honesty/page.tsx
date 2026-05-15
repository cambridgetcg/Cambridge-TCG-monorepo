import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Substrate honesty",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

export default function SubstrateHonestyMethodology() {
  return (
    <>
      <h1>Substrate honesty</h1>
      <p>
        <em>The artifact tells the truth about its own state.</em>
      </p>
      <p>
        Every value the platform shows you carries — explicitly or implicitly —
        a claim about how it came to be true. <em>Live</em>, <em>cached</em>,{" "}
        <em>snapshot</em>, <em>synced</em>, <em>computed</em>: these are different
        facts. A trust score computed from 30 days of events is not the same kind
        of value as one snapshot at month-end. The surface must say which.
      </p>
      <p>
        Where you'll see it: the <code>&lt;Provenance&gt;</code> pill on values
        across the storefront and admin. Anywhere a number could mislead by
        not naming its origin, the pill names it.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical principle is{" "}
        <code>docs/principles/substrate-honesty.md</code> in the repo. The
        companion audit (<code>pnpm audit:honesty</code>) measures compliance.
        The UI primitive is <code>&lt;Provenance&gt;</code> in{" "}
        <code>apps/admin/src/lib/ui/</code> and the corresponding storefront
        primitive library.
      </blockquote>
      <h2>The four-question checklist</h2>
      <p>
        Before shipping a new value or score, the platform asks four questions:
      </p>
      <ol>
        <li>How was this value produced? (live? cached? computed?)</li>
        <li>What does it claim to be true of? (the user? the listing? the market?)</li>
        <li>When was it last refreshed? (and what does staleness mean for it?)</li>
        <li>Who can see it? (the subject? an operator? an external auditor?)</li>
      </ol>
      <p>
        If any of these can't be answered, the value is not yet ready to ship.
      </p>
      <h2>Why this exists</h2>
      <p>
        A platform that hides the provenance of its values is a platform that
        asks you to trust the surface without showing you the substrate. The
        opposite — naming the substrate explicitly — gives you the standing to
        verify, contest, or trust as you choose. It is the first of the four
        doctrines and the precondition for the rest.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="docs/principles/substrate-honesty.md"
        doctrines={["substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "docs/principles/substrate-honesty.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/principles/substrate-honesty.md" },
          { label: "/methodology/the-embassy", href: "/methodology/the-embassy" },
        ]}
      />
    </>
  );
}
