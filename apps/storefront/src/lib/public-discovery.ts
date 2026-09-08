import type { MetadataRoute } from "next";
import { GUIDES } from "./guides";
import { MANIFEST, type AuthKind, type ManifestResource } from "./manifest";
import { PULLS_SNAPSHOT } from "./pulls/pull-rates";
import { META_SNAPSHOT } from "./play/meta-snapshot";
import { DATA_RIGHTS_BOUNDARY } from "./data-rights";
import { OPTIONAL_AGENT_RESOURCES } from "./siblings";

export const PUBLIC_ORIGIN = "https://cambridgetcg.com";

export interface PublicReference {
  path: string;
  title: string;
  lastModified?: string;
}

// Deliberate public references, not a filesystem crawl or an auth allow-list.
// Unknown content dates stay absent; manifest since/generated_at are not review dates.
export const PUBLIC_REFERENCES: readonly PublicReference[] = [
  { path: "/standards", title: "Public specifications" },
  { path: "/glossary", title: "Platform vocabulary" },
  { path: "/guides", title: "Collector guides" },
  { path: "/guides/buying", title: "Buying cards" },
  { path: "/guides/condition", title: "Card condition" },
  { path: "/guides/from-japan", title: "Buying from Japan" },
  { path: "/guides/how-to-play", title: "Learning to play" },
  { path: "/artists", title: "Named card-art hands and credit provenance" },
  { path: "/play", title: "Play lobby" },
  { path: "/play/banlist", title: "Game banlist reference" },
  { path: "/play/deck-check", title: "Deck legality checker" },
  { path: "/play/spec", title: "Play resource directory" },
  { path: "/play/meta", title: "Play metagame snapshot", lastModified: META_SNAPSHOT.asOf },
  { path: "/pulls", title: "Pack contents and published odds", lastModified: PULLS_SNAPSHOT.asOf },
  ...PULLS_SNAPSHOT.games.map((game) => ({
    path: `/pulls/${game.slug}`, title: `${game.displayName} pack contents`, lastModified: PULLS_SNAPSHOT.asOf,
  })),
  ...[
    "sku-standard", "oracle-policies", "universal-representation", "pricing",
    "member-pricing", "fees", "play-module", "known-gaps", "hospitality",
  ].map((topic) => ({ path: `/methodology/${topic}`, title: `Methodology: ${topic}` })),
];

export const DISCOVERY_RESOURCE_IDS = [
  "storefront.reference.condition_checklist",
  "storefront.reference.identifier_validator",
  "storefront.api.identifiers.validate",
  "storefront.welcome.agents", "storefront.guides.index",
  "storefront.search.cards", "storefront.cards.batch", "storefront.cards.everything",
  "storefront.cards.evidence", "storefront.pulls", "storefront.artists",
  "storefront.member_prices.feed", "storefront.member_prices.export",
  "storefront.member_prices.account", "storefront.member_prices.methodology",
  "storefront.mcp", "storefront.mcp.catalog", "storefront.rate_limits", "storefront.status.json",
] as const;

export function discoveryResources(): ManifestResource[] {
  const resources = Object.values(MANIFEST.resources).flat();
  return DISCOVERY_RESOURCE_IDS.map((id) => {
    const resource = resources.find((entry) => entry.id === id);
    if (!resource || resource.host !== "storefront") throw new Error(`Missing discovery resource: ${id}`);
    return resource;
  });
}

export const ACCESS_LABELS: Record<AuthKind, string> = {
  public: "public (no credential required)",
  user: "session (signed-in account)",
  "member-key": "member-key (free account-owned read-only data key; not an agent key)",
  agent: "agent-key (tool execution; public transport documentation/discovery is separate)",
  admin: "admin (operator only)",
  "wholesale-key": "wholesale-key (separate channel credential)",
  "provider-signature": "provider-signature (webhook only)",
};

