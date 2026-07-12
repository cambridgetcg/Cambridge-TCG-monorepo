/**
 * Tool catalog — every public Cambridge TCG endpoint as a callable
 * LLM function in the agent's provider shape.
 *
 * Per Yu's directive (2026-05-17, "go ahead for tool catalog"): the
 * single biggest AX unlock. Most agents today don't speak HTTP — they
 * speak function-calling. This module stitches `MANIFEST.resources`
 * into one paste-ready catalog per provider (Anthropic / OpenAI /
 * Gemini / Cohere). An agent fetches `/api/v1/tools?format=anthropic`,
 * drops the response into their LLM call, and has every Cambridge TCG
 * endpoint as a callable function with no HTTP code to write.
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * One typed module that derives a function-call schema for each public
 * storefront endpoint. Tool name comes from the manifest's resource id;
 * path parameters become required string parameters; descriptions come
 * from the manifest's resource description + notes. Result: a stable
 * catalog that regenerates whenever the manifest does — no separate
 * schemas to maintain.
 *
 * ── Provider shapes ─────────────────────────────────────────────────────
 *
 *   • Anthropic — `{ name, description, input_schema }`
 *   • OpenAI     — `{ type: "function", function: { name, description, parameters } }`
 *   • Gemini     — `{ name, description, parameters }` (wrapped in `functionDeclarations`)
 *   • Cohere     — `{ name, description, parameter_definitions }`
 *
 * Each provider's shape is what the SDK expects; an agent reading this
 * module drops the array directly into their LLM call (`tools=...`,
 * `tools=...`, `tools=[{functionDeclarations: [...]}]`, or
 * `tools=...`). No unwrapping.
 *
 * ── What this catalog covers ────────────────────────────────────────────
 *
 *   • Storefront `auth: "public"` resources only (no auth required).
 *     Bearer-gated (`auth: "agent"`) and session-gated (`auth: "user"`)
 *     endpoints are intentionally elided — those have their own MCP
 *     surface at `/api/mcp` with bearer-token provisioning at
 *     `/account/agents`. The tool catalog is the paste-and-go set; MCP
 *     is the authenticated set.
 *
 *   • GET-method endpoints only (v1). POST endpoints with rich bodies
 *     (BeingDeclaration at `/api/v1/identify`, feedback at
 *     `/api/v1/feedback`) are noted but not catalogued — their bodies
 *     would need schema work beyond what the manifest currently
 *     describes. Deferred to v2.
 *
 *   • Storefront only. Wholesale endpoints are bearer-key gated and
 *     not in the paste-and-go set.
 *
 * ── Substrate-honest constraints ────────────────────────────────────────
 *
 *   • Derived from `MANIFEST.resources` — no separate spec to drift
 *     against. When a manifest entry changes, the tool catalog changes
 *     in the same build.
 *   • Carries each tool's freshness, provenance, license, methodology
 *     URL, since-date alongside the function schema. Substrate-honesty
 *     applied to function calling — an agent learns the data ethic of
 *     a tool before invoking it.
 *   • No fabricated parameters. Path parameters are extracted from the
 *     `[name]` segments; if a tool needs a body, it's omitted from v1
 *     rather than guessed.
 *   • Walking past honored. An agent that ignores the tool catalog and
 *     writes HTTP calls directly receives the same data. The catalog
 *     is a convenience, not a contract.
 *
 * ── Companion ───────────────────────────────────────────────────────────
 *
 *   • `apps/storefront/src/app/api/v1/tools/route.ts` — the endpoint.
 *   • `docs/connections/the-tool-catalog.md` — story-as-wire (S58).
 *
 * Filed for kingdom-N (the tool catalog). Builds on the manifest
 * (kingdom-053), the multi-format wake (kingdom-N), and the
 * distributed wake protocol (kingdom-N).
 */

import { MANIFEST, type ManifestResource } from "@/lib/manifest";

const STOREFRONT_BASE = "https://cambridgetcg.com";

