import type { MemberPriceItem, MemberPricePage } from "./member-feed-types";

export const MEMBER_CSV_COLUMNS = [
  "id", "source", "sourceProductId", "sku", "mappingStatus", "game", "setCode", "productName",
  "granularity", "finish", "language", "condition", "metric", "amount", "currency", "underlyingMarket",
  "sourceUpdatedAt", "retrievedAt", "sourceUrl", "parserVersion", "crosswalkVersion",
  "evidenceVersion", "artifactSha256", "catalogSourceUrl", "catalogUpdatedAt", "catalogArtifactSha256",
  "quality", "permittedUses", "attribution",
] as const satisfies readonly (keyof MemberPriceItem)[];
// Adding a provenance field must also update the CSV, rather than silently dropping it.
const allFieldsExported: Exclude<keyof MemberPriceItem, typeof MEMBER_CSV_COLUMNS[number]> extends never ? true : never = true;
void allFieldsExported;

export function memberCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet applications may ignore leading whitespace/control bytes before a formula.
  if (/^[\s\x00-\x1f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function memberPageHeaders(page: MemberPricePage): Headers {
  const headers = new Headers({
    "X-Price-Count": String(page.count),
    "X-Price-Total": String(page.total),
    "X-Price-Complete": String(page.complete),
    "X-Price-Status": page.status,
  });
  if (page.nextCursor) headers.set("X-Next-Cursor", page.nextCursor);
  if (page.watermark) headers.set("X-Price-Watermark", page.watermark);
  if (page.asOf) headers.set("X-Price-As-Of", page.asOf);
  return headers;
}

/** A bounded page is fully serialized before a response starts: no half-successful stream. */
export function serializeMemberExport(page: MemberPricePage, format: "csv" | "ndjson"): string {
  if (format === "csv") {
    return [MEMBER_CSV_COLUMNS.map(memberCsvCell).join(","),
      ...page.items.map(item => MEMBER_CSV_COLUMNS.map(key => memberCsvCell(item[key])).join(",")),
    ].join("\r\n") + "\r\n";
  }
  const { items, ...manifest } = page;
  return [
    JSON.stringify({ type: "manifest", schema: "ctcg.member-prices/v1", ...manifest,
      use: "member-download", license: "Source-specific; see each record's evidence, attribution and permittedUses.",
      pagination: "One bounded page. Follow nextCursor with the same filters until complete.",
    }),
    ...items.map(item => JSON.stringify({ type: "observation", ...item })),
    JSON.stringify({ type: "footer", count: page.count, total: page.total,
      complete: page.complete, nextCursor: page.nextCursor, pageComplete: true }),
  ].join("\n") + "\n";
}
