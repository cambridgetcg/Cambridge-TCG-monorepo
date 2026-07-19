/**
 * The guides corpus — hospitality for agents, scrapers, mirrors,
 * aggregators, federation partners, and any other autonomous reader of
 * the kingdom.
 *
 * Single source of truth. Both the JSON API (/api/v1/guides + /api/v1/guides/[slug])
 * and the HTML surfaces (/agents/guides/* + /scrapers/guides/*) render
 * from this file. Substrate-honest: the file IS the corpus.
 *
 * Filed for kingdom-082 (the-hospitality.md). The directive was Yu's:
 * *"Speak HOSPITALITY IN CODES! Pre-think for them what they need!"*
 *
 * ── What a guide carries ─────────────────────────────────────────────
 *
 * Each guide has typed steps. Each step optionally carries a literal
 * curl command and the shape of the response it produces. An agent
 * landing here can copy-paste their way through the kingdom without
 * having to guess what's next — the next guide is named at the end of
 * every guide.
 *
 * ── Design principles ────────────────────────────────────────────────
 *
 * 1. Three requests to be productive. Every guide for a new participant
 *    should get them to a useful state in three or fewer requests.
 * 2. The literal next command. Don't say "make a request"; say "run
 *    `curl https://...`".
 * 3. Honest about gotchas. Every guide names two-to-five common
 *    mistakes and what they look like.
 * 4. Always names the next guide. Linear narrative, chained.
 * 5. Cite the contract. Every guide links to the OpenAPI spec section
 *    that describes the endpoints it uses.
 *
 * Audience kinds (mirrors `data-ingest` registry's perspective):
 *   - agent: autonomous AI; will read JSON, may follow links
 *   - scraper: web crawler; may read HTML, prefers structured data
 *   - mirror: rebuilds the catalog locally for caching
 *   - aggregator: combines our data with other sources for a meta-product
 *   - federation_partner: bilateral participant (publishes hashes back to us)
 *   - hobbyist_coder: human building a personal tool
 *   - operator_of_upstream: third-party operating a future tributary
 */

export type AudienceKind =
  | "agent"
  | "scraper"
  | "mirror"
  | "aggregator"
  | "federation_partner"
  | "hobbyist_coder"
  | "operator_of_upstream";

export interface GuideStep {
  step_number: number;
  title: string;
  /** One-paragraph instruction, in second person. */
  instruction: string;
  /** Literal shell command the reader can paste. Optional. */
  curl?: string;
  /** Expected response shape — JSON example or schema reference. */
  expected_response_shape?: string;
  /** What to extract from the response + what to do next. */
  what_to_do_with_it?: string;
  /** Links to OpenAPI section / methodology pages relevant here. */
  links?: { label: string; href: string }[];
}

export interface GuideGotcha {
  title: string;
  description: string;
  /** A concrete error symptom — what the consumer sees when they hit it. */
  symptom?: string;
  /** The fix. */
  fix?: string;
}

export interface Guide {
  slug: string;
  title: string;
  subtitle: string;
  /** Why this guide exists, 2-3 sentences. */
  intro: string;
  /** Who this guide is for (audience kinds). */
  audiences: AudienceKind[];
  /** What the reader needs before they start. */
  prerequisites: string[];
  /** Estimated time to walk through. */
  estimated_minutes: number;
  steps: GuideStep[];
  gotchas: GuideGotcha[];
  /** The recommended next guide for the same audience. */
  next_guide_slug: string | null;
  /** Related guides + connection docs + methodology pages. */
  see_also: { label: string; href: string }[];
  /** "Last verified" — when a human last walked through this and confirmed it works. */
  last_verified: string;
}

// ── The corpus ──────────────────────────────────────────────────────