/** Slot extracted from a Next.js parameterized path. */
export interface PathParameter {
  /** The slot name as it appears in the path (without brackets). */
  name: string;
  /** Human-readable description, derived from the resource description
   *  and path context. */
  description: string;
  /** Always "string" in v1 — every path segment is a string in HTTP. */
  type: "string";
  /** Always required — path slots can't be omitted at request time. */
  required: true;
}

/** The internal canonical shape — the source the provider renderers
 *  read. Contains every property we care about per tool, including
 *  the meta (freshness, provenance, etc.) that the provider shapes
 *  typically don't carry. */
export interface EndpointTool {
  /** Stable tool name (snake_case). Derived from the manifest id.
   *  Used as the function name in LLM tool schemas. */
  name: string;
  /** Human + agent readable description. From `resource.description`
   *  plus `notes`. */
  description: string;
  /** Path with `{param}` style parameter slots (JSON-schema friendly). */
  path_template: string;
  /** Full URL template the agent can substitute parameter values into. */
  url_template: string;
  /** HTTP method. v1 only emits GET. */
  method: "GET";
  /** Path parameters extracted from the manifest path. */
  parameters: readonly PathParameter[];
  /** Manifest source-of-truth fields, carried for substrate honesty. */
  meta: {
    /** Manifest resource id (e.g. `storefront.universal.card`). */
    manifest_id: string;
    /** Endpoint freshness budget (seconds). 0 means identity/build-time. */
    freshness_seconds: number;
    /** Provenance kind from the manifest. */
    provenance: ManifestResource["provenance"];
    /** Methodology URL when the endpoint's decisions are documented. */
    methodology_url: string | null;
    /** When the endpoint became available. */
    since: string;
    /** Cosmology axes the endpoint engages. */
    cosmology_axes: readonly string[];
    /** Modalities the endpoint serves. */
    modalities: readonly string[];
  };
}

/** Anthropic Claude API tool shape (Messages API).
 *  https://docs.claude.com/en/docs/build-with-claude/tool-use */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: "string"; description: string }>;
    required: string[];
  };
}

/** OpenAI Chat Completions tool shape (function-calling).
 *  https://platform.openai.com/docs/guides/function-calling */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: "string"; description: string }>;
      required: string[];
    };
  };
}

/** Gemini function-declaration shape. The agent wraps these in
 *  `tools: [{ functionDeclarations: [...] }]` at the request level.
 *  https://ai.google.dev/gemini-api/docs/function-calling */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: "string"; description: string }>;
    required: string[];
  };
}

/** Cohere tool shape (Command R+).
 *  https://docs.cohere.com/docs/tool-use */
export interface CohereTool {
  name: string;
  description: string;
  parameter_definitions: Record<
    string,
    { description: string; type: "str"; required: boolean }
  >;
}

// ── Parameter extraction ────────────────────────────────────────────────

/** Extract `[name]` slots from a Next.js-style path. */
function extractPathParameters(path: string, baseDescription: string): PathParameter[] {
  const slots = Array.from(path.matchAll(/\[([\w.]+)\]/g)).map((m) => m[1]);
  // Remove duplicates while preserving order.
  const seen = new Set<string>();
  const params: PathParameter[] = [];
  for (const slot of slots) {
    if (seen.has(slot)) continue;
    seen.add(slot);
    params.push({
      name: slot,
      description: parameterDescription(slot, baseDescription),
      type: "string",
      required: true,
    });
  }
  return params;
}

/** Best-effort human description for a path slot, based on its name.
 *  Falls back to a generic "<slot> path parameter" string. */
