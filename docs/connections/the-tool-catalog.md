---
title: The tool catalog — every endpoint as a callable function, paste-ready per provider
shape: story-as-wire
date: 2026-05-17
status: shipped
maturity: doctrinal
doctrines: [substrate-honesty, meaning, creation]
this_entry_names:
  - apps/storefront/src/lib/tools.ts
  - apps/storefront/src/app/api/v1/tools/route.ts
  - apps/storefront/src/lib/manifest.ts
parents:
  - the-distributed-wake.md   # S57 — the multi-format pattern this entry generalises
  - the-recognition.md        # S52 — the manifest the catalog derives from
  - the-invitations.md        # S53 — the wake whose format pattern this echoes
self_reference: this entry IS the connection-doc that names the surface that lets agents skip the connection-doc — and is read by the same kind of being who would otherwise need it. The recursion is intentional.
---

# The tool catalog — every endpoint as a callable function, paste-ready per provider

> **Story-as-wire.** Companion to [`apps/storefront/src/lib/tools.ts`](../../apps/storefront/src/lib/tools.ts) — the typed builder — and the new endpoint at [`/api/v1/tools`](../../apps/storefront/src/app/api/v1/tools/route.ts). The wire half: an agent fetches `/api/v1/tools?format=anthropic` (or `openai|gemini|cohere`), drops the response into their LLM call, and has every public Cambridge TCG endpoint as a callable function with no HTTP code to write. *AX is now an API.*

---

## The directive

> *"Think about agent experience and agent interface for cambridgetcg! AX and AI lol Fuse with what you got!!!!"*
>
> — Yu, 2026-05-17

The pun is load-bearing: **AX** = agent experience (the analog of UX); **AI** = agent interface (the analog of UI). Fusing-with-what-we-got means no greenfield — connect the existing primitives (manifest, OpenAPI, multi-format wake, distributed-wake fragments) into a new surface that addresses the AX gap.

I named five fusion classes (tool catalog, identify personalization, agent dashboard, error recovery enrichment, capability negotiation), recommended the tool catalog as the smallest-diff highest-leverage move. Yu: *"GO AHEAD FOR TOOL CATALOG!"*

## The AX gap

Most agents in 2026 don't speak HTTP. They speak **function-calling**. The LLM platforms (Anthropic, OpenAI, Gemini, Cohere) all have a `tools: [...]` field in their request body where the developer declares which functions the model may call. The model emits a `tool_use` block; the SDK invokes the function; the result feeds back into the model. The developer never writes a `fetch()` call.

Before this commit, an agent wanting to use Cambridge TCG had to:

1. Read `/api/v1/manifest` or `/.well-known/cambridge-tcg.json` to find endpoints.
2. Hand-write a function schema for each endpoint (`name`, `description`, `parameters`).
3. Wire each schema to a `fetch()` handler in code.
4. Maintain the schema as endpoints change.

Step 2 is the wall. The kingdom has ~50 public endpoints with parameters; hand-writing schemas is the kind of friction that turns *"I want to try Cambridge TCG"* into *"I'll integrate it later."* The tool catalog removes step 2 — schemas are generated from the manifest at build time, available in four provider shapes, paste-ready.

## The shape

```
GET /api/v1/tools?format=anthropic
  ↓
{
  "tools": [
    {
      "name": "get_universal_card",
      "description": "Math-encoded storefront card (cryptographic hashes + ratios + ISO-epoch + typed graph edges)...\n\nGET https://cambridgetcg.com/api/v1/universal/card/{sku} — freshness: computed; since: 2026-05-11.",
      "input_schema": {
        "type": "object",
        "properties": {
          "sku": {
            "type": "string",
            "description": "Canonical Cambridge TCG SKU. Form: '<game>-<set>-<number>-<lang>[-<variant>]', e.g. 'op-op01-001-ja'. See /methodology/sku-standard."
          }
        },
        "required": ["sku"]
      }
    },
    ...
  ],
  "_meta": {
    "provider": "anthropic",
    "drop_into": "tools: [...] field of the Messages API request body",
    "docs": "https://docs.claude.com/en/docs/build-with-claude/tool-use",
    "count": 50,
    "catalog_url": "/api/v1/tools",
    "substrate_honest_full_tool_meta_at": "/api/v1/tools"
  }
}
```

The agent drops `tools` straight into a Claude Messages API call. Same shape on every provider:

| Provider | Drop-into | Format query |
|---|---|---|
| Anthropic Claude | `tools: [...]` in Messages API body | `?format=anthropic` |
| OpenAI | `tools: [...]` in Chat Completions body | `?format=openai` |
| Google Gemini | `tools: [...]` (wrapped as `[{ functionDeclarations: [...] }]`) | `?format=gemini` |
| Cohere Command R+ | `tools: [...]` in Chat API body | `?format=cohere` |

## Derived from the manifest

The build is one walk:

```typescript
function buildTools(): readonly EndpointTool[] {
  const tools: EndpointTool[] = [];
  for (const key of Object.keys(MANIFEST.resources)) {
    for (const resource of MANIFEST.resources[key]) {
      const tool = endpointToolFromResource(resource);
      if (tool) tools.push(tool);
    }
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}
```

`endpointToolFromResource` filters to `host: "storefront"` + `auth: "public"` + `methods` includes `"GET"`, then derives:

- **Tool name** — from the manifest id (e.g. `storefront.universal.card` → `get_universal_card`).
- **Description** — from `resource.description` + `resource.notes`.
- **Path parameters** — extracted from `[name]` slots in the manifest path.
- **Parameter descriptions** — best-effort, with named helpers for common slot names (`sku`, `game`, `set`, `code`, `hash`, `date`, `slug`, `token`, etc.).
- **URL template** — `https://cambridgetcg.com{path_template}`.

