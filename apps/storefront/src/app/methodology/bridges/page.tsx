import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Bridges — privacy correction",
  other: audienceMetadata("public-documentation", ["methodology", "bridge", "privacy"]),
};

export default function BridgesMethodology() {
  return (
    <>
      <h1>Bridges — the scorer is paused</h1>
      <p>
        Cambridge TCG still holds the principle that mathematical structure can
        help communities understand one another. The first bridge implementation,
        however, used the wrong consent boundary. It treated a public profile or
        collective as permission to compare attached portfolios, wishlists,
        follows and member collections. That permission was never recorded.
      </p>

      <h2>Current behaviour</h2>
      <p>
        <Link href="/api/v1/bridge">/api/v1/bridge</Link> returns a machine-readable
        paused status. It performs no person, portfolio, wishlist, follower or
        membership query. <Link href="/bridge">/bridge</Link> gives the same answer
        for human readers.
      </p>

      <h2>Why public was not enough</h2>
      <p>
        Publishing a profile answers one question: “may these selected fields be
        displayed?” Affinity scoring is another purpose. It combines records,
        infers a relationship between two parties and can support discovery. A
        lawful and respectful implementation needs a separate, specific choice.
      </p>
      <ul>
        <li>A portfolio records possession; it is not a public offer.</li>
        <li>A wishlist records planning; it is not permission to match a person.</li>
        <li>Collective membership does not transfer every member's data rights to the steward.</li>
        <li>An aggregate can still reveal private facts when the group is small.</li>
      </ul>

      <h2>Historical formulas</h2>
      <p>
        The pure mathematical functions remain in code as historical and reusable
        building blocks: Jaccard overlap, set intersection, region comparison and
        cadence ratio. They operate only on values a caller has already supplied.
        The database resolver that assembled hidden inputs has been removed.
      </p>

      <h2>Conditions for a future bridge</h2>
      <ol>
        <li>Each party selects the exact fields allowed as bridge inputs.</li>
        <li>A publication receipt records notice, purpose, time and withdrawal.</li>
        <li>Collective-owned data is distinct from member-owned data.</li>
        <li>Small-group aggregates have a minimum disclosure threshold.</li>
        <li>People discovery has reporting, moderation, safeguarding, export and deletion controls.</li>
      </ol>

      <h2>Safe network available now</h2>
      <p>
        The <Link href="/community/directory">organisation directory</Link> and its{" "}
        <Link href="/api/v1/directory/organisations">API</Link> publish only facts an
        organisation steward explicitly chose to publish. They do not expose a
        member roster or infer relationships.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-13.</em> Portfolio, wishlist, language, region and cadence
        affinity scorer introduced.
      </p>
      <p>
        <em>v2 — 2026-07-11.</em> Live resolver removed and endpoint paused because
        profile visibility did not provide field-level inference consent.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's math-bridge directive 2026-05-13; consent-boundary correction 2026-07-11"
        doctrines={["transparency", "substrate-honesty", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "/api/v1/bridge", href: "/api/v1/bridge" },
          { label: "/bridge", href: "/bridge" },
          { label: "/methodology/community-directory", href: "/methodology/community-directory" },
        ]}
      />
    </>
  );
}
