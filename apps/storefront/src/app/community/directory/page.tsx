import type { Metadata } from "next";
import Link from "next/link";
import {
  audienceMetadata,
  EmptyState,
  PageHeader,
  TypeSignature,
} from "@/lib/ui";
import {
  getPublicCollectiveFacets,
  listPublicCollectives,
} from "@/lib/collectives/db";
import {
  DIRECTORY_MAX_QUERY_LENGTH,
  DIRECTORY_PAGE_SIZE,
} from "@/lib/collectives/directory-contract";
import {
  normalizeDirectoryPageParams,
  reconcileDirectoryPage,
  type DirectoryActiveFilters,
  type DirectoryPageSearchParams,
} from "@/lib/collectives/directory-params";

export const metadata: Metadata = {
  title: "Organisation directory — Cambridge TCG",
  description:
    "Shops, clubs, guilds, labs and tournament collectives whose steward separately opted into the searchable directory. No structured member/steward data or rankings.",
  other: audienceMetadata("public-documentation", [
    "community",
    "directory",
    "collective",
  ]),
};

const KIND_LABEL: Record<string, string> = {
  shop: "Shop",
  club: "Club",
  guild: "Guild",
  lab: "Lab",
  "tournament-collective": "Tournament collective",
  other: "Collective",
};
interface PageProps {
  searchParams: Promise<DirectoryPageSearchParams>;
}

