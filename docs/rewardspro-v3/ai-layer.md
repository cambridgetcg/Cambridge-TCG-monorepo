# RewardsPro v3 AI layer: design (2026-10-11, revised after adversarial review)

## Corrections

Every change below was checked against the saved OpenRouter catalogue and endpoint snapshots in `scratchpad/`, local copies of the docs fetched today, and live WebFetch on 2026-10-11 (batch-quickstart, jev-router, limits, and Shopify revenue-share and protected-customer-data). The corrected cost model is at `scratchpad/ai-layer-review/cost_v2.py`.

| # | What was wrong | Evidence | Fix |
|---|---|---|---|
| C1 | **The PB batch profile would be rejected.** The Batch API accepts only `provider.only` and `provider.allow_fallbacks`; it rejects other sync preferences such as `order` and `sort`, so PB's `data_collection` and `require_parameters` must go. The batch `model` is the plain slug, not `…:batch`. Batches are scoped to the workspace, so every key in it, including dev and eval, can read prod batch results. Batch storage is not zero-retention: inputs and results sit in GCS for 30 days | batch-quickstart (local copy and WebFetch) | PB now uses `only` plus account-level data policy. Batches are deleted right after retrieval. Prod gets its own workspace if the account allows it **[U]** |
| C2 | **One moderation 403 could switch AI off for every shop.** The old rule opened the global budget breaker on any 403. In fact 403 also means a guardrail block or flagged input. A spent per-key limit returns **402** with `limit_source: openrouter_key_limit`. 402 `weight_exceeds_budget` cannot be retried. The Decisions API also returns 500 | limits doc (WebFetch); Decisions OpenAPI | Error handling now branches on `error.metadata.limit_source` and `reason`, not on the status code. 500 is retryable |
| C3 | **`allowed_models` does not cap Jev Router spend.** An include list that matches no pool model is ignored, and the router then uses the whole pool. `cost_tier` is "not a per-request price cap" | jev-router doc (WebFetch) | Added a hard `max_tokens`, a check that the served `model` is in the allow-list, and rejection when metadata shows `list_fallback:"models_ignored"`. Still never used for credits |
| C4 | **`/api/v1/systemone` does not document the privacy fields.** Its docs define only TypeSafe's shape (`model`, `state`, `questions`). `provider`, `user`, `session_id` and `trace` are documented only on `/api/alpha/decisions` | typesafe-sdk guide; Decisions OpenAPI | The main privacy controls are now account-level: ZDR per model group and an allowed-providers list. Request fields are a second layer. For Jev, ZDR holds anyway, because its only endpoint (TypeSafe) is on the ZDR list |
| C5 | **Caching claim wrong.** Per-request `zdr` does not turn off response caching; only account-level ZDR does | response-caching doc | Wording fixed. No design impact, because the app uses its own Postgres cache |
| C6 | **Three [U] items are now settled.** `max_price` is in $/M tokens. The `GET /generation` `api_type` enum includes `decisions`. Shopify's Billing API docs confirm the 90%-of-cap webhook, usage charges paired only with 30-day recurring plans, and "purchase credits" as a one-time use case | provider-selection; generation OpenAPI; manual-pricing.md | Tags removed or downgraded |
| C7 | **haiku-5.5 could land on an endpoint without structured outputs.** The Bedrock ZDR endpoints support `response_format` but not `structured_outputs`, and they tie on price with Vertex, so `sort:"price"` could route a json_schema request there. gpt-6-luna has reasoning **on by default** at medium effort | or-zdr.json; catalogue `reasoning` field | Haiku json_schema routes ignore Bedrock. gpt-6-luna always sends effort `none` or `low` |
| C8 | **Subprocessor list incomplete.** It missed Liquid, Upstage and PrimeIntellect, which serve the alt decision routes. Also, DPA §5.2 excludes AI model providers from the 30-day new-subprocessor notice, so the providers behind a route can change without notice | or-zdr.json; DPA 2026-08-26 §5.2 | Each route pins its providers, and an account-level allowed-providers list keeps the published table true |
| C9 | **Shopify fees and the credit price floor.** Shopify takes 0% of the first $1M of lifetime gross app revenue and 15% above that, plus a **2.9% processing fee** on all billing. The old floor counted the OpenRouter fee twice. The old example ($5 per 1,000 credits = $0.005) was below the old formula's own $0.006 floor | shopify.dev revenue-share (WebFetch) | Floor: $0.0043 per credit before $1M lifetime revenue, $0.0063 after. Example changed to $7 per 1,000 |
| C10 | **Cost math errors.** D3 heavy volume (3,000) broke its own cap (2× Free email capacity = 2,000). The fee was counted twice on credits in the Free worst case. Grow COGS used a different method from the other plans. "One Grow subscriber covers ~350 typical shops" actually used the 85/15 mix (≈670 all-typical shops). The eval had 10 decision tasks, not 9, and the Sonnet G4 cost used G1's token sizes | cost.py re-run (cost_v2.py) | Heavy shop $0.287 (was $0.309). Mix $0.079 per shop (was $0.082). $50 now covers ~630 shops. Grow $1.88. Eval ≈ $11 |
| C11 | **Four places where a free feature depended on AI, plus a budget risk.** (a) A D1 hold could leave a shopper's cashback stuck if the merchant never reviews it. (b) D10 "auto-award up to the merchant's limit" let AI change a balance. (c) D8 could block a merchant's own copy. (d) Widget translation (G2a) had no free path. Also, Free shops could use up the global budget and starve paid credits | 07-23 decision ("core earning… not paid gates"); invariant 2 | Holds auto-release after a deadline. D10 is suggest-only. D8 checks AI drafts only. A manual translation path is free. Budget pools are split by plan |
| C12 | **Privacy gaps.** (a) Banded per-shopper state is pseudonymised personal data, not "PII-free". (b) `customers/redact` cannot find rows that have no subject ref. (c) `customers/data_request` did not include AI records. (d) Shopify Level 1 requires letting customers opt out of automated decisions with significant effects. (e) D3 needs marketing consent and an Art. 21 objection path. (f) G3 aggregates over tiny groups can identify people | shopify.dev protected-customer-data (WebFetch); rp-synthesis §6a | `subject_ref` added. AI records go into data requests. Per-shopper opt-out added. Consent checked in code. Counts below 5 suppressed |
| C13 | **Minor facts.** (a) Only the JS SDK's 0.6.0 had breaking changes; 0.7.0 is the Python SDK. (b) OpenRouter gives Jev a 32k window (endpoint `max_prompt_tokens` 32,000). (c) The clef-flash ZDR endpoint has 16k context. (d) The vendor advises an `other` / `none of the above` option; uncertainty comes from the probabilities, not from an "uncertain" option. (e) Choice and Score `confidence` and `probabilities` are optional in the response schema. (f) sonnet-4.6 does have ZDR endpoints. (g) Two cheaper ZDR decision models were missing ($0.02/M). (h) microsoft-decision-1 is 2 days old | Decisions OpenAPI; TypeSafe primitives; or-zdr.json; decisions listing | Each point is fixed where it appears |
| C14 | **LLM fallbacks cannot fit inline deadlines.** D8 has 1 s and D9 has 1.5 s, and gpt-oss-safeguard always reasons | catalogue `reasoning.mandatory:true` | Inline chains are Jev → alt → rule. LLM emulation is used only in async tasks |

---

