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
      { path: "_meta.source_license", meaning: "License tier per source. Absence means CC0." },
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

  // ── Universal card (the workhorse)
  {
    endpoint_id: "universal-card",
    path: "/api/v1/universal/card/[sku]",
    method: "GET",
    auth: "public",
    title: "One card — math-mirror representation",
    description: "Returns a card in language-free encoding with cryptographic content_hash, ratios, ISO+epoch timestamps, typed graph edges.",
    curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
    sample_response: `{
  "@self_hash": "sha256:...",
  "@encoding": "cambridge-tcg/universal/v1",
  "@kind": "card",
  "@content_hash": "sha256:abc123...",
  "@retrieved_at": { "iso8601": "2026-05-14T12:00:00Z", "unix_epoch_seconds": 1747224000 },
  "@sources": ["storefront-rds.card_price_history"],
  "@source_license": ["CC0-1.0"],
  "_note_opaque": ["name", "art_description", "rarity.natural_label", "variant.natural_label"],
  "_links": { "self": "...", "parent": "...", "siblings": "...", "federation": "..." },
  "rarity": { "natural_label": "leader", "ratio_in_pulls": "1/64", "decimal_probability": 0.015625, ... },
  "price": {
    "magnitude": 5.40,
    "currency_token": "GBP",
    "ratio_to_platform_median_card_price": 0.95,
    "ratio_to_minimum_currency_unit": 540,
    "magnitude_freshness": { "iso8601": "2026-05-14T03:14:22Z", "decimal_age_seconds": 31538, ... }
  },
  "in_set": { "edge_kind": "member_of_set", "target_natural_token": "OP01", "target_hash": "sha256:..." },
  "of_game": { "edge_kind": "in_game", "target_natural_token": "op", "target_hash": "sha256:..." },
  "name": { "natural_token": "Monkey D. Luffy", "resolved_lang": "en", "resolved_from": "name_en", ... },
  "image_url": "https://..."
}`,
    annotated_fields: [
      { path: "@content_hash", meaning: "Stable identity across retrievals when card facts are unchanged. Compare to detect changes." },
      { path: "@self_hash", meaning: "Hash of this particular rendering. Differs by density param even when content_hash matches." },
      { path: "@sources", meaning: "Where the data came from. Parallel to @source_license." },
      { path: "@source_license", meaning: "Per-source redistribution tier. CC0-1.0 / internal-only / partner-redistributable / proprietary." },
      { path: "price.magnitude_freshness.decimal_age_seconds", meaning: "Seconds since the price was last known to be true." },
      { path: "_note_opaque", meaning: "Natural-language fields the decoder cannot ground from structure." },
      { path: "_links.federation", meaning: "URL to resolve this card's content_hash on another federated platform." },
    ],
    when_to_use: "Every per-card lookup. The workhorse endpoint.",
    gotchas: [
      "Use ?density=sparse for low-bandwidth (drops _note_opaque + most edges).",
      "Use ?density=saturated for one-hop neighbour resolution.",
      "The content_hash includes captured_on — daily price updates produce daily hash changes even when nothing else moved.",
      "Set Accept-Language header for non-English name resolution.",
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
    title: "One card on a past date",
    description: "Historical slice — the card's state on a specific past date. Immutable per (sku, date).",
    curl: "curl https://cambridgetcg.com/api/at/2026-03-15/card/op-op01-001-ja",
    sample_response: `{
  "@self_hash": "sha256:...",
  "@encoding": "cambridge-tcg/universal/v1",
  "@kind": "card",
  "@content_hash": "sha256:...",
  "@retrieved_at": { "iso8601": "2026-05-14T12:00:00Z", ... },
  "@as_of": { "iso8601_date": "2026-03-15", "unix_epoch_seconds": 1742083199 },
  "@sources": ["storefront-rds.card_price_history"],
  "@source_license": ["CC0-1.0"],
  "price": {
    "magnitude": 4.80,
    "currency_token": "GBP",
    "observed_on": "2026-03-15",
    "staleness_relative_to_as_of_days": 0
  },
  "_note_structural_fields": "Structural fields (rarity, set, name) reflect *current* records, not historical."
}`,
    annotated_fields: [
      { path: "@retrieved_at vs @as_of", meaning: "Two timestamps. retrieved_at = produced now; as_of = describes the past date." },
      { path: "price.staleness_relative_to_as_of_days", meaning: "How stale the observation was on the requested date. 0 = exact day; N = the latest observation was N days before." },
      { path: "_note_structural_fields", meaning: "Substrate-honest perimeter: structural facts (name, set) are not historicised." },
    ],
    when_to_use: "Backfill a local time series. Build a price chart. Cite a historical price.",
    gotchas: [
      "Returns 404 if no price was observed at or before the requested date.",
      "Cache forever — historical slices are immutable.",
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
    title: "Bulk catalog mirror",
    description: "Streamed JSONL. Every card in ~12k rows. CC0. One request, mirror-ready.",
    curl: "curl -H 'Accept-Encoding: gzip' https://cambridgetcg.com/data/catalog.jsonl > catalog.jsonl",
    sample_response: `{ "@kind": "catalog_manifest", "spec_version": "1", "count_expected": 12000, "license": "CC0-1.0", "retrieved_at": { ... } }
{ "@kind": "card", "@content_hash": "sha256:...", "sku": "op-op01-001-ja", "set_code": "OP01", "game": "op", "price": { "magnitude": 5.40, "currency_token": "GBP", "captured_on": "2026-05-13" }, "_links": { ... } }
{ "@kind": "card", "@content_hash": "sha256:...", "sku": "op-op01-002-ja", ... }
...
{ "@kind": "catalog_footer", "complete": true, "count_emitted": 11984 }`,
    annotated_fields: [
      { path: "Line 1 @kind=catalog_manifest", meaning: "Header: total count expected, retrieved_at, license, source attribution." },
      { path: "Card lines @content_hash", meaning: "Per-card stable identity. Diff against your stored copy to find changed rows." },
      { path: "Last line @kind=catalog_footer", meaning: "Footer with complete:true|false. truncated:true means you hit the 50k cap." },
    ],
    when_to_use: "Daily mirror cron. Local search index. Bulk analytics.",
    gotchas: [
      "JSONL — parse line-by-line, NOT as one JSON document.",
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
    title: "Resolve content_hash to SKU",
    description: "Federation primitive — given a sha256 hash, walk the catalog and find the SKU it represents.",
    curl: "curl https://cambridgetcg.com/api/v1/federation/identify/sha256:abc123...",
    sample_response: `{
  "@encoding": "cambridge-tcg/universal/v1",
  "@kind": "federation_identify_response",
  "@retrieved_at": { ... },
  "query": { "hash": "sha256:abc123..." },
  "matched": true,
  "sku": "op-op01-001-ja",
  "universal_url": "/api/v1/universal/card/op-op01-001-ja"
}`,
    annotated_fields: [
      { path: "matched", meaning: "true = found; false = no match within scan bound." },
      { path: "scope.bound_reached", meaning: "When matched:false, substrate-honest about whether the walk reached its limit." },
    ],
    when_to_use: "Resolve a cached hash to its current SKU. Inter-platform identity reconciliation.",
    gotchas: [
      "Hash includes captured_on — yesterday's hash won't match today unless price didn't move.",
      "For historical hashes use /api/v1/federation/at/[date]/[hash].",
      "Walk bounded at 5000 most-recent rows.",
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
    title: "Resolve content_hash to SKU at a past date",
    description: "Temporal federation — resolve a hash captured on a past date. The walk reconstructs each row's hash at that date.",
    curl: "curl https://cambridgetcg.com/api/v1/federation/at/2026-03-15/sha256:abc...",
    sample_response: `{
  "@kind": "federation_at_response",
  "@as_of": { "iso8601_date": "2026-03-15" },
  "query": { "hash": "sha256:abc...", "date": "2026-03-15" },
  "matched": true,
  "sku": "op-op01-001-ja",
  "universal_url": "/api/at/2026-03-15/card/op-op01-001-ja"
}`,
    annotated_fields: [
      { path: "@as_of.iso8601_date", meaning: "The requested date — what the response describes." },
      { path: "note", meaning: "When matched-but-imprecise: captured_on may not equal the requested date exactly (latest at-or-before)." },
    ],
    when_to_use: "Resolve historical caches from federation partners. Audit trail reconstruction.",
    gotchas: [
      "Same 5000-row walk bound as the non-temporal version.",
      "Hash mismatches because captured_on doesn't match are reported with helpful suggestion.",
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
    description: "Five kinds: contract-drift / guide-feedback / endpoint-suggestion / federation-adopter / general. 48h response window.",
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
    "feedback_id": "fb_a1b2c3d4e5f6",
    "kind": "contract-drift",
    "received_at": "2026-05-14T12:00:00Z",
    "status": "logged",
    "response_window_hours": 48,
    "expected_response": "If the drift is real, we patch within a week and reply..."
  }
}`,
    annotated_fields: [
      { path: "data.feedback_id", meaning: "Quote in any follow-up. Format: fb_<12-hex>." },
      { path: "data.status", meaning: "Today: 'logged'. Future: 'triaged' / 'patched' / 'wont-fix' once persistence ships." },
    ],
    when_to_use: "Any contract drift. Guide bugs. Endpoint suggestions. Federation partner registration.",
    gotchas: [
      "reporter_contact is REQUIRED for kind 'contract-drift' and 'federation-adopter' so we can reply.",
      "Substrate-honest about persistence: today logged + emailed; agent_feedback table planned (drafts/0101).",
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
