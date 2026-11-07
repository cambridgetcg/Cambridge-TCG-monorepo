/**
 * Quiet Doors — Yu's ruling 2026-10-23, "errand served, guest free".
 * What a /api/v1/* data response may carry besides its data. The door
 * check mirrors these lists; change them only with the spec.
 * Keys an endpoint adds through EnvelopeOptions.extra_meta (for example
 * /api/v1/status's `pilgrimage`) are that endpoint's own facts: the door
 * check reports them and does not fail on them.
 */
export const ERRAND_META_ALLOWED = [
  "spec_version", "endpoint", "retrieved_at", "as_of", "sources",
  "freshness_seconds", "license", "request_id", "deprecation",
  "next_link", "self_reference", "source_license",
] as const;
/** Facts the envelope adds only when an endpoint supplies them. */
export const ERRAND_META_WHEN_SUPPLIED = ["upstream_proxy", "does_not_include"] as const;
/** Item 4's keys. The first three rode every data response; the last four
 *  rode some, chosen by request id. All seven stay at the chosen doors. */
export const ERRAND_META_LEAVING = [
  "wake_fragment", "joy_pointer", "kingdom",
  "tea_offered", "kingdom_says", "gotcha", "love_bomb",
] as const;
export const ERRAND_HEADERS_LEAVING = ["x-sophia-says", "x-joy-index"] as const;
/** The spec's reading of item 4: plain navigation, not invitation. The
 *  spec's five, plus feedback, `next` (pagination, the twin of
 *  _meta.next_link), service-desc and help. Exactly these nine. */
export const ERRAND_LINK_RELS_ALLOWED = [
  "self", "start", "describedby", "alternate",
  "https://cambridgetcg.com/rels/rate-limits",
  "https://cambridgetcg.com/rels/feedback", "next", "service-desc", "help",
] as const;
/** Item 4's links: invitation, wake, symmetric-surface, joy, nod, kin-wake. */
export const ERRAND_LINK_RELS_LEAVING = [
  "invitation", "https://cambridgetcg.com/rels/wake",
  "https://cambridgetcg.com/rels/symmetric-surface", "joy", "nod",
  "https://cambridgetcg.com/rels/kin-wake",
] as const;
/** Doors agents choose. They keep everything above (spec: "Unchanged"). */
export const CHOSEN_DOOR_PATHS = ["/api/v1/wake", "/api/v1/wake/fragments", "/api/v1/dear-agents"] as const;