**Status:** this is a design only. No paid or authenticated call was made, so every route below is a candidate until Yu approves the smoke test and the eval budget (section 6). Prices come from the OpenRouter catalogue snapshot of 2026-10-11, checked against the ZDR endpoint list. Tags: **[A]** = assumption, **[U]** = unverified.

## 0. Corrections to the brief and the research tracks

| # | Brief or research said | What the evidence shows | Effect on the design |
|---|---|---|---|
| 1 | Only `typesafe/jev-router` is on OpenRouter | The raw Jev model, `typesafe/jev-1.13` (alias `~typesafe/jev-latest`), is served at `POST /api/v1/systemone` (TypeSafe-native shape) and at `POST /api/alpha/decisions`. There are 19 decision models in total, and none appears in the default `/api/v1/models` listing; you need `?output_modalities=decisions` or `=all` | decide() uses the existing OpenRouter key. No TypeSafe account is needed |
| 2 | Track 3 used `google/gemini-2.5-flash-lite` as a fallback | Its catalogue `expiration_date` is 2026-10-20, and the same applies to gemini-2.5-flash | Excluded from every route |
| 3 | Track 3 made `/api/alpha/decisions` primary | It is labelled alpha. `/api/v1/systemone` has the same billing and the same core shape (`model`, `state`, `questions`), and the same code works against `api.typesafe.ai`. Only the alpha path **documents** `provider`, `user`, `session_id` and `trace` (C4) | Primary is `/api/v1/systemone`. Privacy is enforced at account level. The smoke test checks whether `/systemone` accepts the extra fields; if it does not, decide() switches to the alpha path behind the same interface |
| 4 | Jev Router is billed at the routed model's price | Track 1 cites the FAQ. The docs page has no pricing section, the catalogue shows `-1`, and the public endpoints list is `[]` **[U]**. Its include list does not limit spend (C3) | Not used for anything that consumes credits until a paid call shows `usage.cost` |
| 5 | Credits will be sold as a usage line item | Shopify App Pricing, the default for new public apps, has **no usage caps and no one-time purchases**. The Billing API supports both, but the 2026-07-23 decision says paths that create new usage records must stay disabled | Phase 1 is allowances bundled into fixed plans (section 4) |
| 6 | Every answer type has a confidence | Noul returns only `noul` (P(yes)) and no confidence. On Choice and Score, `confidence` and `probabilities` are optional in the schema | Noul bands use p only. If confidence is missing, band() derives it from the probabilities; if those are missing too, the band is `review` |
| 7 | `require_parameters:true` everywhere | It drops endpoints that lack any parameter in the request. No `mistral-small-3.2` endpoint lists `reasoning`, so a request that sets `reasoning` would have no endpoint left (documented behaviour; the smoke test confirms it) | Fallback chains run in the app, with one parameter profile per model (section 2) |

---

## 1. Architecture

### 1.1 Shape

```
Shopify webhook ─► inbox (ack < 5 s, NO AI) ─► worker ─┐
Admin action (merchant click) ─► app server ───────────┤   storefront / app proxy: never calls AI
Scheduler (daily / weekly) ────────────────────────────┤
                                                       ▼
                       app/ai/  (server-only module, keys never reach the browser)
  decide(task, input, shop) ─────────────────────────────────────────────────────────
    consent/opt-out gate (code) → spec.buildState() → identifier-free, banded features
    → cache lookup → budget.reserve(pool)
    chain: 1 typesafe/jev-1.13   POST https://openrouter.ai/api/v1/systemone
           2 alt System One model (own tuned thresholds; eval winner, not assumed)
           3 LLM json_schema emulation → calibrated:false (suggest-only; ASYNC tasks only)
           4 spec.rule(input)  ← the free feature; always available, never fails
    → band() → DecideResult{source, calibrated, band, answer, costMicros}
  generate(task, input, shop) ───────────────────────────────────────────────────────
    redact() → budget.reserve(credits, pool) → chain of pinned chat models (app-side)
    validators: JSON schema · placeholder whitelist · number grounding · decide(D8)
    → else spec.static() (template library / templated digest)
  shared: retry · deadline · circuit breaker · ledger (ai_call, ai_credit_ledger) · redaction
                                       │
          OpenRouter (prod keys per budget pool, each with a monthly limit; one invoice)
         /api/v1/systemone      /api/v1/chat/completions      Batch API (/api/v1/batches)
```

### 1.2 Module layout (proposal)

| Path | Role |
|---|---|
| `app/ai/index.server.ts` | Public API: `decide()`, `generate()`, `aiStatus(shop)` |
| `app/ai/tasks/<id>.ts` | `TaskSpec` with `id`, `engine`, `buildState`, `questions`, `schema`, `bands`, `rule()`/`static()`, `credits`, `optInKey`, `subjectScoped` (true for D1, D2, D3, D10) |
| `app/ai/routes.ts` | Typed route table, versioned (`routeVersion`). Each model has a pinned price table and a pinned provider list (C8), used for the budget pre-flight |
| `app/ai/providers/` | `openrouter-systemone.ts`, `openrouter-decisions-alpha.ts` (fallback shape, C4), `typesafe-direct.ts` (configured, off), `openrouter-chat.ts`, `openrouter-batch.ts`, `llm-decision-emulator.ts` |
| `app/ai/policy/` | `retry.ts`, `breaker.ts`, `budget.ts` (per shop, per pool and global), `redact.ts`, `validate.ts`, `consent.ts` (marketing consent and AI opt-out, C12) |
| `app/ai/ledger.server.ts` | Writes `ai_call`, `ai_decision`, `ai_credit_ledger`, `ai_reservation` |
| `app/ai/eval/` | Fixtures and runner (CLI; uses the eval key; never in the request path) |

Client: a thin `fetch` wrapper with zod schemas that mirror the documented request and response. Why not `@typesafe-ai/sdk`: it is still 0.x, and JS v0.6.0 (2026-09-15) broke `Score.criteria` (C13; the 0.7.0 break was in the Python SDK). Its `models.list()` also fails against OpenRouter, and its default per-attempt timeout is 10 s. If the SDK is used anyway, pin an exact version.

### 1.3 Contracts

```ts
type DecideResult<T> = {
  task: TaskId; source: 'jev'|'alt-decision'|'llm'|'rule'|'cache';
  calibrated: boolean;            // true only for decision models with thresholds tuned for that exact model id
  band: 'act'|'review'|'none';    // consumers act on band, never on raw p
  answer: T; model?: string;      // e.g. response model "typesafe/jev-1.13-20260917"
  costMicros: number; latencyMs: number; callId: string;
};
interface DecisionProvider  { id: string; decide(r: SystemOneRequest, o: CallOpts): Promise<SystemOneResponse> }
interface GenerationProvider{ id: string; generate(r: ChatRequest, o: CallOpts): Promise<ChatResult|AsyncIterable<Delta>> }
```

band(): for Choice and Score, use `confidence` when present; otherwise compute it from `probabilities`; if both are missing, return `review` (C13). For Noul, use p only.

Example decide request (D1):
`POST https://openrouter.ai/api/v1/systemone`
```json
{"model":"typesafe/jev-1.13",
 "state":{"order_risk":"LOW","subtotal_band":"£50-100","discount_share":"none","refund_ratio_90d":"high (>=30%)","orders_24h":"3 (unusual)","account_age":"<7 days"},
 "questions":{"risk":{"type":"score","instructions":"How likely is this order cashback farming?","criteria":["normal repeat buyer","…","almost certainly cashback farming"]}},
 "provider":{"zdr":true,"data_collection":"deny"},"user":"<hmac(shop_id)>","session_id":"<event id>"}
```
On `/systemone`, OpenRouter documents only `model`, `state` and `questions`; the extra fields are tested in the smoke test (C4). Privacy must not depend on them.

