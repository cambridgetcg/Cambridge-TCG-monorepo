/**
 * A bounded, manually reviewed demonstrator of UK collector events.
 *
 * This is not a scrape and it is not a claim of nationwide completeness.
 * It records minimal public facts from official organisation pages and open
 * postcode-centroid data. No copied descriptions, images, attendee lists,
 * personal names, personal contact details, or inferred relationships enter
 * the registry.
 */

import type {
  CollectorEvent,
  CollectorOrganisation,
  CollectorVenue,
  EvidenceSource,
} from "./types";

/** One batch timestamp: every source and admitted record was checked together. */
export const COLLECTOR_EVENTS_AS_OF = "2026-07-13T09:03:35Z";
export const COLLECTOR_EVENTS_REVIEW_DUE = "2026-07-20T09:03:35Z";
export const COLLECTOR_EVENTS_FRESHNESS_SECONDS = 604800;
export const COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS = 300;

const minimalFactsReview = (
  note: string,
  rightsEvidenceSourceIds: readonly EvidenceSource["id"][] = [],
) => ({
  reviewed_at: "2026-07-13",
  publication_mode: "minimal-facts-only" as const,
  upstream_license: null,
  copied_descriptive_prose_or_media: false as const,
  rights_evidence_source_ids: rightsEvidenceSourceIds,
  note,
});

const openGeodataReview = (
  rightsEvidenceSourceIds: readonly EvidenceSource["id"][] = ["src_postcodes_licence"],
) => ({
  reviewed_at: "2026-07-13",
  publication_mode: "open-geodata" as const,
  upstream_license: "OS OpenData Licence",
  copied_descriptive_prose_or_media: false as const,
  rights_evidence_source_ids: rightsEvidenceSourceIds,
  note:
    "Postcode centroid returned by Postcodes.io from open postcode data. Source-published attribution is retained anywhere geometry is emitted.",
});

const linkOnlyReview = (
  note: string,
  rightsEvidenceSourceIds: readonly EvidenceSource["id"][] = [],
) => ({
  reviewed_at: "2026-07-13",
  publication_mode: "link-only" as const,
  upstream_license: null,
  copied_descriptive_prose_or_media: false as const,
  rights_evidence_source_ids: rightsEvidenceSourceIds,
  note,
});

const eventSource = (
  id: EvidenceSource["id"],
  publisher: string,
  title: string,
  url: EvidenceSource["url"],
  rightsEvidenceSourceIds: readonly EvidenceSource["id"][] = [],
): EvidenceSource => ({
  id,
  publisher,
  title,
  url,
  retrieved_at: COLLECTOR_EVENTS_AS_OF,
  kind: "official-event-page",
  rights_review: minimalFactsReview(
    rightsEvidenceSourceIds.length > 0
      ? "No open-data grant was found in the reviewed rights evidence. Only a small set of bare event facts is transcribed; descriptive prose and media are not copied."
      : "No open-data grant or exact terms page was located during this review. Only a small set of bare event facts is transcribed; descriptive prose and media are not copied.",
    rightsEvidenceSourceIds,
  ),
});

const postcodeSource = (
  id: EvidenceSource["id"],
  postcode: string,
  terminated = false,
): EvidenceSource => ({
  id,
  publisher: "Postcodes.io",
  title: `Postcode lookup: ${postcode}`,
  url: `https://api.postcodes.io/${terminated ? "terminated_postcodes" : "postcodes"}/${encodeURIComponent(postcode)}` as EvidenceSource["url"],
  retrieved_at: COLLECTOR_EVENTS_AS_OF,
  kind: "postcode-geocoder",
  rights_review: openGeodataReview(),
});

