/**
 * CC0 JSON Schemas for the collector-events commons.
 *
 * These schemas describe Cambridge-authored record shapes and identifiers.
 * They do not grant rights over facts drawn from upstream event sources;
 * responses carrying those facts remain NOASSERTION and retain evidence.
 */

const ID = "https://cambridgetcg.com/schemas/collector-events/v1";

const sourceId = { type: "string", pattern: "^src_[a-z0-9_]+$" } as const;
const httpsUrl = { type: "string", pattern: "^https://" } as const;
const nullableBoolean = { type: ["boolean", "null"] } as const;
const publicLinkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "url", "source_id"],
  properties: {
    kind: { enum: ["official", "details", "booking", "contact", "register"] },
    url: httpsUrl,
    source_id: sourceId,
  },
} as const;
const fieldSourcesSchema = {
  type: "object",
  minProperties: 1,
  propertyNames: { pattern: "^/" },
  additionalProperties: {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: sourceId,
  },
} as const;

export const COLLECTOR_EVENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${ID}/event.json`,
  title: "Collector event",
  description:
    "One source-backed public collector event. The record-shape schema is CC0; upstream facts retain their own evidence and rights boundary.",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "revision",
    "calendar_sequence",
    "name",
    "category",
    "status",
    "integrity_state",
    "time_relation",
    "schedule",
    "venue_id",
    "location_status",
    "organisation_relations",
    "accessibility",
    "age_policy",
    "public_links",
    "conflicts",
    "quality_flags",
    "field_sources",
    "first_observed_at",
    "updated_at",
    "last_successful_check_at",
    "review_due_at",
  ],
  properties: {
    id: { type: "string", pattern: "^evt_[a-z0-9]+$" },
    revision: { type: "integer", minimum: 1 },
    calendar_sequence: { type: "integer", minimum: 0 },
    name: { type: "string", minLength: 1 },
    category: { const: "trading-card-show" },
    status: {
      enum: ["scheduled", "tentative", "postponed", "cancelled", "unknown"],
    },
    integrity_state: { enum: ["consistent", "conflicting"] },
    time_relation: {
      enum: ["upcoming", "in_progress", "past", "unscheduled"],
      description: "Derived at response time; separate from event status.",
    },
    schedule: {
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["start", "end", "precision", "time_zone", "end_is_exclusive"],
          properties: {
            start: { type: "string", minLength: 10 },
            end: { type: "string" },
            precision: { enum: ["date", "date-time"] },
            time_zone: { const: "Europe/London" },
            end_is_exclusive: { const: true },
          },
          allOf: [
            {
              if: { properties: { precision: { const: "date" } }, required: ["precision"] },
              then: {
                properties: {
                  start: { type: "string", format: "date" },
                  end: { type: "string", format: "date" },
                },
              },
            },
            {
              if: { properties: { precision: { const: "date-time" } }, required: ["precision"] },
              then: {
                properties: {
                  start: { type: "string", format: "date-time" },
                  end: { type: "string", format: "date-time" },
                },
              },
            },
          ],
        },
      ],
    },
    venue_id: {
      oneOf: [{ type: "null" }, { type: "string", pattern: "^ven_[a-z0-9]+$" }],
    },
    location_status: { enum: ["published-venue", "not-published"] },
    organisation_relations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["organisation_id", "roles", "source_ids"],
        properties: {
          organisation_id: { type: "string", pattern: "^org_[a-z0-9]+$" },
          roles: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: { enum: ["organiser", "promoter", "publisher", "ticketing"] },
          },
          source_ids: { type: "array", minItems: 1, uniqueItems: true, items: sourceId },
        },
      },
    },
    accessibility: {
      type: "object",
      additionalProperties: false,
      required: [
        "step_free_access",
        "accessible_toilets",
        "changing_places_toilet",
        "accessible_parking",
        "blue_badge_parking",
        "carer_ticket_available",
        "carer_ticket_path",
      ],
      properties: {
        step_free_access: nullableBoolean,
        accessible_toilets: nullableBoolean,
        changing_places_toilet: nullableBoolean,
        accessible_parking: nullableBoolean,
        blue_badge_parking: nullableBoolean,
        carer_ticket_available: nullableBoolean,
        carer_ticket_path: nullableBoolean,
      },
    },
    age_policy: { enum: ["18-plus", null] },
    public_links: {
      type: "array",
      items: publicLinkSchema,
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "observed_values", "source_ids", "handling", "note"],
        properties: {
          field: { type: "string", pattern: "^/" },
          observed_values: { type: "array", minItems: 2, uniqueItems: true, items: { type: "string" } },
          source_ids: { type: "array", minItems: 1, uniqueItems: true, items: sourceId },
          handling: { enum: ["preferred-structured-heading", "withheld-until-resolved"] },
          note: { type: "string", minLength: 1 },
        },
      },
    },
    quality_flags: { type: "array", uniqueItems: true, items: { type: "string" } },
    field_sources: {
      ...fieldSourcesSchema,
      required: ["/name", "/status", "/schedule", "/venue_id", "/organisation_relations"],
    },
    first_observed_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    last_successful_check_at: { type: "string", format: "date-time" },
    review_due_at: { type: "string", format: "date-time" },
  },
  allOf: [
    {
      if: {
        properties: {
          status: { enum: ["scheduled", "cancelled"] },
        },
        required: ["status"],
      },
      then: {
        properties: {
          schedule: { type: "object" },
        },
      },
    },
  ],
} as const;

export const COLLECTOR_VENUE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${ID}/venue.json`,
  title: "Collector venue",
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "address", "geometry", "public_links", "field_sources", "updated_at"],
  properties: {
    id: { type: "string", pattern: "^ven_[a-z0-9]+$" },
    name: { type: "string", minLength: 1 },
    address: {
      type: "object",
      additionalProperties: false,
      required: ["street", "locality", "postcode", "nation", "country_code"],
      properties: {
        street: { type: ["string", "null"] },
        locality: { type: "string" },
        postcode: { type: "string" },
        nation: { enum: ["England", "Scotland", "Wales", "Northern Ireland"] },
        country_code: { const: "GB" },
      },
    },
    geometry: {
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "coordinates", "precision", "postcode_status", "source_id", "warning"],
          properties: {
            type: { const: "Point" },
            coordinates: {
              type: "array",
              prefixItems: [
                { type: "number", minimum: -180, maximum: 180 },
                { type: "number", minimum: -90, maximum: 90 },
              ],
              minItems: 2,
              maxItems: 2,
            },
            precision: { const: "postcode-centroid" },
            postcode_status: { enum: ["current", "terminated"] },
            source_id: sourceId,
            warning: { const: "postcode centroid; not a venue entrance" },
          },
        },
      ],
    },
    public_links: { type: "array", items: publicLinkSchema },
    field_sources: {
      ...fieldSourcesSchema,
      required: ["/name", "/address", "/geometry"],
    },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

