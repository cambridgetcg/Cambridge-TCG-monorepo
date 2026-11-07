import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/agents/operator-actions", () => ({
  createAgent: vi.fn(),
  mintKey: vi.fn(),
  revokeKey: vi.fn(),
  archiveAgent: vi.fn(),
}));

import { AgentsClient } from "./_client";
import type { AgentRow, KeyRow } from "./page";

const source = readFileSync(resolve(process.cwd(), "src/app/account/agents/_client.tsx"), "utf8");

function agent(overrides: Partial<AgentRow>): AgentRow {
  return {
    id: "agent-1",
    public_handle: "quiet-agent",
    display_name: "Quiet Agent",
    model_tag: "example-model",
    description: null,
    rating: 1500,
    rating_deviation: 350,
    matches_played: 0,
    matches_won: 0,
    status: "active",
    suspended_reason: null,
    registered_via: "operator",
    created_at: "2026-10-29T10:00:00Z",
    ...overrides,
  };
}

function key(overrides: Partial<KeyRow>): KeyRow {
  return {
    id: "key-1",
    agent_id: "agent-1",
    key_prefix: "ctcg_agt_abc",
    name: "laptop",
    rate_limit_tier: "free",
    last_used_at: null,
    revoked_at: null,
    revoked_by: null,
    created_at: "2026-10-29T10:00:00Z",
    ...overrides,
  };
}

describe("/account/agents client", () => {
  it("never reloads the page, which would discard the show-once key", () => {
    expect(source).not.toMatch(/location\.reload/);
    expect(source).toContain("router.refresh()");
  });

  it("shows who ended a revoked key as the category the server sent", () => {
    const html = renderToStaticMarkup(
      <AgentsClient
        agents={[agent({})]}
        keys={[
          key({ id: "k1", revoked_at: "2026-10-29T11:00:00Z", revoked_by: "revoked by the key holder" }),
          key({ id: "k2", revoked_at: "2026-10-29T11:00:00Z", revoked_by: "revoked by Cambridge TCG staff" }),
          key({ id: "k3" }),
        ]}
      />,
    );

    expect(html).toContain("revoked by the key holder");
    expect(html).toContain("revoked by Cambridge TCG staff");
    expect(html).toContain("1 live");
    expect(html).toContain("never used");
  });

  it("offers minting only for active operator-managed agents", () => {
    const operator = renderToStaticMarkup(<AgentsClient agents={[agent({})]} keys={[]} />);
    const selfServe = renderToStaticMarkup(
      <AgentsClient agents={[agent({ registered_via: "self-serve" })]} keys={[]} />,
    );
    const suspended = renderToStaticMarkup(
      <AgentsClient agents={[agent({ status: "suspended" })]} keys={[]} />,
    );

    expect(operator).toContain("+ mint key");
    expect(selfServe).not.toContain("+ mint key");
    expect(selfServe).toContain("self-serve agent: no new keys");
    expect(selfServe).toContain("archive");
    expect(suspended).not.toContain("+ mint key");
  });
});
