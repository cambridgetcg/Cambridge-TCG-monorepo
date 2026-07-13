/**
 * Public contract for the UK collector-events commons.
 *
 * The records deliberately contain organisations and public venues, not
 * private people. Every trust-bearing field points back to one or more
 * reviewed evidence sources. Unknown accessibility facts remain null.
 */

export type CollectorEventStatus =
  | "scheduled"
  | "tentative"
  | "postponed"
  | "cancelled"
  | "unknown";

export type EventTimeRelation =
  | "upcoming"
  | "in_progress"
  | "past"
  | "unscheduled";

export type IntegrityState = "consistent" | "conflicting";

export interface EvidenceSource {
  id: `src_${string}`;
  publisher: string;
  title: string;
  url: `https://${string}`;
  retrieved_at: string;
  kind:
    | "official-event-page"
    | "official-index"
    | "official-contact-page"
    | "official-terms"
    | "public-register"
    | "postcode-geocoder";
  rights_review: {
    reviewed_at: string;
    publication_mode: "minimal-facts-only" | "open-geodata" | "link-only";
    upstream_license: string | null;
    copied_descriptive_prose_or_media: false;
    rights_evidence_source_ids: readonly EvidenceSource["id"][];
    note: string;
  };
}

export interface PublicLink {
  kind: "official" | "details" | "booking" | "contact" | "register";
  url: `https://${string}`;
  source_id: EvidenceSource["id"];
}

export interface EventSchedule {
  /** ISO date or ISO date-time with an explicit UTC offset. */
  start: string;
  /** Exclusive end. A one-day date-only event ends on the next date. */
  end: string;
  precision: "date" | "date-time";
  time_zone: "Europe/London";
  end_is_exclusive: true;
}

export interface EventConflict {
  field: string;
  observed_values: readonly string[];
  source_ids: readonly EvidenceSource["id"][];
  handling:
    | "preferred-structured-heading"
    | "withheld-until-resolved";
  note: string;
}

export interface AccessibilityFacts {
  step_free_access: boolean | null;
  accessible_toilets: boolean | null;
  changing_places_toilet: boolean | null;
  accessible_parking: boolean | null;
  blue_badge_parking: boolean | null;
  carer_ticket_available: boolean | null;
  carer_ticket_path: boolean | null;
}

export interface EventOrganisationRelation {
  organisation_id: `org_${string}`;
  roles: readonly ("organiser" | "promoter" | "publisher" | "ticketing")[];
  source_ids: readonly EvidenceSource["id"][];
}

interface CollectorEventBase {
  id: `evt_${string}`;
  revision: number;
  calendar_sequence: number;
  name: string;
  category: "trading-card-show";
  integrity_state: IntegrityState;
  venue_id: `ven_${string}` | null;
  location_status: "published-venue" | "not-published";
  organisation_relations: readonly EventOrganisationRelation[];
  accessibility: AccessibilityFacts;
  age_policy: "18-plus" | null;
  public_links: readonly PublicLink[];
  conflicts: readonly EventConflict[];
  quality_flags: readonly string[];
  field_sources: Readonly<Record<string, readonly EvidenceSource["id"][]>>;
  first_observed_at: string;
  updated_at: string;
  last_successful_check_at: string;
  review_due_at: string;
}

export type CollectorEvent = CollectorEventBase &
  (
    | {
        status: "scheduled" | "cancelled";
        /** Lifecycle-bearing statuses always retain an exclusive schedule. */
        schedule: EventSchedule;
      }
    | {
        status: "tentative" | "postponed" | "unknown";
        schedule: EventSchedule | null;
      }
  );

export type CollectorEventView = CollectorEvent & {
  time_relation: EventTimeRelation;
};

export interface VenueGeometry {
  type: "Point";
  /** RFC 7946 order: longitude, latitude. */
  coordinates: readonly [number, number];
  precision: "postcode-centroid";
  postcode_status: "current" | "terminated";
  source_id: EvidenceSource["id"];
  warning: "postcode centroid; not a venue entrance";
}

export interface CollectorVenue {
  id: `ven_${string}`;
  name: string;
  address: {
    street: string | null;
    locality: string;
    postcode: string;
    nation: "England" | "Scotland" | "Wales" | "Northern Ireland";
    country_code: "GB";
  };
  geometry: VenueGeometry | null;
  public_links: readonly PublicLink[];
  field_sources: Readonly<Record<string, readonly EvidenceSource["id"][]>>;
  updated_at: string;
}

export interface CollectorOrganisation {
  id: `org_${string}`;
  public_name: string;
  entity_kind: "limited-company" | "public-brand";
  legal_identity: {
    legal_name: string;
    company_number: string;
    register_url: `https://${string}`;
    status: "active" | "inactive" | "unknown";
  } | null;
  public_links: readonly PublicLink[];
  field_sources: Readonly<Record<string, readonly EvidenceSource["id"][]>>;
  updated_at: string;
}