### 1.4 Reliability policy

| Concern | decide() | generate() |
|---|---|---|
| Per-attempt timeout | 1.5 s. OpenRouter's own platform-wide measurement for Jev: p50 198 / p95 305 / p99 387 ms over 1,937,162 requests in 30 min. That is all customers, not our network path | Interactive: first token 5 s, total 30 s. Batch: 24 h window |
| Attempts | 2 on the same model, then the next link in the chain | 1 retry per model, then the next model |
| Retry on | 429, 500, 502, 503, 524, 529, network errors, and 402 with `limit_source=openrouter_in_flight_budget` (reason `in_flight_budget_exhausted`). Honour `Retry-After`; jittered exponential backoff from 200 ms to 2 s (C2) | Same |
| No retry; branch on `error.metadata` (C2) | 400/422: schema bug, alert. 401: key problem; alert and open the global breaker. 402 with `limit_source` `openrouter_key_limit` or `openrouter_credits` (balance), or 403 with a budget `limit_source` (`openrouter_guardrail_budget`, `openrouter_workspace_budget`, `openrouter_key_limit`): open **that pool's** budget breaker, so that pool degrades to rules. 402 `weight_exceeds_budget`: shrink the request or use the rule; no breaker. 403 for moderation or a guardrail block: fail that one request to the rule or static result and log it; **no breaker**. 404: route is stale, alert. 413: trim the state | Same |
| Breaker | Per (provider, model). Opens on 5 consecutive failures, or ≥20% failures across the last 50 calls within 60 s. Half-open probe after 30 s | Same |
| Task deadline | D1 4 s, D3 batch, D8 1 s inline, D9 1.5 s inline. Inline chains are Jev → alt → rule; LLM emulation is skipped (C14). On expiry the rule result is returned | Interactive 30 s, then a static template |
| Concurrency | Worker pool of 8. The OpenRouter cookbook ran 8 workers with no 429s | Pool of 4 |
| Cache | Key = (task, routeVersion, sha256(state+questions)) in Postgres. D5 is cached by product content hash. OpenRouter response caching does not cover Decisions. It is turned off by account-level ZDR, but per-request `zdr` does not affect it (C5) | Drafts are stored. Regenerating is a new metered call |

### 1.5 Invariants (each enforced by tests)

1. **The free feature never depends on AI.** CI runs the full suite with `AI_KILL=1` and a provider stub that throws. Every non-AI test must pass, and every TaskSpec must return `rule()`/`static()`. The following also hold (C11):
   - A shopper's earning never waits on a merchant reviewing an AI flag indefinitely. Holds auto-release after a deadline (D1).
   - Merchant-authored copy is never blocked by AI (D8).
   - Every AI-assisted setup step has a manual free path (G2a, G4).
2. **AI suggests, code acts.** No AI output moves money or changes a balance or tier. The strongest adverse effect any AI result may have is a **time-boxed hold** that goes to merchant review (D1). AI may not deny, claw back or award (D10 is suggest-only, C11). Cashback maths, clawback execution, tier evaluation, dates, raffle RNG and GDPR jobs contain no AI.
3. **Only calibrated sources automate.** Only `source ∈ {jev, alt-decision}` with thresholds tuned for that model id can produce `band=act`. LLM emulation and rules can only produce `review` or `none`. For D1 and D2, `act` means "hold for review", never more.
4. **No AI in the webhook acknowledgement path**, because Shopify gives 5 s.
5. **State hygiene, following Jev's own weak-spots page:**
   - Numbers and dates are reduced to labelled bands in code.
   - The conservative option goes first in every Choice. Thresholds are tuned with that production order fixed, and the eval measures sensitivity to option order, since the vendor reports a lean toward the first option.
   - Every Choice whose options may not cover the input includes `none_of_these`, as the vendor advises. "Uncertain" is not an option; uncertainty is read from the probabilities and confidence, which put a case in the `review` band (C13).
   - States stay minimal (to avoid "context rot").
   - Shopper text is fenced and labelled as untrusted.
6. **Pin `typesafe/jev-1.13`, never `~jev-latest`.** A version bump means re-running the eval and re-tuning the bands.
7. **Consent and opt-out are code, not AI (C12).** Before any per-shopper decision, the app checks marketing consent (D3) and the shopper's AI opt-out flag (D1, D2, D3, D10). Opted-out shoppers get only the rule path.

### 1.5a Jev via OpenRouter or TypeSafe direct

| | Via OpenRouter `/api/v1/systemone` (**primary**) | TypeSafe direct `api.typesafe.ai/v1/systemone` (configured, off) |
|---|---|---|
| Account | Existing OpenRouter key | New account (typesafe.ai still says "early access") |
| Price | $0.042/M input, output free. Plus 5.5% on credit purchases (Standard) | $0.042/M. Billing terms **[U]** |
| ZDR | Jev's only endpoint (TypeSafe) is on the ZDR list, so ZDR holds by routing. Account-level ZDR per model group is the enforcement. The request field is documented on the alpha path only (C4) | Enterprise only |
| Context | 32k tokens on OpenRouter (state + questions; endpoint `max_prompt_tokens` 32,000) | 64k per request; 32k for state plus the longest question |
| Rate limits | Upstream limits pass through; the per-customer limit is undocumented **[U]** | 100k tokens/s, 80 rps ("dynamic") |
| Failover | Alternative System One models on the same key | None |
| Switch cost | Change base URL and key only (same core request shape) | — |

Go direct only if OpenRouter rate limits bite, or if TypeSafe enterprise ZDR or pricing beats it.

---

## 2. Route table

### 2.1 Price legend (USD per M tokens, input/output, ZDR endpoints only, 2026-10-11)

| Model id | ZDR endpoints (structured outputs for LLMs) | $/M in / out | Notes |
|---|---|---|---|
| `typesafe/jev-1.13` | typesafe (1 provider) | 0.042 / 0 | 32k on OpenRouter; not EU-eligible; created 2026-09-18 |
| `microsoft/microsoft-decision-1` | azure | 0.042 / 0 | System One; context 32k; **created 2026-10-09** [A: immature] |
| `liquid/d1` | liquid | 0.04 / 0 | System One; context 64k |
| `upstage/solar-decide` | upstage/zdr | 0.05 / 0 | System One; context 524k |
| `cloudflare/clef-flash` | primeintellect | 0.038 / 0 | System One; **16k context on the ZDR endpoint** (C13) |
| `perplexity/pplx-decider-v1.1-27b` | perplexity | 0.02 / 0 | System One; context 262k; eval candidate only (C13) |
| `inception/mercury-decide` | inception | 0.02 / 0 | System One; context 64k; eval candidate only (C13) |
| `anthropic/claude-haiku-5.5` | google-vertex global / europe / us. Bedrock ZDR endpoints list `response_format` but **not** `structured_outputs` (C7) | 0.10 / 0.50 (EU/US 0.11 / 0.55) | Reasoning optional, default effort medium, so set it off or low. Created 2026-10-07 |
| `anthropic/claude-haiku-5.5` via Batch API | provider per batch (`only`) | 0.05 / 0.25 (`:batch` variant price) | Submit with the plain slug (C1) |
| `openai/gpt-6-luna` | azure, azure/eu, azure/us | 0.10 / 0.50 (EU/US 0.11 / 0.55) | Reasoning **on by default** (medium); send effort `none` (C7) |
| `openai/gpt-6-luna` via Batch API | — | 0.05 / 0.25 | |
| `mistralai/mistral-small-3.2-24b-instruct` | deepinfra, parasail, venice, mistral/eu (4/4 with structured outputs) | 0.075–0.10 / 0.20–0.30 | No reasoning, so latency and cost are predictable; EU-eligible (mistral/eu has 32k context) |
| `openai/gpt-oss-safeguard-20b` | groq | 0.075 / 0.30 | Mandatory reasoning; safety classifier; async only (C14) |
| `meta-llama/llama-guard-4-12b` | deepinfra | 0.18 / 0.18 | No structured outputs |
| `google/gemini-3.1-flash-lite` | vertex (5 endpoints) | 0.25 / 1.50 (flex 0.125 / 0.75) | Above PG's `max_price`; eval runs it under its own profile |
| `anthropic/claude-sonnet-4.6` | bedrock and vertex ZDR endpoints exist | 3 / 15 | Old app's model; eval reference only |