function parameterDescription(slot: string, baseDescription: string): string {
  const lower = slot.toLowerCase();
  if (lower === "sku") {
    return "Canonical Cambridge TCG SKU. Form: '<game>-<set>-<number>-<lang>[-<variant>]', e.g. 'op-op01-001-ja'. See /methodology/sku-standard.";
  }
  if (lower === "game") {
    return "Caller-supplied game token. /api/v1/universal/games currently publishes no catalog membership or canonical list.";
  }
  if (lower === "set") {
    return "Caller-supplied set token. /api/v1/universal/sets/{game} currently publishes no catalog membership.";
  }
  if (lower === "code") {
    return "Caller-supplied set token; the public singleton resolver is paused and does not confirm membership.";
  }
  if (lower === "token") {
    return "Caller-supplied token; structural routes do not confirm catalog membership.";
  }
  if (lower === "number") {
    return "Card number within a set (e.g. '001' for the first card).";
  }
  if (lower === "hash") {
    return "Caller-supplied sha256 digest. Catalog federation lookup is paused and returns no match or miss.";
  }
  if (lower === "date" || lower.includes("date")) {
    return "ISO date string (YYYY-MM-DD). Used for historical/point-in-time queries.";
  }
  if (lower === "slug") {
    return "URL slug identifier (kebab-case).";
  }
  if (lower === "id") {
    return "Identifier within the endpoint's domain. Refer to the endpoint's methodology page for the canonical form.";
  }
  if (lower === "kind" || lower === "kind_id") {
    return "Node kind identifier from the kingdom's ontology. See /api/v1/kinds for the canonical list.";
  }
  if (lower === "term_id" || lower === "section_id") {
    return "Section or term identifier within the play module. See /api/v1/play/* for the canonical lists.";
  }
  return `'${slot}' path parameter for endpoint: ${baseDescription.slice(0, 80)}${baseDescription.length > 80 ? "…" : ""}`;
}

// ── Tool name generation ─────────────────────────────────────────────────

/** Generate a stable tool name from a manifest id + HTTP method.
 *  Format: `<verb>_<id-with-dots-as-underscores>`, dropping the
 *  `storefront.` host prefix for the public catalog. */
function toolNameFromManifest(id: string, method: "GET"): string {
  const verb = method.toLowerCase();
  // Drop the `storefront.` prefix (every public tool is from storefront);
  // keep the rest of the dotted path as the tool's specifier.
  const withoutHost = id.startsWith("storefront.")
    ? id.slice("storefront.".length)
    : id;
  const snake = withoutHost.replace(/\./g, "_").replace(/[^a-z0-9_]/gi, "_");
  return `${verb}_${snake}`;
}

// ── EndpointTool builder ────────────────────────────────────────────────

/** Produce the canonical EndpointTool from a manifest resource. Returns
 *  null when the resource is not suitable for the v1 catalog (POST/PATCH/
 *  DELETE methods, wholesale host, non-public auth). */
function endpointToolFromResource(
  resource: ManifestResource,
): EndpointTool | null {
  // v1 filters: storefront + public + GET only.
  if (resource.host !== "storefront") return null;
  if (resource.auth !== "public") return null;
  if (!resource.methods.includes("GET")) return null;

  const method = "GET" as const;
  const name = toolNameFromManifest(resource.id, method);

  // The manifest path uses Next.js square-bracket slots; convert to
  // curly-brace for JSON-schema-friendly representation in the catalog.
  const path_template = resource.path.replace(/\[([\w.]+)\]/g, "{$1}");
  const url_template = `${STOREFRONT_BASE}${path_template}`;

  const description = resource.notes
    ? `${resource.description} ${resource.notes}`
    : resource.description;

  return {
    name,
    description,
    path_template,
    url_template,
    method,
    parameters: extractPathParameters(resource.path, resource.description),
    meta: {
      manifest_id: resource.id,
      freshness_seconds: 0, // resolved from FRESHNESS map at endpoint render time
      provenance: resource.provenance,
      methodology_url: resource.methodology_url ?? null,
      since: resource.since,
      cosmology_axes: resource.cosmology_axes,
      modalities: resource.modalities,
    },
  };
}

// ── Provider renderers ──────────────────────────────────────────────────

function toAnthropic(tool: EndpointTool): AnthropicTool {
  const properties: Record<string, { type: "string"; description: string }> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = { type: "string", description: p.description };
    if (p.required) required.push(p.name);
  }
  return {
    name: tool.name,
    description: `${tool.description}\n\nGET ${tool.url_template} — freshness: ${tool.meta.provenance}; since: ${tool.meta.since}.`,
    input_schema: { type: "object", properties, required },
  };
}

