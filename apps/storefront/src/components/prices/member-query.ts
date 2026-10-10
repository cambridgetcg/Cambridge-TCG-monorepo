// Keep browser, login return paths and downloads on the same bounded query vocabulary.
export const MEMBER_PRICE_FILTERS = ["q", "source", "game", "set", "sku", "metric", "mode", "limit"] as const;
export type MemberPriceSearchParams = Record<string, string | string[] | undefined>;

export function memberPriceParams(search: MemberPriceSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of [...MEMBER_PRICE_FILTERS, "cursor"]) {
    const value = search[key];
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    else if (Array.isArray(value)) for (const entry of value) params.append(key, entry);
  }
  return params;
}

export function memberPriceHref(params: URLSearchParams, cursor?: string | null): string {
  const next = new URLSearchParams(params);
  next.delete("cursor");
  if (cursor) next.set("cursor", cursor);
  return `/prices${next.size ? `?${next}` : ""}`;
}

export function memberPriceExportHref(params: URLSearchParams, format: "csv" | "ndjson"): string {
  const next = new URLSearchParams(params);
  // Display and download have different release projections: a display cursor
  // cannot be used as a download cursor. Each export starts its own snapshot.
  next.delete("cursor");
  next.set("format", format);
  return `/api/account/prices/export?${next}`;
}