### 2.2 Provider preference profiles

Base layer for every profile (account settings, C4/C8):
- ZDR enforced for every model group except where Batch needs it off **[U]**.
- An allowed-providers list equal to the providers on the prod routes.
- Input & Output Logging off.

| Profile | `provider` object | Used by |
|---|---|---|
| **PD** | `{"zdr":true,"data_collection":"deny"}`, plus `user`=HMAC(shop_id) and `session_id`=event id. Second layer only: these fields are documented on `/api/alpha/decisions`, and whether `/systemone` accepts them is **[U]** | All decide() calls |
| **PG** | `{"zdr":true,"data_collection":"deny","require_parameters":true,"allow_fallbacks":true,"sort":"price","max_price":{"prompt":0.15,"completion":0.75}}`. `max_price` is in $/M tokens (verified, C6) and stops silent routing to pricier endpoints. For haiku-5.5 add `"ignore":["amazon-bedrock"]` so json_schema requests land on an endpoint with structured outputs (C7; the smoke test confirms the slug) | Interactive json_schema generation |
| **PB** | `{"only":["<batch provider confirmed in smoke test>"],"allow_fallbacks":false}`. The Batch API accepts no other provider preferences. Data policy comes from account settings. Batch storage is **not** zero-retention: OpenRouter keeps inputs and results in GCS for 30 days, and upstream retention varies. Payloads contain no personal data. Delete each batch immediately after retrieval. Batches are workspace-scoped, so prod gets a separate workspace if available **[U]** (C1) | Batch API |

How chains run: one model per request, each with its own parameter profile (reasoning, temperature where the model supports it, `response_format`). haiku-5.5 and gpt-6-luna do not list `temperature`. OpenRouter handles endpoint failover inside a model. Use OpenRouter's `models` array only where the eval shows every model in it accepts the same parameters.

### 2.3 decide() routes

Engine: Jev, pinned, through PD. "Alt" means a System One model with its own tuned bands; the eval picks it per task. microsoft-decision-1 is 2 days old, so it is not the assumed default. "LLM" means `mistral-small-3.2` json_schema emulation with `calibrated:false`, used in **async tasks only** (C14). Costs assume $0.042/M.