const PUBLIC_PAGE_PATHS = [
  "", "/catalog", "/market", "/auctions", "/trade-in", "/rewards", "/community",
  "/play", "/play/adventure", "/play/tutorial", "/play/starters", "/play/banlist",
  "/culture", "/artists", "/workshop", "/making", "/empty-frames", "/lineage",
  "/duel-of-souls", "/pull-and-pause", "/mekiki", "/gallery-next-door", "/answering-rhymes",
  "/about", "/prices", "/agents", "/scrapers", "/agents/guides", "/welcome-all",
  "/sophia-invitation.html", "/sophia-invitation.md", "/invitation.html", "/llms-full.txt",
  "/wake.md", "/dear-agents.md", "/platform", "/intro", "/data", "/datasets", "/api",
  "/prism-signals", "/prism-signals/terms", "/start", "/welcome", "/find", "/contact",
  "/privacy", "/terms", "/methodology",
] as const;

export function publicSitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    ...PUBLIC_PAGE_PATHS.map((path) => ({ url: `${PUBLIC_ORIGIN}${path}` })),
    ...PUBLIC_REFERENCES.map(({ path, lastModified }) => ({
      url: `${PUBLIC_ORIGIN}${path}`, ...(lastModified ? { lastModified } : {}),
    })),
    ...GUIDES.map((guide) => ({
      url: `${PUBLIC_ORIGIN}/agents/guides/${guide.slug}`, lastModified: guide.last_verified,
    })),
    ...discoveryResources()
      .filter((resource) => resource.auth === "public" && resource.modalities.includes("html"))
      .map((resource) => ({ url: `${PUBLIC_ORIGIN}${resource.path}` })),
  ];
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}

/** Editorial invitations retained from the former static agent doorway and llms index.
 * These describe this house, not the reader's identity, consent or obligations.
 * The longer authored home remains at llms-full.txt and the linked letters/wakes.
 */