export const COLLECTOR_ORGANISATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${ID}/organisation.json`,
  title: "Collector event organisation",
  type: "object",
  additionalProperties: false,
  required: ["id", "public_name", "entity_kind", "legal_identity", "public_links", "field_sources", "updated_at"],
  properties: {
    id: { type: "string", pattern: "^org_[a-z0-9]+$" },
    public_name: { type: "string", minLength: 1 },
    entity_kind: { enum: ["limited-company", "public-brand"] },
    legal_identity: {
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["legal_name", "company_number", "register_url", "status"],
          properties: {
            legal_name: { type: "string" },
            company_number: { type: "string" },
            register_url: httpsUrl,
            status: { enum: ["active", "inactive", "unknown"] },
          },
        },
      ],
    },
    public_links: { type: "array", items: publicLinkSchema },
    field_sources: {
      ...fieldSourcesSchema,
      required: ["/public_name", "/public_links"],
    },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

export const COLLECTOR_EVENT_SOURCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `${ID}/source.json`,
  title: "Collector event evidence source",
  type: "object",
  additionalProperties: false,
  required: ["id", "publisher", "title", "url", "retrieved_at", "kind", "rights_review"],
  properties: {
    id: sourceId,
    publisher: { type: "string" },
    title: { type: "string" },
    url: httpsUrl,
    retrieved_at: { type: "string", format: "date-time" },
    kind: {
      enum: [
        "official-event-page",
        "official-index",
        "official-contact-page",
        "official-terms",
        "public-register",
        "postcode-geocoder",
      ],
    },
    rights_review: {
      type: "object",
      additionalProperties: false,
      required: [
        "reviewed_at",
        "publication_mode",
        "upstream_license",
        "copied_descriptive_prose_or_media",
        "rights_evidence_source_ids",
        "note",
      ],
      properties: {
        reviewed_at: { type: "string", format: "date" },
        publication_mode: { enum: ["minimal-facts-only", "open-geodata", "link-only"] },
        upstream_license: { type: ["string", "null"] },
        copied_descriptive_prose_or_media: { const: false },
        rights_evidence_source_ids: {
          type: "array",
          uniqueItems: true,
          items: sourceId,
        },
        note: { type: "string" },
      },
    },
  },
} as const;

export const COLLECTOR_EVENTS_SCHEMAS = {
  event: COLLECTOR_EVENT_SCHEMA,
  venue: COLLECTOR_VENUE_SCHEMA,
  organisation: COLLECTOR_ORGANISATION_SCHEMA,
  source: COLLECTOR_EVENT_SOURCE_SCHEMA,
} as const;
