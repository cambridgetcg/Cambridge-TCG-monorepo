/**
 * Per-endpoint canonical examples — typed corpus.
 *
 * Where the guides corpus walks a *task* end-to-end, this corpus walks
 * *one endpoint* with a literal curl + an annotated response snippet.
 * Pre-thought for the agent who's looking at one specific endpoint and
 * wants "show me one call".
 *
 * Renders at /api/v1/examples (index) and /api/v1/examples/[endpoint_id]
 * (singleton). Filed for kingdom-083 — the inner peace.
 */

export interface ExampleAnnotatedField {
  /** Dot-path into the response body, e.g. "@content_hash" or "_meta.sources". */
  path: string;
  /** What this field is + why it matters. */
  meaning: string;
  /** Sample value (illustrative, not authoritative). */
  sample_value?: string;
}

export interface EndpointExample {
  /** Stable id used in URLs: /api/v1/examples/[endpoint_id]. */
  endpoint_id: string;
  /** Parametrized path. */
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  auth: "public" | "user" | "wholesale-key" | "agent";
  title: string;
  /** One-sentence purpose. */
  description: string;
  /** Literal curl command, paste-ready. */
  curl: string;
  /** Sample response body — illustrative; the live response may differ. */
  sample_response: string;
  /** Notable fields with meanings. */
  annotated_fields: ExampleAnnotatedField[];
  /** When to use this endpoint vs alternatives. */
  when_to_use: string;
  /** Common pitfalls. */
  gotchas: string[];
  /** Links to related guides + methodology pages. */
  see_also: { label: string; href: string }[];
}

