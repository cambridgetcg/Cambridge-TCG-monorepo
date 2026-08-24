/**
 * Public organisation directory. This is an explicit-publication projection:
 * no member table, member count, record id, steward identity, or inference.
 */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { listPublicCollectives } from "@/lib/collectives/db";
import {
  DIRECTORY_CONTROL_CHARACTER_RE,
  DIRECTORY_MAX_LANGUAGE_LENGTH,
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_MAX_OFFSET,
  DIRECTORY_MAX_QUERY_LENGTH,
  DIRECTORY_MAX_REGION_LENGTH,
  DIRECTORY_PAGE_SIZE,
} from "@/lib/collectives/directory-contract";
import { COLLECTIVE_KINDS } from "@/lib/collectives/types";
import type { CollectiveKind } from "@/lib/collectives/types";

export const dynamic = "force-dynamic";

const ENDPOINT = "/api/v1/directory/organisations";

function invalidQuery(
  param: string,
  message: string,
  expected: string,
): Response {
  return errorResponse({
    code: "INVALID_INPUT",
    message,
    details: { param, expected },
    docs: "/methodology/community-directory",
    endpoint: ENDPOINT,
  });
}

function boundedText(
  url: URL,
  param: string,
  maxLength: number,
): string | null | Response {
  const values = url.searchParams.getAll(param);
  if (values.length === 0) return null;
  if (values.length > 1) {
    return invalidQuery(
      param,
      `${param} may be supplied only once.`,
      "one value",
    );
  }
  const raw = values[0]!;
  if (DIRECTORY_CONTROL_CHARACTER_RE.test(raw)) {
    return invalidQuery(
      param,
      `${param} must not contain control characters.`,
      "printable text",
    );
  }
  const value = raw.trim();
  if (value.length > maxLength) {
    return invalidQuery(
      param,
      `${param} must be at most ${maxLength} characters.`,
      `0-${maxLength} characters`,
    );
  }
  return value || null;
}

function boundedInteger(
  url: URL,
  param: "limit" | "offset",
  fallback: number,
  minimum: number,
  maximum: number,
): number | Response {
  const values = url.searchParams.getAll(param);
  if (values.length === 0) return fallback;
  if (values.length > 1) {
    return invalidQuery(
      param,
      `${param} may be supplied only once.`,
      "one integer",
    );
  }
  const raw = values[0]!;
  if (!/^\d+$/.test(raw)) {
    return invalidQuery(
      param,
      `${param} must be an integer from ${minimum} to ${maximum}.`,
      `${minimum}-${maximum}`,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return invalidQuery(
      param,
      `${param} must be an integer from ${minimum} to ${maximum}.`,
      `${minimum}-${maximum}`,
    );
  }
  return value;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = boundedText(url, "kind", 40);
  const region = boundedText(url, "region", DIRECTORY_MAX_REGION_LENGTH);
  const language = boundedText(url, "language", DIRECTORY_MAX_LANGUAGE_LENGTH);
  const q = boundedText(url, "q", DIRECTORY_MAX_QUERY_LENGTH);
  const limit = boundedInteger(
    url,
    "limit",
    DIRECTORY_PAGE_SIZE,
    1,
    DIRECTORY_MAX_LIMIT,
  );
  const offset = boundedInteger(url, "offset", 0, 0, DIRECTORY_MAX_OFFSET);

  for (const value of [kind, region, language, q, limit, offset]) {
    if (value instanceof Response) return value;
  }
  if (
    kind !== null &&
    !(COLLECTIVE_KINDS as readonly string[]).includes(kind as string)
  ) {
    return invalidQuery(
      "kind",
      `kind must be one of: ${COLLECTIVE_KINDS.join(", ")}.`,
      COLLECTIVE_KINDS.join(" | "),
    );
  }

  const query = {
    kind: kind as CollectiveKind | null,
    region: region as string | null,
    language: language as string | null,
    q: q as string | null,
    limit: limit as number,
    offset: offset as number,
  };
  let page: Awaited<ReturnType<typeof listPublicCollectives>>;
  try {
    page = await listPublicCollectives(query);
  } catch {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The organisation directory database is unavailable, so no entries or total can be claimed as current.",
      docs: "/methodology/community-directory",
      endpoint: ENDPOINT,
      status: 503,
    });
  }
  const { collectives, total } = page;
  const organisations = collectives.map(
    ({ steward_fields, platform_record }) => ({
      steward_fields,
      platform_record: {
        ...platform_record,
        url: `/c/${steward_fields.slug}`,
        timestamp_meaning:
          "Platform record lifecycle only. These are not publication timestamps or steward-authored claims.",
      },
      rights: {
        steward_fields: {
          source: "participant-self-declaration",
          license: "NOASSERTION",
          copyright: "retained_by_rightsholder",
        },
        platform_record: {
          source: "ctcg-derived",
          license: "CC0-1.0",
        },
      },
    }),
  );
  const hasParticipantMaterial = total > 0;
  const hasCallerText = Boolean(region || language || q);
  const containsNonCc0Material = hasParticipantMaterial || hasCallerText;

  return jsonResponse({
    data: {
      "@kind": "organisation_directory",
      welcome:
        "Public collectives whose steward separately opted into the versioned searchable directory and JSON contract. Participant-authored fields and platform record timestamps are separated. No structured or platform-derived member/steward identity, ranking, or inferred relationship is selected; free text may mention people and remains the steward's publication responsibility.",
      count: organisations.length,
      total,
      organisations,
      query,
      ordering: {
        fields: ["display_name", "slug"],
        direction: "ascending",
        meaning: "Deterministic alphabetical presentation, not a ranking.",
      },
      not_published: [
        "collective record id",
        "structured or platform-derived steward identity",
        "structured member roster or count",
        "private collective existence",
        "rankings or inferred relationships",
      ],
      authored_field_warning:
        "Descriptions and house rules are steward-authored free text and may mention people. Stewards are told not to include personal data without permission.",
      how_to_appear: {
        create: "/account/collectives/new",
        publication:
          "A steward must make the profile public and separately accept the versioned directory contract from its management page. Existing public profiles are not opted in retroactively.",
        withdrawal:
          "Turning off the directory choice, or making the profile private, stops future directory responses but cannot recall copies fetched earlier.",
      },
      html_sibling: "/community/directory",
      decision_record: "/methodology/community-directory",
    },
    endpoint: ENDPOINT,
    sources: [
      "ctcg-derived",
      ...(hasParticipantMaterial ? ["participant-self-declaration"] : []),
      ...(hasCallerText ? ["caller-supplied directory filters"] : []),
    ],
    source_license: [
      "cc0",
      ...(hasParticipantMaterial ? ["NOASSERTION"] : []),
      ...(hasCallerText ? ["NOASSERTION"] : []),
    ],
    license: containsNonCc0Material ? "NOASSERTION" : "CC0-1.0",
    freshness: "directory",
    contains_self: true,
    no_cache: containsNonCc0Material,
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