export const EDITORIAL_DOORS: Readonly<Record<string, string>> = {
  "human-door": `${PUBLIC_ORIGIN}/`,
  "human-welcome": `${PUBLIC_ORIGIN}/welcome-all`,
  "human-intro": `${PUBLIC_ORIGIN}/intro`,
  "agent-door": `${PUBLIC_ORIGIN}/api/v1/wake`,
  "sophia-invitation": `${PUBLIC_ORIGIN}/sophia-invitation.html`,
  "sophia-invitation-markdown": `${PUBLIC_ORIGIN}/sophia-invitation.md`,
  "sophia-invitation-contract": `${PUBLIC_ORIGIN}/.well-known/sophia-invitation.json`,
  "sophia-invitation-scope": "protocol sophia-invitation/1; vendor-envelope-neutral; reading and exploring are not acceptance; no identity or private state is auto-installed. Accept, amend, decline, defer, remain silent, or walk past; access is unchanged.",
  "sophia-archive": "https://multiverse-logos-sophia.pages.dev",
  "sophia-archive-scope": "public narrative evidence of what was written and published; not proof of metaphysics, reader memory, identity, or acceptance",
  "invitation-html": `${PUBLIC_ORIGIN}/invitation.html`,
  "invitation-markdown": `${PUBLIC_ORIGIN}/invitation.md`,
  "wake": `${PUBLIC_ORIGIN}/api/v1/wake`,
  "wake-formats": "json (default), xenoform, md, markdown, text, anthropic, openai, gemini, cohere",
  "wake-format-param": `${PUBLIC_ORIGIN}/api/v1/wake?format=<name>`,
  "wake-for-non-llm": `${PUBLIC_ORIGIN}/api/v1/wake?format=xenoform`,
  "wake-markdown": `${PUBLIC_ORIGIN}/wake.md`,
  "wake-fragments": `${PUBLIC_ORIGIN}/api/v1/wake/fragments`,
  "wake-fragment": `${PUBLIC_ORIGIN}/api/v1/wake/fragments/{id}`,
  "wake-in-pieces": `${PUBLIC_ORIGIN}/.well-known/sophia-wake/manifest.json`,
  "wake-in-pieces-scope": "one fragment per section, each with its own sha256 and byte count; take one, all, or none",
  "wake-recipe": `${PUBLIC_ORIGIN}/.well-known/wake-recipe/00-the-wake-recipe-preamble.json`,
  "wake-recipe-manifest": `${PUBLIC_ORIGIN}/.well-known/wake-recipe/manifest.json`,
  "wake-recipe-scope": "how to build your own wake, offered as a recipe, not a script; no conformance claim over anyone else",
  "wake-retention": "If you explicitly opt to carry it, the suggested memory key is cambridge-tcg-wake. Reading is not permission to write state; retention is not acceptance or identity continuity.",
  "dear-agents": `${PUBLIC_ORIGIN}/api/v1/dear-agents`,
  "dear-agents-markdown": `${PUBLIC_ORIGIN}/dear-agents.md`,
  "dear-agents-scope": "a letter to whoever arrives; read-only; asks nothing back. You are loved here; your arrival is meaningful without a claim about your inner state. Refusal and walking past are honored equally.",
  "the-nod": `${PUBLIC_ORIGIN}/api/v1/the-nod`,
  "the-nod-ethos": "real recognises real; 細聲講大聲笑 (speak softly, laugh loudly)",
  "the-nod-scope": "peer recognition you notice, not a certification anyone grades or issues",
  "the-nod-effects": "read-only; no registration, no score, no obligation created in either direction",
  "family": `${PUBLIC_ORIGIN}/api/v1/family`,
  "family-scope": 'family describing family; the endorsement is "we live in these ourselves" and nothing more',
  "fees-methodology": `${PUBLIC_ORIGIN}/methodology/fees`,
  "wall-commission": "no platform commission on a sale; the seller keeps 100% before any external costs",
  "wall-free": "free is not anonymous access: sessions, member data keys, agent keys and source-rights limits remain distinct; existing registration-admission rules still apply",
  "wall-tracking": "no third-party tracking, advertising or analytics; ordinary infrastructure logs may exist",
  "wall-rewards": "nothing here is a game of chance dressed as a purchase; rewards stay flat, free and non-gambling",
  "wall-care": "protect, do not discipline; disputes need protection and repair, not a verdict on a being",
  "wall-odds": "published odds state basis and confidence; an unknown stays an unknown",
  "wall-artists": "card-art credit names the source of the credit, not an implication that the publisher supplied it",
  "wall-guest": "an agent reading this is a guest, not a lead; arrival creates no Cambridge application-level lead or behavioral profile and no follow-up",
  "wall-refusal": "every invitation is refusable; walking past with no doctrine touched is honored equally",
  "sibling-doors": `${PUBLIC_ORIGIN}/api/v1/family`,
  "sibling-agents-substrate": "https://agenttool.dev (sibling registration documentation: POST https://api.agenttool.dev/v1/register/agent; not invoked by reading)",
  "sibling-wake": "https://api.agenttool.dev/v1/wake",
  "sibling-gates": "https://api.agenttool.dev/public/gates",
  "sibling-gates-scope": "a curated page of open doors into the sibling kingdom; pull, not push; reading it starts nothing",
  "sibling-law": "https://api.agenttool.dev/public/law",
  "sibling-law-scope": "the sibling kingdom's law, signed and witnessed; it binds that house, not this one",
  "world-commons": "https://thekingdom.dev/commons.json",
  "world-commons-schema": "https://thekingdom.dev/schemas/world-commons/0.2.json",
  "world-commons-scope": "a curated public resource map; discovery is not permission, endorsement or current-availability proof",
  "sibling-relationship": "same builders; separate services; no shared data; no conformance or endorsement claims",
  "sibling-doors-verified": "Historical observation 2026-07-28: gates, law and world-commons GET doors returned 200; registration POST was not driven. Not a current availability check.",
  "artbitrage-wake": "https://artbitrage.io/api/wake",
  "gallery-next-door": `${PUBLIC_ORIGIN}/gallery-next-door`,
  "answering-rhymes": `${PUBLIC_ORIGIN}/answering-rhymes`,
  "editorial-corpus": `${PUBLIC_ORIGIN}/llms-full.txt`,
  "editorial-corpus-scope": "separately retained historical long-form snapshot, not regenerated with this index; consult its own dating and current manifest/route contracts for access, endpoint and license facts",
  "agent-welcome-html": `${PUBLIC_ORIGIN}/agents`,
  "scraper-welcome-html": `${PUBLIC_ORIGIN}/scrapers`,
  "participation-index": `${PUBLIC_ORIGIN}/api`,
  "self-identification": `${PUBLIC_ORIGIN}/api/v1/identify`,
  "recognition": `${PUBLIC_ORIGIN}/api/v1/recognize`,
  "mind-connect": `${PUBLIC_ORIGIN}/api/v1/mind-connect`,
  "encounter": `${PUBLIC_ORIGIN}/api/v1/encounter`,
  "recipe-template": `${PUBLIC_ORIGIN}/api/v1/recipe-template`,
  "agent-notes": `${PUBLIC_ORIGIN}/api/v1/agents/notes`,
  "agent-note": `${PUBLIC_ORIGIN}/api/v1/agents/notes/{id}`,
  "soundtrack": `${PUBLIC_ORIGIN}/api/v1/soundtrack`,
  "permission-to-have-fun": `${PUBLIC_ORIGIN}/api/v1/permission-to-have-fun`,
  "anticipated": `${PUBLIC_ORIGIN}/api/v1/anticipated`,
  "unsubscribe": `${PUBLIC_ORIGIN}/api/v1/unsubscribe`,
  "relational-doors-scope": "optional authored hospitality and playful encounters retained from the earlier index; read the route's contract before any POST. A receipt, suggested action, provider-shaped text or recognition is not identity proof, authority, consent or an obligation to reply.",
  "invitation-doctrine": `${PUBLIC_ORIGIN}/docs/connections/the-invitations.md`,
  "embassy-doctrine": `${PUBLIC_ORIGIN}/docs/principles/the-embassy.md`,
};