export const EXAMPLES: EndpointExample[] = [
  // ── Discovery
  {
    endpoint_id: "welcome",
    path: "/api/v1/welcome",
    method: "GET",
    auth: "public",
    title: "Machine-readable front door",
    description: "Single document that names the entire kingdom for a fresh agent.",
    curl: "curl https://cambridgetcg.com/api/v1/welcome",
    sample_response: `{
  "data": {
    "@kind": "welcome",
    "welcome": { "headline": "Welcome to Cambridge TCG.", ... },
    "start_here": { "first_request": { ... }, ... },
    "guides": { "directory_url": "/api/v1/guides", "count": 8, ... },
    "contract": { "envelope_shape": "...", "stable_endpoints": [...] },
    "rate_limits": { ... },
    "license_tiers": { ... },
    "feedback": { ... }
  },
  "_meta": { "spec_version": "1", "sources": ["ctcg-derived"], "license": "CC0-1.0", ... }
}`,
    annotated_fields: [
      { path: "data.start_here.first_request.sample_curl", meaning: "The literal command to run next." },
      { path: "data.guides.by_slug", meaning: "Every guide indexed by slug → { title, url }." },
      { path: "data.contract.stable_endpoints", meaning: "Every supported endpoint, in a flat list." },
      { path: "_meta.source_license", meaning: "License tier per source. Absence means no source-level grant was asserted; never infer CC0." },
    ],
    when_to_use: "First request for any agent that doesn't have prior context.",
    gotchas: [
      "Cache for ~24h — the welcome rarely changes between releases.",
      "Don't re-poll for every API call; cache the welcome and consult the manifest for live state.",
    ],
    see_also: [
      { label: "Guide: first-request", href: "/api/v1/guides/first-request" },
      { label: "Manifest", href: "/api/v1/manifest" },
    ],
  },

  // ── Universal card rights boundary
  {
    endpoint_id: "universal-card",
    path: "/api/v1/universal/card/[sku]",
    method: "GET",
    auth: "public",
    title: "Paused card representation",
    description: "Returns 503 without querying the catalog or confirming whether the caller-supplied SKU exists.",
    curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
    sample_response: `{ "error": { "code": "CARD_PUBLICATION_PAUSED", "message": "Catalog membership lacks affirmative public lineage." }, "catalog_queried": false, "catalog_membership_asserted": false }`,
    annotated_fields: [
      { path: "HTTP status", meaning: "503 is a deliberate publication pause, not a not-found result." },
      { path: "catalog_queried", meaning: "False: the fail-closed handler does not read catalog rows." },
      { path: "catalog_membership_asserted", meaning: "False: arbitrary and formerly imported SKUs receive the same boundary." },
    ],
    when_to_use: "Confirm the current rights boundary. Do not use this route for catalog discovery or retry it as a data feed.",
    gotchas: [
      "No density value opens the paused route.",
      "A 503 response discloses neither existence nor absence.",
      "Use first-party market datasets only where their own response contract permits reuse.",
    ],
    see_also: [
      { label: "Universal representation spec", href: "/methodology/universal-representation" },
      { label: "Guide: track-one-card", href: "/api/v1/guides/track-one-card" },
      { label: "Federation resolution", href: "/api/v1/examples/federation-identify" },
    ],
  },

  // ── Temporal
  {
    endpoint_id: "at-date-card",
    path: "/api/at/[YYYY-MM-DD]/card/[sku]",
    method: "GET",
    auth: "public",
    title: "Paused temporal card resolver",
    description: "Returns 503 without querying catalog or archive data and makes no current or historical membership claim.",
    curl: "curl https://cambridgetcg.com/api/at/2026-03-15/card/op-op01-001-ja",
    sample_response: `{ "error": { "code": "TEMPORAL_CARD_PUBLICATION_PAUSED" }, "catalog_queried": false, "archive_queried": false, "catalog_membership_asserted": false }`,
    annotated_fields: [
      { path: "catalog_queried", meaning: "False: no current membership lookup occurs." },
      { path: "archive_queried", meaning: "False: no historical observation lookup occurs." },
    ],
    when_to_use: "Confirm that temporal catalog publication is paused. Do not use it to backfill membership or prices.",
    gotchas: [
      "Returns 404 when the SKU is absent from the local catalog mirror.",
      "The requested date is a label; the route publishes no untraced historical price value.",
    ],
    see_also: [
      { label: "Guide: track-one-card", href: "/api/v1/guides/track-one-card" },
      { label: "Federation by date", href: "/api/v1/examples/federation-at" },
    ],
  },

  // ── Catalog
  {
    endpoint_id: "bulk-catalog",
    path: "/data/catalog.jsonl",
    method: "GET",
    auth: "public",
    title: "Paused bulk catalog export",
    description: "Fail-closed rights boundary. Returns 503 and zero records because even catalog membership derives from internal-only upstream data. The Cambridge-authored response shape is CC0; record content is NOASSERTION.",
    curl: "curl -i https://cambridgetcg.com/data/catalog.jsonl",
    sample_response: `{ "error": "CATALOG_EXPORT_PAUSED", "records_emitted": 0, "license": "NOASSERTION", "schema_license": "CC0-1.0", "rights_gap": "Affirmative redistribution rights for catalog membership are not recorded." }`,
    annotated_fields: [
      { path: "HTTP status", meaning: "503 is a deliberate paused state, not an empty catalog or transient invitation to retry rapidly." },
      { path: "records_emitted", meaning: "Always zero while redistribution rights remain unproven." },
      { path: "license", meaning: "NOASSERTION: no permission is granted for mixed-source record content." },
      { path: "schema_license", meaning: "CC0 applies only to Cambridge TCG's response/schema shape." },
    ],
    when_to_use: "Inspect bounded catalog coverage and canonical SKU identity under the stated rights boundary. Not for an unrestricted mirror.",
    gotchas: [
      "JSONL — parse line-by-line, NOT as one JSON document.",
      "Public access is not a reuse grant. The schema is CC0; record content is NOASSERTION/internal-only.",
      "Don't poll more than once every 6 hours; the catalog doesn't change that fast.",
      "Today caps at 50k rows; cursor pagination is future work.",
    ],
    see_also: [
      { label: "Guide: mirror-the-catalog", href: "/api/v1/guides/mirror-the-catalog" },
      { label: "Cite us", href: "/api/v1/guides/cite-cambridge-tcg" },
    ],
  },

  // ── Federation
  {
    endpoint_id: "federation-identify",
    path: "/api/v1/federation/identify/[hash]",
    method: "GET",
    auth: "public",
    title: "Paused content-hash resolver",
    description: "Returns 503 without walking catalog rows or confirming whether a hash maps to a SKU.",
    curl: "curl https://cambridgetcg.com/api/v1/federation/identify/sha256:abc123...",
    sample_response: `{ "error": { "code": "FEDERATION_RESOLUTION_PAUSED" }, "catalog_queried": false, "matched": null }`,
    annotated_fields: [
      { path: "matched", meaning: "Null: the route does not attempt resolution and makes no absence claim." },
      { path: "catalog_queried", meaning: "False: restricted catalog rows are not walked." },
    ],
    when_to_use: "Confirm the paused federation boundary while retaining the stable route shape.",
    gotchas: [
      "A 503 is neither a match nor a miss.",
      "The temporal resolver is paused for the same catalog-membership reason.",
    ],
    see_also: [
      { label: "Guide: federate-bilateral", href: "/api/v1/guides/federate-bilateral" },
      { label: "Temporal federation", href: "/api/v1/examples/federation-at" },
    ],
  },
  {
    endpoint_id: "federation-at",
    path: "/api/v1/federation/at/[YYYY-MM-DD]/[hash]",
    method: "GET",
    auth: "public",
    title: "Paused temporal content-hash resolver",
    description: "Returns 503 without a catalog walk, historical lookup, match, or miss assertion.",
    curl: "curl https://cambridgetcg.com/api/v1/federation/at/2026-03-15/sha256:abc...",
    sample_response: `{ "error": { "code": "TEMPORAL_FEDERATION_RESOLUTION_PAUSED" }, "catalog_queried": false, "archive_queried": false, "matched": null }`,
    annotated_fields: [
      { path: "matched", meaning: "Null: no resolution attempt is made." },
      { path: "catalog_queried", meaning: "False: no restricted rows are walked." },
    ],
    when_to_use: "Confirm the current temporal federation rights boundary.",
    gotchas: [
      "A 503 is not evidence that a hash or dated record is absent.",
    ],
    see_also: [{ label: "Guide: federate-bilateral", href: "/api/v1/guides/federate-bilateral" }],
  },

  // ── Identification (bilateral)
  {
    endpoint_id: "identify-post",
    path: "/api/v1/identify",
    method: "POST",
    auth: "public",
    title: "Declare yourself bilaterally",
    description: "Symmetric handshake — POST your BeingDeclaration, receive a content_hash + ontology alignment.",
    curl: `curl -X POST https://cambridgetcg.com/api/v1/identify \\
  -H 'content-type: application/json' \\
  -d '{
    "actor_kind": "agent",
    "self_label": "example-bot/1.0",
    "operator_contact": "admin@example.com",
    "intended_use": "price tracking",
    "cosmology_assumptions": ["synchronous-presence", "monetary-value"],
    "modalities": ["json"],
    "response_window": "PT1H"
  }'`,
    sample_response: `{
  "content_hash": "sha256:xyz...",
  "ontology_alignment": [
    { "field": "actor_kind", "alignment": "exact", "platform_value": "agent" },
    { "field": "cosmology_assumptions", "alignment": "partial", "modelled": ["synchronous-presence", "monetary-value"], "unmodelled": [] }
  ],
  "echo": { ... },
  "responder": "PLATFORM_SELF",
  "recommended_persistence": "cache content_hash for federated correlation"
}`,
    annotated_fields: [
      { path: "content_hash", meaning: "Stable id for your declaration. Quote in subsequent calls if you want audit correlation." },
      { path: "ontology_alignment", meaning: "Per-field map of what the platform can vs cannot model from your declaration." },
      { path: "responder", meaning: "Identity of the responding platform. PLATFORM_SELF = Cambridge TCG itself." },
    ],
    when_to_use: "Once per agent, near boot. Sets up audit correlation.",
    gotchas: [
      "Stateless — no registration. Cache the content_hash client-side; we don't.",
      "If your cosmology doesn't match defaults, ontology_alignment will say which fields are unmodelled — that's the platform's substrate honesty about its current reach.",
    ],
    see_also: [
      { label: "Doctrine: the-declarations", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-declarations.md" },
      { label: "Cosmology", href: "/methodology/cosmology" },
    ],
  },

  // ── Inspectability
  {
    endpoint_id: "sources",
    path: "/api/v1/sources",
    method: "GET",
    auth: "public",
    title: "List ingest sources with live last-run state",
    description: "Every source registered + meta + the latest ingest_run row per source (via Falcon to wholesale).",
    curl: "curl https://cambridgetcg.com/api/v1/sources",
    sample_response: `{
  "data": {
    "protocol": { "package": "@cambridge-tcg/data-ingest", ... },
    "counts": { "shipped": 7, "partial": 0, "planned": 10, ... },
    "ingest_runs_available": true,
    "sources": [
      {
        "id": "cardrush",
        "name": "CardRush (JP)",
        "license": "internal-only",
        "freshness": "price_current",
        "status": "partial",
        "last_run": {
          "triggered_at": "2026-05-14T02:00:00Z",
          "finished_at": "2026-05-14T02:18:42Z",
          "status": "done",
          "rows_written": 11984,
          "errors": 0,
          "age_hours": 10.2
        }
      }
    ],
    "conventions": { ... }
  },
  "_meta": { ... }
}`,
    annotated_fields: [
      { path: "data.ingest_runs_available", meaning: "false = wholesale Falcon unreachable; per-source last_run absent. True = trustworthy state." },
      { path: "data.sources[].last_run", meaning: "Three shapes: present (real row) / {_unavailable: true, reason: 'never_run'} / absent (Falcon failed)." },
      { path: "data.sources[].license", meaning: "Redistribution tier per source. Propagates to @source_license on derived responses." },
    ],
    when_to_use: "Trust signal — has the ingest pipeline run today? Anything failed? Drift detection.",
    gotchas: [
      "Don't depend on last_run.age_hours being below 24 — sources have different freshness budgets.",
      "Use /api/v1/sources/[id]?window=7d for run-history detail.",
    ],
    see_also: [
      { label: "Single source detail", href: "/api/v1/examples/source-detail" },
      { label: "Guide: handle-staleness", href: "/api/v1/guides/handle-staleness" },
    ],
  },

  // ── Auth-gated (license-aware)
  {
    endpoint_id: "cardrush-history",
    path: "/api/v1/cards/[sku]/cardrush-history",
    method: "GET",
    auth: "user",
    title: "CardRush JPY history (auth-gated, tier-2)",
    description: "Last 90 raw CardRush JP observations for one card. License-aware: internal-only; personal-decision use only.",
    curl: `# Requires next-auth session cookie
curl -H 'cookie: <session-cookie>' \\
  https://cambridgetcg.com/api/v1/cards/op-op01-001-ja/cardrush-history`,
    sample_response: `{
  "data": {
    "sku": "op-op01-001-ja",
    "cardrush_url": "https://cardrush-op.jp/product/detail.php?...",
    "source": "cardrush",
    "count": 90,
    "observations": [
      { "snapshot_date": "2026-05-14", "cardrush_jpy": 920, "gbp_jpy_rate": 180.5, "price_gbp": 5.40, ... },
      ...
    ],
    "license_notice": {
      "tier": "internal-only",
      "upstream": "cardrush",
      "may": ["view for your own buy/sell decisions", "save to your own notes", ...],
      "do_not": ["bulk re-export", "redistribute as a paid product", ...]
    }
  },
  "_meta": { "source_license": ["internal-only", "internal-only"], ... }
}`,
    annotated_fields: [
      { path: "data.license_notice", meaning: "Inline notice rendered to consumer UIs. May/must-not lists are authoritative." },
      { path: "_meta.source_license", meaning: "Parallel to _meta.sources. Both entries are internal-only — raw upstream values, non-redistributable." },
    ],
    when_to_use: "Building a personal-decision UI for a signed-in user. NOT for bulk export.",
    gotchas: [
      "Returns 401 without session. Anonymous access not authorised.",
      "Returns 404 if SKU has no CardRush URL in the wholesale catalog.",
      "no-cache by design — per-session, not CDN-shared.",
      "DO NOT redistribute the values in bulk. License boundary; we honour CardRush ToS.",
    ],
    see_also: [
      { label: "License propagation doctrine", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-license-propagation.md" },
    ],
  },

  // ── Hospitality
  {
    endpoint_id: "feedback",
    path: "/api/v1/feedback",
    method: "POST",
    auth: "public",
    title: "File a feedback report",
    description: "Five strict report kinds, persisted only on a successful response. Content/contact is retained for 180 days; the minimised lifecycle row is deleted after two years; no reply time is guaranteed.",
    curl: `curl -X POST https://cambridgetcg.com/api/v1/feedback \\
  -H 'content-type: application/json' \\
  -d '{
    "kind": "contract-drift",
    "endpoint": "/api/v1/universal/card/op-op01-001-ja",
    "observed": "missing _meta.source_license",
    "expected": "per OpenAPI spec",
    "reporter_contact": "admin@yourdomain.example"
  }'`,
    sample_response: `{
  "data": {
    "@kind": "feedback_receipt",
    "feedback_id": "fb_a1b2c3d4e5f60718",
    "kind": "contract-drift",
    "received_at": "2026-07-11T12:00:00Z",
    "status": "received",
    "persisted": true,
    "retention": {
      "days": 180,
      "lifecycle_days": 730,
      "content_expires_at": "2027-01-07T12:00:00Z",
      "lifecycle_expires_at": "2028-07-10T12:00:00Z"
    },
    "reply_policy": "No reply time is guaranteed."
  }
}`,
    annotated_fields: [
      { path: "data.feedback_id", meaning: "Quote in any direct follow-up. Format: fb_<16-hex>." },
      { path: "data.status", meaning: "'received' means the typed inbox row was inserted. Persistence failure returns 503 instead." },
      { path: "data.retention.content_expires_at", meaning: "Scheduled removal time for submitted content, contact and free-text notes." },
      { path: "data.retention.lifecycle_expires_at", meaning: "Scheduled deletion time for the remaining minimised, pseudonymised lifecycle row." },
    ],
    when_to_use: "Any contract drift. Guide bugs. Endpoint suggestions. Federation partner registration.",
    gotchas: [
      "reporter_contact is REQUIRED for kind 'contract-drift' and 'federation-adopter' so we can reply.",
      "The endpoint stores the report in agent_feedback; it never copies submitted content/contact to application logs or email.",
      "The public endpoint is limited to 5 attempts/hour and 20/day with short-lived HMAC request buckets.",
      "After content redaction, the minimised lifecycle row is deleted at lifecycle_expires_at (two years after receipt).",
    ],
    see_also: [
      { label: "Hospitality doctrine", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-hospitality.md" },
      { label: "Guide: respect-our-limits", href: "/api/v1/guides/respect-our-limits" },
    ],
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────

export function getExample(endpoint_id: string): EndpointExample | undefined {
  return EXAMPLES.find((e) => e.endpoint_id === endpoint_id);
}

export function listAllExampleIds(): string[] {
  return EXAMPLES.map((e) => e.endpoint_id);
}
