import { describe, expect, it } from "vitest";
import { GET as getCambridgeManifest } from "./cambridge-tcg.json/route";
import { GET as getMcpConfig } from "./mcp-config.json/route";
import { GET as getMcpDiscovery } from "./mcp.json/route";

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