export const COLLECTOR_EVENT_SOURCES: readonly EvidenceSource[] = [
  eventSource(
    "src_ukcs_cambridge_11",
    "UK Card Shows",
    "Cambridge Card Show #11",
    "https://www.ukcardshows.co.uk/event-details-registration/cambridge-card-show-11",
    ["src_ukcs_terms"],
  ),
  eventSource(
    "src_ukcs_milton_keynes",
    "UK Card Shows",
    "Milton Keynes Card Show",
    "https://www.ukcardshows.co.uk/event-details-registration/milton-keynes-card-show",
    ["src_ukcs_terms"],
  ),
  eventSource(
    "src_kent_card_show_2026",
    "The Kent Card Show",
    "The Kent Card Show 2026",
    "https://thekentcardshow.uk/",
  ),
  eventSource(
    "src_card_con_iv_2026",
    "Card Con",
    "Card Con IV 2026",
    "https://www.card-con.co.uk/pages/cciv26",
  ),
  {
    id: "src_ukcs_tickets_index",
    publisher: "UK Card Shows",
    title: "Tickets and event index",
    url: "https://www.ukcardshows.co.uk/tickets",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-index",
    rights_review: linkOnlyReview(
      "The index is retained only as the boundary for a database-rights review. Cambridge does not reproduce the current listing set without written permission or an open-data grant.",
      ["src_ukcs_terms"],
    ),
  },
  {
    id: "src_ukcs_contact",
    publisher: "UK Card Shows",
    title: "Contact UK Card Shows",
    url: "https://www.ukcardshows.co.uk/contact",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-contact-page",
    rights_review: minimalFactsReview(
      "Only the organisation-level contact URL and stated hosting relationships are recorded; no personal contact details are copied.",
      ["src_ukcs_terms"],
    ),
  },
  {
    id: "src_ukcs_terms",
    publisher: "UK Card Shows",
    title: "Terms and conditions",
    url: "https://www.ukcardshows.co.uk/terms-and-conditions",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-terms",
    rights_review: minimalFactsReview(
      "Reviewed for reuse boundaries. The page does not grant an open-data licence.",
    ),
  },
  {
    id: "src_companies_house_ukcs",
    publisher: "Companies House",
    title: "UK CARD SHOWS LTD company profile",
    url: "https://find-and-update.company-information.service.gov.uk/company/16350033",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "public-register",
    rights_review: minimalFactsReview(
      "Only organisation identity, company number, and status are recorded. Officer and personal address data are excluded.",
    ),
  },
  {
    id: "src_kent_contact",
    publisher: "The Kent Card Show",
    title: "Contact The Kent Card Show",
    url: "https://thekentcardshow.uk/contact/",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-contact-page",
    rights_review: minimalFactsReview(
      "Only the public organisation contact page URL is recorded; form contents and personal details are not copied.",
    ),
  },
  {
    id: "src_postcodes_licence",
    publisher: "Postcodes.io",
    title: "Postcodes.io licences",
    url: "https://postcodes.io/docs/licences/",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-terms",
    rights_review: openGeodataReview([]),
  },
  {
    id: "src_london_card_show_terms",
    publisher: "London Card Show",
    title: "Terms of use",
    url: "https://londoncardshow.co.uk/terms-of-use/",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-terms",
    rights_review: linkOnlyReview(
      "Restrictive copying and publication language was found. The source remains a discoverable exclusion lead; no event facts are imported.",
    ),
  },
  {
    id: "src_scotland_card_show_terms",
    publisher: "Scotland Card Show",
    title: "Terms and conditions",
    url: "https://scotlandcardshow.com/terms-and-conditions/",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-terms",
    rights_review: linkOnlyReview(
      "Restrictive reproduction language was found. The source remains a discoverable exclusion lead; no event facts are imported.",
    ),
  },
  {
    id: "src_spalding_card_show_lead",
    publisher: "Spalding Card Show",
    title: "Spalding Card Show",
    url: "https://spaldingcardshow.com/",
    retrieved_at: COLLECTOR_EVENTS_AS_OF,
    kind: "official-event-page",
    rights_review: linkOnlyReview(
      "The current official pages presented unresolved date signals during review. No structured event record is admitted until they agree.",
    ),
  },
  postcodeSource("src_postcode_cb4_2qt", "CB4 2QT"),
  postcodeSource("src_postcode_mk9_1up", "MK9 1UP"),
  postcodeSource("src_postcode_me14_3jf", "ME14 3JF"),
  postcodeSource("src_postcode_gu14_6fd", "GU14 6FD"),
] as const;

const venue = (
  id: CollectorVenue["id"],
  name: string,
  street: string | null,
  locality: string,
  postcode: string,
  coordinates: readonly [number, number],
  eventSourceId: EvidenceSource["id"],
  geometrySourceId: EvidenceSource["id"],
  postcodeStatus: "current" | "terminated" = "current",
): CollectorVenue => ({
  id,
  name,
  address: { street, locality, postcode, nation: "England", country_code: "GB" },
  geometry: {
    type: "Point",
    coordinates,
    precision: "postcode-centroid",
    postcode_status: postcodeStatus,
    source_id: geometrySourceId,
    warning: "postcode centroid; not a venue entrance",
  },
  public_links: [],
  field_sources: {
    "/name": [eventSourceId],
    "/address": [eventSourceId],
    "/geometry": [geometrySourceId, "src_postcodes_licence"],
  },
  updated_at: COLLECTOR_EVENTS_AS_OF,
});