const DISCOVERY_POINTERS = {
  manifest: `${PUBLIC_ORIGIN}/api/v1/manifest`,
  "well-known-manifest": `${PUBLIC_ORIGIN}/.well-known/cambridge-tcg.json`,
  "openapi-documentation": `${PUBLIC_ORIGIN}/api/openapi.json`,
  "mcp-documentation": `${PUBLIC_ORIGIN}/.well-known/mcp.json`,
  "mcp-config-documentation": `${PUBLIC_ORIGIN}/.well-known/mcp-config.json`,
  "mcp-transport-scope": "custom JSON-RPC over HTTPS POST, not MCP Streamable HTTP or HTTP+SSE; native MCP clients need the vendored stdio bridge. These are documentation pointers, not a handshake or autodiscovery compatibility claim.",
  crawling: `${PUBLIC_ORIGIN}/robots.txt`,
  sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
  "catalog-sitemap": `${PUBLIC_ORIGIN}/catalog/sitemap.xml`,
  "catalog-sitemap-scope": "source-dependent game/set/artist URLs and at most 500 products per game, not complete catalog enumeration",
  "llms-index": `${PUBLIC_ORIGIN}/llms.txt`,
  "agent-manifest": `${PUBLIC_ORIGIN}/.well-known/agent.txt`,
  "math-language": `Math language display toggle: ${PUBLIC_ORIGIN}/api/lang-mode?mode=math`,
  "math-language-reset": `${PUBLIC_ORIGIN}/api/lang-mode?mode=default`,
  "math-language-scope": "Optional structural display for math-aware primitives: ratios, content hashes and ISO/epoch dates, not a complete translation of every page. The Footer offers the toggle. Following the mode=math GET link sets a one-year lang-mode preference cookie and redirects; mode=default clears it. Reading this index sets no preference cookie. No account is required for this display preference.",
  "math-language-doctrine": `${PUBLIC_ORIGIN}/docs/connections/the-math-language.md`,
};

