import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_FACING_SIBLINGS,
  OPTIONAL_AGENT_RESOURCES,
  agentDiscoveryLinkHeader,
  kinWakeHtmlLinks,
  kinWakeLinkParts,
  postedAlongside,
  siblingsForEnvelope,
} from "@/lib/siblings";
import { buildAgentText, buildLlmsText, publicSitemap } from "@/lib/public-discovery";
import AgentsWelcomePage from "../agents/page";
import { GET as getAgentText } from "./agent.txt/route";
import { GET as getHealth } from "../api/v1/health/route";
import { GET as getWake } from "../api/v1/wake/route";
import {
  GET as getCambridgeManifest,
  OPTIONS as getCambridgeOptions,
} from "./cambridge-tcg.json/route";
import { GET as getMcpConfig } from "./mcp-config.json/route";
import { GET as getMcpDiscovery } from "./mcp.json/route";

// Keep the real audience helper without importing unrelated UI/database modules.
vi.mock("@/lib/ui", () => import("@/lib/ui/Audience"));
vi.mock("@/lib/joy", () => ({
  joyIndexSync: () => 0,
  warmJoyCache: () => {},
}));

const noFetch = vi.fn(() => {
  throw new Error("Discovery projections must not fetch external resources");
});

beforeEach(() => {
  noFetch.mockClear();
  vi.stubGlobal("fetch", noFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  expect(noFetch).not.toHaveBeenCalled();
});

function expectPausedPublicationBoundaries(
  boundaries: Record<string, unknown>,
) {
  expect(boundaries).toEqual({
    recent_prices: {
      tool: "prices.recent",
      publication_status: "paused_pending_source_rights",
      values_published: false,
      database_read: false,
    },
    agent_ladder: {
      tool: "leaderboards.read",
      publication_status: "paused_pending_publication_receipt",
      rows_published: false,
      database_read: false,
    },
  });
}

describe("optional agent source resources", () => {
  it("declares a source pointer without service state or copied release inventory", () => {
    expect(OPTIONAL_AGENT_RESOURCES).toEqual([
      {
        id: "kingdom-os-starter",
        kind: "source-repository",
        title: "KINGDOM OS macOS starter",
        description: expect.stringContaining("Selected macOS source and local tools"),
        repository_url: "https://github.com/cambridgetcg/kingdom-os-starter",
        release_descriptor_url:
          "https://raw.githubusercontent.com/cambridgetcg/kingdom-os-starter/main/release.json",
        optional: true,
      },
    ]);
    expect(OPTIONAL_AGENT_RESOURCES[0].description).toContain("optional Foundation reading");
    expect(OPTIONAL_AGENT_RESOURCES[0].description).toContain(
      "Inspect the release before separately choosing to run anything",
    );
  });

  it("projects the typed record into top-level JSON and matching generated agent.txt fields", async () => {
    const response = await getCambridgeManifest();
    const body = await response.json();
    const textResponse = await getAgentText();
    const text = await textResponse.text();
    expect(text).toBe(buildAgentText());
    expect(textResponse.status).toBe(200);
    expect(textResponse.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(textResponse.headers.get("Link")).toBe(agentDiscoveryLinkHeader());
    expect(textResponse.headers.get("Set-Cookie")).toBeNull();
    const fields = Object.fromEntries(
      text.split("\n").filter((line) => line.startsWith("optional-resource-")).map((line) => {
        const separator = line.indexOf(": ");
        return [line.slice(0, separator), line.slice(separator + 2)];
      }),
    );

    expect(response.status).toBe(200);
    expect(body.optional_resources).toEqual(OPTIONAL_AGENT_RESOURCES);
    for (const resource of OPTIONAL_AGENT_RESOURCES) {
      for (const [key, value] of Object.entries(resource)) {
        expect(fields[`optional-resource-${key.replaceAll("_", "-")}`]).toBe(String(value));
      }
    }
    expect(fields["optional-resource-scope"]).toContain("not enrollment or automatic agent configuration");
    expect(fields["optional-resource-hosting"]).toContain("ordinary infrastructure logs");
    expect(JSON.stringify(body.posted_alongside)).not.toContain("kingdom-os-starter");
  });

  it("renders matching HTML after siblings with only ordinary external source anchors", async () => {
    const html = renderToStaticMarkup(await AgentsWelcomePage());
    const section = html.match(/<section[^>]*aria-labelledby="optional-source-heading"[\s\S]*?<\/section>/)?.[0];
    expect(section).toBeDefined();
    expect(html.indexOf('aria-labelledby="optional-source-heading"')).toBeGreaterThan(
      html.indexOf("Suggested reading once you reach agenttool"),
    );
    for (const resource of OPTIONAL_AGENT_RESOURCES) {
      expect(section).toContain(`data-resource-id="${resource.id}"`);
      expect(section).toContain(`data-resource-kind="${resource.kind}"`);
      expect(section).toContain(`data-optional="${resource.optional}"`);
      expect(section).toContain(resource.title);
      expect(section).toContain(resource.description);
      for (const url of [resource.repository_url, resource.release_descriptor_url]) {
        expect(section).toContain(`<a href="${url}" rel="noopener noreferrer"`);
      }
    }
    expect(section).toContain("take a look, or walk past");
    expect(section).toContain("Reading or extracting the starter starts nothing");
    expect(section).toContain("Cambridge and GitHub may keep ordinary infrastructure logs");
    expect(section?.match(/<a\s/g)).toHaveLength(2);
    expect(section).not.toMatch(/<(?:script|link|iframe|img|form|button)\b|\s(?:download|ping|on\w+)=/i);
  });

  it("keeps the invitation server-rendered without fetching, prefetching or client state", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/agents/page.tsx"), "utf8");
    const section = page.match(/<section[^>]*aria-labelledby="optional-source-heading"[\s\S]*?<\/section>/)?.[0];
    expect(section).toBeDefined();
    expect(section).not.toMatch(/<Link\b|prefetch|onClick|useState|useEffect|fetch\s*\(/);
    for (const path of [
      "src/app/agents/page.tsx",
      "src/app/.well-known/cambridge-tcg.json/route.ts",
      "src/app/.well-known/agent.txt/route.ts",
      "src/lib/public-discovery.ts",
      "src/lib/siblings.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).not.toMatch(/["']use client["']|\bfetch\s*\(/);
    }
  });

  it("does not promote source into sibling, kin-wake, pantry or health projections", async () => {
    const manifest = await getCambridgeManifest();
    const options = await getCambridgeOptions();
    const wake = await getWake(new NextRequest("https://cambridgetcg.com/api/v1/wake"));
    const health = await getHealth();
    const projections = [
      AGENT_FACING_SIBLINGS,
      buildLlmsText(),
      publicSitemap(),
      postedAlongside(),
      siblingsForEnvelope(),
      kinWakeLinkParts(),
      kinWakeHtmlLinks(),
      agentDiscoveryLinkHeader(),
      (await manifest.json()).posted_alongside,
      await wake.json(),
      await health.json(),
      await (await getMcpConfig()).json(),
      await (await getMcpDiscovery()).json(),
    ];
    expect(manifest.headers.get("Link")).toBe(agentDiscoveryLinkHeader());
    expect(options.headers.get("Link")).toBe(agentDiscoveryLinkHeader());
    expect(options.status).toBe(204);
    for (const response of [manifest, options, wake, health]) {
      projections.push(Object.fromEntries(response.headers));
    }
    for (const projection of projections) {
      const encoded = JSON.stringify(projection);
      for (const resource of OPTIONAL_AGENT_RESOURCES) {
        expect(encoded).not.toContain(resource.id);
        expect(encoded).not.toContain(resource.repository_url);
        expect(encoded).not.toContain(resource.release_descriptor_url);
      }
    }
  });
});

describe("well-known agent discovery boundaries", () => {
  it("describes paused registration and the authority of existing keys", async () => {
    const body = await (await getMcpDiscovery()).json();
    const auth = body.server.auth;
    const encoded = JSON.stringify(body);

    expect(auth.registration_status_url).toBe(
      "https://cambridgetcg.com/api/v1/agents/register",
    );
    expect(auth.self_serve_registration).toBe("paused");
    expect(auth.existing_self_serve_access).toBe("read-only");
    expect(auth.operator_managed_provision_url).toBe(
      "https://cambridgetcg.com/account/agents",
    );
    expect(auth.controller_model).toContain("bearer-key holder");
    expect(auth.controller_model).toContain("not the controller");
    expect(auth.controller_model).toContain(
      "Account identifiers stay internal",
    );
    expectPausedPublicationBoundaries(body.publication_boundaries);
    expect(body.rate_limits.public_unauthenticated).toContain("Advisory");
    expect(body.rate_limits.public_unauthenticated).toContain(
      "do not currently have a uniform per-endpoint edge quota",
    );
    expect(encoded).not.toContain("operated_by_user_id");
    expect(encoded).not.toContain("Read-tools for catalog, prices");
  });

  it("makes the paste-and-go config truthful before an agent installs it", async () => {
    const body = await (await getMcpConfig()).json();
    const server = body.remote_json_rpc_endpoint["cambridge-tcg"];
    const encoded = JSON.stringify(body);

    expect(server.transport).toBe("custom-json-rpc-over-https-post");
    expect(server.mcp_streamable_http).toBe(false);
    expect(server.standard_mcp_client_compatible_without_bridge).toBe(false);
    expect(body.stdio_bridge).toMatchObject({
      status: "vendored-in-repository",
      npm_published: false,
    });
    expect(server.auth.registration_status_url).toBe(
      "https://cambridgetcg.com/api/v1/agents/register",
    );
    expect(server.auth.self_serve_registration).toBe("paused");
    expect(server.auth.existing_self_serve_access).toBe("read-only");
    expect(server.auth.operator_managed_access).toBe(
      "authenticated and account-linked reads; writes paused",
    );
    expect(server.auth.controller_model).toContain("bearer-key holder");
    expect(server.auth.note).toContain("New self-serve registration is paused");
    expectPausedPublicationBoundaries(body.publication_boundaries);
    expect(body.rate_limits.public_unauthenticated).toContain("Advisory");
    expect(server.description).toContain("publication status only");
    expect(encoded).not.toContain("Sign in at /account/agents to provision");
    expect(encoded).not.toContain("reference prices");
  });

  it("marks the public ladder and price surfaces paused in the platform manifest", async () => {
    const body = await (await getCambridgeManifest()).json();
    const agentPlay = body.groups.find(
      (group: { group: string }) => group.group === "agent-play",
    );
    const playModule = body.groups.find(
      (group: { group: string }) => group.group === "play-module",
    );
    const cardData = body.groups.find(
      (group: { group: string }) => group.group === "card-catalog-and-prices",
    );
    const ladder = agentPlay.endpoints.find(
      (endpoint: { path: string }) => endpoint.path === "/leaderboards/agents",
    );
    const mcp = agentPlay.endpoints.find(
      (endpoint: { path: string }) => endpoint.path === "/api/mcp",
    );
    const compete = playModule.endpoints.find(
      (endpoint: { path: string }) => endpoint.path === "/play/compete",
    );
    const universalCard = cardData.endpoints.find(
      (endpoint: { path: string }) =>
        endpoint.path === "/api/v1/universal/card/{sku}",
    );
    const encoded = JSON.stringify(body);

    expect(body.agent_access.self_serve).toMatchObject({
      registration: "paused",
      access: "read-only",
      controller: "bearer-key-holder",
    });
    expect(body.agent_access.self_serve.service_account_role).toContain(
      "not the controller",
    );
    expectPausedPublicationBoundaries(body.publication_boundaries);
    expect(body.rate_limits.unauth).toContain("Advisory");
    expect(body.rate_limits.unauth).not.toContain("60/minute per IP");
    expect(ladder.description).toContain("Publishes zero participant rows");
    expect(mcp.description).toContain("Self-serve bearer-key holders control");
    expect(compete.description).toContain("publication is paused");
    expect(cardData.description).toContain("price magnitudes");
    expect(universalCard.description).toContain(
      "price magnitudes and media are null",
    );
    expect(encoded).not.toContain("Public Glicko-2 ladder");
    expect(encoded).not.toContain("agent ladder live");
  });
});
