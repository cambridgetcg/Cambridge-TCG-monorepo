/**
 * /c/[slug] — public collective profile.
 *
 * The community surface for door 3 of the eleven (see
 * docs/connections/the-tailored-doors.md). A collective is a multi-member
 * identity with one decision (steward) and one collection — a Tokyo LGS,
 * a card club, a research lab, a tournament guild. Private collectives
 * 404 to non-members; public collectives render to anyone.
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
  getActiveMembers,
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
  // The organisation profile is reachable from the bulk directory. Keep it
  // roster-free for every visitor; only the steward sees membership records
  // here. Member publication needs its own future purpose/receipt.
  const members = viewerIsSteward
    ? await getActiveMembers(collective.id, true)
    : [];

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
          <span className="text-[10px] uppercase tracking-wider text-warning">
            self-attested · not independently verified
          </span>
        </div>
        <h1 className="text-3xl font-display font-semibold mb-2">{collective.display_name}</h1>
        <div className="flex items-baseline gap-3 flex-wrap text-sm text-ink-muted">
          {collective.region && <span>{collective.region}</span>}
          {collective.languages.length > 0 && (
            <span>{collective.languages.join(" · ")}</span>
          )}
          {viewerIsSteward && (
            <span>
              {collective.active_member_count} member{collective.active_member_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {collective.games.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {collective.games.map((game) => (
              <span
                key={game}
                className="rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs font-mono text-ink-muted"
              >
                {game}
              </span>
            ))}
          </div>
        )}
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

      {(collective.website_url || collective.public_contact_url) && (
        <section className="mb-6 flex flex-wrap gap-3 text-sm">
          {collective.website_url && (
            <a
              href={collective.website_url}
              rel="ugc nofollow noopener noreferrer"
              className="rounded-lg border border-border-subtle px-3 py-2 text-ink hover:border-border-strong"
            >
              Submitted website ↗
            </a>
          )}
          {collective.public_contact_url && (
            <a
              href={collective.public_contact_url}
              rel="ugc nofollow noopener noreferrer"
              className="rounded-lg border border-border-subtle px-3 py-2 text-ink hover:border-border-strong"
            >
              Submitted public contact page ↗
            </a>
          )}
        </section>
      )}

      {collective.accessibility_notes && (
        <section className="mb-6 rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
            Accessibility
          </h2>
          <p className="text-sm leading-relaxed text-ink-muted whitespace-pre-wrap">
            {collective.accessibility_notes}
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

      {viewerIsSteward && (
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
            Members ({members.length}) · steward-only view
          </h2>
          <ul className="space-y-2 list-none p-0">
            {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 rounded-lg bg-surface border border-border-subtle p-3"
            >
              <Link
                href={m.username ? `/u/${m.username}` : "#"}
                className="shrink-0 w-9 h-9 rounded-full bg-surface-subtle flex items-center justify-center text-xs font-semibold text-ink-muted overflow-hidden"
              >
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (m.name ?? m.username ?? "?")[0]?.toUpperCase()
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {m.username ? (
                    <Link
                      href={`/u/${m.username}`}
                      className="text-ink text-sm font-semibold hover:underline"
                    >
                      {m.name ?? m.username}
                    </Link>
                  ) : (
                    <span className="text-ink text-sm font-semibold">
                      {m.name ?? "Unnamed member"}
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                    {m.role}
                  </span>
                  {m.visibility === "private" && (
                    <span className="text-[10px] uppercase tracking-wider text-warning">
                      private (visible to steward only)
                    </span>
                  )}
                </div>
              </div>
            </li>
            ))}
          </ul>
        </section>
      )}

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
        <p className="mt-2 text-xs text-ink-faint">
          Something inaccurate or unsafe?{" "}
          <Link
            href={`/contact?topic=directory&listing=${encodeURIComponent(collective.slug)}`}
            className="text-accent underline"
          >
            Report or correct this profile
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
