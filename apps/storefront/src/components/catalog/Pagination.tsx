/**
 * Catalog pagination — thin shim around the unified <Pagination> primitive.
 *
 * Existing call sites pass `(total, page, perPage, searchParams)` and
 * expect a `/catalog?…` href factory. This shim translates that into the
 * generic {@link import("@/lib/ui").Pagination} which takes an explicit
 * `href(page) => string` factory. New code should use the generic one
 * directly with whatever route the caller is paginating over.
 */

import { Pagination as GenericPagination } from "@/lib/ui";

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
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/catalog${qs ? `?${qs}` : ""}`;
  };
  return (
    <GenericPagination
      page={page}
      totalPages={totalPages}
      totalRows={total}
      pageSize={perPage}
      href={href}
    />
  );
}