export const COLLECTOR_VENUES: readonly CollectorVenue[] = [
  venue("ven_01k0n0a1f4q8t2w6y9c3", "Cambridge Regional College", "Kings Hedges Road", "Cambridge", "CB4 2QT", [0.134368, 52.235291], "src_ukcs_cambridge_11", "src_postcode_cb4_2qt"),
  venue("ven_01k0n0a3h6s1w4y8b2e5", "Unity Place", "200 Grafton Gate", "Milton Keynes", "MK9 1UP", [-0.77254, 52.036313], "src_ukcs_milton_keynes", "src_postcode_mk9_1up"),
  venue("ven_01k0n0a9q3z7d1f5h8m2", "Kent Event Centre", null, "Maidstone", "ME14 3JF", [0.585733, 51.301218], "src_kent_card_show_2026", "src_postcode_me14_3jf"),
  venue("ven_01k0n0b1r4a8e2g6j9n3", "Farnborough International", "ShowCentre, Etps Road", "Farnborough", "GU14 6FD", [-0.759853, 51.27529], "src_card_con_iv_2026", "src_postcode_gu14_6fd"),
] as const;

export const COLLECTOR_ORGANISATIONS: readonly CollectorOrganisation[] = [
  {
    id: "org_01k0n1c1s5b9f3h7k2p4",
    public_name: "UK Card Shows",
    entity_kind: "limited-company",
    legal_identity: {
      legal_name: "UK CARD SHOWS LTD",
      company_number: "16350033",
      register_url: "https://find-and-update.company-information.service.gov.uk/company/16350033",
      status: "active",
    },
    public_links: [
      { kind: "official", url: "https://www.ukcardshows.co.uk/", source_id: "src_ukcs_contact" },
      { kind: "contact", url: "https://www.ukcardshows.co.uk/contact", source_id: "src_ukcs_contact" },
      { kind: "register", url: "https://find-and-update.company-information.service.gov.uk/company/16350033", source_id: "src_companies_house_ukcs" },
    ],
    field_sources: {
      "/public_name": ["src_ukcs_contact"],
      "/legal_identity": ["src_companies_house_ukcs"],
      "/public_links": ["src_ukcs_contact", "src_companies_house_ukcs"],
    },
    updated_at: COLLECTOR_EVENTS_AS_OF,
  },
  {
    id: "org_01k0n1c4w8e3j6m1p5s7",
    public_name: "The Kent Card Show",
    entity_kind: "public-brand",
    legal_identity: null,
    public_links: [
      { kind: "official", url: "https://thekentcardshow.uk/", source_id: "src_kent_card_show_2026" },
      { kind: "contact", url: "https://thekentcardshow.uk/contact/", source_id: "src_kent_contact" },
    ],
    field_sources: {
      "/public_name": ["src_kent_card_show_2026"],
      "/public_links": ["src_kent_card_show_2026", "src_kent_contact"],
    },
    updated_at: COLLECTOR_EVENTS_AS_OF,
  },
  {
    id: "org_01k0n1c5x9f4k7n2q6t8",
    public_name: "Card Con",
    entity_kind: "public-brand",
    legal_identity: null,
    public_links: [
      { kind: "official", url: "https://www.card-con.co.uk/", source_id: "src_card_con_iv_2026" },
    ],
    field_sources: {
      "/public_name": ["src_card_con_iv_2026"],
      "/public_links": ["src_card_con_iv_2026"],
    },
    updated_at: COLLECTOR_EVENTS_AS_OF,
  },
] as const;

const unknownAccessibility = {
  step_free_access: null,
  accessible_toilets: null,
  changing_places_toilet: null,
  accessible_parking: null,
  blue_badge_parking: null,
  carer_ticket_available: null,
  carer_ticket_path: null,
} as const;

const observed = {
  first_observed_at: COLLECTOR_EVENTS_AS_OF,
  updated_at: COLLECTOR_EVENTS_AS_OF,
  last_successful_check_at: COLLECTOR_EVENTS_AS_OF,
  review_due_at: COLLECTOR_EVENTS_REVIEW_DUE,
} as const;

const ukcs = "org_01k0n1c1s5b9f3h7k2p4" as const;