function filterHref(
  base: DirectoryActiveFilters,
  patch: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...patch })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/community/directory?${query}` : "/community/directory";
}

export default async function OrganisationDirectoryPage({
  searchParams,
}: PageProps) {
  const supplied = await searchParams;
  const normalized = normalizeDirectoryPageParams(supplied);
  const { active } = normalized;
  const hasFilters = Object.values(active).some(Boolean);
  let { adjusted } = normalized;
  let { pageNumber } = normalized;

  const [initialPage, facets] = await Promise.all([
    listPublicCollectives({
      ...active,
      limit: DIRECTORY_PAGE_SIZE,
      offset: (pageNumber - 1) * DIRECTORY_PAGE_SIZE,
    }),
    getPublicCollectiveFacets(),
  ]);
  let page = initialPage;
  let reconciled = reconcileDirectoryPage(pageNumber, page.total);
  pageNumber = reconciled.pageNumber;
  adjusted ||= reconciled.adjusted;
  if (reconciled.needsRequery) {
    page = await listPublicCollectives({
      ...active,
      limit: DIRECTORY_PAGE_SIZE,
      offset: (pageNumber - 1) * DIRECTORY_PAGE_SIZE,
    });
    reconciled = reconcileDirectoryPage(pageNumber, page.total);
    pageNumber = reconciled.pageNumber;
    adjusted ||= reconciled.adjusted;
    if (reconciled.needsRequery) {
      // A concurrent withdrawal can shrink the directory between the initial
      // count and the bounded reconciliation query. Retry once more without
      // allowing a rapidly changing directory to create an unbounded loop.
      page = await listPublicCollectives({
        ...active,
        limit: DIRECTORY_PAGE_SIZE,
        offset: (pageNumber - 1) * DIRECTORY_PAGE_SIZE,
      });
      reconciled = reconcileDirectoryPage(pageNumber, page.total);
      pageNumber = reconciled.pageNumber;
      adjusted ||= reconciled.adjusted;
    }
  }
  const { lastPage } = reconciled;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-ink">
      <PageHeader
        title="Organisation directory"
        description="Collectives whose steward separately opted into searchable HTML and public JSON. The query selects no structured member/steward data; steward-written text may mention people."
      />

      {adjusted && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-border-subtle bg-surface-subtle p-3 text-sm text-ink-muted"
        >
          One or more URL filters were outside the directory bounds and were
          ignored or returned to the nearest supported page.
        </p>
      )}

      <form
        method="GET"
        action="/community/directory"
        className="mt-6 flex gap-2"
      >
        {active.kind && <input type="hidden" name="kind" value={active.kind} />}
        {active.region && (
          <input type="hidden" name="region" value={active.region} />
        )}
        {active.language && (
          <input type="hidden" name="language" value={active.language} />
        )}
        <input
          type="search"
          name="q"
          maxLength={DIRECTORY_MAX_QUERY_LENGTH}
          defaultValue={active.q ?? ""}
          placeholder="Search names and descriptions"
          aria-label="Search organisations"
          className="flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-ink px-4 py-2 text-sm text-page"
        >
          Search
        </button>
      </form>

      {(hasFilters ||
        facets.kinds.length > 0 ||
        facets.regions.length > 0 ||
        facets.languages.length > 0) && (
        <section aria-label="Directory filters" className="mt-4 space-y-2">
          {hasFilters && (
            <p>
              <Link
                href="/community/directory"
                className="text-xs text-accent underline hover:text-accent-strong"
              >
                Clear all filters
              </Link>
            </p>
          )}
          {facets.kinds.length > 0 && (
            <FacetRow
              label="Kind"
              options={facets.kinds.map((value) => ({
                value,
                label: KIND_LABEL[value] ?? value,
              }))}
              activeValue={active.kind}
              paramName="kind"
              base={active}
            />
          )}
          {facets.regions.length > 0 && (
            <FacetRow
              label="Region"
              options={facets.regions.map((value) => ({ value, label: value }))}
              activeValue={active.region}
              paramName="region"
              base={active}
            />
          )}
          {facets.languages.length > 0 && (
            <FacetRow
              label="Language"
              options={facets.languages.map((value) => ({
                value,
                label: value,
              }))}
              activeValue={active.language}
              paramName="language"
              base={active}
            />
          )}
        </section>
      )}

      <section aria-live="polite" aria-busy="false" className="mt-8">
        {page.collectives.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Nothing matches those filters."
              description="Try a wider search, or clear the filters to see every published organisation."
            />
          ) : (
            <div className="rounded-lg border border-border-subtle bg-surface p-5">
              <h2 className="font-display text-lg">
                No organisation has published itself yet.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                The directory is intentionally empty until a steward chooses
                publication. It is not filled with sample organisations or
                inferred from member activity.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link
                  href="/account/collectives/new"
                  className="rounded-lg bg-ink px-4 py-2 text-page"
                >
                  Create a collective
                </Link>
                <Link
                  href="/methodology/collectives"
                  className="rounded-lg border border-border-subtle px-4 py-2"
                >
                  How collectives work
                </Link>
              </div>
            </div>
          )
        ) : (
          <>
            <p className="mb-4 text-[11px] uppercase tracking-wider text-ink-faint">
              {page.total} published{" "}
              {page.total === 1 ? "organisation" : "organisations"}
              {hasFilters && " matching"}
            </p>
            <ul className="space-y-3">
              {page.collectives.map(({ steward_fields: collective }) => (
                <li key={collective.slug}>
                  <Link
                    href={`/c/${collective.slug}`}
                    className="block rounded-lg border border-border-subtle bg-surface p-4 transition-colors hover:border-border-strong"
                  >
                    <span className="text-[10px] uppercase tracking-wider text-ok">
                      {KIND_LABEL[collective.kind] ?? collective.kind}
                    </span>
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {collective.display_name}
                    </h2>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-muted">
                      {collective.region && <span>{collective.region}</span>}
                      {collective.languages.length > 0 && (
                        <span>{collective.languages.join(" · ")}</span>
                      )}
                    </div>
                    {collective.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                        {collective.description}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            {lastPage > 1 && (
              <nav
                aria-label="Directory pages"
                className="mt-6 flex items-center justify-between text-sm"
              >
                {pageNumber > 1 ? (
                  <Link
                    href={filterHref(active, {
                      page:
                        pageNumber === 2 ? undefined : String(pageNumber - 1),
                    })}
                    className="rounded-lg border border-border-subtle px-3 py-2"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-ink-faint">
                  Page {pageNumber} of {lastPage}
                </span>
                {pageNumber < lastPage ? (
                  <Link
                    href={filterHref(active, { page: String(pageNumber + 1) })}
                    className="rounded-lg border border-border-subtle px-3 py-2"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-border-subtle bg-surface-subtle p-5">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint">
          What this directory does not select
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-muted">
          <li>
            No structured member names/counts, record ids, or platform-derived
            steward identity.
          </li>
          <li>No people directory and no inferred relationships.</li>
          <li>No ranking: entries are ordered alphabetically.</li>
          <li>
            A private collective is absent, so this surface cannot confirm it
            exists.
          </li>
          <li>
            Descriptions and house rules are steward-written; they may mention
            people and should contain personal data only with permission.
          </li>
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          <Link
            href="/methodology/community-directory"
            className="text-accent underline hover:text-accent-strong"
          >
            Read the decision
          </Link>
          {" · "}
          <Link
            href="/api/v1/directory/organisations"
            className="text-accent underline hover:text-accent-strong"
          >
            Machine-readable
          </Link>
        </p>
      </section>

      <details className="not-prose mt-10">
        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink-muted">
          Provenance
        </summary>
        <TypeSignature
          type="route"
          origin="Organisation-directory implementation authored 2026-08-24 with a separate, versioned directory-publication receipt"
          doctrines={[
            "substrate-honesty",
            "transparency",
            "meaning",
            "inclusion",
          ]}
          audience="public-documentation"
          recursion={[
            {
              label: "/methodology/community-directory",
              href: "/methodology/community-directory",
            },
            {
              label: "/methodology/collectives",
              href: "/methodology/collectives",
            },
            { label: "/bridge", href: "/bridge" },
          ]}
        />
      </details>
    </main>
  );
}

function FacetRow({
  label,
  options,
  activeValue,
  paramName,
  base,
}: {
  label: string;
  options: { value: string; label: string }[];
  activeValue?: string;
  paramName: "kind" | "region" | "language";
  base: DirectoryActiveFilters;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      {activeValue && (
        <Link
          href={filterHref(base, { [paramName]: undefined })}
          aria-label={`Clear ${label.toLowerCase()} filter`}
          className="rounded-lg border border-border-subtle px-2 py-1 text-xs text-ink-muted"
        >
          Clear
        </Link>
      )}
      {options.map((option) => {
        const selected = option.value === activeValue;
        return (
          <Link
            key={option.value}
            href={filterHref(base, {
              [paramName]: selected ? undefined : option.value,
            })}
            aria-current={selected ? "true" : undefined}
            className={
              selected
                ? "rounded-lg bg-accent-wash px-2 py-1 text-xs text-accent"
                : "rounded-lg border border-border-subtle px-2 py-1 text-xs text-ink-muted hover:text-ink"
            }
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