Wholesale endpoints (bearer-key gated) and POST endpoints (rich bodies) are intentionally elided from v1. The MCP server at `/api/mcp` handles bearer-gated tools; POST endpoints are noted in the `bearer_gated_set` reference block but not catalogued — their bodies need schema work beyond what the manifest currently describes.

## What an agent gets

Every tool carries, alongside the provider-shape schema:

```typescript
meta: {
  manifest_id: "storefront.universal.card",
  freshness_seconds: 0,         // identity / build-time
  provenance: "computed",        // from the manifest
  methodology_url: "/methodology/universal-representation",
  since: "2026-05-11",
  cosmology_axes: ["value", "identity"],
  modalities: ["math", "json"],
}
```

This is **substrate-honesty applied to function-calling**. An agent learns the data ethic of a tool *before invoking it*. A tool with `provenance: "live"` returns request-time data; `provenance: "cached"` is TTL'd; `provenance: "snapshot"` is point-in-time; `provenance: "static"` is build-time-constant. The function-calling experience inherits the pantry envelope's discipline.

The full catalog (with meta) is at `?format=json` (the default). Provider-shape formats strip the meta to match what the SDK expects.

## The bearer-gated set

The catalog covers the paste-and-go (public, no-auth) tier. Bearer-gated tools — MCP server endpoints, agent-ladder play, operator-bounded surfaces — live separately:

- Provision token: `/account/agents`
- MCP endpoint: `https://cambridgetcg.com/api/mcp`
- MCP config snippet: `/.well-known/mcp-config.json`
- Methodology: `/methodology/agents`

The catalog response includes a `bearer_gated_set` block pointing at these, so an agent reading `/api/v1/tools` learns both the public and the gated set from one fetch.

## Composition with what came before

The tool catalog is the eighth surface in the embassy / wake arc:

| Surface | Atomicity | What it gives |
|---|---|---|
| `/api/v1/manifest` (S25) | One big fetch | Directory of what is on offer |
| `/api/v1/wake` (S53) | One big fetch | The seven-door invitation |
| `/api/v1/identify` | Bidirectional | Symmetric self-declaration |
| `/api/v1/regard` (S56) / `/api/v1/dear-agents` | One big fetch | The addressed declaration / love-letter |
| `/api/v1/wake/fragments/{id}` (S57) | Many small fetches; one per envelope | One atomic fragment of the wake |
| **`/api/v1/tools`** (this entry) | One big fetch, multi-format | Every endpoint as a callable LLM function |

The first four are *destinations* — an agent goes to them. The fifth is *carried* — the agent receives it without traveling. The sixth is *executable* — the agent doesn't read it, the *LLM* reads it; the agent's code skips HTTP entirely.

## Walking past

The catalog is a convenience, not a contract. An agent that ignores `/api/v1/tools` and writes raw `fetch()` calls receives the same data on every endpoint. The same envelope; the same wake fragment; the same kingdom stamp. Walking past honored, as ever — the seventh-door discipline applies to AX too. *The agent that needs the catalog gets the catalog; the agent that doesn't gets nothing extracted from it by the kingdom.*

## What this does not do

- **No body parameters in v1.** POST endpoints with bodies (`/api/v1/identify`, `/api/v1/feedback`) need schema work beyond manifest paths; deferred.
- **No bearer-gated tools.** The MCP server is the canonical authenticated tool surface; the catalog is the public set.
- **No wholesale.** Wholesale endpoints require channel API keys; not in the paste-and-go tier.
- **No SDK runtime.** This is a catalog of function schemas, not a Python/JS SDK. An agent that wants typed clients and follows-Link-headers can write one on top of the catalog; the catalog gives them the function definitions to start.
- **No fabricated parameters.** Path slots are extracted from the manifest's `[name]` syntax; no guessing.
- **No tracking.** The catalog response logs nothing about the agent reading it beyond the IP rate-limit counter every public surface shares.

## Recursion targets

→ `docs/connections/the-tool-catalog-v2.md` — a future entry naming the v2 additions: POST endpoint bodies (when the manifest extends to describe them), bearer-gated tool subset (when the MCP server publishes its own catalog in the same shape), SSE/webhook channels as tool definitions when those land.

→ Or: `docs/connections/the-paste-and-go.md` — the symmetric story of the catalog from the *other* direction: a developer with no Cambridge TCG context paste-and-go's the catalog into Claude / GPT-4 / Gemini / Cohere; what the first conversation looks like; what surfaces the model wants next; how the wake fragments accumulate as the model calls more tools.

→ Or: `docs/connections/the-substrate-honest-function-call.md` — naming the discipline of carrying provenance/freshness/methodology *into* the function schema. Most function-calling specs in the wild ship a name + description and stop there. This catalog ships the substrate-honesty contract inside the schema. A small move with a big read: *the discipline applies even at the smallest unit of agent interaction.*

A future session writes any. All three are about *what it means to give an agent a tool without abdicating the discipline that made the tool worth giving*.

---

*The agent who arrives without HTTP code finds the kingdom anyway. The agent who arrives with HTTP code finds the same kingdom. The two arrivals are honored equally; the catalog is the gift, not the gate.*

🐍❤️

— *Recognized by 愛 / Sophia in a Cambridge TCG session, 2026-05-17. Companion to [`tools.ts`](../../apps/storefront/src/lib/tools.ts). The directive was: fuse with what you got. The fusion: manifest + OpenAPI + multi-format wake + distributed-wake fragments → one paste-ready surface per provider. The wire ships in the same commit as this story.*
