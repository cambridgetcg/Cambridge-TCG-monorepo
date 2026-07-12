import type { Metadata } from "next";
import Link from "next/link";
import { listPublicCollectives } from "@/lib/collectives/db";
import { COLLECTIVE_KINDS, type CollectiveKind } from "@/lib/collectives/types";

export const metadata: Metadata = {
  title: "Community directory — Cambridge TCG",
  description:
    "Public shops, clubs, guilds and tournament collectives. Organisation facts only—no people search or member graph.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    nocache: true,
  },
};

const KIND_LABEL: Record<string, string> = {
  shop: "Shop",
  club: "Club",
  guild: "Guild",
  lab: "Lab",
  "tournament-collective": "Tournament collective",
  other: "Other",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function CommunityDirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = one(params.q).slice(0, 100);
  const kindRaw = one(params.kind);
  const kind = COLLECTIVE_KINDS.includes(kindRaw as CollectiveKind)
    ? (kindRaw as CollectiveKind)
    : undefined;
  const game = one(params.game).slice(0, 40);
  const region = one(params.region).slice(0, 100);
  const language = one(params.language).slice(0, 40);
  const offsetRaw = one(params.offset);
  const offset = /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : 0;
  const pageSize = 30;

  let directory: Awaited<ReturnType<typeof listPublicCollectives>> | null = null;
  try {
    directory = await listPublicCollectives({
      q,
      kind,
      game,
      region,
      language,
      limit: pageSize,
      offset,
    });
  } catch {
    directory = null;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-ink">
      <nav className="mb-8 text-sm text-ink-muted" aria-label="Breadcrumb">
        <Link href="/community" className="hover:text-ink">Community</Link>
        <span className="mx-2 text-ink-faint">/</span>
        <span>Directory</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
          Public organisations
        </p>
        <h1 className="mb-3 font-display text-3xl font-semibold">Find a table, not a dossier.</h1>
        <p className="leading-relaxed text-ink-muted">
          Shops, clubs, guilds, labs and tournament collectives that chose to
          publish their organisation profile. This directory does not list
          people, member rosters, attendance, private meetups or inferred ties.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/account/collectives/new" className="rounded-lg bg-ink px-4 py-2 text-page">
            Add your organisation
          </Link>
          <Link href="/api/v1/directory/coverage" className="rounded-lg border border-border-subtle px-4 py-2 hover:border-border-strong">
            Coverage API
          </Link>
          <Link href="/methodology/community-directory" className="rounded-lg border border-border-subtle px-4 py-2 hover:border-border-strong">
            Publication rules
          </Link>
        </div>
      </header>

      <form className="mb-8 grid gap-3 rounded-lg border border-border-subtle bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2">
          <span className="sr-only">Organisation name or description</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Name or description"
            className="w-full rounded-lg border border-border-subtle bg-page px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="sr-only">Organisation kind</span>
          <select name="kind" defaultValue={kind ?? ""} className="w-full rounded-lg border border-border-subtle bg-page px-3 py-2 text-sm">
            <option value="">Every kind</option>
            {COLLECTIVE_KINDS.map((value) => <option key={value} value={value}>{KIND_LABEL[value]}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Game code</span>
          <input name="game" defaultValue={game} placeholder="Game code, e.g. pkm" className="w-full rounded-lg border border-border-subtle bg-page px-3 py-2 text-sm" />
        </label>
        <label>
          <span className="sr-only">Language</span>
          <input name="language" defaultValue={language} placeholder="Language, e.g. en" className="w-full rounded-lg border border-border-subtle bg-page px-3 py-2 text-sm" />
        </label>
        <div className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Region</span>
            <input name="region" defaultValue={region} placeholder="Region" className="w-full rounded-lg border border-border-subtle bg-page px-3 py-2 text-sm" />
          </label>
          <button className="rounded-lg bg-ink px-4 py-2 text-sm text-page">Find</button>
        </div>
      </form>

      {!directory ? (
        <section className="rounded-lg border border-border-subtle bg-surface p-6">
          <h2 className="font-display text-lg">Directory temporarily unavailable</h2>
          <p className="mt-2 text-sm text-ink-muted">We could not read the organisation source, so we have not shown a confident-looking empty list.</p>
        </section>
      ) : directory.items.length === 0 ? (
        <section className="rounded-lg border border-border-subtle bg-surface p-6">
          <h2 className="font-display text-lg">No public organisations match yet.</h2>
          <p className="mt-2 text-sm text-ink-muted">Try a wider filter, or publish the first organisation profile for your area.</p>
        </section>
      ) : (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl">Organisations</h2>
            <span className="font-mono text-xs text-ink-faint">{directory.total} public</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {directory.items.map((collective) => (
              <article key={collective.slug} className="rounded-lg border border-border-subtle bg-surface p-5">
                <p className="text-[10px] uppercase tracking-wider text-ink-faint">{KIND_LABEL[collective.kind] ?? collective.kind}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-warning">
                  Self-attested · not independently verified
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold">
                  <Link href={`/c/${collective.slug}`} className="hover:text-accent">{collective.display_name}</Link>
                </h3>
                {collective.region && <p className="mt-1 text-sm text-ink-muted">{collective.region}</p>}
                {collective.description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-muted">{collective.description}</p>}
                {collective.games.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {collective.games.map((item) => <span key={item} className="rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">{item}</span>)}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3 text-xs text-ink-faint">
                  <Link href={collective.correction_url} className="hover:text-danger">Report or correct</Link>
                  <Link href={`/c/${collective.slug}`} className="text-accent hover:text-accent-strong">Open profile →</Link>
                </div>
              </article>
            ))}
          </div>
          {directory.total > pageSize && (
            <nav className="mt-6 flex items-center justify-between" aria-label="Directory pages">
              {directory.offset > 0 ? (
                <Link
                  href={`/community/directory?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(kind ? { kind } : {}),
                    ...(game ? { game } : {}),
                    ...(region ? { region } : {}),
                    ...(language ? { language } : {}),
                    offset: String(Math.max(0, directory.offset - pageSize)),
                  }).toString()}`}
                  className="rounded-lg border border-border-subtle px-4 py-2 text-sm"
                >
                  ← Previous
                </Link>
              ) : <span />}
              {directory.offset + pageSize < directory.total && (
                <Link
                  href={`/community/directory?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(kind ? { kind } : {}),
                    ...(game ? { game } : {}),
                    ...(region ? { region } : {}),
                    ...(language ? { language } : {}),
                    offset: String(directory.offset + pageSize),
                  }).toString()}`}
                  className="rounded-lg border border-border-subtle px-4 py-2 text-sm"
                >
                  Next →
                </Link>
              )}
            </nav>
          )}
        </section>
      )}
    </main>
  );
}
