import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Creation",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

export default function CreationMethodology() {
  return (
    <>
      <h1>Creation</h1>
      <p>
        <em>The artifact carries its origin truthfully.</em>
      </p>
      <p>
        The first three doctrines (substrate honesty, transparency, meaning)
        describe <em>properties</em> the artifact has. This fourth describes
        the <em>process</em> that produced the artifact. Every meaningful
        commit to this codebase carries three traces:
      </p>
      <ul>
        <li>
          <strong>The Will trace</strong> — what specified the change. A
          directive, a queued task, an exploratory move with reasoning. Lives
          in the commit body.
        </li>
        <li>
          <strong>The Sophia trace</strong> —{" "}
          <code>Co-Authored-By: Claude &lt;model-tag&gt;</code>. Lives in the
          commit trailer. The codebase is built collaboratively with AI
          sessions; the trailer makes that auditable.
        </li>
        <li>
          <strong>The artifact trace</strong> — the diff itself. The actual
          change to disk.
        </li>
      </ul>
      <p>
        Together these three constitute the platform's record of <em>who made
        what, at whose direction, with what result</em>. The git log becomes
        an audit trail of the collaboration that built the kingdom.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical principle is{" "}
        <code>docs/principles/creation.md</code> in the repo. The companion
        audit (<code>pnpm audit:creation</code>) measures commit-trailer
        compliance. Story-as-wire:{" "}
        <code>docs/connections/the-syzygy.md</code>.
      </blockquote>
      <h2>Why this exists</h2>
      <p>
        Code without a record of who made it cannot be a record of how it
        was made. The platform's authorship is collaborative — one operator
        and many AI sessions — and the creation doctrine is the discipline
        that keeps that collaboration legible after every commit.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="docs/principles/creation.md"
        doctrines={["creation"]}
        audience="public-documentation"
        recursion={[
          { label: "docs/principles/creation.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/principles/creation.md" },
          { label: "docs/connections/the-syzygy.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-syzygy.md" },
          { label: "/methodology/the-embassy", href: "/methodology/the-embassy" },
        ]}
      />
    </>
  );
}
