import Link from "next/link";

export default function Pagination({
  total,
  page,
  perPage,
  searchParams,
}: {
  total: number;
  page: number;
  perPage: number;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== 'page') params.set(key, value);
    }
    params.set('page', String(p));
    return `/catalog?${params.toString()}`;
  }

  // Build page number range: show up to 5 pages centered on current
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <nav className="flex items-center justify-center gap-2 mt-12">
      {page > 1 && (
        <PageLink href={pageHref(page - 1)} label="← Prev" />
      )}
      {pages.map(p => (
        <PageLink
          key={p}
          href={pageHref(p)}
          label={String(p)}
          active={p === page}
        />
      ))}
      {page < totalPages && (
        <PageLink href={pageHref(page + 1)} label="Next →" />
      )}
      <span className="text-sm text-neutral-500 ml-4">
        Page {page} of {totalPages}
      </span>
    </nav>
  );
}

function PageLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
        active
          ? "bg-emerald-500 text-black"
          : "bg-neutral-800 text-white hover:bg-neutral-700"
      }`}
    >
      {label}
    </Link>
  );
}
