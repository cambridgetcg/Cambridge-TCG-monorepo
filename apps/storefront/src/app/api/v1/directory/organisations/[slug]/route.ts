import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { getDirectoryCollectiveBySlug } from "@/lib/collectives/db";
import { isValidSlug } from "@/lib/collectives/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return errorResponse({
      code: "NOT_FOUND",
      message: "Organisation not found.",
      docs: "/api/v1/directory/organisations",
      status: 404,
      endpoint: "/api/v1/directory/organisations/[slug]",
    });
  }

  try {
    const collective = await getDirectoryCollectiveBySlug(slug);
    if (!collective) {
      return errorResponse({
        code: "NOT_FOUND",
        message: "Organisation not found.",
        docs: "/api/v1/directory/organisations",
        status: 404,
        endpoint: "/api/v1/directory/organisations/[slug]",
      });
    }
    return jsonResponse({
      data: {
        "@kind": "organisation",
        organisation: collective,
        publication: {
          basis: "separate current directory notice accepted by a self-asserted authorised representative",
          independently_verified: false,
          correction_url: `/contact?topic=directory&listing=${encodeURIComponent(collective.slug)}`,
          terms_url: "/licenses/community-directory-public-display-v1",
          reuse:
            "Public display only unless the named organisation grants broader rights.",
        },
        schema_url: "/schemas/v1/community-organisation.json",
      },
      endpoint: "/api/v1/directory/organisations/[slug]",
      sources: ["ctcg-storefront-rds.collectives"],
      source_license: ["proprietary"],
      license: "LicenseRef-CambridgeTCG-Public-Display-Only",
      freshness: "identity",
      as_of: collective.updated_at,
      extra_meta: {
        as_of_semantics:
          "Steward-submitted updated_at; it is source-state time, not independent verification.",
      },
      no_cache: true,
      does_not_include: [
        "No steward identity or member roster.",
        "No dedicated personal-contact or private-location field. Submitted free text is self-attested and reportable through correction_url.",
      ],
    });
  } catch {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message: "The organisation directory is temporarily unavailable.",
      docs: "/api/v1/directory/coverage",
      status: 503,
      endpoint: "/api/v1/directory/organisations/[slug]",
    });
  }
}