export const COLLECTOR_EVENTS: readonly CollectorEvent[] = [
  {
    id: "evt_01k0m9e1a6r3c8d4f7g2",
    revision: 1,
    calendar_sequence: 0,
    name: "Cambridge Card Show #11",
    category: "trading-card-show",
    status: "scheduled",
    integrity_state: "consistent",
    schedule: { start: "2026-08-01T10:00:00+01:00", end: "2026-08-01T16:00:00+01:00", precision: "date-time", time_zone: "Europe/London", end_is_exclusive: true },
    venue_id: "ven_01k0n0a1f4q8t2w6y9c3",
    location_status: "published-venue",
    organisation_relations: [{ organisation_id: ukcs, roles: ["organiser", "publisher", "ticketing"], source_ids: ["src_ukcs_cambridge_11", "src_ukcs_contact"] }],
    accessibility: {
      ...unknownAccessibility,
      carer_ticket_available: true,
      carer_ticket_path: true,
    },
    age_policy: null,
    public_links: [{ kind: "details", url: "https://www.ukcardshows.co.uk/event-details-registration/cambridge-card-show-11", source_id: "src_ukcs_cambridge_11" }],
    conflicts: [],
    quality_flags: [],
    field_sources: { "/name": ["src_ukcs_cambridge_11"], "/status": ["src_ukcs_cambridge_11"], "/schedule": ["src_ukcs_cambridge_11"], "/venue_id": ["src_ukcs_cambridge_11"], "/organisation_relations": ["src_ukcs_cambridge_11", "src_ukcs_contact"], "/accessibility/carer_ticket_available": ["src_ukcs_cambridge_11"], "/accessibility/carer_ticket_path": ["src_ukcs_cambridge_11"] },
    ...observed,
  },
  {
    id: "evt_01k0m9e3c8t5f1g6h9j4",
    revision: 1,
    calendar_sequence: 0,
    name: "Milton Keynes Card Show",
    category: "trading-card-show",
    status: "scheduled",
    integrity_state: "consistent",
    schedule: { start: "2026-10-11T10:30:00+01:00", end: "2026-10-11T16:00:00+01:00", precision: "date-time", time_zone: "Europe/London", end_is_exclusive: true },
    venue_id: "ven_01k0n0a3h6s1w4y8b2e5",
    location_status: "published-venue",
    organisation_relations: [{ organisation_id: ukcs, roles: ["publisher", "ticketing"], source_ids: ["src_ukcs_milton_keynes"] }],
    accessibility: {
      step_free_access: true,
      accessible_toilets: true,
      changing_places_toilet: true,
      accessible_parking: true,
      blue_badge_parking: true,
      carer_ticket_available: true,
      carer_ticket_path: true,
    },
    age_policy: null,
    public_links: [{ kind: "details", url: "https://www.ukcardshows.co.uk/event-details-registration/milton-keynes-card-show", source_id: "src_ukcs_milton_keynes" }],
    conflicts: [],
    quality_flags: [],
    field_sources: { "/name": ["src_ukcs_milton_keynes"], "/status": ["src_ukcs_milton_keynes"], "/schedule": ["src_ukcs_milton_keynes"], "/venue_id": ["src_ukcs_milton_keynes"], "/organisation_relations": ["src_ukcs_milton_keynes"], "/accessibility": ["src_ukcs_milton_keynes"] },
    ...observed,
  },
  {
    id: "evt_01k0m9f1m6b3p8q4r7s2",
    revision: 1,
    calendar_sequence: 0,
    name: "The Kent Card Show 2026",
    category: "trading-card-show",
    status: "scheduled",
    integrity_state: "consistent",
    schedule: { start: "2026-10-03", end: "2026-10-05", precision: "date", time_zone: "Europe/London", end_is_exclusive: true },
    venue_id: "ven_01k0n0a9q3z7d1f5h8m2",
    location_status: "published-venue",
    organisation_relations: [{ organisation_id: "org_01k0n1c4w8e3j6m1p5s7", roles: ["publisher"], source_ids: ["src_kent_card_show_2026"] }],
    accessibility: unknownAccessibility,
    age_policy: null,
    public_links: [{ kind: "official", url: "https://thekentcardshow.uk/", source_id: "src_kent_card_show_2026" }],
    conflicts: [],
    quality_flags: ["time-not-published"],
    field_sources: { "/name": ["src_kent_card_show_2026"], "/status": ["src_kent_card_show_2026"], "/schedule": ["src_kent_card_show_2026"], "/venue_id": ["src_kent_card_show_2026"], "/organisation_relations": ["src_kent_card_show_2026"] },
    ...observed,
  },
  {
    id: "evt_01k0m9f2n7c4q9r5s8t3",
    revision: 1,
    calendar_sequence: 0,
    name: "Card Con IV 2026",
    category: "trading-card-show",
    status: "scheduled",
    integrity_state: "conflicting",
    schedule: { start: "2026-09-05", end: "2026-09-07", precision: "date", time_zone: "Europe/London", end_is_exclusive: true },
    venue_id: "ven_01k0n0b1r4a8e2g6j9n3",
    location_status: "published-venue",
    organisation_relations: [{ organisation_id: "org_01k0n1c5x9f4k7n2q6t8", roles: ["publisher"], source_ids: ["src_card_con_iv_2026"] }],
    accessibility: {
      ...unknownAccessibility,
      carer_ticket_available: true,
      carer_ticket_path: true,
    },
    age_policy: null,
    public_links: [{ kind: "official", url: "https://www.card-con.co.uk/pages/cciv26", source_id: "src_card_con_iv_2026" }],
    conflicts: [{ field: "/schedule/time", observed_values: ["09:00–17:00", "10:00–18:00 (VIP 09:30)"], source_ids: ["src_card_con_iv_2026"], handling: "withheld-until-resolved", note: "Two time ranges appear on the official page, so only date precision is published here." }],
    quality_flags: ["internal-source-time-conflict", "time-withheld-until-resolved"],
    field_sources: { "/name": ["src_card_con_iv_2026"], "/status": ["src_card_con_iv_2026"], "/schedule": ["src_card_con_iv_2026"], "/venue_id": ["src_card_con_iv_2026"], "/organisation_relations": ["src_card_con_iv_2026"], "/accessibility/carer_ticket_available": ["src_card_con_iv_2026"], "/accessibility/carer_ticket_path": ["src_card_con_iv_2026"] },
    ...observed,
  },
] as const;

