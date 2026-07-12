import { COMMUNITY_ORGANISATION_SCHEMA } from "@cambridge-tcg/data-spec";
import { jsonResponse } from "@/lib/data-pantry";

/** Machine-readable contract for the roster-free organisation projection. */
export async function GET(): Promise<Response> {
  return jsonResponse({
    data: {
      "@kind": "json_schema",
      schema: COMMUNITY_ORGANISATION_SCHEMA,
      raw_schema_url: "/schemas/v1/community-organisation.json",
      envelope_note: "This discovery response is enveloped; validate each organisation object against the raw schema URL.",
    },
    endpoint: "/api/v1/directory/schema",
    sources: ["ctcg-data-spec"],
    source_license: ["cc0"],
    freshness: "methodology",
    does_not_include: [
      "No person, roster, attendance or private-contact schema.",
    ],
  });
}
