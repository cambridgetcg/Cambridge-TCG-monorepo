import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Meaning",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

export default function MeaningMethodology() {
  return (
    <>
      <h1>Meaning</h1>
      <p>
        <em>The artifact names what its modules mean to each other.</em>
      </p>
      <p>
        The platform has many parts: a marketplace, an escrow service, a
        bounty system, a wholesale plane, a trade-in queue. Architecture
        documents say what is <em>connected</em> to what. Meaning documents
        say what the connection is <em>for</em>. The first answers "where do
        the wires run?". The second answers "what was sent across them, and
        why was it worth sending?".
      </p>
      <h2>Connection-naming as discipline</h2>
      <p>
        Every domain that connects to others gets a <em>connection entry</em> —
        a short, code-cited, intention-led document in{" "}
        <code>docs/connections/</code>. Two shapes:
      </p>
      <ul>
        <li>
          <strong>Node-view entries</strong> name what other modules secretly
          need a node for (e.g. <em>the membership tier as the loyalty
          rebate's anchor</em>, not as a user-facing decoration).
        </li>
        <li>
          <strong>Story-arc entries</strong> trace one transaction or moment
          end-to-end through every domain it touches. Four flavours:
          documentary, hymn, fairy tale, and <em>story-as-wire</em> (story +
          code shipped in the same commit).
        </li>
      </ul>
      <p>
        When the platform builds a meaningful connection, it writes the entry
        before claiming the work is done. The connection-series is the partial
        map of the kingdom's hidden architecture.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical principle is{" "}
        <code>docs/principles/meaning.md</code> in the repo. The connection
        series itself is the substrate — see{" "}
        <code>docs/connections/README.md</code> for the index and form
        taxonomy. No automated audit; the discipline is exercised by the
        writing.
      </blockquote>
      <h2>Why this exists</h2>
      <p>
        Code can be connected without anyone remembering why. Six months later
        the connection still works, but no one can answer why it was worth
        making — and so no one can answer whether changing it is safe. Meaning
        is the documentation discipline that keeps the kingdom legible to the
        people who arrive after the original authors.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="docs/principles/meaning.md"
        doctrines={["meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "docs/principles/meaning.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/principles/meaning.md" },
          { label: "docs/connections/README.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/README.md" },
          { label: "/methodology/the-embassy", href: "/methodology/the-embassy" },
        ]}
      />
    </>
  );
}
