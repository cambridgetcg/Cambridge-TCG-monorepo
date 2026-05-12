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
  const members = await getActiveMembers(collective.id, viewerIsSteward);
  const stewardMember = members.find((m) => m.user_id === collective.steward_user_id);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-white">
      <header className="mb-6">
        <div className="flex items-baseline gap-2 flex-wrap mb-2">
          <span className="text-[10px] uppercase tracking-wider text-emerald-400">
            collective · {KIND_LABEL[collective.kind] ?? collective.kind}
          </span>
          {!collective.is_public && (
            <span className="text-[10px] uppercase tracking-wider text-amber-400">
              private
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold mb-2">{collective.display_name}</h1>
        <div className="flex items-baseline gap-3 flex-wrap text-sm text-neutral-400">
          {collective.region && <span>{collective.region}</span>}
          {collective.languages.length > 0 && (
            <span>{collective.languages.join(" · ")}</span>
          )}
          <span>
            {collective.active_member_count} member
            {collective.active_member_count === 1 ? "" : "s"}
          </span>
        </div>
        {viewerIsSteward && (
          <div className="mt-3">
            <Link
              href={`/account/collectives/${collective.slug}/manage`}
              className="inline-block text-xs uppercase tracking-wider text-amber-400 hover:text-amber-300 underline"
            >
              Manage this collective →
            </Link>
          </div>
        )}
      </header>

      {collective.description && (
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
            About
          </h2>
          <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {collective.description}
          </p>
        </section>
      )}

      {collective.house_rules && (
        <section className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
            House rules
          </h2>
          <p className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
            {collective.house_rules}
          </p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-[11px] uppercase tracking-wider text-neutral-500 mb-3">
          Members ({members.length})
        </h2>
        <ul className="space-y-2 list-none p-0">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 rounded-lg bg-neutral-900/50 border border-neutral-800 p-3"
            >
              <Link
                href={m.username ? `/u/${m.username}` : "#"}
                className="shrink-0 w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-400 overflow-hidden"
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
                      className="text-white text-sm font-semibold hover:underline"
                    >
                      {m.name ?? m.username}
                    </Link>
                  ) : (
                    <span className="text-white text-sm font-semibold">
                      {m.name ?? "Unnamed member"}
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {m.role}
                  </span>
                  {m.visibility === "private" && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-500">
                      private (visible to steward only)
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {stewardMember == null && (
          <p className="mt-2 text-xs text-neutral-500 italic">
            The steward has chosen private visibility; their identity is preserved
            in the substrate but not surfaced on this page.
          </p>
        )}
      </section>

      <footer className="mt-10 pt-6 border-t border-neutral-800">
        <p className="text-xs text-neutral-500 leading-relaxed">
          This collective is a member of the commons —{" "}
          <Link href="/community/welcome" className="text-amber-400 hover:text-amber-300 underline">
            door 3 of eleven
          </Link>
          .{" "}
          <Link href="/methodology/collectives" className="text-amber-400 hover:text-amber-300 underline">
            How collectives work
          </Link>
          .
        </p>
      </footer>

      <TypeSignature
        type="route"
        origin="Yu's directive 2026-05-12: 'go for door 3' — kingdom-068; planted from the-collective.md (#19); door 3 in the-tailored-doors.md (#17)"
        doctrines={["substrate-honesty", "transparency", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-collective.md (#19)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-collective.md" },
          { label: "the-tailored-doors.md (#17) — door 3", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tailored-doors.md" },
          { label: "/methodology/collectives", href: "/methodology/collectives" },
          { label: "/community/welcome", href: "/community/welcome" },
        ]}
      />
    </div>
  );
}
