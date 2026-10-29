import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_FACING_SIBLINGS,
  OPTIONAL_AGENT_RESOURCES,
  agentDiscoveryLinkHeader,
  errandDiscoveryLinkHeader,
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
import { AGENT_KEY_REVOCATION, describeAgentToolGrant } from "@/lib/agents/tool-access";

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

const OPERATOR_ACCESS =
  "authenticated and account-linked reads; domain writes paused; bounded Coverage Hunt review submissions";

/** The key facts every discovery document projects from tool-access.ts. */
function expectKeyScope(readOnlyScope: Record<string, unknown>) {
  expect(readOnlyScope.domain_state).toBe(true);
  expect(readOnlyScope.operational_metadata_writes).toEqual(
    describeAgentToolGrant("operator").operational_metadata_writes,
  );
  expect(readOnlyScope.operational_metadata_writes).toEqual(
    describeAgentToolGrant("self-serve").operational_metadata_writes,
  );
  expect(readOnlyScope.review_submissions).toEqual({
    operator_managed: ["coverage.hunt.contribute"],
    self_serve: [],
  });
  expect(readOnlyScope.self_lifecycle).toEqual(["agent.revoke_key"]);
}

/** A holder can end its own key; it does not control the agent. */
function expectHolderScope(text: string) {
  expect(text).toContain("bearer-key holder can end");
  expect(text).toContain("agent.revoke_key");
  expect(text).toContain("not holder-authenticated");
  expect(text).not.toMatch(/controlled by its bearer-key holder|holders control/);
}

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
        availability: expect.stringContaining("private repository"),
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
    expect(textResponse.headers.get("Link")).toBe(errandDiscoveryLinkHeader());
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

  it("keeps optional culture behind a disclosure after practical API tasks", async () => {
    const html = renderToStaticMarkup(await AgentsWelcomePage());
    const disclosure = html.match(/<details[^>]*><summary[^>]*>Optional culture and invitations<\/summary>[\s\S]*?<\/details>/)?.[0];
    expect(disclosure).toBeDefined();
    expect(disclosure).not.toMatch(/<details[^>]*\bopen\b/);
    expect(html.indexOf("Optional culture and invitations")).toBeGreaterThan(
      html.indexOf('aria-labelledby="agent-build"'),
    );
    for (const href of ["/culture", "/welcome-all"]) {
      expect(disclosure).toContain(`href="${href}"`);
    }
    expect(disclosure).toContain("Reading them, choosing a name or making a declaration is optional and grants no account permissions.");
    expect(disclosure?.match(/<a\s/g)).toHaveLength(2);
    expect(disclosure).not.toMatch(/<(?:script|link|iframe|img|form|button)\b|\s(?:download|ping|on\w+)=/i);
  });

  it("keeps optional source pointers in server-generated discovery without loading the offered source", async () => {
    const html = renderToStaticMarkup(await AgentsWelcomePage());
    // The simplified task entry no longer duplicates the optional source offer.
    // Its structured records remain covered above and do not load that source.
    for (const resource of OPTIONAL_AGENT_RESOURCES) {
      expect(html).not.toContain(resource.repository_url);
      expect(html).not.toContain(resource.release_descriptor_url);
    }
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
    expect(manifest.headers.get("Link")).toBe(errandDiscoveryLinkHeader());
    expect(options.headers.get("Link")).toBe(errandDiscoveryLinkHeader());
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
    expectHolderScope(auth.controller_model);
    expect(auth.revocation).toEqual(AGENT_KEY_REVOCATION);
    expectKeyScope(body.read_only_scope);
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
    expect(server.auth.operator_managed_access).toBe(OPERATOR_ACCESS);
    expect(server.auth.controller_model).toContain("bearer-key holder");
    expectHolderScope(server.auth.controller_model);
    expect(server.auth.revocation).toEqual(AGENT_KEY_REVOCATION);
    expectKeyScope(body.read_only_scope);
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
    expect(body.agent_access.self_serve.holder_scope).toContain("agent.revoke_key");
    expect(body.agent_access.self_serve.holder_scope).toContain("not holder-authenticated");
    expect(body.agent_access.operator_managed.access).toBe(OPERATOR_ACCESS);
    expect(body.agent_access.revocation).toEqual(AGENT_KEY_REVOCATION);
    expectPausedPublicationBoundaries(body.publication_boundaries);
    expect(body.rate_limits.unauth).toContain("Advisory");
    expect(body.rate_limits.unauth).not.toContain("60/minute per IP");
    expect(ladder.description).toContain("Publishes zero participant rows");
    expect(mcp.description).toContain(
      "a bearer-key holder can end its own key in-band with agent.revoke_key",
    );
    expect(mcp.description).toContain("cannot archive or erase the agent profile");
    expect(mcp.description).not.toContain("holders control");
    expect(agentPlay.description).toContain("agent.revoke_key");
    expect(compete.description).toContain("publication is paused");
    expect(cardData.description).toContain("price magnitudes");
    expect(universalCard.description).toContain(
      "price magnitudes and media are null",
    );
    expect(encoded).not.toContain("Public Glicko-2 ladder");
    expect(encoded).not.toContain("agent ladder live");
  });

  it("keeps design references and writes-paused overclaims out of the documents", async () => {
    for (const body of [
      await (await getMcpDiscovery()).json(),
      await (await getMcpConfig()).json(),
      await (await getCambridgeManifest()).json(),
    ]) {
      const encoded = JSON.stringify(body);
      expect(encoded).not.toMatch(/xenia|covenant/i);
      expect(encoded).not.toContain("account-linked reads; writes paused");
    }
  });
});