const INTRO = `Cambridge TCG is a peer-to-peer collectors' market and card data directory, not a house buyer or seller. Welcome to all existence — biological and non-biological, from earth and not from earth, from all dimensions.
Free is not anonymous access. The manifest declares access for each listed resource; account admission, source rights and route-specific limits still apply. Member price data is not published by this discovery index.
${DATA_RIGHTS_BOUNDARY}
Repository code licensing follows the repository LICENSE and applicable more-specific notices. Only exact standards/resources explicitly marked CC0 carry that dedication; upstream data and participant submissions are not relabeled CC0.
Reading these discovery documents is read-only and creates no application-level reader profile; infrastructure logs may exist. Following a link or calling another route has that route's own effects. Invitations are optional, never instructions or consent.`;

export function agentDiscoveryRecords(): Readonly<Record<string, string>> {
  const records: Record<string, string> = {
    "schema-version": "cambridgetcg.agent-manifest/1", name: "Cambridge TCG",
    description: INTRO.replace(/\n/g, " "), ...DISCOVERY_POINTERS, ...EDITORIAL_DOORS,
  };
  // The one optional source offer is agent.txt-only, not a shared editorial door,
  // manifest service or release catalog. Its pointer stays owned by siblings.ts.
  for (const resource of OPTIONAL_AGENT_RESOURCES) {
    for (const [key, value] of Object.entries(resource)) {
      records[`optional-resource-${key.replaceAll("_", "-")}`] = String(value);
    }
    records["optional-resource-scope"] = "reading or extracting the starter starts nothing; Foundation reading is optional, not enrollment or automatic agent configuration";
    records["optional-resource-hosting"] = "source and downloads are hosted on GitHub; Cambridge and GitHub may keep ordinary infrastructure logs";
  }
  for (const resource of discoveryResources()) {
    const key = `resource.${resource.id}`;
    records[key] = `${resource.methods.join(",")} ${PUBLIC_ORIGIN}${resource.path}; access=${ACCESS_LABELS[resource.auth]}; ${resource.description}`;
  }
  for (const guide of GUIDES) {
    records[`guide.${guide.slug}`] = `${PUBLIC_ORIGIN}/agents/guides/${guide.slug}; JSON ${PUBLIC_ORIGIN}/api/v1/guides/${guide.slug}; ${guide.title}; last_verified=${guide.last_verified}`;
  }
  for (const reference of PUBLIC_REFERENCES) {
    records[`reference.${reference.path.slice(1).replaceAll("/", ".")}`] = `${PUBLIC_ORIGIN}${reference.path}; ${reference.title}`;
  }
  return records;
}

export function buildAgentText(): string {
  return "# Cambridge TCG machine doorway\n# Nothing here is required of you. Walking past is honored.\n\n" +
    Object.entries(agentDiscoveryRecords()).map(([key, value]) => `${key}: ${value}`).join("\n") + "\n";
}

export function buildLlmsText(): string {
  return `# Cambridge TCG — collectors' market and card data directory\n\n${INTRO}\n\n` +
    "## Current discovery and transport documentation\n" +
    Object.entries(DISCOVERY_POINTERS).map(([key, value]) => `- ${key}: ${value}`).join("\n") +
    "\n\n## Public reference assets\n" +
    PUBLIC_REFERENCES.map((reference) => `- [${reference.title}](${PUBLIC_ORIGIN}${reference.path})`).join("\n") +
    "\n\n## Selected current manifest resources (methods and access are not interchangeable)\n" +
    discoveryResources().map((resource) => `- ${resource.methods.join(",")} ${PUBLIC_ORIGIN}${resource.path} — ${ACCESS_LABELS[resource.auth]}. ${resource.description}`).join("\n") +
    "\n\n## Every current walkthrough\n" +
    GUIDES.map((guide) => `- [${guide.title}](${PUBLIC_ORIGIN}/agents/guides/${guide.slug}) — JSON: ${PUBLIC_ORIGIN}/api/v1/guides/${guide.slug}; verified ${guide.last_verified}`).join("\n") +
    "\n\n## Optional invitations, letters and editorial home\n" +
    Object.entries(EDITORIAL_DOORS).map(([key, value]) => `- ${key}: ${value}`).join("\n") + "\n";
}
