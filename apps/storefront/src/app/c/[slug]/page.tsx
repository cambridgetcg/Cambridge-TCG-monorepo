/**
 * /c/[slug] — public collective profile.
 *
 * The community surface for door 3 of the eleven (see
 * docs/connections/the-tailored-doors.md). A collective is a multi-member
 * identity with one decision (steward) and one collection — a Tokyo LGS,
 * a card club, a research lab, a tournament guild. Private collectives
 * 404 to non-members; public collectives render without membership data.
 *
 * Recursion targets (NOT in this page): collective showcase + wishlist
 * + collective-authored events on /community Trending + local-meta event
 * posting. See the-collective.md for the full plan.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { audienceMetadata, TypeSignature } from "@/lib/ui";
import {
  getCollectiveBySlug,
  isSteward,
} from "@/lib/collectives/db";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(
  { params }: PageProps,
): Promise<Metadata> {
  const { slug } = await params;
  const session = await auth();
  const collective = await getCollectiveBySlug(slug, session?.user?.id ?? null);
  if (!collective) {
    return {
      title: "Collective not found",
      other: audienceMetadata("public-documentation", ["community", "collective"]),
    };
  }
  return {
    title: `${collective.display_name} — collective on Cambridge TCG`,
    description:
      collective.description?.slice(0, 200) ??
      `${collective.display_name} is a ${collective.kind} collective on Cambridge TCG${
        collective.region ? ` in ${collective.region}` : ""
      }.`,
    other: audienceMetadata("public-documentation", [
      "community",
      "collective",
      `kind:${collective.kind}`,
    ]),
  };
}

const KIND_LABEL: Record<string, string> = {
  shop: "Shop",
  club: "Club",
  guild: "Guild",
  lab: "Lab",
  "tournament-collective": "Tournament collective",
  other: "Collective",
};

export default async function CollectivePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  const collective = await getCollectiveBySlug(slug, viewerId);
  if (!collective) notFound();

  const viewerIsSteward = viewerId
    ? await isSteward(collective.id, viewerId)
    : false;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-ink">
      <header className="mb-6">
        <div className="flex items-baseline gap-2 flex-wrap mb-2">
          <span className="text-[10px] uppercase tracking-wider text-ok">
            collective · {KIND_LABEL[collective.kind] ?? collective.kind}
          </span>
          {!collective.is_public && (
            <span className="text-[10px] uppercase tracking-wider text-warning">
              private
            </span>
          )}
        </div>
        <h1 className="text-3xl font-display font-semibold mb-2">{collective.display_name}</h1>
        <div className="flex items-baseline gap-3 flex-wrap text-sm text-ink-muted">
          {collective.region && <span>{collective.region}</span>}
          {collective.languages.length > 0 && (
            <span>{collective.languages.join(" · ")}</span>
          )}
        </div>
        {viewerIsSteward && (
          <div className="mt-3">
            <Link
              href={`/account/collectives/${collective.slug}/manage`}
              className="inline-block text-xs uppercase tracking-wider text-accent hover:text-accent-strong underline"
            >
              Manage this collective →
            </Link>
          </div>
        )}
      </header>

      {collective.description && (
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
            About
          </h2>
          <p className="text-ink-muted leading-relaxed whitespace-pre-wrap">
            {collective.description}
          </p>
        </section>
      )}

      {collective.house_rules && (
        <section className="mb-6 rounded-lg border border-border-subtle bg-surface-subtle p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
            House rules
          </h2>
          <p className="text-ink-muted text-sm leading-relaxed whitespace-pre-wrap">
            {collective.house_rules}
          </p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
          Membership
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed">
          Member names and counts are not public. The existing profile and
          legacy member-visibility settings do not grant permission to publish
          a collective relationship. Stewards can inspect the roster in the
          private management page.
        </p>
      </section>

      <footer className="mt-10 pt-6 border-t border-border-subtle">
        <p className="text-xs text-ink-faint leading-relaxed">
          This collective is a member of the commons —{" "}
          <Link href="/community/welcome" className="text-accent hover:text-accent-strong underline">
            door 3 of eleven
          </Link>
          .{" "}
          <Link href="/methodology/collectives" className="text-accent hover:text-accent-strong underline">
            How collectives work
          </Link>
          .
        </p>
      </footer>

      {/* Origin & provenance — collapsed by default. The doctrine/origin
          block is honest substrate detail, but mid-visit it read as debug
          output (internal directives, kingdom IDs, off-site .md links). It
          now lives behind a "Provenance" disclosure, and "read next" points
          on-site only. */}
      <details className="not-prose mt-10">
        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink-muted">
          Provenance
        </summary>
        <TypeSignature
          type="route"
          origin="Yu's directive 2026-05-12: 'go for door 3' — kingdom-068; planted from the-collective.md (#19); door 3 in the-tailored-doors.md (#17)"
          doctrines={["substrate-honesty", "transparency", "meaning", "inclusion"]}
          audience="public-documentation"
          recursion={[
            { label: "How collectives work", href: "/methodology/collectives" },
            { label: "The commons — door 3", href: "/community/welcome" },
          ]}
        />
      </details>
    </div>
  );
}