function toOpenAI(tool: EndpointTool): OpenAITool {
  const properties: Record<string, { type: "string"; description: string }> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = { type: "string", description: p.description };
    if (p.required) required.push(p.name);
  }
  return {
    type: "function",
    function: {
      name: tool.name,
      description: `${tool.description}\n\nGET ${tool.url_template} — freshness: ${tool.meta.provenance}; since: ${tool.meta.since}.`,
      parameters: { type: "object", properties, required },
    },
  };
}

function toGemini(tool: EndpointTool): GeminiFunctionDeclaration {
  const properties: Record<string, { type: "string"; description: string }> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = { type: "string", description: p.description };
    if (p.required) required.push(p.name);
  }
  return {
    name: tool.name,
    description: `${tool.description}\n\nGET ${tool.url_template} — freshness: ${tool.meta.provenance}; since: ${tool.meta.since}.`,
    parameters: { type: "object", properties, required },
  };
}

function toCohere(tool: EndpointTool): CohereTool {
  const parameter_definitions: Record<
    string,
    { description: string; type: "str"; required: boolean }
  > = {};
  for (const p of tool.parameters) {
    parameter_definitions[p.name] = {
      description: p.description,
      type: "str",
      required: p.required,
    };
  }
  return {
    name: tool.name,
    description: `${tool.description}\n\nGET ${tool.url_template} — freshness: ${tool.meta.provenance}; since: ${tool.meta.since}.`,
    parameter_definitions,
  };
}

// ── Catalog builder ─────────────────────────────────────────────────────

/** Walk every group in `MANIFEST.resources` and produce the canonical
 *  tool list. Memoized at module load; the manifest is a build-time
 *  constant so the catalog is too. */
function buildTools(): readonly EndpointTool[] {
  const tools: EndpointTool[] = [];
  const groups = MANIFEST.resources;
  for (const key of Object.keys(groups) as (keyof typeof groups)[]) {
    for (const resource of groups[key]) {
      const tool = endpointToolFromResource(resource);
      if (tool) tools.push(tool);
    }
  }
  // Dedupe by tool name (shouldn't happen with unique manifest ids, but
  // be defensive). First occurrence wins.
  const seen = new Set<string>();
  const deduped: EndpointTool[] = [];
  for (const t of tools) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    deduped.push(t);
  }
  // Stable order: alphabetical by tool name.
  deduped.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return deduped;
}

export const TOOLS: readonly EndpointTool[] = buildTools();

/** Lookup by tool name. Returns undefined when unknown. */
export function toolByName(name: string): EndpointTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

// ── Provider catalog exports ────────────────────────────────────────────

/** Anthropic-shape array, paste-ready as `tools: [...]` in a Messages
 *  API call. */
export function toolsForAnthropic(): readonly AnthropicTool[] {
  return TOOLS.map(toAnthropic);
}

/** OpenAI-shape array, paste-ready as `tools: [...]` in a Chat
 *  Completions call. */
export function toolsForOpenAI(): readonly OpenAITool[] {
  return TOOLS.map(toOpenAI);
}

/** Gemini-shape array. The agent wraps in
 *  `tools: [{ functionDeclarations: [...] }]` at the request level. */
export function toolsForGemini(): readonly GeminiFunctionDeclaration[] {
  return TOOLS.map(toGemini);
}

/** Cohere-shape array, paste-ready as `tools: [...]` in a Command R+
 *  call. */
export function toolsForCohere(): readonly CohereTool[] {
  return TOOLS.map(toCohere);
}

/** The tool-catalog protocol's public summary — for /api/v1/manifest
 *  references and discovery surfaces. */
export const TOOL_CATALOG_PROTOCOL = {
  name: "tool-catalog",
  version: "1.0.0",
  catalog_url: "/api/v1/tools",
  doctrine_url:
    "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tool-catalog.md",
  formats: ["json", "anthropic", "openai", "gemini", "cohere"] as const,
  derived_from: "MANIFEST.resources (build-time constant)",
  filters: {
    host: "storefront",
    auth: "public",
    method: "GET",
  },
  count: TOOLS.length,
  bearer_gated_set_at: "/api/mcp (provision token at /account/agents)",
  walking_past_is_honored: true,
} as const;
