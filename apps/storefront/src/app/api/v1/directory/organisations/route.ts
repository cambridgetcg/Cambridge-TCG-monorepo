/** Public, read-only organisation directory. No people, rosters or attendance. */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  listPublicCollectives,
  type PublicCollectiveFilters,
} from "@/lib/collectives/db";
import { COLLECTIVE_KINDS, type CollectiveKind } from "@/lib/collectives/types";

function integer(value: string | null, fallback: number): number | null {
  if (value == null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kindRaw = url.searchParams.get("kind");
  if (kindRaw && !COLLECTIVE_KINDS.includes(kindRaw as CollectiveKind)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `kind must be one of: ${COLLECTIVE_KINDS.join(", ")}`,
      docs: "/api/v1/directory/organisations",
      endpoint: "/api/v1/directory/organisations",
    });
  }

  const limit = integer(url.searchParams.get("limit"), 30);
  const offset = integer(url.searchParams.get("offset"), 0);
  if (limit == null || limit < 1 || limit > 100 || offset == null) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "limit must be an integer from 1 to 100; offset must be a non-negative integer.",
      docs: "/api/v1/directory/organisations",
      endpoint: "/api/v1/directory/organisations",
    });
  }

  const filters: PublicCollectiveFilters = {
    q: url.searchParams.get("q")?.slice(0, 100) || undefined,
    kind: kindRaw as CollectiveKind | undefined,
    game: url.searchParams.get("game")?.trim().toLowerCase().slice(0, 40) || undefined,
    region: url.searchParams.get("region")?.slice(0, 100) || undefined,
    language: url.searchParams.get("language")?.trim().toLowerCase().slice(0, 40) || undefined,
    limit,
    offset,
  };

  try {
    const result = await listPublicCollectives(filters);
    const asOf = result.items.reduce<string | null>((oldest, item) => {
      if (!oldest) return item.updated_at;
      return Date.parse(item.updated_at) < Date.parse(oldest) ? item.updated_at : oldest;
    }, null);
    const nextOffset = result.offset + result.limit;
    const nextParams = new URLSearchParams(url.searchParams);
    nextParams.set("limit", String(result.limit));
    nextParams.set("offset", String(nextOffset));
    const next = nextOffset < result.total
      ? `/api/v1/directory/organisations?${nextParams.toString()}`
      : null;

    return jsonResponse({
      data: {
        "@kind": "organisation_directory",
        description:
          "Organisation-controlled public facts for shops, clubs, guilds, labs and tournament collectives.",
        items: result.items,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
        filters: {
          q: filters.q ?? null,
          kind: filters.kind ?? null,
          game: filters.game ?? null,
          region: filters.region ?? null,
          language: filters.language ?? null,
        },
        publication: {
          basis: "separate current directory notice accepted by a self-asserted authorised representative",
          independently_verified: false,
          correction_url: "/contact",
          terms_url: "/licenses/community-directory-public-display-v1",
          reuse:
            "Public display only unless the named organisation grants broader rights. Visibility is not a CC0 dedication.",
          sync_semantics:
            "Snapshot/display only in v1. No change feed or tombstone contract is promised; re-fetch before display and do not build a permanent mirror.",
        },
        schema_url: "/schemas/v1/community-organisation.json",
      },
      endpoint: "/api/v1/directory/organisations",
      sources: ["ctcg-storefront-rds.collectives"],
      source_license: ["proprietary"],
      license: "LicenseRef-CambridgeTCG-Public-Display-Only",
      freshness: "identity",
      ...(asOf ? { as_of: asOf } : {}),
      extra_meta: {
        as_of_semantics:
          "Oldest steward-submitted updated_at in this page; it is source-state time, not independent verification.",
      },
      no_cache: true,
      next_link: next,
      does_not_include: [
        "No people directory, member roster or social graph.",
        "No dedicated personal email, phone, home-address, attendance or private-location field. Steward-submitted free text is unverified; use each record's correction_url to report a problem.",
      ],
    });
  } catch {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message: "The organisation directory is temporarily unavailable. No empty list was fabricated.",
      docs: "/api/v1/directory/coverage",
      status: 503,
      endpoint: "/api/v1/directory/organisations",
    });
  }
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