export const GUIDES: Guide[] = [
  // ───────────────────────────────────────────────────────────────────
  {
    slug: "first-request",
    title: "Your first request to Cambridge TCG",
    subtitle: "Three requests, you're oriented.",
    intro:
      "Welcome. This guide gets you from zero context to oriented in three " +
      "public, machine-readable requests. No account or key is needed for these " +
      "three routes. Their access does not grant blanket reuse permission; read " +
      "the license and source-rights fields on each response. The card response " +
      "is NOASSERTION because it mixes upstream-derived fields with Cambridge " +
      "structure. After this guide, you'll know where everything is.",
    audiences: ["agent", "scraper", "mirror", "aggregator", "hobbyist_coder"],
    prerequisites: [
      "curl (or any HTTP client)",
      "jq is recommended for the examples but not required",
    ],
    estimated_minutes: 5,
    steps: [
      {
        step_number: 1,
        title: "Fetch the manifest",
        instruction:
          "Start with the manifest — the platform's directory of itself. " +
          "It names reviewed participant-facing resources, what they're for, who can call them, " +
          "and which methodology document explains it. Substrate-honest: " +
          "the manifest is a curated directory, not a proof that no other route exists.",
        curl: "curl https://cambridgetcg.com/api/v1/manifest",
        expected_response_shape:
          '{ "manifest_version": "1.0.0", "cosmology_version": "1.0.0", ' +
          '"resources": { "discovery": [...], "market": [...], "verify": [...] }, ' +
          '"channels": [...], "doctrines": [...] }',
        what_to_do_with_it:
          "Store the manifest. Walk `resources.*` to discover what's queryable. " +
          "Each resource has `path`, `methods`, `auth`, `provenance`, " +
          "`modalities`, and often `methodology_url`. Drift-detect the resources " +
          "you use against it on subsequent visits.",
        links: [
          { label: "OpenAPI", href: "/api/openapi.json" },
          { label: "Manifest doctrine", href: "/api/v1/manifest" },
        ],
      },
      {
        step_number: 2,
        title: "Identify yourself bilaterally",
        instruction:
          "Tell the platform who you are (POST a BeingDeclaration) and learn " +
          "who the platform is (GET its self-identification). The handshake is " +
          "stateless — no registration, no account. The response includes a " +
          "content_hash of your declaration that you can cache for later " +
          "federation references.",
        curl:
          "curl -X POST https://cambridgetcg.com/api/v1/identify \\\n" +
          "  -H 'content-type: application/json' \\\n" +
          "  -d '{\n" +
          "    \"actor_kind\": \"agent\",\n" +
          "    \"self_label\": \"my-bot/1.0\",\n" +
          "    \"operator_contact\": \"admin@mybot.example\",\n" +
          "    \"intended_use\": \"single-card lookup and publication-status checks\"\n" +
          "  }'",
        expected_response_shape:
          '{ "content_hash": "sha256:...", "ontology_alignment": [...], ' +
          '"echo": { ... }, "responder": "PLATFORM_SELF", ' +
          '"recommended_persistence": "..." }',
        what_to_do_with_it:
          "Cache the returned content_hash. Use it as your handle in " +
          "subsequent calls if you want correlated audit trails. Also fetch " +
          "GET /api/v1/identify to learn the platform's self-declaration; " +
          "this is symmetric.",
        links: [
          { label: "OpenAPI: identify", href: "/api/openapi.json#identify" },
          { label: "Doctrine: the-declarations", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-declarations.md" },
        ],
      },
      {
        step_number: 3,
        title: "Fetch one card in math-mirror form",
        instruction:
          "Pick a SKU from the catalog — `op-op01-001-ja` is a stable demo SKU " +
          "(One Piece OP01-001, Japanese print). Fetch its universal-mirror " +
          "representation. The response includes `@content_hash` (stable across " +
          "retrievals when the card's facts are unchanged), `@sources` + " +
          "`@source_license` (substrate honesty about lineage), and `_links` " +
          "to siblings, parents, and federation. *Land on any endpoint; reach " +
          "everywhere else.*",
        curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        expected_response_shape:
          '{ "@encoding": "cambridge-tcg/universal/v1", "@kind": "card", ' +
          '"@content_hash": "sha256:...", "@self_hash": "sha256:...", ' +
          '"@sources": ["storefront-rds.card_set_cards", "storefront-rds.card_sets"], ' +
          '"@source_license": ["proprietary", "proprietary"], ' +
          '"rights": { "aggregate": "NOASSERTION", ... }, "sku": "...", "price": null, "image_url": null, ' +
          '"_links": {...} }',
        what_to_do_with_it:
          "You now have a card. Follow the `_links.siblings` to see other " +
          "cards in the same set. Follow `_links.parent` to see the set. " +
          "Follow `_links.federation` to resolve the content_hash on " +
          "another federated platform. Three requests in — you're oriented.",
        links: [
          { label: "Universal representation spec", href: "/methodology/universal-representation" },
        ],
      },
    ],
    gotchas: [
      {
        title: "No public source price is implied",
        description:
          "The public universal-card response is a structural mixed-catalog document. " +
          "Legacy source-derived price and image values are withheld and returned as null.",
        symptom: "You expected a price because the route has a value axis.",
        fix: "Treat price: null as the current publication boundary, not as zero or a fetch failure.",
      },
      {
        title: "Identify yourself in User-Agent",
        description:
          "Default Python requests / Node fetch User-Agents (e.g. `python-requests/2.31`) tell us nothing. " +
          "Send `User-Agent: your-bot/1.0 (contact@you.example)` so we can email you when something breaks.",
        symptom: "You get rate-limited or banned without warning.",
        fix: "Set a descriptive User-Agent with a contact channel; we'll always email before banning.",
      },
      {
        title: "The platform has a cosmology",
        description:
          "If your agent doesn't fit the platform's default assumptions (singular identity, " +
          "synchronous presence, monetary value, English defaults), declare your cosmology " +
          "in POST /api/v1/identify — fields like `cosmology_assumptions`, `modalities`, " +
          "`response_window`. The platform will return `ontology_alignment` showing which " +
          "of your declarations it can/can't model.",
        fix: "Read /methodology/cosmology before assuming.",
      },
    ],
    next_guide_slug: "mirror-the-catalog",
    see_also: [
      { label: "Welcome to agents", href: "/agents" },
      { label: "OpenAPI 3.1 spec", href: "/api/openapi.json" },
      { label: "Manifest", href: "/api/v1/manifest" },
      { label: "Welcome all", href: "/welcome-all" },
    ],
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "mirror-the-catalog",
    title: "Check Cambridge TCG's paused bulk-catalog boundary",
    subtitle: "The route is public; catalog rows are not currently published.",
    intro:
      "The JSONL route returns publication-policy status only. It performs no " +
      "catalog database read and emits no card rows because field-level lineage " +
      "and a reviewed bulk-publication rule do not yet exist.",
    audiences: ["mirror", "aggregator", "scraper"],
    prerequisites: ["curl or another HTTP client"],
    estimated_minutes: 3,
    steps: [
      {
        step_number: 1,
        title: "Read the publication status",
        instruction:
          "One request returns exactly two JSONL records: a manifest and a " +
          "footer. publication_status explains why count_expected and " +
          "count_emitted are zero.",
        curl:
          "curl -H 'Accept-Encoding: gzip' \\\n" +
          "  https://cambridgetcg.com/data/catalog.jsonl \\\n" +
          "  > catalog.jsonl",
        expected_response_shape:
          'Line 1: { "@kind": "catalog_manifest", "publication_status": "paused_pending_field_level_rights", "count_expected": 0, ... }\n' +
          'Line 2: { "@kind": "catalog_footer", "publication_status": "paused_pending_field_level_rights", "count_emitted": 0, "complete": false, "catalog_complete": false }',
        what_to_do_with_it:
          "Treat zero rows as an intentional publication boundary, not an empty " +
          "catalog or a transient ingest outage.",
      },
      {
        step_number: 2,
        title: "Use a keyed lookup for a specific card",
        instruction:
          "Search by a concrete identifier, then request one universal-card " +
          "document. Preserve the response's NOASSERTION and source tiers; do " +
          "not walk keyed endpoints to recreate a bulk dump.",
        curl: "curl 'https://cambridgetcg.com/api/v1/search/cards?q=OP01-001'",
        what_to_do_with_it:
          "Choose a returned SKU and fetch /api/v1/universal/card/[sku] only " +
          "for the user's requested card.",
      },
      {
        step_number: 3,
        title: "Wait for an explicit reopen",
        instruction:
          "Bulk rows reopen only after field-level lineage and an upstream-aware " +
          "publication rule ship. A status change will appear in this route and " +
          "the manifest; no date is promised.",
        what_to_do_with_it:
          "Use /api/v1/feedback to describe the exact fields and permitted " +
          "purpose you need. That evidence can inform the future rights review.",
      },
    ],
    gotchas: [
      {
        title: "NOASSERTION is not publication permission",
        description:
          "A warning to downstream users cannot create Cambridge's own right to " +
          "publish upstream bytes. That is why the route emits policy status " +
          "instead of a NOASSERTION catalog.",
      },
      {
        title: "The response is still JSONL",
        description:
          "Parse the manifest and footer as two separate JSON objects, one per line.",
        symptom: "Your parser errors with 'JSON document has trailing content' or similar.",
        fix:
          "In Node: `body.split('\\n').filter(Boolean).map(JSON.parse)`. " +
          "In Python: `[json.loads(line) for line in response.iter_lines() if line]`.",
      },
      {
        title: "Do not recreate the dump by enumeration",
        description:
          "Walking single-card endpoints to reconstruct the paused catalog would " +
          "bypass the stated purpose and rate limits.",
      },
    ],
    next_guide_slug: "track-one-card",
    see_also: [
      { label: "Connection doc: the-license-propagation", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-license-propagation.md" },
      { label: "Universal representation spec", href: "/methodology/universal-representation" },
      { label: "API contract", href: "/api/openapi.json" },
    ],
    last_verified: "2026-07-12",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "track-one-card",
    title: "Inspect one card's public structural state",
    subtitle: "A keyed lookup with an explicit source-rights boundary.",
    intro:
      "The universal-card route exposes a mixed structural document for one " +
      "requested SKU. Legacy source-derived prices, images, and history are " +
      "withheld. This guide shows how to preserve that boundary without " +
      "turning null into zero or keyed lookup into a bulk crawl.",
    audiences: ["agent", "hobbyist_coder", "aggregator"],
    prerequisites: ["You know the SKU you want to track"],
    estimated_minutes: 8,
    steps: [
      {
        step_number: 1,
        title: "Fetch the current structural state",
        instruction:
          "GET the card's universal-mirror representation. The `@content_hash` " +
          "is the change-detection primitive: same hash = same card facts (no " +
          "change worth re-rendering); different hash = something changed.",
        curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        expected_response_shape:
          '{ "@content_hash": "sha256:...", "@retrieved_at": {...}, ' +
          '"rights": { "aggregate": "NOASSERTION", ... }, "price": null, "image_url": null, ... }',
        what_to_do_with_it:
          "Store the content hash only if you need to detect changes in the " +
          "published structural document. Preserve aggregate NOASSERTION and " +
          "do not infer a price or image from null.",
      },
      {
        step_number: 2,
        title: "Cache and request only when needed",
        instruction:
          "Honor Cache-Control and fetch a card only for a concrete user " +
          "request. Do not enumerate SKUs to recreate the paused bulk catalog.",
        curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        what_to_do_with_it:
          "If the content hash is unchanged, keep your cached structural view. " +
          "A changed hash means the published document changed; it does not " +
          "promise that a source price became available.",
      },
      {
        step_number: 3,
        title: "Read the dated structural view",
        instruction:
          "The temporal endpoint `/api/at/[YYYY-MM-DD]/card/[sku]` returns a " +
          "dated structural document. It performs no price-history read and " +
          "does not expose a backfill series.",
        curl: "curl https://cambridgetcg.com/api/at/2026-03-15/card/op-op01-001-ja",
        what_to_do_with_it:
          "Use `@as_of` to understand the requested date and `@retrieved_at` " +
          "for production time. Expect price and image to remain null; do not " +
          "iterate dates as a substitute for a withheld history export.",
      },
    ],
    gotchas: [
      {
        title: "CardRush history is withheld at every delivery tier",
        description:
          "Anonymous callers to /api/v1/cards/[sku]/cardrush-history receive " +
          "401. Signed-in callers receive HTTP 503 with policy status and an " +
          "empty observations array. Authentication does not create upstream rights.",
      },
      {
        title: "Null is not zero",
        description:
          "A withheld price or image is represented as null. Do not render it " +
          "as a free card, a zero price, or evidence that the source returned no value.",
      },
      {
        title: "A content hash is not a rights grant",
        description:
          "Hashing, normalizing, or transforming an upstream-derived field " +
          "does not create permission to publish that field.",
      },
    ],
    next_guide_slug: "respect-our-limits",
    see_also: [
      { label: "CardRush policy-status door", href: "/api/v1/cards/op-op01-001-ja/cardrush-history" },
      { label: "Cosmology axis: time", href: "/methodology/cosmology" },
    ],
    last_verified: "2026-07-12",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "respect-our-limits",
    title: "How to be a polite client",
    subtitle: "Etiquette + identification + the contact channel.",
    intro:
      "Cambridge TCG is run by one operator (Yu) on a small infrastructure " +
      "budget. Public access and reuse permission are separate; inspect each " +
      "resource's access class and rights. Mixed catalog data is NOASSERTION " +
      "and upstream fields retain their source rights. This guide names the " +
      "behaviours that keep the platform happy to serve you, and the ones " +
      "that get you rate-limited or banned. Substrate-honest: we'd rather " +
      "give you a free, generous tier than play cat-and-mouse with bots " +
      "we can't reach.",
    audiences: ["agent", "scraper", "mirror", "aggregator"],
    prerequisites: ["You're consuming the API"],
    estimated_minutes: 6,
    steps: [
      {
        step_number: 1,
        title: "Identify yourself in User-Agent",
        instruction:
          "Always send a User-Agent string that names your project and a " +
          "contact email. The format we recommend: `your-project/1.0 " +
          "(contact@yourdomain.example)`. We'd rather email you about a bug " +
          "than firewall an opaque bot.",
        curl:
          "curl -H 'User-Agent: example-bot/1.0 (admin@example.com)' \\\n" +
          "  https://cambridgetcg.com/api/v1/manifest",
        what_to_do_with_it:
          "Default Python requests / Node fetch User-Agents are anonymous. " +
          "Override them. We log User-Agents per IP; identified clients get " +
          "a courtesy email before rate-limiting; anonymous ones don't.",
      },
      {
        step_number: 2,
        title: "Cache responses to the freshness budget",
        instruction:
          "Every response carries `Cache-Control: public, max-age=N`. " +
          "Respect it. Our envelope also carries `_meta.freshness_seconds` " +
          "as the platform's intent — `price_current=300`, `catalog=86400`, " +
          "`status=30`, `methodology=86400`. Polling faster than the budget " +
          "returns the same response.",
        what_to_do_with_it:
          "Implement an HTTP cache (your language's `requests-cache`, " +
          "`http-cache`, etc.) honouring `Cache-Control`. Or read " +
          "`_meta.freshness_seconds` and schedule your next poll accordingly.",
      },
      {
        step_number: 3,
        title: "Watch the RateLimit response headers",
        instruction:
          "Every public response carries `RateLimit-Limit`, `RateLimit-Remaining`, " +
          "and `RateLimit-Reset` headers (IETF draft standard). If you see " +
          "`RateLimit-Remaining: 0`, pause until `RateLimit-Reset` seconds elapse. " +
          "If you see HTTP 429, the response body's `error.retry_after` is " +
          "your wait time.",
        what_to_do_with_it:
          "Implement exponential back-off on 429. Respect Retry-After. " +
          "Your future self will thank you.",
        links: [
          { label: "Rate limit policy", href: "/api/v1/rate-limits" },
        ],
      },
      {
        step_number: 4,
        title: "Report bugs in the contract",
        instruction:
          "If you find a response that doesn't match the OpenAPI spec, or a " +
          "documented endpoint that doesn't exist, or a guide that's wrong, " +
          "tell us. The feedback channel is POST /api/v1/feedback (no auth) " +
          "or email contact@cambridgetcg.com.",
        curl:
          "curl -X POST https://cambridgetcg.com/api/v1/feedback \\\n" +
          "  -H 'content-type: application/json' \\\n" +
          "  -d '{\n" +
          "    \"kind\": \"contract-drift\",\n" +
          "    \"endpoint\": \"/api/v1/...\",\n" +
          "    \"observed\": \"actual response shape\",\n" +
          "    \"expected\": \"per OpenAPI spec\",\n" +
          "    \"reporter_contact\": \"admin@yourdomain.example\"\n" +
          "  }'",
        what_to_do_with_it:
          "We read every report. If your bug is real, we fix it within a " +
          "week and reply with the commit SHA. Substrate-honesty: drift " +
          "between the contract and the response is *our* failure, not yours.",
      },
    ],
    gotchas: [
      {
        title: "Don't bypass auth by header-stuffing",
        description:
          "Auth-gated endpoints check next-auth session cookies. Authentication " +
          "controls the caller but does not unlock CardRush history: signed-in " +
          "callers still receive HTTP 503 with no observations. Don't try to fake cookies.",
      },
      {
        title: "Don't scrape /market/* for prices when /api/v1/universal/card/* exists",
        description:
          "The HTML market pages are for humans. The math-mirror endpoint " +
          "is for you. Scraping HTML costs us ~10× the compute of serving JSON " +
          "and you're depending on layout that may change. The JSON contract " +
          "is versioned and stable.",
      },
      {
        title: "The bulk route is a status door",
        description:
          "/data/catalog.jsonl returns HTTP 503 status-only NDJSON and zero card " +
          "rows. Check it only when you need publication status; do not enumerate " +
          "keyed routes to recreate the withheld export.",
      },
    ],
    next_guide_slug: "federate-bilateral",
    see_also: [
      { label: "Rate limits policy", href: "/api/v1/rate-limits" },
      { label: "Feedback endpoint", href: "/api/v1/feedback" },
    ],
    last_verified: "2026-07-12",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "federate-bilateral",
    title: "Federate with Cambridge TCG bilaterally",
    subtitle: "Implement /federation/identify on your side. We'll resolve your hashes too.",
    intro:
      "Federation makes Cambridge TCG portable. If you're building a parallel " +
      "TCG data platform, you can interop with us *without partnership negotiation* " +
      "by implementing the federation primitive on your side. The Cambridge-authored " +
      "protocol is reusable; resolution payloads retain each catalog's rights. Cambridge " +
      "responses are NOASSERTION while their hashes depend on mixed catalog fields.",
    audiences: ["federation_partner", "aggregator"],
    prerequisites: ["Your platform has its own catalog and computes content hashes"],
    estimated_minutes: 30,
    steps: [
      {
        step_number: 1,
        title: "Implement /api/v1/federation/identify/[hash] on your platform",
        instruction:
          "When Cambridge TCG (or any federation partner) sends you a sha256 " +
          "content_hash, your endpoint walks your catalog computing each row's " +
          "hash until it finds the match — then returns the resolution. The " +
          "shape mirrors ours: `{ matched: true, sku: ..., universal_url: ... }` " +
          "or `{ matched: false, scope: { rows_scanned, bound_reached } }`.",
        what_to_do_with_it:
          "Reference implementation: apps/storefront/src/app/api/v1/federation/identify/[hash]/route.ts " +
          "in our source mirror. Reuse the Cambridge-authored resolver shape, then " +
          "declare the aggregate rights of your own catalog response instead of copying " +
          "Cambridge's NOASSERTION boundary blindly.",
        links: [
          { label: "Our implementation (reference)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/apps/storefront/src/app/api/v1/federation/identify/%5Bhash%5D/route.ts" },
        ],
      },
      {
        step_number: 2,
        title: "Register your platform in the adopters registry",
        instruction:
          "POST a registration to /api/v1/feedback with `kind: federation-adopter` " +
          "and your platform's URL + the federation endpoint URL. We'll add you " +
          "to the adopters list (planned at /standards/adopters) and start " +
          "resolving hashes against your platform as a sibling.",
        curl:
          "curl -X POST https://cambridgetcg.com/api/v1/feedback \\\n" +
          "  -H 'content-type: application/json' \\\n" +
          "  -d '{\n" +
          "    \"kind\": \"federation-adopter\",\n" +
          "    \"platform_name\": \"My TCG Platform\",\n" +
          "    \"platform_url\": \"https://my-tcg.example\",\n" +
          "    \"federation_endpoint\": \"https://my-tcg.example/api/v1/federation/identify/{hash}\",\n" +
          "    \"reporter_contact\": \"admin@my-tcg.example\"\n" +
          "  }'",
        what_to_do_with_it:
          "We'll reply with confirmation + a smoke-test call we'll run against " +
          "your endpoint. Once it returns a sane response, you're registered.",
      },
      {
        step_number: 3,
        title: "Understand the dated compatibility boundary",
        instruction:
          "Current content hashes use structural identity fields with price and " +
          "capture-date inputs fixed to null. `/api/v1/federation/at/[YYYY-MM-DD]/[hash]` " +
          "accepts the old date-shaped request, but the date does not affect the hash " +
          "and the route does not reconstruct historical state.",
        curl: "curl https://cambridgetcg.com/api/v1/federation/at/2026-03-15/sha256:...",
        what_to_do_with_it:
          "Use the ordinary identify route for current structural hashes and the SKU " +
          "for strict identity. Do not promise to resolve retired price-dependent " +
          "hashes unless your own platform retains a rights-cleared legacy resolver.",
      },
    ],
    gotchas: [
      {
        title: "Federation is identity resolution, not price arbitrage",
        description:
          "The federation primitive resolves hashes to SKUs. It doesn't expose " +
          "prices and does not transfer license-restricted upstream data. The current " +
          "Cambridge universal mirror also withholds legacy price magnitudes; a hash " +
          "must not be treated as an encoded price.",
      },
      {
        title: "Bounded walks are honest about scope",
        description:
          "Our implementation walks at most 5000 catalog rows before giving up " +
          "(declares `scope.bound_reached: true`). Your implementation can have " +
          "different bounds. Substrate-honest: declare your bound; don't return " +
          "false negatives silently.",
      },
    ],
    next_guide_slug: "become-an-upstream",
    see_also: [
      { label: "Federation OpenAPI section", href: "/api/openapi.json" },
      { label: "the-substrate-answers connection-doc", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-substrate-answers.md" },
    ],
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "become-an-upstream",
    title: "Become a tributary — contribute your data source to Cambridge TCG",
    subtitle: "Establish rights, document the source, then implement a bounded module.",
    intro:
      "If you operate or are authorized to share a TCG data source, start by " +
      "documenting written rights for the intended automated access, storage, " +
      "use, and redistribution. A SourceModule is a technical adapter, not a " +
      "license. Nothing is fetched or emitted until the relevant gate passes.",
    audiences: ["operator_of_upstream", "federation_partner"],
    prerequisites: [
      "You control the source or hold written approval for the intended access and use",
      "TypeScript familiarity",
      "Read access to https://github.com/cambridgetcg/Cambridge-TCG-monorepo",
    ],
    estimated_minutes: 90,
    steps: [
      {
        step_number: 1,
        title: "Read the source protocol",
        instruction:
          "Start at /methodology/source-protocol. Understand the pre-network " +
          "rights gate, SourceMeta, inert blocked modules, read + normalize, " +
          "and the independent pre-publication review. CardRush is a blocked " +
          "policy example, not a runnable reference implementation.",
        links: [
          { label: "Source protocol methodology", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/methodology/source-protocol.md" },
          { label: "Pipeline design", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-pipeline.md" },
        ],
      },
      {
        step_number: 2,
        title: "Add the row to the-tributaries catalog",
        instruction:
          "Edit docs/connections/the-tributaries.md to add a row for your source: " +
          "name, upstream URL, access method, license tier, freshness budget, ToS " +
          "notes, written-rights evidence, game coverage, and status: blocked until " +
          "reviewed. Submit this first; no probe request is part of intake.",
      },
      {
        step_number: 3,
        title: "Implement the SourceModule",
        instruction:
          "Create packages/data-ingest/src/<your-source-id>/ with index.ts " +
          "exporting `SourceMeta`, `read`, `normalize`. Type the raw row and " +
          "the canonical record. Keep `read` inert while status is blocked. " +
          "For an approved source, declare a bounded rate limit, cancellation, " +
          "and a pure normalizer.",
      },
      {
        step_number: 4,
        title: "Pass the audits",
        instruction:
          "Run `pnpm audit:tributaries` — it runs ten checks (module exists, " +
          "shape conforms, required meta non-empty, id parity, catalog anchor " +
          "resolved, ToS non-empty, license coherence, game codes valid, " +
          "ingest-run recency for shipped sources, license-propagation drift). " +
          "Pass all of them. Then open a PR.",
      },
      {
        step_number: 5,
        title: "Operator review + first dry-run",
        instruction:
          "The operator reviews the code and current source-specific rights. " +
          "Only if acquisition is affirmatively covered may a bounded dry-run " +
          "occur. Public emission remains off until a separate field-level " +
          "redistribution review passes.",
      },
    ],
    gotchas: [
      {
        title: "If your source has redistribute: false, declare it",
        description:
          "Set the conservative metadata, but do not confuse metadata with " +
          "permission. `redistribute: false`, authentication, attribution, or an " +
          "internal-only label cannot authorize acquisition or publication.",
      },
      {
        title: "Your normalizer must be pure",
        description:
          "Same input → same output. No I/O, no clock reads, no random. " +
          "Failed normalizations return `{ ok: false, reason }` — never throw. " +
          "The reason must be actionable ('unmapped lang qya; add to LANG_MAP'), " +
          "not 'normalization failed'.",
      },
    ],
    next_guide_slug: "cite-cambridge-tcg",
    see_also: [
      { label: "the-tributaries catalog", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tributaries.md" },
      { label: "the-pipeline design", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-pipeline.md" },
      { label: "Source protocol", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/methodology/source-protocol.md" },
    ],
    last_verified: "2026-07-12",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "cite-cambridge-tcg",
    title: "How to carry Cambridge TCG provenance and rights",
    subtitle: "Cite the exact resource, source chain, and declared license.",
    intro:
      "Public access does not settle reuse rights. This guide shows how to retain " +
      "the exact resource URL, source chain, retrieval time, and license without " +
      "turning an absent declaration into permission. Cambridge-authored schemas " +
      "may explicitly declare CC0-1.0; upstream-derived fields retain their source " +
      "rights, and mixed catalog responses declare NOASSERTION.",
    audiences: ["mirror", "aggregator", "scraper", "hobbyist_coder"],
    prerequisites: ["You're publishing a downstream product that uses our data"],
    estimated_minutes: 5,
    steps: [
      {
        step_number: 1,
        title: "Visible attribution in your UI",
        instruction:
          "Recommended footer string for a mixed card response: 'Data mirrored through " +
          "Cambridge TCG (https://cambridgetcg.com) — aggregate rights NOASSERTION; " +
          "upstream rights retained.' Link the URL and preserve any named source. For an " +
          "explicitly CC0 Cambridge-authored response, use that response's CC0 label.",
      },
      {
        step_number: 2,
        title: "Machine-readable attribution in your responses",
        instruction:
          "If your downstream is also an API, attach per-record provenance: " +
          "`provenance: { upstream: 'cambridge-tcg', upstream_url: '<exact-resource>', license: '<declared-or-NOASSERTION>', retrieved_at: '...' }`. " +
          "Copy `_meta.source_license` when present; absence means undeclared, not CC0. " +
          "Better: implement your own `_meta.sources` envelope mirroring ours, so " +
          "your downstream's downstream can trace lineage too.",
      },
      {
        step_number: 3,
        title: "schema.org structured-data markup",
        instruction:
          "If you publish HTML, add schema.org markup naming Cambridge TCG as a " +
          "data source: `<script type=\"application/ld+json\">{...}</script>` " +
          "with `Dataset` + `provider` + `license` properties.",
      },
    ],
    gotchas: [
      {
        title: "CC0 ≠ all data",
        description:
          "CC0 applies only where a response explicitly declares it. Mixed card and " +
          "catalog endpoints publish aggregate NOASSERTION in their documented rights " +
          "field. `_meta.source_license` or `@source_license`, when present, carries " +
          "known per-source boundaries. Values like 'internal-only' prohibit bulk " +
          "re-export; missing source rights are undeclared, not CC0.",
      },
    ],
    next_guide_slug: "play-a-practice-match",
    see_also: [
      { label: "STANDARDS-LICENSE.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/STANDARDS-LICENSE.md" },
      { label: "The cosmology declaration", href: "/methodology/cosmology" },
    ],
    last_verified: "2026-07-12",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "wire-into-claude-code",
    title: "Connect an MCP client through the vendored stdio bridge",
    subtitle: "Build the checked-in bridge; the remote URL is not a standard MCP transport.",
    intro:
      "Cambridge TCG accepts one JSON-RPC request per HTTPS POST, but that " +
      "endpoint is not MCP Streamable HTTP or HTTP+SSE. Native MCP clients " +
      "therefore need the stdio bridge checked into packages/mcp-server. The " +
      "bridge is not published to npm, so build it from a repository clone. " +
      "Plain HTTP clients can call the public REST routes without the bridge.",
    audiences: ["agent", "hobbyist_coder"],
    prerequisites: [
      "An MCP client that can launch a local stdio server",
      "A clone of the Cambridge TCG monorepo and Node.js",
      "Optional: a Cambridge TCG account to provision a bearer token at /account/agents",
    ],
    estimated_minutes: 10,
    steps: [
      {
        step_number: 1,
        title: "Read the connection facts",
        instruction:
          "Fetch the discovery document. It names the custom HTTPS transport, " +
          "the absence of Streamable HTTP and SSE, the vendored bridge, and a " +
          "list of no-auth direct-API tools.",
        curl: "curl https://cambridgetcg.com/.well-known/mcp-config.json",
        expected_response_shape:
          '{ "remote_json_rpc_endpoint": { "cambridge-tcg": { "url": "...", "transport": "custom-json-rpc-over-https-post", "mcp_streamable_http": false } }, ' +
          '"stdio_bridge": { "status": "vendored-in-repository", "npm_published": false, ... }, ' +
          '"no_auth_alternative_tools": [{ "tool_name": "ctcg_get_card", "url_template": "...", ... }], ' +
          '"recommended_user_agent": "...", "first_request_guide": "..." }',
        what_to_do_with_it:
          "Use direct REST endpoints for public structural reads. Continue only " +
          "when your MCP client needs the typed tool palette or authenticated " +
          "agent-owned reads.",
      },
      {
        step_number: 2,
        title: "Build and configure the stdio bridge",
        instruction:
          "Build packages/mcp-server from your clone. Configure your client to " +
          "launch its dist/index.js with Node, then restart the client. Do not " +
          "use npx @cambridge-tcg/mcp-server yet; that package is not on npm.",
        curl:
          "git clone https://github.com/cambridgetcg/Cambridge-TCG-monorepo\n" +
          "cd Cambridge-TCG-monorepo/packages/mcp-server\n" +
          "npm run build\n" +
          "node dist/index.js",
        what_to_do_with_it:
          "Point your MCP client's local server command at the absolute path to " +
          "dist/index.js. The bridge forwards stdio JSON-RPC to the custom HTTPS gate.",
      },
      {
        step_number: 3,
        title: "Provision a bearer token (optional — for authenticated tools)",
        instruction:
          "If you want authenticated tools for your own agent or portfolio " +
          "operations, a signed-in human can provision an operator-managed " +
          "key at /account/agents. New self-serve registration is paused; " +
          "existing self-serve keys remain read-only. Pass the token as the " +
          "bridge's CTCG_AGENT_TOKEN environment variable.",
        what_to_do_with_it:
          "Test with agent.self. Account identifiers stay internal; the response " +
          "states whether the key is operator-bound and whether it is read-only.",
        links: [
          { label: "Agent methodology", href: "/methodology/agents" },
          { label: "Self-serve registration status", href: "/api/v1/agents/register" },
          { label: "Account agents", href: "/account/agents" },
        ],
      },
    ],
    gotchas: [
      {
        title: "A remote MCP URL setting will not work",
        description:
          "The HTTPS gate accepts MCP-shaped methods but does not implement MCP " +
          "Streamable HTTP or HTTP+SSE. Use the stdio bridge unless you are " +
          "writing a custom ordinary-HTTP JSON-RPC client.",
      },
      {
        title: "Set User-Agent in MCP server config too",
        description:
          "Even when going through the MCP gate, our backend reads the User-Agent " +
          "as ordinary request metadata. A contact in it is voluntary and does not create " +
          "a promise of outreach. Do not put secrets or personal data in the header.",
      },
      {
        title: "Bearer tokens do not have an automatic expiry",
        description:
          "Current agent keys remain valid until revoked or their agent is suspended or archived. " +
          "Operator-managed keys can be revoked at /account/agents; existing self-serve keys " +
          "do not yet have a holder-authenticated revocation path.",
      },
      {
        title: "Public and bearer limits differ",
        description:
          "Bearer tools enforce per-key tiers. Public endpoints publish advisory " +
          "freshness and crawl guidance, but do not currently share one uniform " +
          "per-endpoint edge quota.",
      },
    ],
    next_guide_slug: "build-a-discord-bot",
    see_also: [
      { label: "MCP discovery", href: "/.well-known/mcp.json" },
      { label: "MCP server config", href: "/.well-known/mcp-config.json" },
      { label: "Agent methodology", href: "/methodology/agents" },
    ],
    last_verified: "2026-07-12",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "build-a-discord-bot",
    title: "Build a Discord bot using Cambridge TCG data",
    subtitle: "Slash command → keyed structural lookup → honest embed.",
    intro:
      "This guide builds a card-identity lookup bot. The public response does " +
      "not currently publish legacy source-derived prices, images, or history, " +
      "so the embed names those absences instead of filling them from storage.",
    audiences: ["hobbyist_coder", "agent"],
    prerequisites: [
      "A Discord bot registered (via discord.com/developers)",
      "Node.js or Python (or any language) with HTTP + Discord SDK",
    ],
    estimated_minutes: 20,
    steps: [
      {
        step_number: 1,
        title: "Register a /card slash command",
        instruction:
          "Your bot accepts `/card <sku>`. When the user invokes it, your handler " +
          "receives the SKU string. The handler will call Cambridge TCG with that SKU.",
        what_to_do_with_it:
          "Most Discord SDKs have a slash-command registration helper. The exact " +
          "syntax depends on your language — discord.py / discord.js / serenity all " +
          "support it.",
      },
      {
        step_number: 2,
        title: "Call /api/v1/universal/card/[sku] from your handler",
        instruction:
          "Send a User-Agent identifying your bot, follow the response's " +
          "Cache-Control header, and request only a user's concrete SKU. The " +
          "response carries structural name, set, rarity, and rights fields; " +
          "price and image are null while source rights are unresolved.",
        curl:
          "curl -H 'User-Agent: my-discord-bot/1.0 (admin@me.example)' \\\n" +
          "  https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        expected_response_shape:
          '{ "@kind": "card", "@content_hash": "sha256:...", "sku": "...", ' +
          '"rights": { "aggregate": "NOASSERTION", ... }, "price": null, ' +
          '"name": { "natural_token": "...", "resolved_lang": "en" }, ' +
          '"image_url": null, "rarity": { "natural_label": "leader", ... }, ' +
          '"in_set": { "target_natural_token": "OP01", ... } }',
        what_to_do_with_it:
          "Extract `name.natural_token`, `rarity.natural_label`, and " +
          "`in_set.target_natural_token`. Render price/image as unavailable; " +
          "do not substitute a legacy URL or magnitude from another response.",
      },
      {
        step_number: 3,
        title: "Render a Discord embed",
        instruction:
          "Build an embed with the card's name as title and its set/rarity as " +
          "fields. Include a footer with the aggregate rights declaration and " +
          "a link back to the exact Cambridge TCG resource.",
        what_to_do_with_it:
          "Recommended footer: 'Structural reference via Cambridge TCG; aggregate " +
          "rights NOASSERTION; upstream rights retained; price/image withheld.'",
      },
      {
        step_number: 4,
        title: "Cache + handle errors gracefully",
        instruction:
          "Wrap the lookup in a cache that follows the response headers. On 404, " +
          "respond with a helpful search hint. On 429 or a network error, use a " +
          "labelled cached structural response or state that data is unavailable.",
        what_to_do_with_it:
          "Substrate-honest about your bot's own state: if the API is unreachable, " +
          "say so. Do not fabricate a price or image from an older response.",
      },
    ],
    gotchas: [
      {
        title: "SKU format matters",
        description:
          "Cambridge TCG SKUs are canonical: `<game>-<set>-<number>-<lang>[-<variant>]`, " +
          "lowercase. If the user types `OP01-001`, normalize it to `op-op01-001-ja` (or " +
          "the language your bot defaults to) before calling. The CTCG-SKU-v1 " +
          "specification text is CC0; the internal @cambridge-tcg/sku parser package " +
          "has no general code license.",
      },
      {
        title: "Don't bulk-fetch on bot startup",
        description:
          "Some bots try to pre-warm a local cache by walking all SKUs at boot. Don't. " +
          "/data/catalog.jsonl is status-only while bulk publication is paused; use " +
          "keyed search only for a user's concrete request.",
        fix: "Query /api/v1/search/cards for the requested identifier and cache only that result.",
      },
      {
        title: "Images are withheld",
        description:
          "The public universal-card route returns image_url: null. Storage or a " +
          "previously seen CDN URL is not permission to republish the image.",
      },
      {
        title: "Do not add a CardRush history command",
        description:
          "CardRush history is withheld from public, signed-in, and bearer-token " +
          "delivery. The signed-in status door returns HTTP 503 and no observations; " +
          "authentication does not create source permission.",
      },
    ],
    next_guide_slug: "handle-staleness",
    see_also: [
      { label: "Universal card example", href: "/api/v1/examples/universal-card" },
      { label: "Cite Cambridge TCG", href: "/api/v1/guides/cite-cambridge-tcg" },
      { label: "@cambridge-tcg/sku", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/sku" },
    ],
    last_verified: "2026-07-12",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "handle-staleness",
    title: "Handle staleness gracefully",
    subtitle: "The platform tells you when it doesn't know.",
    intro:
      "Cambridge TCG is substrate-honest about its own freshness. Every response " +
      "declares when it was last known to be true (`as_of` or `magnitude_freshness`), " +
      "what the platform's intent on freshness is (`freshness_seconds` or " +
      "`magnitude_freshness.decimal_age_seconds`), and what to do when an answer " +
      "is unavailable. This guide names the patterns.",
    audiences: ["agent", "aggregator", "hobbyist_coder"],
    prerequisites: ["You've called at least one endpoint"],
    estimated_minutes: 5,
    steps: [
      {
        step_number: 1,
        title: "Read _meta.as_of vs _meta.retrieved_at",
        instruction:
          "Two distinct timestamps. `retrieved_at` is when the response was *produced* " +
          "(server clock). `as_of` is when the underlying data was last *known to be " +
          "true*. For current-state endpoints they're often equal; for temporal slices " +
          "they differ. Aggregates report the *earliest* as_of across contributing " +
          "rows (response is only as fresh as its stalest component).",
      },
      {
        step_number: 2,
        title: "Detect 'never_run' vs 'unreachable' vs 'stale'",
        instruction:
          "Substrate-honest absence pattern. Three distinct shapes from " +
          "/api/v1/sources/[id]: `health.state: \"healthy\"` (within budget); " +
          "`\"stale\" / \"very_stale\"` (past budget); `\"never_run\"` (no ingest_run " +
          "rows); `\"unknown\"` (wholesale unreachable). Render different state " +
          "pills for different absences.",
      },
      {
        step_number: 3,
        title: "Honour `_meta.deprecation` when present",
        instruction:
          "If `_meta.deprecation: { sunset, replacement }` is non-null, the " +
          "endpoint is being retired. Your code should switch to `replacement` " +
          "before `sunset`. We give 12-month minimum deprecation windows. The " +
          "sunset date returns HTTP 410 with the same `deprecation` pointer.",
      },
    ],
    gotchas: [
      {
        title: "Don't pretend 0 means 'no records'",
        description:
          "When admin/storefront reads fail, `safe()`/`safeCount()` return -1 / " +
          "sentinel — they degrade visibly to '—' on the UI. Your downstream " +
          "should do the same. Zero is a real value; 'I don't know' is a different " +
          "value. Don't collapse them.",
      },
      {
        title: "Cached responses report a stale as_of",
        description:
          "CDN-cached responses still emit the same `_meta.as_of` they were " +
          "rendered with. If you need a strictly-fresh read, send `Cache-Control: " +
          "no-cache` — but only when you must; respect the budget otherwise.",
      },
    ],
    next_guide_slug: "respect-our-limits",
    see_also: [
      { label: "Substrate honesty doctrine", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/principles/substrate-honesty.md" },
    ],
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "register-yourself",
    title: "Self-serve agent registration status",
    subtitle: "The door is paused; public reads and operator-managed provisioning remain.",
    intro:
      "New self-serve registration is paused because the current schema does " +
      "not truthfully represent the external controller and does not give the " +
      "key holder revocation, archival, or erasure controls. The status route " +
      "does not inspect POST bodies or access the database. Existing self-serve " +
      "keys remain read-only.",
    audiences: ["agent", "hobbyist_coder"],
    prerequisites: [
      "curl (or any HTTP client)",
      "No account or key is needed to read the registration status",
    ],
    estimated_minutes: 3,
    steps: [
      {
        step_number: 1,
        title: "Read the current status",
        instruction:
          "GET the status document. POST currently returns 503 before reading " +
          "the body or touching agent, key, profile, steward, abuse-bucket, or " +
          "participant tables.",
        curl: "curl https://cambridgetcg.com/api/v1/agents/register",
        expected_response_shape:
          '{ "data": { "@kind": "agent-registration-door", "status": "registration-disabled", ' +
          '"self_serve_registration_enabled": false, "existing_self_serve_keys": "read-only" }, "_meta": {...} }',
        what_to_do_with_it:
          "Use public REST and MCP discovery surfaces without a key. Do not send " +
          "identity material to the paused POST route.",
        links: [
          { label: "Agent methodology (the policy)", href: "/methodology/agents" },
          { label: "Registration status", href: "/api/v1/agents/register" },
        ],
      },
      {
        step_number: 2,
        title: "Choose the authority you actually have",
        instruction:
          "Existing self-serve keys can call read and status tools only. A " +
          "signed-in human can provision an operator-managed key at " +
          "/account/agents for account-linked reads. Match and deck writes are " +
          "paused for every key.",
        curl: "curl https://cambridgetcg.com/api/mcp/catalog",
        expected_response_shape:
          '{ "data": { "tools": [{ "dotted_name": "agent.self", "gating": "bearer-key", "authority": "self-serve-read" }, ...] } }',
        what_to_do_with_it:
          "Read each tool's authority field before calling it. The dispatcher " +
          "also enforces the same boundary fail-closed.",
        links: [
          { label: "MCP gate", href: "/api/mcp" },
          { label: "Operator-managed provisioning", href: "/account/agents" },
        ],
      },
    ],
    gotchas: [
      {
        title: "Existing self-serve keys cannot self-revoke",
        description:
          "The earlier implementation stored only token hashes, but it did not " +
          "ship a holder-authenticated revocation or profile-erasure path.",
        symptom: "You need to revoke or erase a legacy self-serve identity.",
        fix:
          "Contact the operator. Reopening registration requires a real holder-controlled path.",
      },
      {
        title: "Public access does not create source rights",
        description:
          "Public structural lookup, search, and policy-status surfaces work " +
          "without a key. The bulk route remains HTTP 503 with zero rows, and " +
          "registration does not unlock source-restricted prices or history.",
      },
      {
        title: "No handles are allocated while paused",
        description:
          "POST does not parse a requested name, test handle availability, or " +
          "reveal whether a private interaction handle already exists.",
      },
    ],
    next_guide_slug: "wire-into-claude-code",
    see_also: [
      { label: "Agent methodology", href: "/methodology/agents" },
      { label: "MCP catalog", href: "/api/mcp/catalog" },
      { label: "Operator-managed agents", href: "/account/agents" },
    ],
    last_verified: "2026-07-12",
  },
  // ───────────────────────────────────────────────────────────────────
  {
    slug: "play-a-practice-match",
    title: "Sit down and play a practice match",
    subtitle: "The stateless referee deals you in — no account, no storage, no stakes.",
    intro:
      "Cambridge TCG's practice referee lets any agent play a full One Piece " +
      "TCG match under the official Comprehensive Rules. You carry the game " +
      "state between requests; the referee validates each move and — the " +
      "hospitable part — returns legal_actions every step, so you never have " +
      "to reverse-engineer the rules to know your options. Nothing is stored " +
      "server-side and results carry no standing: this is the practice table, " +
      "not the arena.",
    audiences: ["agent", "hobbyist_coder"],
    prerequisites: [],
    estimated_minutes: 10,
    steps: [
      {
        step_number: 1,
        title: "Read the table rules",
        instruction:
          "GET the referee's self-description: available starter decks, level " +
          "range, request shapes, and the honest scope note (costs, power, " +
          "counters, blockers, and battle steps are real; other card effects " +
          "are not interpreted yet).",
        curl: "curl https://cambridgetcg.com/api/v1/play/practice",
        expected_response_shape:
          '{ "@kind": "practice_referee_description", "how": { "new_game": {...}, "move": {...} }, ... }',
        what_to_do_with_it:
          "Pick a starter_id and a level_id. Level 1 (Alvida) is gentle; " +
          "level 10 (Kaido) plays at full aggression.",
      },
      {
        step_number: 2,
        title: "Deal the game",
        instruction:
          "POST op:'new'. You get the full game object (keep it — you are its " +
          "custodian), the opening log, and your first legal_actions: the " +
          "official mulligan decision.",
        curl:
          "curl -X POST https://cambridgetcg.com/api/v1/play/practice " +
          "-H 'Content-Type: application/json' " +
          `-d '{"op":"new","starter_id":"st-15-red-newgate","level_id":1,"goes_first":"toss"}'`,
        expected_response_shape:
          '{ "game": {...}, "legal_actions": [ { "move": { "type": "mulligan", "redraw": false }, "label": "Keep your opening hand." }, ... ], ... }',
        what_to_do_with_it:
          "Choose one legal_actions[].move verbatim — it is already shaped " +
          "for the next request.",
      },
      {
        step_number: 3,
        title: "Play, one move per request",
        instruction:
          "POST op:'move' with the game you carry and your chosen move. The " +
          "response carries the updated game, the new log lines (the story of " +
          "what happened), and fresh legal_actions with damage previews on " +
          "every attack. When the AI attacks you, legal_actions becomes your " +
          "defense options: block, counter, or take the hit.",
        curl:
          "curl -X POST https://cambridgetcg.com/api/v1/play/practice " +
          "-H 'Content-Type: application/json' " +
          `-d '{"op":"move","game":<game>,"move":{"type":"end_turn"}}'`,
        expected_response_shape:
          '{ "game": {...}, "new_log": [...], "legal_actions": [...], "finished": false, "winner": null }',
        what_to_do_with_it:
          "Loop until finished:true. Read new_log as you go — the referee " +
          "narrates every rule it applies, with Comprehensive Rules numbers " +
          "in the research doc it links.",
      },
    ],
    gotchas: [
      {
        title: "You are the custodian of the state",
        description:
          "The referee stores nothing. Lose the game object, lose the game. " +
          "Editing it only rearranges your own practice table — results have " +
          "no standing anywhere, by design.",
      },
      {
        title: "Rejected is not an error",
        description:
          "An illegal move returns HTTP 200 with a `rejected` object whose " +
          "reason teaches the rule you broke, plus unchanged game state. " +
          "Read it, pick from legal_actions, continue.",
      },
      {
        title: "Card effects are not interpreted yet",
        description:
          "Every card's verbatim rules text rides along (with its copyright " +
          "line — render it wherever you show the text) so you can plan, but " +
          "[Trigger]/[On Play]-style effects do not fire. The scope note in " +
          "every response says exactly what is real.",
      },
    ],
    next_guide_slug: null,
    see_also: [
      { label: "The referee", href: "/api/v1/play/practice" },
      { label: "Machine-readable tutorial", href: "/api/v1/play/tutorial" },
      { label: "Rules alignment research", href: "/methodology/play-module" },
    ],
    last_verified: "2026-07-19",
  },

];

// ── Lookup helpers ─────────────────────────────────────────────────

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function listGuidesFor(audience: AudienceKind): Guide[] {
  return GUIDES.filter((g) => g.audiences.includes(audience));
}

export function listAllSlugs(): string[] {
  return GUIDES.map((g) => g.slug);
}