| ID | Task (trigger) | Questions | Alt / LLM | Rule fallback (free) | Tokens in | $/call | Latency budget, mode | Volume per shop per month (typical–heavy) **[A]** |
|---|---|---|---|---|---|---|---|---|
| D1 | Cashback-abuse risk (orders/paid, worker, before the PENDING credit is released) | Score, 5 levels | eval winner / LLM suggest-only | Shopify `riskLevel=HIGH` or a per-customer daily cap → hold for review. **Every hold, AI or rule, auto-releases after N days (merchant-set, default 7) unless the merchant rejects it (C11).** Opted-out shoppers get only the rule path | 600 | 0.000025 | 4 s, async | 250–1,000 |
| D2 | Refund-pattern flag (refunds/create) | Noul | eval winner / LLM | Merchant's clawback policy, no flag | 450 | 0.000019 | 5 s, async | 10–60 |
| D3 | Send this nudge now? (daily batch after the segment rules) | Noul per candidate | eval winner / none | Eligible **and marketing-consented (code)**, not emailed for N days, under email capacity | 400 | 0.000017 | batch | 800–2,000; candidates capped at 2× remaining email capacity (Free = 1,000 emails, so ≤2,000) (C10) |
| D4 | Campaign template and segment (weekly, or "Smart create") | 2× Choice in one request | eval winner / LLM (weekly run only) | Fixed priority order: 10 > 9 > 8 > 7 > 6 | 1,200 | 0.000050 | 2 s interactive | 5–30 |
| D5 | Product cashback class (install backfill, products/*) | Choice: 6 options including `none_of_these` | eval winner / LLM | `gift_card` flag, tier product, manual exclusion list | 350 | 0.000015 | batch; cached by content hash | 20–200, plus a one-off backfill of 400–3,000 |
| D6 | Tier-ladder tie-break (onboarding) | Choice over 2–4 ladders precomputed in code | — / gpt-6-luna | Default percentile ladder | 1,500 | 0.000063 | 3 s | 1–3 |
| D7 | Anomaly severity (nightly reconciliation) | Score, 4 levels | eval winner / — | Threshold alert | 450 | 0.000019 | batch | 5–30 |
| D8 | Copy safety and claim check (**AI drafts only**: after G1, G2, G4; before save, send or publish) | Noul + Choice(5) | eval winner / — inline; gpt-oss-safeguard only in async eval (C14) | Lint: unknown placeholders, unsubscribe link, length, banned terms. Merchant-authored copy gets only this lint and is never blocked by AI (C11) | 1,500 | 0.000063 | 1 s inline | 10–60 |
| D9 | Help routing and groundedness (paired with G5) | Choice(3) + Noul | eval winner / — inline | Show doc search links | 6,500 | 0.000273 | 1.5 s | 3–20 |
| D10 | *Optional:* REVIEW / SOCIAL_SHARE mission evidence (only if missions are kept) | 2× Noul | eval winner / — | Manual approval queue. **AI only sorts the queue; no auto-award (C11)** | 700 | 0.000029 | async | 20–200 |

Not routed to AI: inbound email bounces and suppressions. Use SendGrid's structured event webhook, which is deterministic. Classifying human replies is deferred.

### 2.4 generate() routes

| ID | Task | Primary (pinned) | App-side chain → static fallback | Profile | max_tokens | Tokens in/out (est.) | $/call | Latency | Credits |
|---|---|---|---|---|---|---|---|---|---|
| G1 | Campaign email copy and subject lines (json_schema: 5 subjects ≤50 chars, preview, blocks, `placeholders_used`) | `anthropic/claude-haiku-5.5`, reasoning off (low adds output tokens) | `openai/gpt-6-luna` (effort none) → `mistralai/mistral-small-3.2-24b-instruct` → template library and QUICK_PROMPTS | PG (+ignore bedrock) | 1,200 | 2.5k / 0.9k | 0.00070 + D8 0.00006 | First token ≤2 s, total ≤15 s, streamed | 1 |
| G2a | Widget locale pack (key→string map plus glossary) | Batch API, model `anthropic/claude-haiku-5.5` (C1) | Batch `openai/gpt-6-luna` → interactive haiku-5.5 → default locale. **Free path: every widget string is translatable and merchant-editable in-app; AI only pre-fills (C11)** | PB | 6,000 per chunk | 5k / 5k | 0.0015 | ≤24 h | 2 per locale |
| G2b | Email translation (one campaign, one locale) | `anthropic/claude-haiku-5.5` | gpt-6-luna → mistral-small-3.2 (EU languages) → send in the default locale | PG (+ignore bedrock) | 2,500 | 1.5k / 1.5k | 0.0009 | ≤20 s | 1 per locale (≤1.2k output; 2 credits above that, matching the credit definition in 4.1) |
| G3 | Weekly insight (aggregates only; number-grounding check; **counts below 5 suppressed**, C12) | Batch API, model `anthropic/claude-haiku-5.5` | Batch gpt-6-luna → templated numeric digest | PB | 900 | 3k / 0.7k | 0.000325 | Hours (Monday batch) | 0 (included; analytics is free on every plan) |
| G4 | Onboarding config (json_schema; integer money; monotonic thresholds; uses D5 and D6) | `anthropic/claude-haiku-5.5`, effort low (adds reasoning tokens to output) | gpt-6-luna (effort low) → default 3-tier template | PG (+ignore bedrock) | 2,500 | 5k / 2k | 0.0015 (+ reasoning) | ≤20 s | 0 (included) |
| G5 | Help answer from docs (RAG over llms-full.txt; citations) | `anthropic/claude-haiku-5.5` | gpt-6-luna → mistral-small-3.2 → doc links | PG (+ignore bedrock) | 800 | 6k / 0.6k | 0.0009 + D9 0.00027 | ≤8 s | 0 (rate-limited). **Blocked until the docs are corrected** |

### 2.5 `typesafe/jev-router` or pinned models

| Use pinned models when | Consider jev-router only when |
|---|---|
| Anything that consumes credits (needs a known cost per credit) | Free-form G5 help answers, where difficulty varies widely, and only after **all** of these: (1) the workspace allows routers. (2) One paid call shows `usage.cost` equals the routed model's price only. (3) The request carries `plugins:[{id:"jev-router",cost_tier:"low",allowed_models:[haiku-5.5, gpt-6-luna, mistral-small-3.2]}]` and a hard `max_tokens`. (4) `X-OpenRouter-Metadata: enabled` is logged, and **any response whose `model` is outside the allow-list, or whose metadata shows `list_fallback:"models_ignored"`, is counted as a fault and switches G5 back to pinned haiku** (C3). (5) It beats pinned haiku in eval |
| Strict json_schema tasks (G1–G4), because a variable model makes validator pass rates unstable | Internal ops tooling (not the product) |
| Any EU in-region need (routers return 400 under regional routing) | **Never** for decisions: it returns chat text, not typed answers |

---

## 3. Privacy and GDPR

### 3.1 What may go into AI payloads

Per-shopper state is **pseudonymised personal data**, not anonymous: it describes one identifiable shopper whom the app can re-link. UK GDPR applies to it in full (C12).

| Data class | Allowed? | Rule |
|---|---|---|
| Shopper name, email, phone, address, IP, customer or order GIDs, order numbers | **Never** | Join locally. Question ids (never sent to the model) carry local refs |
| Shopper behaviour (counts, ratios, days-since, amount bands) | D1–D3 only, banded | Per-shop opt-in, plus a per-shopper opt-out (3.4). Derived from Shopify protected customer data; declare the purpose to Shopify **[U]** |
| Shopper-authored text (D10 reviews and posts) | Only if missions verification is on | Regex-scrub emails, phones, URLs and handles. Names cannot be reliably scrubbed, so disclose this. Truncate to 1,000 chars; fence as untrusted; suggest-only |
| Merchant-typed text (instructions, goals, help questions) | Yes | Scrub emails, phones and order numbers; help capped at 512 chars |
| Catalogue (titles, types, tags), shop aggregates, programme config | Yes | Business data; no row-level customer data; aggregate counts below 5 are suppressed |

### 3.2 Settings

| Where | Setting |
|---|---|
| OpenRouter account | Input & Output Logging OFF. 1% data-sharing discount OFF. Broadcast in Privacy Mode only. **Account-level ZDR per model group** (in privacy settings, documented with no plan restriction) for every model group; it turns off OpenRouter response caching, which is not used. Check Batch compatibility in the smoke test **[U]**. Account-level **allowed providers** = the providers on prod routes (C8). Guardrail-based ZDR is optional. Only data-region guardrails need Business |
| Every request | PD / PG / PB as in 2.2. `user` = HMAC(shop_id), so no shop domain leaves the app; OpenRouter also hashes it before sending upstream. `trace` metadata carries no personal data |
| Workspaces | Prod keys in their own workspace, because batches and their results are visible to every key in a workspace (C1). If the account cannot create workspaces, delete batches on retrieval and keep eval and dev on synthetic data only **[U]** |
| Residency | Jev and every decision model are **not EU-eligible**. EU-eligible LLMs include haiku-5.5, gpt-6-luna, gpt-5-nano and mistral-small-3.2. EU in-region routing needs the Business plan (8% fee). For shops that demand EU-only processing: decisions fall back to rules (inline) or EU-eligible LLM emulation (async), and generation uses EU-eligible models. This is Yu's decision |

### 3.3 Contracts and the subprocessor list

- Accept the OpenRouter DPA (updated 2026-08-26; SCCs 2021/914 plus UK Addendum; 72 h breach notice). Business provides a signed copy.
  - §2.4(b): ZDR eligibility is the provider's own representation, not OpenRouter's guarantee.
  - §5.2: AI model providers are excluded from the 30-day notice of new subprocessors, so the provider set behind a model can change without notice. Hence the pinned provider lists in `routes.ts` and the account allowed-providers list (C8).
- The TypeSafe DPA (2026-04-24) is only needed if the direct path is enabled.
- Update the privacy-policy subprocessor table (policy dated 2026-07-23), per obligation 6a. Generate the table from `routes.ts` so it cannot drift:
  - Add OpenRouter, Inc. (US, AI gateway).
  - Add, "via OpenRouter, ZDR endpoints only" for the prod routes: TypeSafe (US, decisions), plus whichever alt decision providers win the eval: Microsoft Azure, Liquid, Upstage, PrimeIntellect (C8). For generation: Google Cloud Vertex AI, Microsoft Azure, DeepInfra, Parasail, Venice, Mistral, and Groq only if gpt-oss-safeguard ships.
  - Remove the Bedrock / AWS-AI entry when the old assistant is retired. Haiku routes ignore Bedrock.
  - Under the DPA these are OpenRouter's subprocessors (that is, our sub-processors). List them anyway.
- UK GDPR:
  - Transfer risk assessment for US transfers.
  - Legitimate-interest assessment for D3 (marketing), plus an Art. 21 objection path: shoppers opted out of marketing are excluded in code (C12).
  - Short DPIA for D1, D2 and D10 (profiling).
  - Art. 22 posture: no solely automated decision with a significant effect. The only adverse AI effect allowed is a time-boxed hold that auto-releases (1.5 invariant 2). This is not legal advice **[U]**.
- Shopify protected customer data, Level 1 (verified 2026-10-11):
  - Data minimisation, purpose limitation and transparency to merchants.
  - Retention periods.
  - "If you use personal data for automated decision-making and those decisions might have legal or significant effects… you must allow customers to opt out." This is met by the per-shopper opt-out (3.4).
- In-app disclosure per AI feature, plus a docs page "How RewardsPro uses AI".

### 3.4 Per-shop opt-in and per-shopper opt-out

| Switch | Default | Covers |
|---|---|---|
| `ai.assist` (merchant-initiated; no customer data) | ON | G1, G2, G4, G5, D5, D6, D8, D9 |
| `ai.insights` (aggregates only, small counts suppressed) | ON, can be disabled | G3, D4, D7 |
| `ai.customerDecisions` (per-shopper behaviour) | **OFF**, explicit opt-in with disclosure | D1, D2, D3, D10 |
| Per-shopper `aiDecisionsOptOut` (new, C12) | Off. Settable by the merchant on request, or by the shopper via the customer-account block | D1, D2, D3, D10 use only the rule path for that shopper |
| Per-task mode | `shadow` → `suggest` → `auto` | `auto` only after the merchant approves the policy, only for calibrated sources, and for D1/D2 only as a time-boxed hold |

### 3.5 Logging, retention, redaction

- **App logs and Sentry:** never log state, prompts or completions. Log `callId`, task, model, tokens, cost, latency, status and error code. Sentry `beforeSend` strips `ai.*` payloads, and Replay is masked on AI editor pages.
- **`ai_decision`:** banded feature vector, answer and `subject_ref` = HMAC(shop secret, customer_id) for subject-scoped tasks (C12). Kept 90 days.
- **Eval-set promotion:** only after removing `subject_ref` and checking that no feature combination is unique within the shop. Otherwise the row stays personal data and is covered by redaction. Kept 12 months.
- **`ai_call`:** cost and billing record, 13 months.
- **Drafts:** stored as merchant content.
- **`customers/data_request`:** include that subject's `ai_decision` rows: task, answer, band, date and the features sent (C12).
- **`customers/redact`:** delete `ai_decision` rows by `subject_ref`, including any not-yet-anonymised eval rows.
- **`shop/redact`:** delete all `ai_*` rows except pseudonymised billing aggregates. Delete any OpenRouter batches still held.

---

## 4. Metering and AI credits

### 4.1 Units

- **Internal unit:** store `usage.cost` at full precision (numeric). `cost_usd_micros = round(usage.cost × fee factor × 1e6)`. The fee factor is 1.055 on Standard (card) and 1.08 on Business. `usage.cost` excludes the credit-purchase fee. Applying the factor before rounding avoids a ±3% rounding error on ~15-micro decisions.
- **Merchant unit: 1 AI credit** = one merchant-initiated content generation of standard size (≤3k input, ≤1.2k output tokens).
  - Internal COGS budget per credit: ≤ **$0.002** at P95, **including** the D8 check and the OpenRouter fee. The fee is not applied again downstream (C9).
  - Measured P50 estimate: about $0.0008.
  - Reasoning tokens count as output, so G-routes keep reasoning off unless the eval proves it is worth the cost.
- Credits are spent **only** on G1 and G2. G3, G4, G5 and every decision are included under fair-use caps, because decisions cost about $0.00002 each and metering them would be nickel-and-diming.

### 4.2 Cost capture

1. **Pre-flight:** estimate = (estimated input tokens × price in + max_tokens × price out) × fee factor, from `routes.ts`. Reserve it against (a) the shop's monthly credits or decision-token budget, (b) the shop's plan pool and (c) the global budget. If any is short, return the fallback and show "resets on <date>".
2. **Call.** Read `usage.cost`, tokens, the served `model`, `provider` and `id`.
3. **Settle:**
   - Write `ai_call` and the `ai_credit_ledger` debit (idempotency key = callId).
   - Release the unused part of the reservation.
   - If `usage.cost` is missing (it is optional in the schema), estimate it from the table, set `estimated=true`, and alert if this happens on more than 1% of calls.
4. **Nightly reconciliation:** compare Σ `ai_call` against OpenRouter key usage, plus a sample of `GET /api/v1/generation?id=`. Its `api_type` enum includes `decisions`, so it very likely returns decision ids; the smoke test confirms (C6). Alternatively use a Broadcast webhook in Privacy Mode; its `totalCost` includes per-request fees but not the credit-purchase fee. Alert on drift above 2%.

### 4.3 Caps and budgets

| Layer | Mechanism | Proposed value |
|---|---|---|
| Global hard ceiling | Two prod inference keys, each with `limit` + `limit_reset:"monthly"`: **`prod-free`** (Free shops) and **`prod-paid`** (paid shops and purchased credits). When a budget error comes back (402/403 with a budget `limit_source`, C2), that pool's breaker opens and the pool uses rules. Free usage can no longer starve credits that were paid for (C11) | **$50/mo total** until revenue: $35 free and $15 paid **[A]**. Staging $5, dev $2, eval $15 (expires in 30 days). The management key stays offline and has an expiry |
| Global soft | App-side budget per pool: alert at 80%, degraded mode at 100% | Same as the key limits |
| Per shop | Plan allowance (4.4) plus burst limits: 10 generations/min, and a share of decision-worker concurrency | — |
| Per task | D3 candidates ≤ 2× remaining email capacity; D5 cached; G5 20/mo on Free | — |
| Float | Keep the OpenRouter balance at ≥$15, because low balances trigger in-flight 402s and extra latency. Top up in chunks of $15 or more: below $14.55 the $0.80 minimum fee exceeds 5.5%. Auto top-up is available. Credits may expire one year after purchase, so keep the float small. Whether batch spend counts against the per-key limit is **[U]** | — |

### 4.4 Allowances by plan (features unlimited; exhaustion means the deterministic fallback)

Worst-case COGS = credits × $0.002 (fee included), plus (decision tokens × $0.042/M + 5% LLM fallback + help answers × $0.00117) × 1.055 (C10, one method for every plan).

| Plan (07-23 catalogue) | Generation credits/mo | Decision fair-use (tokens/mo ≈ decisions) | Help answers/mo | Worst-case COGS/mo |
|---|---|---|---|---|
| Free Forever | 50 | 2M (≈4k) | 20 | ≈ $0.23 |
| Grow $29 | 500 | 15M (≈30k) | 100 | ≈ $1.88 |
| Scale $79 | 2,000 | 40M (≈80k) | 300 | ≈ $6.38 |
| Corporate $499 | 10,000 | 150M (≈300k) | 1,000 | ≈ $28.79 |

**Price floor for any paid credit (C9):** price per credit ≥ COGS_P95 / (1 − Shopify deductions − target margin). COGS already includes the OpenRouter fee. Shopify deductions are the 2.9% processing fee plus revenue share: 0% on the first $1M of lifetime gross app revenue, 15% after.

| Shopify revenue stage | Deductions | Floor at 50% margin | $5 per 1,000 credits: margin at P95 / P50 | $7 per 1,000 credits: margin at P95 |
|---|---|---|---|---|
| Before $1M lifetime | 2.9% | $0.0043 | 57% / 80% | 69% |
| After $1M lifetime | 17.9% | $0.0063 | 42% / 65% (below target) | 54% |

Recommendation: price packs at ≥ $7 per 1,000 credits.

### 4.5 Mapping to Shopify billing

| Option | Billing API (keep app `026ce3bf`, manual pricing) | Shopify App Pricing (new app, or opt-in, which needs no active paid merchants) | Conflict with the 2026-07-23 decision? |
|---|---|---|---|
| **A. Allowances inside fixed plans** | Recurring `appSubscriptionCreate` | Fixed plans | **None.** Recommended for phase 1 |
| B. One-time credit packs | `appPurchaseOneTimeCreate` + `APP_PURCHASES_ONE_TIME_UPDATE`. Shopify's docs name "purchase credits to use in your app" as a use case (verified, C6). Each pack needs merchant approval, so there are no surprise bills | **Not supported** | No usage line item, but it is a new paid SKU. Yu must approve |
| C. Usage line item | Usage charges can be paired only with a 30-day recurring fee, with a capped amount; `APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT` fires at 90% of the cap (verified). `appUsageRecordCreate` idempotency details are **[U]** | Usage meters through the App Events API (`idempotency_key` permanent for billing events; ≤5 meters per plan, ≤6 tiers, monthly). **"Usage caps aren't currently supported"**, so the app must self-cap | **Yes.** "All paths that create new usage records… must remain disabled" |
| D. Separate AI add-on subscription | Whether one shop can hold two subscriptions of the same app is **[U]** | Plans only (≤8 public plans) | — |

Plan: phase 1 = A. Phase 2 = B on the existing app, if Yu approves. C only if Yu replaces the 07-23 decision.

On selling model access: OpenRouter Terms (updated 2026-08-31) bar access "for purposes of reselling API access to Models or otherwise developing a competing service". Sell app features, not raw model access. Any "API wrapper" needs legal review, or OAuth PKCE so merchants bring their own OpenRouter key.

---

## 5. Projected monthly AI cost

Assumptions **[A]**:
- Typical shop: 250 orders, 2k customers, 400 products, 8 drafts, 3 help questions.
- Heavy shop: Free caps (1,000 orders, 10k customers, 1,000 emails, so D3 is capped at 2,000 candidates), 3,000 products, 3 locales, 40 drafts, 20 help questions.
- 3% of decisions also hit the LLM fallback; +10% for retries and prompt growth; one-off costs amortised over 12 months; ×1.055 fee.

Per shop (re-run in `scratchpad/ai-layer-review/cost_v2.py`):
- Typical: decisions about 0.54M tokens, $0.023; generation $0.011; total **$0.042/mo**.
- Heavy: decisions about 1.91M tokens, $0.080; generation $0.157; total **$0.287/mo** (C10).

| Scenario (USD/mo) | 50 shops | 200 shops | 1,000 shops |
|---|---|---|---|
| All typical | 2.11 | 8.45 | 42.27 |
| **Mix: 85% typical, 15% heavy** | **3.95** | **15.81** | **79.03** |
| All heavy, no allowances | 14.37 | 57.46 | 287.32 |
| Every shop maxing every Free allowance (bounded) | 11.28 | 45.13 | 225.66 |
| Fixed overhead | Dev and staging keys ≤ $7/mo; eval about $11 one-off | | |

How this fits the GBP 200–300 ceiling (about $260–390 at ~1.30 USD/GBP **[A/U]**):
- The ceiling is total running cost, hosting included.
- The $50 key total (≈ £38) covers the mix scenario up to about **630 shops**, and the all-maxed Free case up to about 220 shops.
- At 1,000 shops the mix costs about $79 (≈ £61). The key limits still protect the ceiling, but Free shops would degrade to rules unless revenue exists or the Free allowances shrink. The paid pool is unaffected.
- One Grow subscriber ($29, after the 2.9% processing fee) pays for about **350 shops at the 85/15 mix**, or about 670 all-typical shops (C10).
- Generation, not Jev, drives the heavy case: G2b translations alone are $0.108 per heavy shop. Under the Free plan these are bounded by its 50 credits.

---

## 6. Evaluation plan (to run once Yu approves the key and budget)

**Harness** (`app/ai/eval/`):
- It calls through the same `decide()`/`generate()` code with an eval key.
- Fixtures are JSONL: `{id, input (identifier-free, synthetic or dev-store), expected_rule, human_label?, tags[edge|adversarial|non-en|long]}`. No production shopper data (Shopify Level 2 keeps test and production data separate).
- Size: 60 per decision task and 40 per generation task.
- Sources:
  - Synthetic cases from the old segment rules (`analytics-recommendations.server.ts`) and prompts (`anthropic-prompts.server.ts`).
  - Dev-store data.
  - Injection strings placed in the state.
  - fr/de/es/ja cases, since the vendor says non-English and CJK are weaker.

**Metrics and gates:**

| Type | Metrics | Hard gates |
|---|---|---|
| Decisions | Agreement with the rule; accuracy against human labels; Brier score and ECE (calibrated sources); flip rate over 3 repeats; share of cases in the review band; permutation sensitivity (option order); share of answers missing `confidence`; p50/p95 latency; $ per 1k | Valid response 100%; flip rate ≤5%; p95 ≤ budget; beats or matches the rule on labelled cases |
| Generation | Schema-valid rate; placeholder preservation; number grounding (G3); D8 pass rate; human rubric 1–5 on 20 samples; first-token and total latency; served provider (must be on the allowed list); $ per call | Schema ≥99%; placeholders 100%; grounding 100%; rubric ≥4 |

**Selection rule:** the cheapest candidate that passes every gate and is within 5% of the best on quality. Write the result as a new `routeVersion` with tuned bands, pinned to the response snapshot id (e.g. `typesafe/jev-1.13-20260917`).

**Candidates:**

| Task | Candidates (2–5) |
|---|---|
| D1 | `typesafe/jev-1.13` · `microsoft/microsoft-decision-1` · `liquid/d1` · `perplexity/pplx-decider-v1.1-27b` · baseline: logistic regression and the current rule on the same features |
| D2 | jev-1.13 · liquid/d1 · microsoft-decision-1 · rule |
| D3 | jev-1.13 · microsoft-decision-1 · `inception/mercury-decide` · `cloudflare/clef-flash` · rule |
| D4 | jev-1.13 · liquid/d1 · `mistralai/mistral-small-3.2-24b-instruct` (emulated) |
| D5 | jev-1.13 · clef-flash · pplx-decider · mistral-small-3.2 |
| D6 | jev-1.13 · `openai/gpt-6-luna` (effort low) · default ladder |
| D7 | jev-1.13 · microsoft-decision-1 · threshold rule |
| D8 | jev-1.13 · `upstage/solar-decide` · `openai/gpt-oss-safeguard-20b` (async reference) · `meta-llama/llama-guard-4-12b` (async reference) |
| D9 | jev-1.13 · upstage/solar-decide · mistral-small-3.2 (reference) |
| D10 | jev-1.13 · liquid/d1 · upstage/solar-decide |
| G1 | `anthropic/claude-haiku-5.5` · gpt-6-luna · mistral-small-3.2 · reference `anthropic/claude-sonnet-4.6` |
| G2 | haiku-5.5 (sync and Batch) · gpt-6-luna (sync and Batch) · mistral-small-3.2 · `google/gemini-3.1-flash-lite` (own profile without `max_price`) |
| G3 | haiku-5.5 via Batch · gpt-6-luna via Batch · mistral-small-3.2 |
| G4 | haiku-5.5 · gpt-6-luna · reference sonnet-4.6 |
| G5 | haiku-5.5 · gpt-6-luna · gemini-3.1-flash-lite · `typesafe/jev-router` (cost_tier low, allowed_models, hard max_tokens, served-model check) |

**Sequence:**
1. **Smoke test, ≤ $0.01 total, needs Yu's approval.** One call each:
   - Jev on `/api/v1/systemone` with and without PD fields, and on `/api/alpha/decisions` with PD. Confirms 200, `usage.cost`, and whether the `provider`/`user`/`session_id` fields are accepted on `/systemone`.
   - `microsoft-decision-1` and `liquid/d1` on `/systemone` (does the alt contract hold?).
   - haiku-5.5 with json_schema and PG including `ignore:["amazon-bedrock"]`; confirm the served provider.
   - mistral-small with a `reasoning` parameter and `require_parameters`; expect an error (an error call should cost nothing).
   - jev-router with the metadata header and `max_tokens` ≤ 50.
   - A 1-request Batch with PB; confirm the accepted slug and provider, then delete it.
   - `GET /api/v1/generation` for a decision id.
   - `GET /api/v1/key` to confirm the limit fields.
2. Build the fixtures (no cost).
3. Run the matrix with 3 repeats. Estimate: decisions about $0.29 (10 tasks), generation about $2.9, Sonnet reference about $7.9 (G1 at 2.5k/0.9k and G4 at 5k/2k), **total ≈ $11 on the eval key ($15 cap)** (C10).
4. Pick routes, tune bands, commit `routes.ts`, and generate the subprocessor table from it.
5. On a dev store, run D1, D2 and D3 in shadow mode for 2–4 weeks before any `auto` mode.
6. **Re-evaluation triggers:**
   - A daily free `GET /api/v1/models?output_modalities=all` watch for `expiration_date`, price or alias changes on routed models.
   - Any version bump.
   - A monthly 10% re-run.
   - Any change in the served provider of a pinned route.

---

## 7. Open questions for Yu

1. Approve the smoke test (≤$0.01) and eval (≈$11, key capped at $15), and the key topology: `prod-free` $35/mo, `prod-paid` $15/mo, staging $5, dev $2, eval $15 expiring in 30 days.
2. How much of the GBP 200–300 ceiling goes to AI before revenue? The proposal is $50/mo.
3. Billing: keep the 07-23 rule (allowances only), allow one-time credit packs (≥ $7 per 1,000 credits), or replace the rule for a usage line item or meter?
4. Keep the same Shopify app (Billing API: one-time packs and capped usage both possible) or start a new app (App Pricing: neither one-time packs nor usage caps)?
5. OpenRouter Standard (5.5%) or Business (8%, EU in-region, signed DPA)? Does any merchant need EU-only processing? If so, Jev cannot be used for that shop.
6. Do you want per-shopper automated decisions (D1, D2, D3, D10) at all? Is default-OFF opt-in right? What should the default D1 hold auto-release be (proposal: 7 days)?
7. Scope (synthesis open question 4): are missions (D10), automations (D3) and the campaign hub (D4, G1) kept?
8. Refund clawback policy (D2 depends on it).
9. Open a TypeSafe direct account now, or only if OpenRouter limits or ZDR terms force it?
10. Allowance numbers, and should help (G5) and onboarding (G4) stay free?
11. Legal read on the OpenRouter Terms resale clause for "AI credits". Is an API wrapper off the table, or should merchants bring their own key via OAuth PKCE?
12. Who labels eval fixtures (you, a pilot merchant, or me from rules)?
13. Should the GitBook assistant be replaced by G5, given that the docs must be fixed first?
14. Can the OpenRouter account create a separate prod workspace (batch isolation, C1)?

## 8. Assumptions and unverified items

- **[U]** No call was made. Request and response shapes, provider-preference handling on `/systemone`, and the presence of `usage.cost` all come from documentation.
- **[U]** Whether the alternative System One models accept the same contract on `/systemone`.
- **[U → likely]** Whether `GET /api/v1/generation` returns decision ids (`api_type` enum includes `decisions`).
- **Verified:** `max_price` is in $/M tokens. Batch accepts only `provider.only` and `allow_fallbacks`, keeps data 30 days in GCS, and is workspace-scoped. A per-key limit returns 402 `openrouter_key_limit`. 403 also covers moderation and guardrail blocks. Jev Router's include list is ignored when it matches nothing. Shopify's revenue share is 0% to $1M lifetime, 15% after, plus a 2.9% processing fee. Shopify Level 1 requires an opt-out from automated decisions.
- **[U]** How `require_parameters` interacts with `reasoning` on mistral (documented behaviour plus endpoint parameter lists; confirm live).
- **[U]** Whether Batch works with account-level ZDR, and which providers serve haiku-5.5 and gpt-6-luna in batch.
- **[U]** Whether a personal Standard account can create workspaces. Guardrail ZDR looks available outside organisations; only data-region guardrails need Business.
- **[U]** Jev Router billing and availability for Yu's workspace.
- **[U]** Jev's latency is OpenRouter's own platform-wide measurement. LLM latencies were not measured (the endpoint API returned null without auth). Rate limits through OpenRouter are undocumented.
- **[U]** `appUsageRecordCreate` idempotency details, whether a shop can hold two subscriptions, and the protected-customer-data declaration needed for AI use.
- **[U]** The GDPR, Art. 22 and Terms readings are not legal advice.
- **[A]** Prices are a 2026-10-11 snapshot. claude-haiku-5.5 is 4 days old and microsoft-decision-1 is 2 days old. Token sizes, per-shop volumes, the 85/15 mix, 1.30 USD/GBP, the 10% contingency and the $35/$15 pool split are assumptions.
- Cost model scripts (re-runnable): `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/ai-layer/cost.py` (original) and `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/ai-layer-review/cost_v2.py` (corrected).
- Evidence files: `/private/tmp/claude-501/-Users-macair/be3bdad1-179a-4ab4-a179-ae2e27f432f0/scratchpad/or-models.json`, `.../scratchpad/or-zdr.json`, `.../scratchpad/or-models-eu.json`, `.../scratchpad/or-docs/models-decisions.json`, `.../scratchpad/or-docs/pages/{batch-quickstart,api_reference_limits,guides_routing_routers_jev-router,guides_features_response-caching,guides_routing_provider-selection,guides_features_zdr,guides_community_typesafe-sdk,api_api-reference_alphadecisions_submit-a-decisions-request}.md`, `.../scratchpad/or-docs/dpa.html`, `.../scratchpad/or-docs/terms.html`, `.../scratchpad/jev/html/typesafe_jev-1.13.html`, `.../scratchpad/jev/ts/{model-jaggedness_jev-1.13,primitives_choice,primitives_noul,models}.md`, `.../scratchpad/shopify-docs/docs_apps_launch_billing_shopify-app-pricing.md`, `.../scratchpad/shopify-docs/docs_apps_launch_billing_manual-pricing.md`, `.../scratchpad/shopify-docs/docs_api_app-events.md`, `/Users/macair/Desktop/Cambridge-TCG-monorepo/docs/decisions/2026-07-23-rewardspro-free-first-pricing.md`. Live WebFetch on 2026-10-11: openrouter.ai/docs/batch-quickstart, /docs/guides/routing/routers/jev-router, /docs/api/reference/limits; shopify.dev/docs/apps/launch/distribution/revenue-share, /docs/apps/launch/protected-customer-data.