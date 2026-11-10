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
    expires_at: null,
    expired: false,
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

  it("words each key's end, marks expired keys and offers no revoke on them", () => {
    const html = renderToStaticMarkup(
      <AgentsClient
        agents={[agent({})]}
        keys={[
          key({ id: "k1", name: "dated", expires_at: "2027-01-28T15:04:07.000Z" }),
          key({ id: "k2", name: "endless", expires_at: null }),
          key({ id: "k3", name: "ran-out", expires_at: "2026-11-01T00:00:00.000Z", expired: true, last_used_at: "2026-10-31T09:00:00Z" }),
          key({
            id: "k4",
            name: "ended",
            expires_at: "2026-12-01T00:00:00.000Z",
            revoked_at: "2026-10-30T11:00:00Z",
            revoked_by: "revoked from this page",
          }),
        ]}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(text).toContain("2 live, 1 expired, 1 revoked");
    expect(text).toContain("· expires 2027-01-28 15:04:07 UTC");
    expect(html).toContain('<time dateTime="2027-01-28T15:04:07.000Z">');
    expect(text).toContain("· no expiry");
    expect(text).toContain("expired 2026-11-01 00:00:00 UTC");
    // A revoked key's expiry is not shown; revocation is its state.
    expect(text).not.toContain("2026-12-01");
    expect(text).toContain("revoked from this page");
    // An expired key keeps its last use (for rotation) but has no revoke button.
    expect(text).toContain("last used");
    expect(html.match(/>revoke</g)).toHaveLength(2);
  });

  it("mints through a form, not a prompt, and shows no mint form until asked", () => {
    expect(source).not.toMatch(/prompt\([^)]*[Nn]ame for this key/);
    expect(source).toContain("mintKey({");
    const html = renderToStaticMarkup(<AgentsClient agents={[agent({})]} keys={[]} />);
    expect(html).toContain("+ mint key");
    expect(html).not.toContain('aria-label="Mint a key');
  });

  it("pre-selects 90 days on the create form, with no warning until never is chosen", () => {
    const html = renderToStaticMarkup(<AgentsClient agents={[]} keys={[]} />);

    expect(html).toMatch(/<option value="90d" selected="">90 days<\/option>/);
    for (const label of ["7 days", "30 days", "1 year", "On a date (UTC)", "Never"]) {
      expect(html).toContain(`>${label}</option>`);
    }
    expect(html).not.toContain("If a copy leaks");
    expect(html).not.toContain('type="date"');
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
