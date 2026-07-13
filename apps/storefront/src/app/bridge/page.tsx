import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Bridge — paused safely",
  description:
    "The former people-affinity scorer is paused. Public visibility is not permission to scan portfolios, wishlists, follows or memberships.",
  other: audienceMetadata("public-documentation", ["bridge", "privacy", "community"]),
};

export default function BridgePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-ink">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
        Capability status
      </p>
      <h1 className="font-display text-3xl font-semibold">The affinity bridge is paused.</h1>
      <p className="mt-4 leading-relaxed text-ink-muted">
        Its first version compared people and collectives using portfolios,
        wishlists, follows and member collections. A public profile is permission
        to display chosen profile fields. It is not permission to infer a
        relationship score from other records.
      </p>

      <section className="mt-8 rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="font-display text-lg">What remains live</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-muted">
          <li>Pure set and ratio functions remain in code for explicitly supplied future inputs.</li>
          <li>The endpoint reports its paused state without querying any person or collection.</li>
          <li>The organisation directory publishes only organisation-controlled facts.</li>
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="font-display text-lg">What would reopen it</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          <li>Field-level bridge inputs selected by each person or organisation.</li>
          <li>A receipt recording notice, purpose, time and withdrawal.</li>
          <li>Reporting, moderation, safeguarding, export and deletion controls.</li>
        </ol>
      </section>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/community/directory" className="rounded-lg bg-ink px-4 py-2 text-page">
          Find public organisations
        </Link>
        <Link href="/methodology/bridges" className="rounded-lg border border-border-subtle px-4 py-2">
          Read the decision
        </Link>
        <Link href="/api/v1/bridge" className="rounded-lg border border-border-subtle px-4 py-2">
          Machine status
        </Link>
      </div>

      <TypeSignature
        type="route"
        origin="Yu's directive 2026-05-13: 'Math is the universal language'; privacy correction 2026-07-11"
        doctrines={["substrate-honesty", "transparency", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "/api/v1/bridge", href: "/api/v1/bridge" },
          { label: "/methodology/bridges", href: "/methodology/bridges" },
          { label: "/community/directory", href: "/community/directory" },
        ]}
      />
    </main>
  );
}
