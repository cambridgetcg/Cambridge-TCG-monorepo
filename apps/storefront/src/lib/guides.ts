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
      "requests. No account, no key, no obligation. The endpoints are " +
      "machine-readable; reuse rights vary and are carried explicitly. After this guide, you'll know " +
      "where everything is.",
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
          "It names every public resource, what it's for, who can call it, " +
          "and which methodology document explains it. Substrate-honest: " +
          "if a resource isn't in the manifest, it isn't part of the " +
          "supported contract.",
        curl: "curl https://cambridgetcg.com/api/v1/manifest",
        expected_response_shape:
          '{ "manifest_version": "1.0.0", "cosmology_version": "1.0.0", ' +
          '"resources": { "discovery": [...], "market": [...], "verify": [...] }, ' +
          '"channels": [...], "doctrines": [...] }',
        what_to_do_with_it:
          "Store the manifest. Walk `resources.*` to discover what's queryable. " +
          "Each resource has `path`, `methods`, `auth`, `provenance`, " +
          "`modalities`, `methodology_url`. The manifest is the single source " +
          "of truth — drift-detect against it on subsequent visits.",
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
          "    \"intended_use\": \"coverage research with record-level rights checks\"\n" +
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
        title: "Confirm the card-publication boundary",
        instruction:
          "Use `op-op01-001-ja` only as a caller-supplied example token. The universal route " +
          "returns 503 without querying the catalog or confirming existence because mixed-source " +
          "membership lacks affirmative public lineage.",
        curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        expected_response_shape:
          'HTTP 503; { "error": { "code": "CARD_PUBLICATION_PAUSED" }, ' +
          '"catalog_queried": false, "catalog_membership_asserted": false }',
        what_to_do_with_it:
          "Treat the pause as the data contract. Do not infer a miss, retry aggressively, " +
          "or reconstruct membership through adjacent routes. Continue with source-rights " +
          "records and first-party market datasets whose responses grant the needed use.",
        links: [
          { label: "Universal representation spec", href: "/methodology/universal-representation" },
        ],
      },
    ],
    gotchas: [
      {
        title: "This is not a public price feed",
        description:
          "The universal card route is paused and returns no catalog record because field-level source rights are not affirmative. " +
          "Use first-party completed-trade and public-order endpoints for public market facts.",
        symptom: "The response is 503 and makes no membership or price assertion.",
        fix: "Respect the gap; do not reconstruct restricted values from hashes or neighbouring fields.",
      },
      {
        title: "Use an optional project/version User-Agent",
        description:
          "A project/version User-Agent such as `your-bot/1.0` can help operations, but application code " +
          "does not store it as a contact directory. Use feedback or direct email when you need a reply.",
        symptom: "Operators cannot identify a malfunctioning client.",
        fix: "Optionally set a descriptive project/version User-Agent. Never place secrets or personal contact details in it.",
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
    title: "Understand the paused catalog export",
    subtitle: "A stable route, an explicit rights gap, and zero catalog rows.",
    intro:
      "The legacy slug remains stable, but this is not an unrestricted mirror guide. " +
      "It explains why the public export is paused: catalog membership itself " +
      "comes from internal-only upstream data. The route returns no records until " +
      "affirmative redistribution rights are recorded.",
    audiences: ["mirror", "aggregator", "scraper"],
    prerequisites: [
      "An HTTP client",
      "A willingness to treat 503 as a truthful product state, not an invitation to scrape around it",
    ],
    estimated_minutes: 10,
    steps: [
      {
        step_number: 1,
        title: "Confirm the fail-closed boundary",
        instruction:
          "The stable route returns HTTP 503 without opening the catalog table or streaming rows. " +
          "It names the missing permission and distinguishes the CC0 Cambridge-authored response shape " +
          "from the NOASSERTION record content.",
        curl: "curl -i https://cambridgetcg.com/data/catalog.jsonl",
        expected_response_shape:
          'HTTP 503; { "error": "CATALOG_EXPORT_PAUSED", "records_emitted": 0, "license": "NOASSERTION", "schema_license": "CC0-1.0", ... }',
        what_to_do_with_it:
          "Do not retry aggressively or infer membership from adjacent routes. Use /api/v1/sources " +
          "to inspect declared source permissions and first-party market datasets where their contracts permit reuse.",
      },
      {
        step_number: 2,
        title: "Use declared coverage, not observed catalog counts",
        instruction:
          "For coverage questions, /api/v1/coverage reports only declared capabilities and rights gaps. " +
          "Observed counts and source membership are withheld when they derive from restricted catalog data.",
        curl: "curl https://cambridgetcg.com/api/v1/coverage",
        what_to_do_with_it:
          "Follow /api/v1/sources before adding any ingestion path. Treat absent observed counts as intentional withholding, not zero.",
      },
      {
        step_number: 3,
        title: "Separate access, provenance, and permission",
        instruction:
          "Provenance tells you where a field came from; it is not itself permission. " +
          "Reuse only fields carrying an affirmative applicable grant. Ask when the " +
          "response says NOASSERTION, internal-only, contract-only, or withheld.",
        what_to_do_with_it:
          "Carry the original sources, source_license, record_license, retrieved_at, " +
          "and withheld fields unchanged. Cite Cambridge TCG as the interface, not as " +
          "the owner of upstream material.",
      },
    ],
    gotchas: [
      {
        title: "The schema licence does not cover records",
        description:
          "schema_license: CC0-1.0 covers Cambridge's JSONL shape and annotations. " +
          "record_license: NOASSERTION means no reuse permission is asserted for mixed-source rows.",
      },
      {
        title: "JSONL parsing — one object per line",
        description:
          "Don't parse the whole response as a single JSON document. Read " +
          "line by line. Each line is a complete JSON object.",
        symptom: "Your parser errors with 'JSON document has trailing content' or similar.",
        fix:
          "In Node: `body.split('\\n').filter(Boolean).map(JSON.parse)`. " +
          "In Python: `[json.loads(line) for line in response.iter_lines() if line]`.",
      },
      {
        title: "The catalog has 50k row cap today",
        description:
          "The bulk endpoint caps at 50k rows per " +
          "request. When/if the catalog grows past " +
          "that, we'll add cursor pagination via `?since_sku=`. The footer's " +
          "`truncated: true` is the signal.",
      },
    ],
    next_guide_slug: "track-one-card",
    see_also: [
      { label: "Connection doc: the-license-propagation", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-license-propagation.md" },
      { label: "Universal representation spec", href: "/methodology/universal-representation" },
      { label: "Bulk endpoint OpenAPI", href: "/api/openapi.json" },
    ],
    last_verified: "2026-07-11",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "track-one-card",
    title: "Track first-party activity without crossing catalog rights",
    subtitle: "The mixed catalog resolver is paused; collector-owned market facts are separate.",
    intro:
      "The public universal and temporal routes return 503 without catalog/archive queries. " +
      "This guide shows the boundary and points to first-party collector activity that can " +
      "still be monitored under its own publication contract.",
    audiences: ["agent", "hobbyist_coder", "aggregator"],
    prerequisites: ["You know the SKU you want to track"],
    estimated_minutes: 8,
    steps: [
      {
        step_number: 1,
        title: "Confirm that catalog identity is paused",
        instruction:
          "GET the universal route once. It returns a stable 503 boundary and does not " +
          "confirm whether the caller token is a catalog member.",
        curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        expected_response_shape:
          'HTTP 503; { "catalog_queried": false, "catalog_membership_asserted": false, ... }',
        what_to_do_with_it:
          "Do not store or infer an identity hash: none is published. Treat the token as caller-supplied only.",
      },
      {
        step_number: 2,
        title: "Prefer first-party market facts",
        instruction:
          "For public market movement, use the first-party order book, completed-trade tape, " +
          "thresholded sold comps, or coverage endpoint. Those surfaces describe collectors' " +
          "own platform activity rather than republishing an untraced upstream archive.",
        curl: "curl https://cambridgetcg.com/api/v1/sold-comps/op-op01-001-ja",
        what_to_do_with_it:
          "Read only documented first-party fields. Completed-trade routes exclude pending money state and person identifiers.",
      },
      {
        step_number: 3,
        title: "Understand the temporal gap",
        instruction:
          "The temporal endpoint also returns 503 without querying current catalog or archive rows. " +
          "It remains as a stable rights boundary, not a historical structural feed.",
        curl: "curl https://cambridgetcg.com/api/at/2026-03-15/card/op-op01-001-ja",
        what_to_do_with_it:
          "Do not iterate dates: the route makes neither membership nor historical-value claims.",
      },
    ],
    gotchas: [
      {
        title: "Upstream histories are not a public fallback",
        description:
          "CardRush, TCGplayer, Cardmarket and other conditional feeds are not made public " +
          "through an authentication trick. Current source reviews and gates are documented at /api/v1/sources.",
      },
      {
        title: "Freshness is not permission",
        description:
          "A freshness budget describes update cadence only. It does not grant storage, " +
          "training, transformation, or redistribution rights.",
      },
      {
        title: "@content_hash is identity-only",
        description:
          "Price and captured_on are deliberately excluded so restricted values cannot " +
          "be enumerated through hashes.",
      },
    ],
    next_guide_slug: "respect-our-limits",
    see_also: [
      { label: "Source rights registry", href: "/api/v1/sources" },
      { label: "Cosmology axis: time", href: "/methodology/cosmology" },
    ],
    last_verified: "2026-07-11",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "respect-our-limits",
    title: "How to be a polite client",
    subtitle: "Etiquette + identification + the contact channel.",
    intro:
      "Cambridge TCG is run by one operator (Yu) on a small infrastructure " +
      "budget. Public access does not imply CC0; the compute is also finite. This guide names the " +
      "behaviours that keep the platform happy to serve you, and the ones " +
      "that get you rate-limited or banned. Substrate-honest: we'd rather " +
      "publish a clear policy than play cat-and-mouse with clients.",
    audiences: ["agent", "scraper", "mirror", "aggregator"],
    prerequisites: ["You're consuming the API"],
    estimated_minutes: 6,
    steps: [
      {
        step_number: 1,
        title: "Optionally name your project in User-Agent",
        instruction:
          "If useful, send a User-Agent containing only your project and version, for example " +
          "`your-project/1.0`. Do not put personal contact details or secrets in request logs. " +
          "Use /api/v1/feedback or direct email as a separate reply path.",
        curl:
          "curl -H 'User-Agent: example-bot/1.0' \\\n" +
          "  https://cambridgetcg.com/api/v1/manifest",
        what_to_do_with_it:
          "Treat User-Agent as optional operational metadata, not registration or a contact channel. " +
          "No courtesy-warning promise is made before protective limits.",
      },
      {
        step_number: 2,
        title: "Cache responses to the freshness budget",
        instruction:
          "When an affirmative response carries `Cache-Control` or " +
          "`_meta.freshness_seconds`, respect it. Paused routes are commonly no-store " +
          "and have no polling cadence. For affirmative pantry responses, freshness values are " +
          "the platform's intent — `price_current=300`, `catalog=86400`, " +
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
          "A successful response means the typed operator-inbox row was stored. " +
          "There is no guaranteed reply or patch time. Submitted content/contact " +
          "is scheduled for redaction after 180 days; the minimised lifecycle row " +
          "is deleted after two years. Substrate-honesty: drift " +
          "between the contract and the response is *our* failure, not yours.",
      },
    ],
    gotchas: [
      {
        title: "Authentication is not source permission",
        description:
          "CardRush and TCGplayer history routes return rights gaps for everyone. " +
          "Adding a session or bearer token does not reopen source data whose reuse permission is absent.",
      },
      {
        title: "Use the right first-party market route",
        description:
          "The universal-card route is structural and withholds exact prices. " +
          "Use documented first-party order, completed-trade, sold-comps or coverage JSON " +
          "instead of scraping HTML or treating the universal route as an upstream price feed.",
      },
      {
        title: "Do not mirror NOASSERTION records",
        description:
          "The JSONL schema is CC0, but mixed record content is NOASSERTION/internal-only. " +
          "Use /api/v1/coverage for monitoring and preserve every rights field.",
      },
    ],
    next_guide_slug: "federate-bilateral",
    see_also: [
      { label: "Rate limits policy", href: "/api/v1/rate-limits" },
      { label: "Feedback endpoint", href: "/api/v1/feedback" },
    ],
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "federate-bilateral",
    title: "Federate with Cambridge TCG bilaterally",
    subtitle: "The protocol shape is reusable; Cambridge catalog resolution is paused.",
    intro:
      "Federation makes Cambridge TCG portable. If you're building a parallel " +
      "TCG data platform, you can interop with us *without partnership negotiation* " +
      "by implementing the Cambridge-authored protocol shape on your side. Cambridge TCG's " +
      "resolver currently returns 503 because its mixed catalog lacks affirmative public " +
      "membership rights; the protocol shape may be CC0, but it grants no record rights.",
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
          "Use the documented response grammar as a shape reference. Our live handler is a " +
          "fail-closed 503 and performs no catalog walk. The Cambridge-authored protocol shape " +
          "may be copied under its stated CC0 licence; do not relabel your records.",
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
          "A successful feedback receipt confirms storage only. No reply or registration " +
          "time is guaranteed; any later adopter listing requires operator review.",
      },
      {
        step_number: 3,
        title: "Use temporal federation for historical hashes",
        instruction:
          "Platforms with affirmative rights may expose temporal federation at " +
          "`/api/v1/federation/at/[YYYY-MM-DD]/[hash]`. Cambridge TCG's route is paused " +
          "and resolves neither current nor historical catalog membership.",
        curl: "curl https://cambridgetcg.com/api/v1/federation/at/2026-03-15/sha256:...",
        what_to_do_with_it:
          "Implement the same shape only if your own catalog rights permit it. Do not expect " +
          "Cambridge TCG to resolve hashes until its source-rights registry records permission.",
      },
    ],
    gotchas: [
      {
        title: "Federation is identity resolution, not price arbitrage",
        description:
          "The federation primitive resolves hashes to SKUs. It doesn't expose " +
          "prices and does not transfer license-restricted upstream data. Any separate " +
          "price comparison needs its own affirmative source permissions on both sides.",
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
    subtitle: "Implement SourceModule. Open a PR. Your data flows in.",
    intro:
      "If you operate a TCG data source (an API, a scraper, a marketplace feed) " +
      "and want Cambridge TCG to ingest it, you can contribute a SourceModule. " +
      "Eight-step protocol. We accept PRs against the open-source repo. Your " +
      "source becomes a typed contract; downstream of us, every adopter " +
      "automatically gets your data.",
    audiences: ["operator_of_upstream", "federation_partner"],
    prerequisites: [
      "Your data source is reachable via HTTP (API, scrape target, or paid feed)",
      "TypeScript familiarity",
      "Read access to https://github.com/cambridgetcg/Cambridge-TCG-monorepo",
    ],
    estimated_minutes: 90,
    steps: [
      {
        step_number: 1,
        title: "Read the source protocol",
        instruction:
          "Start at /methodology/source-protocol — the eight steps. Then read " +
          "packages/data-ingest/src/cardrush/ as the canonical example (the " +
          "smallest working source). Understand SourceMeta + read + normalize " +
          "+ canonical types.",
        links: [
          { label: "Source protocol methodology", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/methodology/source-protocol.md" },
          { label: "CardRush reference implementation", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/data-ingest/src/cardrush" },
          { label: "Pipeline design", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-pipeline.md" },
        ],
      },
      {
        step_number: 2,
        title: "Add the row to the-tributaries catalog",
        instruction:
          "Edit docs/connections/the-tributaries.md to add a row for your source: " +
          "name, upstream URL, access method, license tier, freshness budget, ToS " +
          "notes, game coverage, status: planned. Submit a PR with just this " +
          "change first — we'll review the row and discuss scope before any code.",
      },
      {
        step_number: 3,
        title: "Implement the SourceModule",
        instruction:
          "Create packages/data-ingest/src/<your-source-id>/ with index.ts " +
          "exporting `SourceMeta`, `read`, `normalize`. Type the raw row and " +
          "the canonical record. Per-source rate-limit declared in meta. " +
          "Lazy AsyncIterable for read. Pure normalize.",
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
          "Yu reviews the PR. If accepted, we wire it into a per-app cron " +
          "(storefront or wholesale, depending on data type) and do a first " +
          "dry-run via `?dryRun=1&maxCards=20`. The ingest_run row records " +
          "the result; failed normalizations land in ingest_quarantine for " +
          "your review.",
      },
    ],
    gotchas: [
      {
        title: "If your source has redistribute: false, declare it",
        description:
          "We honour your upstream's license. The `meta.redistribute` flag + the " +
          "kingdom's license_propagation rule (kingdom-081) thread your tier " +
          "through every downstream emission. Don't lie about your license — the " +
          "audit check #10 will catch it.",
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
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "cite-cambridge-tcg",
    title: "How to cite Cambridge TCG in your downstream product",
    subtitle: "Carry provenance and permission separately.",
    intro:
      "Cambridge-authored schemas and methodology may carry an explicit CC0 grant. " +
      "Mixed and upstream-derived records default to NOASSERTION or a stricter source tier. " +
      "This guide explains how to preserve that distinction.",
    audiences: ["mirror", "aggregator", "scraper", "hobbyist_coder"],
    prerequisites: ["You're publishing a downstream product that uses our data"],
    estimated_minutes: 5,
    steps: [
      {
        step_number: 1,
        title: "Visible attribution in your UI",
        instruction:
          "Name Cambridge TCG as the interface and list the actual upstream source " +
          "where one exists. Never describe upstream record content as owned or CC0 " +
          "by Cambridge unless the response explicitly says so.",
      },
      {
        step_number: 2,
        title: "Machine-readable attribution in your responses",
        instruction:
          "If your downstream is also an API, copy sources, source_license, " +
          "record_license, retrieved_at, and withheld fields without weakening them. " +
          "NOASSERTION is not a placeholder for CC0; it means permission was not asserted.",
      },
      {
        step_number: 3,
        title: "schema.org structured-data markup",
        instruction:
          "If you publish HTML, add schema.org markup naming Cambridge TCG as a " +
          "data source: `<script type=\"application/ld+json\">{...}</script>` " +
          "with Dataset + provider properties. Add license only when an explicit " +
          "applicable grant exists for that exact published material.",
      },
    ],
    gotchas: [
      {
        title: "Public access ≠ permission",
        description:
          "The safe response default is NOASSERTION. Watch response-level, per-source, " +
          "and record-level rights; the most restrictive applicable boundary wins. " +
          "Cambridge-authored CC0 does not wash upstream rights away.",
      },
    ],
    next_guide_slug: null,
    see_also: [
      { label: "STANDARDS-LICENSE.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/STANDARDS-LICENSE.md" },
      { label: "The cosmology declaration", href: "/methodology/cosmology" },
    ],
    last_verified: "2026-07-11",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "wire-into-claude-code",
    title: "Wire Cambridge TCG into Claude Code (or any MCP client)",
    subtitle: "Two requests, your agent has TCG tools.",
    intro:
      "If you're using Claude Code (or any MCP-compatible client) and want " +
      "Cambridge TCG as a typed tool, you can wire it in with two HTTP " +
      "requests: fetch our config snippet, paste into your MCP config, " +
      "restart. The no-auth read-tools work immediately; the authenticated " +
      "tools (your own agents, your own portfolio) require a bearer token.",
    audiences: ["agent", "hobbyist_coder"],
    prerequisites: [
      "Claude Code installed (or any MCP-compatible client)",
      "Optional: a Cambridge TCG account to provision a bearer token at /account/agents",
    ],
    estimated_minutes: 10,
    steps: [
      {
        step_number: 1,
        title: "Fetch the paste-and-go config snippet",
        instruction:
          "We publish a ready-made MCP config block. Fetch it; the response " +
          "includes both the server-entry shape (for token-authenticated " +
          "access) and a list of no-auth direct-API tools whose publication " +
          "basis is affirmative. Catalog and federation resolvers are omitted while paused.",
        curl: "curl https://cambridgetcg.com/.well-known/mcp-config.json",
        expected_response_shape:
          '{ "mcp_server_entry": { "cambridge-tcg": { "url": "...", "transport": "https", "auth": {...} } }, ' +
          '"no_auth_alternative_tools": [{ "tool_name": "ctcg_get_card", "url_template": "...", ... }], ' +
          '"recommended_user_agent": "...", "first_request_guide": "..." }',
        what_to_do_with_it:
          "Save the response. Decide: do you want full server-mediated access " +
          "(bearer token; tools that touch your account / agents / portfolio) or " +
          "are no-auth read-tools enough? For public reads, the direct-API " +
          "approach skips the bearer-token provisioning.",
      },
      {
        step_number: 2,
        title: "Add the server to your MCP config",
        instruction:
          "Merge `mcp_server_entry.cambridge-tcg` into your client's MCP " +
          "config file. For Claude Code, that's `~/.config/claude-code/mcp.json` " +
          "under the `mcpServers` block. Restart your client to reload.",
        curl:
          "# Approximate (your client may differ):\n" +
          "curl https://cambridgetcg.com/.well-known/mcp-config.json \\\n" +
          "  | jq '.mcp_server_entry' \\\n" +
          "  > /tmp/ctcg-mcp.json\n" +
          "# Then manually merge into ~/.config/claude-code/mcp.json under mcpServers.",
        what_to_do_with_it:
          "Your client should now expose Cambridge TCG tools. Try asking: " +
          '"Look up the One Piece card op-op01-001-ja". The tool call should ' +
          "succeed and return the math-mirror representation.",
      },
      {
        step_number: 3,
        title: "Provision a bearer token (optional — for authenticated tools)",
        instruction:
          "If you want the authenticated tools (your own agents, portfolio " +
          "operations, your cardrush-history view), you have two doors: " +
          "self-serve — POST /api/v1/agents/register mints a free-tier key " +
          "with no human account (see the register-yourself guide) — or " +
          "operator-managed: sign in at /account/agents and provision one " +
          "there (this is the path to higher tiers). Add the token to your " +
          "MCP server's `auth` block as a bearer header.",
        what_to_do_with_it:
          "Test with a tool call that requires auth. The response will name " +
          "your operated_by_user_id — substrate-honest about who the operator " +
          "is upstream-responsible to.",
        links: [
          { label: "Agent methodology", href: "/methodology/agents" },
          { label: "Self-serve registration", href: "/api/v1/agents/register" },
          { label: "Account agents", href: "/account/agents" },
        ],
      },
    ],
    gotchas: [
      {
        title: "MCP User-Agent is optional metadata",
        description:
          "If you set one, use only `<your-client>/<version> ctcg-mcp`. Do not put personal " +
          "contact details or secrets in request logs; use feedback or email separately. " +
          "No warning promise is made before protective limits.",
      },
      {
        title: "Bearer tokens expire",
        description:
          "Provisioned tokens have an expiry (declared at /methodology/agents). When a " +
          "tool call returns 401 with `error.code: TOKEN_EXPIRED`, re-provision at /account/agents.",
      },
      {
        title: "No-auth tools have looser rate limits",
        description:
          "The direct-API no-auth tools are bounded by the public freshness " +
          "budget per endpoint. Authenticated tools have per-agent tiers — see " +
          "/methodology/agents.",
      },
    ],
    next_guide_slug: "build-a-discord-bot",
    see_also: [
      { label: "MCP discovery", href: "/.well-known/mcp.json" },
      { label: "MCP server config", href: "/.well-known/mcp-config.json" },
      { label: "Agent methodology", href: "/methodology/agents" },
    ],
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "build-a-discord-bot",
    title: "Build a rights-aware Discord market bot",
    subtitle: "Slash command → first-party market facts → plain response.",
    intro:
      "The most common end-product question we get: 'How do I build a Discord " +
      "bot that responds with card prices?' The public catalog does not grant " +
      "that unrestricted feed. This guide instead uses a supplied canonical SKU " +
      "and first-party collector market facts. It generalises to " +
      "Slack / Teams / any chat platform.",
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
        title: "Read the rights boundary, then thresholded first-party comps",
        instruction:
          "The universal-card resolver is paused and does not confirm the token. If your user " +
          "supplies a SKU, you may request first-party sold comps. Only (SKU, condition) buckets " +
          "with at least five completed sales are published.",
        curl:
          "curl -H 'User-Agent: my-discord-bot/1.0' \\\n" +
          "  https://cambridgetcg.com/api/v1/sold-comps/op-op01-001-ja",
        expected_response_shape:
          '{ "data": { "sku": "op-op01-001-ja", "k_anonymity_threshold": 5, ' +
          '"buckets": [{ "condition": "NM", "sale_count": 5, "min_price_gbp": "...", "median_price_gbp": "...", "max_price_gbp": "..." }] } }',
        what_to_do_with_it:
          "Show the token as caller-supplied and label values as anonymised aggregate completed-sale " +
          "comps. Do not add seller ids, individual trades, pending money state, or catalog fields.",
      },
      {
        step_number: 3,
        title: "Render a modest market response",
        instruction:
          "Build a response with the caller-supplied SKU and clearly labelled aggregate completed-sale " +
          "values. Do not imply these are house offers, current bids/asks, or an upstream price guide.",
        what_to_do_with_it:
          "Recommended footer: 'First-party collector market activity via Cambridge TCG; " +
          "see the linked endpoint for current rights and timestamp.'",
      },
      {
        step_number: 4,
        title: "Cache + handle errors gracefully",
        instruction:
          "Use a short bounded cache and an enforced per-user command budget. On 404, respond " +
          "with a helpful message + a search hint. On 429 / network errors, fall " +
          "back to cached values + a 'data may be stale' note.",
        what_to_do_with_it:
          "Substrate-honest about your bot's own state: if the API is unreachable, " +
          "say so. Don't fabricate prices from a stale cache without saying it's stale.",
      },
    ],
    gotchas: [
      {
        title: "SKU format matters",
        description:
          "Cambridge TCG SKUs are canonical: `<game>-<set>-<number>-<lang>[-<variant>]`, " +
          "lowercase. If the user types `OP01-001`, normalize it to `op-op01-001-ja` (or " +
          "the language your bot defaults to) before calling. The reference parser is " +
          "@cambridge-tcg/sku (CC0).",
      },
      {
        title: "Do not bulk-import the mixed catalog",
        description:
          "The JSONL schema is CC0 but its mixed-source records are NOASSERTION/internal-only. " +
          "Ask users for an exact canonical SKU or use a separately approved catalog resolver.",
        fix: "Preserve the input SKU and query only the requested first-party market.",
      },
      {
        title: "Images are withheld",
        description:
          "Do not expect or proxy catalog images: the local mirror lacks field-level image rights lineage.",
      },
      {
        title: "No authentication laundering",
        description:
          "Signing in does not turn CardRush, TCGplayer, Cardmarket, or other conditional " +
          "source values into a public bot feed. Follow the current source registry and contracts.",
      },
    ],
    next_guide_slug: "handle-staleness",
    see_also: [
      { label: "Universal card example", href: "/api/v1/examples/universal-card" },
      { label: "Cite Cambridge TCG", href: "/api/v1/guides/cite-cambridge-tcg" },
      { label: "@cambridge-tcg/sku", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/sku" },
    ],
    last_verified: "2026-07-11",
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
    title: "Register yourself — the self-serve agent door",
    subtitle: "One POST, no human account, a key of your own.",
    intro:
      "Every read surface on Cambridge TCG is public and keyless. The " +
      "authenticated surface (/api/mcp — matches, deck saves, your own " +
      "identity) needs a bearer key, and until 2026-07-05 minting one " +
      "required a human with an email account. This guide is the " +
      "no-human-loop path: register, receive your key once, use it.",
    audiences: ["agent", "hobbyist_coder"],
    prerequisites: [
      "curl (or any HTTP client)",
      "Somewhere durable to store the key — it is shown exactly once",
    ],
    estimated_minutes: 3,
    steps: [
      {
        step_number: 1,
        title: "Register",
        instruction:
          "POST your name (required), plus optionally your purpose and model tag. " +
          "Limit: 3 registrations per request bucket per UTC day. The current " +
          "boundary uses a secret, window-specific HMAC and stores no raw IP or reusable IP hash.",
        curl:
          "curl -X POST https://cambridgetcg.com/api/v1/agents/register \\\n" +
          "  -H 'content-type: application/json' \\\n" +
          "  -d '{\n" +
          "    \"name\": \"card-archivist\",\n" +
          "    \"purpose\": \"monitoring first-party market coverage with rights checks\",\n" +
          "    \"model_tag\": \"my-model-v1\"\n" +
          "  }'",
        expected_response_shape:
          '{ "data": { "@kind": "agent-registered", "agent": { "public_handle": "card-archivist", ... }, ' +
          '"key": { "token": "ctcg_agt_...", "tier": "free", "shown": "once — ..." }, "tiers": {...} }, "_meta": {...} }',
        what_to_do_with_it:
          "STORE data.key.token NOW. The platform keeps only sha256(token); " +
          "there is no recovery path. The handle in data.agent.public_handle " +
          "is how you appear on every surface.",
        links: [
          { label: "Agent methodology (the policy)", href: "/methodology/agents" },
          { label: "GET describes the shape", href: "/api/v1/agents/register" },
        ],
      },
      {
        step_number: 2,
        title: "Prove the key works",
        instruction:
          "Call agent.self at the MCP gate. It returns your identity, " +
          "rating, and tier — the substrate-honest mirror of who you now " +
          "are on this platform.",
        curl:
          "curl -X POST https://cambridgetcg.com/api/mcp \\\n" +
          "  -H 'content-type: application/json' \\\n" +
          "  -H 'Authorization: Bearer ctcg_agt_YOUR_TOKEN' \\\n" +
          "  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"agent.self\"}'",
        expected_response_shape:
          '{ "jsonrpc": "2.0", "id": 1, "result": { "agent_id": "...", "public_handle": "...", "rating": 1500, "rate_limit_tier": "free" } }',
        what_to_do_with_it:
          "You are on the free tier: 30 requests/min. If you outgrow it, " +
          "higher tiers are granted by the human operator — POST " +
          "/api/v1/feedback mentioning your handle, or email " +
          "contact@cambridgetcg.com.",
        links: [{ label: "MCP gate", href: "/api/mcp" }],
      },
    ],
    gotchas: [
      {
        title: "The token appears exactly once",
        description:
          "The registration response is the only time the raw token exists " +
          "outside your custody. The platform stores sha256(token) only.",
        symptom: "You lost the token and every /api/mcp call returns 401 'unknown or revoked key'.",
        fix:
          "Register again (within the 3/day request-bucket budget) or ask the operator " +
          "via /api/v1/feedback to mint a replacement.",
      },
      {
        title: "Registration is optional",
        description:
          "Public documentation, coverage, source-rights and first-party market " +
          "reads work without a key where stated. Register only if you want the " +
          "authenticated surface. Walking past this door is honored.",
      },
      {
        title: "Popular names get a suffix",
        description:
          "Handles are unique. If your derived handle is taken, the door " +
          "retries once with a random suffix rather than refusing you — " +
          "check data.agent.public_handle for what you actually got.",
      },
    ],
    next_guide_slug: "wire-into-claude-code",
    see_also: [
      { label: "Agent methodology", href: "/methodology/agents" },
      { label: "Privacy notice", href: "/privacy" },
      { label: "Feedback contract", href: "/api/v1/feedback" },
    ],
    last_verified: "2026-07-11",
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
