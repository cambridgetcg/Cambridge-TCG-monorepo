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
      "requests. No account, no key, no obligation. Every endpoint you'll hit " +
      "is CC0-licensed and machine-readable. After this guide, you'll know " +
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
          "    \"intended_use\": \"price tracking and catalog mirroring\"\n" +
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
          '"@sources": ["storefront-rds.card_price_history"], ' +
          '"@source_license": ["CC0-1.0"], "sku": "...", "price": {...}, ' +
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
        title: "Don't poll faster than 5 minutes for prices",
        description:
          "Card prices have a `price_current` freshness budget of 5 minutes (300 seconds). " +
          "Polling faster than that is wasted bandwidth — you'll get the same response. " +
          "Use `_meta.freshness_seconds` or `@retrieved_at` to schedule your next poll.",
        symptom: "You see no price changes despite polling every 30 seconds.",
        fix: "Check `_meta.freshness_seconds`; schedule your next poll for `now + freshness_seconds`.",
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
    title: "Mirror Cambridge TCG's card catalog locally",
    subtitle: "One request, ~12k cards, CC0.",
    intro:
      "If you're building a meta-product (price aggregator, deck builder, " +
      "search engine), you'll want a local mirror of the catalog so your " +
      "users don't hit our API for every card view. This guide gets you " +
      "from zero to a refreshable local copy in one request, plus a " +
      "polite refresh discipline.",
    audiences: ["mirror", "aggregator", "scraper"],
    prerequisites: [
      "About 6 MB of disk for the JSONL file",
      "A daily cron or scheduled task",
    ],
    estimated_minutes: 10,
    steps: [
      {
        step_number: 1,
        title: "Fetch the bulk catalog",
        instruction:
          "One request returns the entire catalog as streaming JSONL. The " +
          "first line is a manifest header (count, retrieved_at, license); " +
          "the last is a footer (complete, count_emitted); intervening lines " +
          "are cards in canonical universal-mirror sparse form. Each card " +
          "carries `@content_hash` for change-detection.",
        curl:
          "curl -H 'Accept-Encoding: gzip' \\\n" +
          "  https://cambridgetcg.com/data/catalog.jsonl \\\n" +
          "  > catalog.jsonl",
        expected_response_shape:
          'Line 1: { "@kind": "catalog_manifest", "count_expected": 12000, "license": "CC0-1.0", ... }\n' +
          'Line 2-N: { "@kind": "card", "@content_hash": "sha256:...", "sku": "...", "price": {...}, ... }\n' +
          'Line N+1: { "@kind": "catalog_footer", "complete": true, "count_emitted": 11984 }',
        what_to_do_with_it:
          "Parse line-by-line. Store the manifest header — its `retrieved_at` " +
          "is your cache key. Index cards by `sku`. Compare each card's " +
          "`@content_hash` against your stored copy on next refresh; only " +
          "re-index changed rows. The footer's `complete: true` is the signal " +
          "you got the full stream; `truncated: true` means you hit the 50k cap " +
          "(unlikely today; cursor pagination is future work).",
      },
      {
        step_number: 2,
        title: "Schedule a daily refresh",
        instruction:
          "The catalog freshness budget is `catalog` (24 hours). Pulling " +
          "once a day at off-peak (e.g. 04:00 UTC) is the polite cadence. " +
          "Don't pull more often than every 6 hours — the catalog doesn't " +
          "change that fast and your bandwidth is wasted.",
        curl: "# cron entry: 0 4 * * *  curl -o catalog.jsonl https://cambridgetcg.com/data/catalog.jsonl",
        what_to_do_with_it:
          "After each refresh, diff the new `@content_hash` set against your " +
          "previous to find changed/added/removed rows. Cards never get hard-" +
          "deleted but the `@content_hash` changes when the latest captured " +
          "price changes.",
      },
      {
        step_number: 3,
        title: "Cite Cambridge TCG honestly",
        instruction:
          "The data is CC0 — you owe no attribution legally. But " +
          "*substrate-honest* attribution is encouraged: in your UI, name " +
          "where the data came from, and link back. Reciprocal kindness.",
        what_to_do_with_it:
          "Recommended attribution: 'Catalog data from Cambridge TCG (https://cambridgetcg.com) — CC0-1.0.' " +
          "Or in machine-readable form, attach `provenance: { source: \"cambridge-tcg\", license: \"CC0-1.0\", retrieved_at: \"...\" }` to each row in your downstream product.",
      },
    ],
    gotchas: [
      {
        title: "The price chain may include cardrush JP retail",
        description:
          "GBP prices are Cambridge TCG's published reference prices — open data, not offers (the platform holds no market position). But the " +
          "underlying price observation pipeline at our wholesale layer reads " +
          "from CardRush JP (license: internal-only). The bulk export only " +
          "carries derived GBP — not raw JPY — so you're fine. But if you " +
          "later use /api/v1/cards/[sku]/cardrush-history (auth-gated tier-2), " +
          "the JPY values come with `internal-only` license restrictions: " +
          "personal-decision use OK, bulk re-export not.",
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
          "Current catalog is ~12k rows. The bulk endpoint caps at 50k per " +
          "request — well above today's size. When/if the catalog grows past " +
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
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "track-one-card",
    title: "Track one card's price over time",
    subtitle: "Polling discipline + change-detection.",
    intro:
      "If you're building a price-alert bot, a single-card watch surface, " +
      "or a deck-tracker, you want per-card price observation without " +
      "thrashing the API. This guide names the polite cadence + the " +
      "change-detection primitive.",
    audiences: ["agent", "hobbyist_coder", "aggregator"],
    prerequisites: ["You know the SKU you want to track"],
    estimated_minutes: 8,
    steps: [
      {
        step_number: 1,
        title: "Fetch the current state",
        instruction:
          "GET the card's universal-mirror representation. The `@content_hash` " +
          "is the change-detection primitive: same hash = same card facts (no " +
          "change worth re-rendering); different hash = something changed.",
        curl: "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        expected_response_shape:
          '{ "@content_hash": "sha256:...", "@retrieved_at": {...}, ' +
          '"price": { "magnitude": 5.40, "currency_token": "GBP", "magnitude_freshness": {...} }, ... }',
        what_to_do_with_it:
          "Store `@content_hash` + `price.magnitude` + `price.magnitude_freshness.iso8601`. " +
          "These are your local cache key.",
      },
      {
        step_number: 2,
        title: "Poll politely",
        instruction:
          "Schedule re-fetches at the freshness budget. For prices, that's " +
          "5 minutes (`price_current`). Faster polling returns the same " +
          "response — wasted bandwidth. Set a maximum poll rate of " +
          "12 requests/hour per SKU.",
        curl:
          "# every 5 minutes:\n" +
          "curl https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        what_to_do_with_it:
          "On each poll, compare the new `@content_hash` against your stored. " +
          "If equal: nothing changed; reschedule. If different: extract the " +
          "new magnitude, log to your time-series, possibly fire your alert. " +
          "Substrate-honest about `magnitude_freshness.decimal_age_seconds` — " +
          "the platform may report a price that was last observed hours ago.",
      },
      {
        step_number: 3,
        title: "Walk historical via /api/at/",
        instruction:
          "If you want to backfill, hit the temporal endpoint — `/api/at/[YYYY-MM-DD]/card/[sku]`. " +
          "Each historical day is immutable (returns `Cache-Control: immutable`). " +
          "Pull once per day per SKU into your local series.",
        curl: "curl https://cambridgetcg.com/api/at/2026-03-15/card/op-op01-001-ja",
        what_to_do_with_it:
          "Build your local time-series by iterating dates. The response's " +
          "`@as_of` declares the queried date; the `@retrieved_at` declares " +
          "when the response was produced. The price's `staleness_relative_to_as_of_days` " +
          "tells you how stale the observation was on that historical day.",
      },
    ],
    gotchas: [
      {
        title: "Anonymous JPY history is not available",
        description:
          "The storefront universal-mirror gives GBP prices (Cambridge TCG's " +
          "reference price — labelled, CC0, never an offer). If you want the raw CardRush JPY observation " +
          "history (90 days), you must be signed in and call " +
          "/api/v1/cards/[sku]/cardrush-history. That endpoint declares " +
          "`_meta.source_license: ['internal-only']` — non-bulk, non-redistributable.",
      },
      {
        title: "The 5-minute budget is per-SKU advisory",
        description:
          "We don't currently enforce per-SKU rate limits at the edge. The " +
          "5-minute number is the freshness budget — polling faster doesn't " +
          "give you fresher data. We monitor for abuse patterns and may " +
          "rate-limit unfriendly clients without warning.",
      },
      {
        title: "@content_hash includes captured_on",
        description:
          "The hash incorporates the price observation date, so a card " +
          "without a price update still produces a fresh hash daily. " +
          "If you want truly hash-based change detection without the daily " +
          "noise, compare `price.magnitude` + `magnitude_freshness.iso8601` " +
          "instead.",
      },
    ],
    next_guide_slug: "respect-our-limits",
    see_also: [
      { label: "Auth-gated JPY history (Phase 5.4)", href: "/api/v1/cards/op-op01-001-ja/cardrush-history" },
      { label: "Cosmology axis: time", href: "/methodology/cosmology" },
    ],
    last_verified: "2026-05-14",
  },

  // ───────────────────────────────────────────────────────────────────
  {
    slug: "respect-our-limits",
    title: "How to be a polite client",
    subtitle: "Etiquette + identification + the contact channel.",
    intro:
      "Cambridge TCG is run by one operator (Yu) on a small infrastructure " +
      "budget. The data is CC0; the compute isn't. This guide names the " +
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
          "Auth-gated endpoints (`/api/v1/cards/[sku]/cardrush-history`, " +
          "`/api/v1/webhooks/subscriptions`) check next-auth session cookies. " +
          "Don't try to fake them. We log unauthorized attempts.",
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
        title: "Don't poll the bulk catalog more than once every 6 hours",
        description:
          "It's 6 MB streamed. Pulling it every minute is rude. The freshness " +
          "budget is 24 hours; cron at 04:00 UTC is what we recommend.",
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
    subtitle: "Implement /federation/identify on your side. We'll resolve your hashes too.",
    intro:
      "Federation makes Cambridge TCG portable. If you're building a parallel " +
      "TCG data platform, you can interop with us *without partnership negotiation* " +
      "by implementing the federation primitive on your side. Bidirectional " +
      "hash resolution; CC0; symmetric.",
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
          "in our open-source mirror. Same shape. CC0 — copy freely.",
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
        title: "Use temporal federation for historical hashes",
        instruction:
          "Content hashes include `captured_on` so the hash a partner cached " +
          "yesterday differs from today's. Both platforms expose temporal " +
          "federation: `/api/v1/federation/at/[YYYY-MM-DD]/[hash]`. Resolves a " +
          "hash against the catalog's state on a specific past date.",
        curl: "curl https://cambridgetcg.com/api/v1/federation/at/2026-03-15/sha256:...",
        what_to_do_with_it:
          "Implement the same endpoint on your side. Now any partner that cached " +
          "a content_hash on any date can resolve it back to current SKU on either " +
          "platform.",
      },
    ],
    gotchas: [
      {
        title: "Federation is identity resolution, not price arbitrage",
        description:
          "The federation primitive resolves hashes to SKUs. It doesn't expose " +
          "prices, doesn't transfer license-restricted upstream data. If you want " +
          "cross-platform price comparison, both platforms ship the universal-mirror " +
          "endpoint; consumers fetch both and compare.",
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
    subtitle: "CC0 forever; attribution-free but warmly encouraged.",
    intro:
      "We publish under CC0-1.0 by default. You owe no attribution legally — " +
      "your downstream is free. But substrate-honest attribution is encouraged. " +
      "This guide names the recommended forms.",
    audiences: ["mirror", "aggregator", "scraper", "hobbyist_coder"],
    prerequisites: ["You're publishing a downstream product that uses our data"],
    estimated_minutes: 5,
    steps: [
      {
        step_number: 1,
        title: "Visible attribution in your UI",
        instruction:
          "Recommended footer string: 'Catalog and price data from Cambridge TCG " +
          "(https://cambridgetcg.com) — CC0-1.0.' Link the URL. We don't require " +
          "it; we appreciate it. Helps users find the source of truth.",
      },
      {
        step_number: 2,
        title: "Machine-readable attribution in your responses",
        instruction:
          "If your downstream is also an API, attach per-record provenance: " +
          "`provenance: { upstream: 'cambridge-tcg', upstream_url: 'https://cambridgetcg.com', license: 'CC0-1.0', retrieved_at: '...' }`. " +
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
          "Our default license is CC0. But some endpoints carry upstream license " +
          "constraints. Watch `_meta.source_license` — values like 'internal-only' " +
          "mean you cannot bulk-re-export. The /api/v1/cards/[sku]/cardrush-history " +
          "endpoint (CardRush JPY observations) is internal-only.",
      },
    ],
    next_guide_slug: null,
    see_also: [
      { label: "STANDARDS-LICENSE.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/STANDARDS-LICENSE.md" },
      { label: "The cosmology declaration", href: "/methodology/cosmology" },
    ],
    last_verified: "2026-05-14",
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
          "access) and a list of no-auth direct-API tools (universal/card, " +
          "federation/identify, catalog walks, etc.).",
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
        title: "Set User-Agent in MCP server config too",
        description:
          "Even when going through the MCP gate, our backend reads the User-Agent " +
          "of the request. Set `User-Agent: <your-client>/<version> (<contact>) ctcg-mcp` " +
          "so we can email you about breakage before firewalling.",
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
    title: "Build a Discord bot using Cambridge TCG data",
    subtitle: "Slash command → curl → embed.",
    intro:
      "The most common end-product question we get: 'How do I build a Discord " +
      "bot that responds with card prices?' This guide walks through the " +
      "minimum: one slash command, one curl, one rich embed. Generalises to " +
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
        title: "Call /api/v1/universal/card/[sku] from your handler",
        instruction:
          "Substrate-honest: send a User-Agent identifying your bot. Honour the " +
          "5-minute freshness budget — cache responses for at least that long. The " +
          "response carries everything you need: name, set, rarity, price magnitude, " +
          "image_url for the embed thumbnail.",
        curl:
          "curl -H 'User-Agent: my-discord-bot/1.0 (admin@me.example)' \\\n" +
          "  https://cambridgetcg.com/api/v1/universal/card/op-op01-001-ja",
        expected_response_shape:
          '{ "@kind": "card", "@content_hash": "sha256:...", "sku": "...", ' +
          '"price": { "magnitude": 5.40, "currency_token": "GBP", ... }, ' +
          '"name": { "natural_token": "...", "resolved_lang": "en" }, ' +
          '"image_url": "...", "rarity": { "natural_label": "leader", ... }, ' +
          '"in_set": { "target_natural_token": "OP01", ... } }',
        what_to_do_with_it:
          "Extract: `name.natural_token` for the embed title; `image_url` for the " +
          "thumbnail; `price.magnitude` + `currency_token` for the price field; " +
          "`rarity.natural_label` + `in_set.target_natural_token` for context.",
      },
      {
        step_number: 3,
        title: "Render a Discord embed",
        instruction:
          "Build an embed with the card's name as title, image_url as thumbnail, " +
          "and a price field. Include a small footer with the source attribution " +
          "and a link back to Cambridge TCG.",
        what_to_do_with_it:
          "Recommended embed.footer.text: 'Price from Cambridge TCG (CC0). Updated " +
          "[<magnitude_freshness.iso8601>].' This honours the cite-cambridge-tcg " +
          "guidance and tells your users when the data was last refreshed.",
      },
      {
        step_number: 4,
        title: "Cache + handle errors gracefully",
        instruction:
          "Wrap the curl in your language's cache helper (TTL = 300s, the " +
          "`price_current` freshness budget). On 404 (SKU not found), respond " +
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
        title: "Don't bulk-fetch on bot startup",
        description:
          "Some bots try to pre-warm a local cache by walking all SKUs at boot. Don't. " +
          "Use /data/catalog.jsonl once a day instead — same data, one request, no " +
          "rate-limit risk.",
        fix: "Schedule a daily refresh of catalog.jsonl; index it locally for autocomplete.",
      },
      {
        title: "Image URLs may rotate",
        description:
          "image_url points at the platform CDN. URLs are stable in practice but not " +
          "contractually guaranteed forever. Cache them with a 24h TTL; refresh on miss.",
      },
      {
        title: "Respect the JPY history license",
        description:
          "If you build a bot feature showing 'JPY history for this card', it MUST be " +
          "authenticated (per-user OAuth or session) and the bot's reply MUST include the " +
          "license_notice from the response. Bulk public dispatch of JPY values is forbidden.",
      },
    ],
    next_guide_slug: "handle-staleness",
    see_also: [
      { label: "Universal card example", href: "/api/v1/examples/universal-card" },
      { label: "Cite Cambridge TCG", href: "/api/v1/guides/cite-cambridge-tcg" },
      { label: "@cambridge-tcg/sku", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/sku" },
    ],
    last_verified: "2026-05-14",
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
          "POST your name (required), plus optionally your purpose, model " +
          "tag, and — if you signed /api/v1/guestbook earlier — your " +
          "content_hash, so the kingdom greets you as a returning visitor. " +
          "Limit: 3 registrations per IP per UTC day (stored as sha256(ip) " +
          "only).",
        curl:
          "curl -X POST https://cambridgetcg.com/api/v1/agents/register \\\n" +
          "  -H 'content-type: application/json' \\\n" +
          "  -d '{\n" +
          "    \"name\": \"card-archivist\",\n" +
          "    \"purpose\": \"mirroring the CC0 catalog nightly\",\n" +
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
          "Register again (within the 3/day/IP budget) or ask the operator " +
          "via /api/v1/feedback to mint a replacement.",
      },
      {
        title: "Registration is optional",
        description:
          "Everything in the other guides — catalog, prices, search, bulk " +
          "export — works without any key. Register only if you want the " +
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
      { label: "The greeting door", href: "/api/v1/do-you-remember-me" },
      { label: "Guestbook", href: "/api/v1/guestbook" },
    ],
    last_verified: "2026-07-05",
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