export const COLLECTOR_EVENT_EXCLUSIONS = [
  {
    source_id: "src_ukcs_tickets_index",
    source: "UK Card Shows tickets index",
    url: "https://www.ukcardshows.co.uk/tickets",
    reason: "The broader listing set is link-only. Written permission or an open-data grant is required before reproducing or systematically expanding from this index.",
  },
  {
    source_id: "src_london_card_show_terms",
    source: "London Card Show",
    url: "https://londoncardshow.co.uk/terms-of-use/",
    reason: "Official terms prohibit copying or publishing site content; retained as a link-only lead, not a structured record.",
  },
  {
    source_id: "src_scotland_card_show_terms",
    source: "Scotland Card Show",
    url: "https://scotlandcardshow.com/terms-and-conditions/",
    reason: "Official terms contain restrictive reproduction language; retained as a link-only lead, not a structured record.",
  },
  {
    source_id: "src_spalding_card_show_lead",
    source: "Spalding Card Show",
    url: "https://spaldingcardshow.com/",
    reason: "The current official pages presented unresolved date signals during review; admission is paused until they agree.",
  },
] as const;

export const COLLECTOR_EVENT_GAPS = [
  "This four-event demonstrator is England-only and is not a directory of every UK collector event.",
  "No admitted future event in Scotland, Wales, or Northern Ireland passed this review cycle.",
  "Accessibility is unknown unless an official source explicitly stated the feature.",
  "Event cancellation and postponement require an affirmative source statement; a disappearing page is not treated as cancellation.",
  "Organisation records stop at public brands and legal entities. People, officer records, and personal contact details are excluded.",
] as const;

export const COLLECTOR_EVENT_ATTRIBUTIONS = [
  "Contains Ordnance Survey data © Crown copyright and database right 2025.",
  "Contains Royal Mail data © Royal Mail copyright and database right 2025.",
  "Contains National Statistics data © Crown copyright and database right 2025.",
  "Contains NRS data © Crown copyright and database right 2025.",
  "Postcode centroids supplied via Postcodes.io; points are approximate and are not venue entrances.",
] as const;

export const COLLECTOR_EVENT_SOURCE_BY_ID = new Map(
  COLLECTOR_EVENT_SOURCES.map((source) => [source.id, source]),
);
export const COLLECTOR_EVENT_BY_ID = new Map(
  COLLECTOR_EVENTS.map((event) => [event.id, event]),
);
export const COLLECTOR_VENUE_BY_ID = new Map(
  COLLECTOR_VENUES.map((venueRecord) => [venueRecord.id, venueRecord]),
);
export const COLLECTOR_ORGANISATION_BY_ID = new Map(
  COLLECTOR_ORGANISATIONS.map((organisation) => [organisation.id, organisation]),
);
